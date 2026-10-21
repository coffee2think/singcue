// 모의 getUserMedia·AudioContext·requestAnimationFrame으로 이벤트와 정리 동작만 확인한다. 실제 마이크 입력은 확인하지 않는다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MicEvent } from './micEvents.ts';
import { startMicMeter } from './startMicMeter.ts';

/** 테스트가 정하는 현재 파형 값. 128이면 무음, 그 외에는 ±(값-128) 사각파 */
let waveform: number;
let frames: Map<number, FrameRequestCallback>;
let nextFrameId: number;
let contexts: FakeAudioContext[];
let track: { label: string; stop: ReturnType<typeof vi.fn> };
let getUserMedia: ReturnType<typeof vi.fn>;

class FakeAnalyser {
  fftSize = 2048;
  getByteTimeDomainData(array: Uint8Array) {
    const offset = waveform - 128;
    array.forEach((_, i) => (array[i] = 128 + (i % 2 === 0 ? offset : -offset)));
  }
}

class FakeAudioContext {
  state: AudioContextState = 'suspended';
  analyser = new FakeAnalyser();
  source = { connect: vi.fn() };
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  close = vi.fn(async () => {
    this.state = 'closed';
  });
  createAnalyser = () => this.analyser;
  createMediaStreamSource = vi.fn(() => this.source);

  constructor() {
    contexts.push(this);
  }
}

function stream() {
  return { getAudioTracks: () => [track], getTracks: () => [track] };
}

beforeEach(() => {
  waveform = 128;
  frames = new Map();
  nextFrameId = 1;
  contexts = [];
  track = { label: '머리에 거는 수화기(Galaxy Buds Pro) (Bluetooth)', stop: vi.fn() };
  getUserMedia = vi.fn(async () => stream());
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(nextFrameId, callback);
    return nextFrameId++;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 예약된 화면 갱신을 시각 `now`(ms)에 한 번 실행한다 */
function tick(now: number) {
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((callback) => callback(now));
}

async function setup() {
  const events: MicEvent[] = [];
  const meter = await startMicMeter((event) => events.push(event));
  return { meter, events };
}

describe('startMicMeter', () => {
  it('오디오만 요청하고 스트림을 분석기에 연결한 뒤 장치 이름을 알려 준다', async () => {
    const { meter, events } = await setup();

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    const [context] = contexts;
    expect(context.createMediaStreamSource).toHaveBeenCalledOnce();
    expect(context.source.connect).toHaveBeenCalledWith(context.analyser);
    expect(context.analyser.fftSize).toBe(1024);
    expect(context.resume).toHaveBeenCalledOnce();
    expect(meter?.deviceLabel).toBe('머리에 거는 수화기(Galaxy Buds Pro) (Bluetooth)');
    expect(events).toEqual([]);
  });

  it('장치 이름이 비어 있으면 "이름 없음"으로 알려 준다', async () => {
    track.label = '';
    const { meter } = await setup();
    expect(meter?.deviceLabel).toBe('이름 없음');
  });

  it('화면 갱신마다 입력 레벨(dB)을 알린다', async () => {
    const { meter, events } = await setup();
    expect(meter?.getLevel()).toBe(-100);

    waveform = 128 + 64; // 진폭 0.5 → 약 −6dB
    tick(16);
    waveform = 128;
    tick(32);

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: 'level', db: expect.closeTo(-6.02, 2) });
    expect(events[1]).toEqual({ type: 'level', db: -100 });
    expect(meter?.getLevel()).toBe(-100);
  });

  it('−55dB 미만이 4초 이어지면 장치 이름과 함께 무음을 한 번 알린다', async () => {
    const { events } = await setup();
    const silences = () => events.filter((event) => event.type === 'silence');

    for (let now = 0; now <= 3984; now += 16) tick(now);
    expect(silences()).toEqual([]);

    tick(4000);
    tick(4016);
    tick(8000);
    expect(silences()).toEqual([{ type: 'silence', deviceLabel: '머리에 거는 수화기(Galaxy Buds Pro) (Bluetooth)' }]);

    waveform = 128 + 10; // 약 −22dB
    tick(8016);
    waveform = 128;
    tick(9000);
    tick(13000);
    expect(silences()).toHaveLength(2);
  });

  it('소리가 들어오는 동안에는 무음을 알리지 않는다', async () => {
    waveform = 128 + 10;
    const { events } = await setup();
    for (let now = 0; now <= 10000; now += 100) tick(now);
    expect(events.some((event) => event.type === 'silence')).toBe(false);
  });

  it('stop하면 측정을 멈추고 트랙과 오디오 컨텍스트를 닫는다', async () => {
    const { meter, events } = await setup();
    meter?.stop();
    meter?.stop();
    tick(16);

    expect(events).toEqual([]);
    expect(frames.size).toBe(0);
    expect(track.stop).toHaveBeenCalledOnce();
    expect(contexts[0].close).toHaveBeenCalledOnce();
  });

  it('마이크 권한이 거부되면 permission-denied 오류를 알리고 null을 돌려준다', async () => {
    getUserMedia.mockRejectedValue(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }));
    const { meter, events } = await setup();

    expect(meter).toBeNull();
    expect(events).toEqual([
      { type: 'error', error: { kind: 'permission-denied', message: expect.stringContaining('마이크 권한') } },
    ]);
    expect(contexts).toEqual([]);
    expect(frames.size).toBe(0);
  });

  it('마이크를 연 뒤 오디오 준비에 실패하면 트랙을 닫고 오류를 알린다', async () => {
    vi.stubGlobal(
      'AudioContext',
      class extends FakeAudioContext {
        createMediaStreamSource = vi.fn(() => {
          throw new Error('broken');
        });
      },
    );
    const { meter, events } = await setup();

    expect(meter).toBeNull();
    expect(events).toEqual([{ type: 'error', error: expect.objectContaining({ kind: 'unknown' }) }]);
    expect(track.stop).toHaveBeenCalledOnce();
    expect(contexts[0].close).toHaveBeenCalledOnce();
  });

  it('mediaDevices가 없으면(HTTPS·localhost가 아님) unsupported 오류를 알린다', async () => {
    vi.stubGlobal('navigator', {});
    const { meter, events } = await setup();

    expect(meter).toBeNull();
    expect(events).toEqual([{ type: 'error', error: expect.objectContaining({ kind: 'unsupported' }) }]);
  });
});
