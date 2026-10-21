// 모의 SpeechRecognition으로 설정, 자동 재시작, 오류·결과 전달만 확인한다. 실제 브라우저 음성 인식은 확인하지 않는다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSpeechAdapter, isSpeechSupported, RESTART_DELAY_MS } from './createSpeechAdapter.ts';
import type { SpeechEvent } from './speechEvents.ts';
import type {
  SpeechRecognitionErrorEventLike,
  SpeechRecognitionResultEventLike,
  SpeechRecognitionResultLike,
} from './webSpeechApi.ts';

let created: FakeRecognition[];

class FakeRecognition {
  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onstart: (() => void) | null = null;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null = null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null = null;
  onend: (() => void) | null = null;
  running = false;
  start = vi.fn(() => {
    // Chrome은 이미 시작한 인식을 다시 start()하면 InvalidStateError를 던진다
    if (this.running) throw new DOMException('already started', 'InvalidStateError');
    this.running = true;
  });
  stop = vi.fn();
  abort = vi.fn();

  constructor() {
    created.push(this);
  }

  // 아래는 브라우저가 보내는 이벤트 흉내
  fireStart() {
    this.onstart?.();
  }
  fireResult(resultIndex: number, results: SpeechRecognitionResultLike[]) {
    this.onresult?.({ resultIndex, results });
  }
  fireError(error: string) {
    this.onerror?.({ error });
  }
  fireEnd() {
    this.running = false;
    this.onend?.();
  }
}

/** 후보 문자열로 결과 하나를 만든다 */
function result(isFinal: boolean, ...transcripts: string[]): SpeechRecognitionResultLike {
  const alternatives = transcripts.map((transcript) => ({ transcript, confidence: 0.9 }));
  return Object.assign(alternatives, { isFinal });
}

beforeEach(() => {
  created = [];
  vi.useFakeTimers();
  vi.stubGlobal('window', { webkitSpeechRecognition: FakeRecognition });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** 인식을 켜고 onstart까지 보낸 상태를 돌려준다 */
function setup() {
  const events: SpeechEvent[] = [];
  const adapter = createSpeechAdapter((event) => events.push(event));
  adapter.start();
  const recognition = created[0];
  recognition.fireStart();
  return { adapter, events, recognition };
}

describe('isSpeechSupported', () => {
  it('표준 이름이나 webkit 접두사 이름이 있으면 true', () => {
    expect(isSpeechSupported()).toBe(true);
    vi.stubGlobal('window', { SpeechRecognition: FakeRecognition });
    expect(isSpeechSupported()).toBe(true);
  });

  it('둘 다 없으면 false', () => {
    vi.stubGlobal('window', {});
    expect(isSpeechSupported()).toBe(false);
  });
});

describe('createSpeechAdapter', () => {
  it('ko-KR, 연속 인식, 중간 결과, 후보 5개로 설정해 시작한다', () => {
    const { adapter, events, recognition } = setup();

    expect(recognition).toMatchObject({
      lang: 'ko-KR',
      continuous: true,
      interimResults: true,
      maxAlternatives: 5,
    });
    expect(recognition.start).toHaveBeenCalledOnce();
    expect(adapter.isEnabled()).toBe(true);
    expect(events).toEqual([{ type: 'start' }]);
  });

  it('이미 켜져 있으면 start()를 다시 불러도 새로 시작하지 않는다', () => {
    const { adapter, recognition } = setup();
    adapter.start();
    expect(created).toHaveLength(1);
    expect(recognition.start).toHaveBeenCalledOnce();
  });

  describe('자동 재시작', () => {
    it('켜진 상태에서 onend가 오면 잠시 뒤 다시 시작한다', () => {
      const { events, recognition } = setup();
      events.length = 0;

      recognition.fireEnd();
      expect(events).toEqual([{ type: 'end', restarting: true }]);
      expect(recognition.start).toHaveBeenCalledOnce();

      vi.advanceTimersByTime(RESTART_DELAY_MS);
      expect(recognition.start).toHaveBeenCalledTimes(2);
      recognition.fireStart();
      expect(events).toEqual([{ type: 'end', restarting: true }, { type: 'start' }]);
    });

    it('여러 번 끝나도 그때마다 다시 시작한다', () => {
      const { recognition } = setup();
      for (let n = 0; n < 3; n++) {
        recognition.fireEnd();
        vi.advanceTimersByTime(RESTART_DELAY_MS);
        recognition.fireStart();
      }
      expect(recognition.start).toHaveBeenCalledTimes(4);
    });

    it('stop() 뒤의 onend로는 다시 시작하지 않는다', () => {
      const { adapter, events, recognition } = setup();
      events.length = 0;

      adapter.stop();
      expect(recognition.stop).toHaveBeenCalledOnce();
      expect(adapter.isEnabled()).toBe(false);
      recognition.fireEnd();
      vi.advanceTimersByTime(RESTART_DELAY_MS * 10);

      expect(recognition.start).toHaveBeenCalledOnce();
      expect(events).toEqual([{ type: 'end', restarting: false }]);
    });

    it('재시작을 기다리는 동안 stop()하면 재시작을 취소하고 꺼짐을 알린다', () => {
      const { adapter, events, recognition } = setup();
      recognition.fireEnd();
      events.length = 0;

      adapter.stop();
      vi.advanceTimersByTime(RESTART_DELAY_MS * 10);

      expect(recognition.start).toHaveBeenCalledOnce();
      expect(recognition.stop).not.toHaveBeenCalled();
      expect(events).toEqual([{ type: 'end', restarting: false }]);
    });

    it('재시작에 실패하면 start-failed 오류를 알리고 인식을 끈다', () => {
      const { adapter, events, recognition } = setup();
      recognition.fireEnd();
      recognition.running = true; // 다음 start()가 InvalidStateError를 던지게 한다
      events.length = 0;

      vi.advanceTimersByTime(RESTART_DELAY_MS);

      expect(adapter.isEnabled()).toBe(false);
      expect(events).toEqual([
        { type: 'error', error: expect.objectContaining({ code: 'start-failed', fatal: true }) },
        { type: 'end', restarting: false },
      ]);
    });

    it('끈 뒤 onend 전에 다시 켜면 새 인식 객체로 시작하고, 이전 객체의 이벤트는 무시한다', () => {
      const { adapter, events, recognition: old } = setup();
      adapter.stop();
      adapter.start();
      events.length = 0;

      expect(created).toHaveLength(2);
      const next = created[1];
      expect(next.start).toHaveBeenCalledOnce();

      old.fireResult(0, [result(true, '시작')]);
      old.fireEnd();
      vi.advanceTimersByTime(RESTART_DELAY_MS);
      expect(events).toEqual([]);
      expect(old.start).toHaveBeenCalledOnce();
      expect(adapter.isEnabled()).toBe(true);
    });
  });

  describe('오류 전달', () => {
    it('not-allowed를 전달하고 인식을 끈 뒤 다시 시작하지 않는다', () => {
      const { adapter, events, recognition } = setup();
      events.length = 0;

      recognition.fireError('not-allowed');
      recognition.fireEnd();
      vi.advanceTimersByTime(RESTART_DELAY_MS * 10);

      expect(events).toEqual([
        { type: 'error', error: expect.objectContaining({ code: 'not-allowed', fatal: true }) },
        { type: 'end', restarting: false },
      ]);
      expect(adapter.isEnabled()).toBe(false);
      expect(recognition.start).toHaveBeenCalledOnce();
    });

    it('no-speech를 전달하고 세션이 끝나면 다시 시작한다', () => {
      const { adapter, events, recognition } = setup();
      events.length = 0;

      recognition.fireError('no-speech');
      recognition.fireEnd();
      vi.advanceTimersByTime(RESTART_DELAY_MS);

      expect(events).toEqual([
        { type: 'error', error: expect.objectContaining({ code: 'no-speech', fatal: false }) },
        { type: 'end', restarting: true },
      ]);
      expect(adapter.isEnabled()).toBe(true);
      expect(recognition.start).toHaveBeenCalledTimes(2);
    });

    it('브라우저가 지원하지 않으면 not-supported 오류를 알리고 켜지지 않는다', () => {
      vi.stubGlobal('window', {});
      const events: SpeechEvent[] = [];
      const adapter = createSpeechAdapter((event) => events.push(event));

      adapter.start();

      expect(adapter.isEnabled()).toBe(false);
      expect(events).toEqual([
        { type: 'error', error: expect.objectContaining({ code: 'not-supported', fatal: true }) },
      ]);
    });

    it('처음 start()가 예외를 던지면 start-failed 오류를 알리고 켜지지 않는다', () => {
      vi.stubGlobal('window', {
        webkitSpeechRecognition: class extends FakeRecognition {
          start = vi.fn(() => {
            throw new DOMException('blocked', 'NotAllowedError');
          });
        },
      });
      const events: SpeechEvent[] = [];
      const adapter = createSpeechAdapter((event) => events.push(event));

      adapter.start();

      expect(adapter.isEnabled()).toBe(false);
      expect(events.map((event) => event.type)).toEqual(['error', 'end']);
    });
  });

  describe('결과 전달', () => {
    it('발화 ID, 최종 결과 여부, 공백을 지운 후보 목록을 전달한다', () => {
      const { events, recognition } = setup();
      events.length = 0;

      recognition.fireResult(0, [result(false, '멈')]);
      recognition.fireResult(0, [result(true, ' 멈춰 ', '멈춰요', '', '음 춰', '엄춰', '멈추어')]);

      expect(events).toEqual([
        { type: 'result', result: { utteranceId: '1-0', isFinal: false, candidates: ['멈'] } },
        {
          type: 'result',
          result: { utteranceId: '1-0', isFinal: true, candidates: ['멈춰', '멈춰요', '음 춰', '엄춰', '멈추어'] },
        },
      ]);
    });

    it('resultIndex부터의 결과만 전달하고, 발화마다 다른 ID를 준다', () => {
      const { events, recognition } = setup();
      events.length = 0;

      recognition.fireResult(1, [result(true, '시작'), result(false, '정지')]);

      expect(events).toEqual([
        { type: 'result', result: { utteranceId: '1-1', isFinal: false, candidates: ['정지'] } },
      ]);
    });

    it('후보가 모두 빈 문자열이면 전달하지 않는다', () => {
      const { events, recognition } = setup();
      events.length = 0;
      recognition.fireResult(0, [result(false, ' ', '')]);
      expect(events).toEqual([]);
    });

    it('재시작한 세션의 발화 ID는 이전 세션과 겹치지 않는다', () => {
      const { events, recognition } = setup();
      recognition.fireResult(0, [result(true, '시작')]);
      recognition.fireEnd();
      vi.advanceTimersByTime(RESTART_DELAY_MS);
      recognition.fireStart();
      recognition.fireResult(0, [result(true, '정지')]);

      const ids = events.flatMap((event) => (event.type === 'result' ? [event.result.utteranceId] : []));
      expect(ids).toEqual(['1-0', '2-0']);
    });
  });
});
