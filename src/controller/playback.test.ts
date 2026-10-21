import { describe, expect, it } from 'vitest';
import type { PlayerEvent } from '../adapters/playerAdapter/index.ts';
import { DEFAULT_SETTINGS } from '../core/defaultSettings.ts';
import { INITIAL_PLAYBACK_STATE, playbackReducer } from '../core/playbackMachine.ts';
import type { PlaybackState, Section, Settings } from '../types.ts';
import {
  SECTION_END_CHECK_MS,
  canPlay,
  canStop,
  checkSectionEnd,
  crossedSectionEnd,
  playSection,
  startSectionEndWatch,
  toMachineEvent,
} from './playback.ts';

const section: Section = { id: 'a', name: '구간 1', start: 75, end: 100 };

function fakePlayer() {
  const calls: string[] = [];
  return {
    calls,
    seekTo: (seconds: number) => calls.push(`seekTo:${seconds}`),
    play: () => calls.push('play'),
  };
}

/** 플레이어 이벤트를 차례로 받아 컨트롤러가 갖게 될 상태 */
function run(events: PlayerEvent[], from: PlaybackState = INITIAL_PLAYBACK_STATE): PlaybackState {
  return events.reduce((state, event) => playbackReducer(state, toMachineEvent(event)), from);
}

describe('toMachineEvent', () => {
  it('준비는 영상이 준비된 정지 상태로 바꾼다', () => {
    expect(run([{ type: 'ready' }])).toBe('stopped');
  });

  it('재생·정지 상태 변경을 그대로 따른다', () => {
    expect(run([{ type: 'stateChange', status: 'playing' }], 'stopped')).toBe('playing');
    expect(run([{ type: 'stateChange', status: 'stopped' }], 'playing')).toBe('stopped');
  });

  it('오류가 나면 준비 전으로 돌아간다', () => {
    expect(run([{ type: 'error', error: { code: 150, message: '' } }], 'playing')).toBe('unready');
  });

  it('영상 화면을 직접 눌러 생긴 재생·정지도 버튼과 같은 상태가 된다', () => {
    // 버튼 재생 → 화면 클릭 정지 → 화면 클릭 재생 → 버튼 정지
    const events: PlayerEvent[] = [
      { type: 'ready' },
      { type: 'stateChange', status: 'playing' },
      { type: 'stateChange', status: 'stopped' },
    ];
    expect(run(events)).toBe('stopped');
    expect(run([...events, { type: 'stateChange', status: 'playing' }])).toBe('playing');
  });
});

describe('canPlay / canStop', () => {
  it('준비 전이거나 구간을 고르지 않았으면 재생할 수 없다', () => {
    expect(canPlay('unready', section)).toBe(false);
    expect(canPlay('stopped', null)).toBe(false);
    expect(canPlay('stopped', section)).toBe(true);
    // 재생 중에 누르면 구간 처음부터 다시 재생한다
    expect(canPlay('playing', section)).toBe(true);
  });

  it('재생 중일 때만 정지할 수 있다', () => {
    expect(canStop('playing')).toBe(true);
    expect(canStop('stopped')).toBe(false);
    expect(canStop('unready')).toBe(false);
  });
});

describe('playSection', () => {
  it('구간 시작에서 프리롤만큼 앞으로 옮긴 뒤 재생한다', () => {
    const player = fakePlayer();
    expect(playSection(player, section, DEFAULT_SETTINGS.preroll)).toBe(73.5);
    expect(player.calls).toEqual(['seekTo:73.5', 'play']);
  });

  it('시작 위치가 프리롤보다 앞이면 0초부터 재생한다', () => {
    const player = fakePlayer();
    expect(playSection(player, { ...section, start: 1 }, 1.5)).toBe(0);
    expect(player.calls).toEqual(['seekTo:0', 'play']);
  });

  it('프리롤이 0이면 구간 시작 위치에서 재생한다', () => {
    const player = fakePlayer();
    playSection(player, section, 0);
    expect(player.calls).toEqual(['seekTo:75', 'play']);
  });
});

describe('crossedSectionEnd', () => {
  it('직전 위치가 끝보다 앞이고 이번 위치가 끝 이상일 때만 지난 것으로 본다', () => {
    expect(crossedSectionEnd(99.8, 100.05, 100)).toBe(true);
    expect(crossedSectionEnd(99.8, 100, 100)).toBe(true);
    expect(crossedSectionEnd(99.5, 99.75, 100)).toBe(false);
  });

  it('위치를 새로 옮긴 직후(직전 위치 없음)에는 지난 것으로 보지 않는다', () => {
    expect(crossedSectionEnd(null, 100.2, 100)).toBe(false);
  });

  it('구간 끝 뒤에서 재생하면 지난 것으로 보지 않는다', () => {
    // 자동 정지 뒤 영상 화면을 눌러 이어서 재생하거나, 끝 뒤 위치에서 직접 재생한 경우
    expect(crossedSectionEnd(100.1, 100.35, 100)).toBe(false);
  });
});

describe('checkSectionEnd', () => {
  function timedPlayer(times: number[]) {
    const calls: string[] = [];
    let index = 0;
    return {
      calls,
      getCurrentTime: () => times[Math.min(index++, times.length - 1)],
      pause: () => calls.push('pause'),
      seekTo: (seconds: number) => calls.push(`seekTo:${seconds}`),
      play: () => calls.push('play'),
    };
  }

  /** 0.25초 간격으로 위치를 차례로 확인하고, 확인마다의 결과를 돌려준다 */
  function tick(
    times: number[],
    settings: Pick<Settings, 'endAction' | 'preroll'>,
    startedAt = 1_000_000,
  ) {
    const player = timedPlayer(times);
    const watch = startSectionEndWatch(startedAt);
    let reads = 0;
    const loadSettings = () => {
      reads++;
      return settings;
    };
    const laps = times.map((_, i) =>
      checkSectionEnd(player, section, watch, loadSettings, startedAt + (i + 1) * SECTION_END_CHECK_MS),
    );
    return { player, watch, laps, reads: () => reads };
  }

  it('구간 끝 전에는 플레이어에 명령하지 않고 설정도 읽지 않는다', () => {
    const { player, laps, reads } = tick([99, 99.25, 99.5, 99.75], { endAction: 'stop', preroll: 1.5 });
    expect(player.calls).toEqual([]);
    expect(laps).toEqual([null, null, null, null]);
    expect(reads()).toBe(0);
  });

  it('자동 정지는 끝을 지난 확인에서 한 번만 멈춘다', () => {
    // 일시정지 이벤트가 오기 전까지 확인이 몇 번 더 돌아도 다시 멈추지 않는다
    const { player, laps } = tick([99.6, 99.85, 100.1, 100.12, 100.12], { endAction: 'stop', preroll: 1.5 });
    expect(player.calls).toEqual(['pause']);
    expect(laps.every((lap) => lap === null)).toBe(true);
  });

  it('계속 재생은 아무것도 하지 않는다', () => {
    const { player, laps } = tick([99.85, 100.1, 100.35], { endAction: 'continue', preroll: 1.5 });
    expect(player.calls).toEqual([]);
    expect(laps.every((lap) => lap === null)).toBe(true);
  });

  it('자동 반복은 프리롤만큼 앞으로 돌아가 다시 재생하고, 끝난 바퀴의 시작 시각과 재생 시간을 돌려준다', () => {
    const { player, watch, laps } = tick([99.85, 100.1], { endAction: 'repeat', preroll: 1.5 }, 1_000_000);
    expect(player.calls).toEqual(['seekTo:73.5', 'play']);
    expect(laps[0]).toBeNull();
    // 두 번째 확인(시작 후 0.5초)에서 바퀴가 끝났다
    expect(laps[1]).toEqual({ section, startedAt: 1_000_000, seconds: 0.5 });
    expect(watch).toEqual({ lastTime: null, lapStartedAt: 1_000_500 });
  });

  it('자동 반복은 정지 명령 전까지 바퀴마다 반복하고, 프리롤은 바퀴마다 설정에서 읽는다', () => {
    const player = timedPlayer([99.9, 100.1, 73.5, 99.9, 100.1, 72]);
    const watch = startSectionEndWatch(0);
    const prerolls = [1.5, 3];
    let lapIndex = 0;
    const loadSettings = () => ({ endAction: 'repeat' as const, preroll: prerolls[lapIndex++] });
    const laps = [1, 2, 3, 4, 5, 6].map((i) => checkSectionEnd(player, section, watch, loadSettings, i * 1000));

    expect(player.calls).toEqual(['seekTo:73.5', 'play', 'seekTo:72', 'play']);
    expect(laps.filter((lap) => lap !== null)).toEqual([
      { section, startedAt: 0, seconds: 2 },
      { section, startedAt: 2000, seconds: 3 },
    ]);
  });

  it('이동 직후 이전 위치가 한 번 더 읽혀도 바퀴를 두 번 세지 않는다', () => {
    const { player, laps } = tick([99.9, 100.1, 100.15, 73.5, 73.75], { endAction: 'repeat', preroll: 1.5 });
    expect(player.calls).toEqual(['seekTo:73.5', 'play']);
    expect(laps.filter((lap) => lap !== null)).toHaveLength(1);
  });

  it('반복 중에 끝 동작을 바꾸면 다음 구간 끝부터 반영된다', () => {
    const player = timedPlayer([99.9, 100.1, 73.5, 99.9, 100.1]);
    const watch = startSectionEndWatch(0);
    const actions = ['repeat', 'stop'] as const;
    let read = 0;
    const loadSettings = () => ({ endAction: actions[read++], preroll: 1.5 });
    [1, 2, 3, 4, 5].forEach((i) => checkSectionEnd(player, section, watch, loadSettings, i * 250));
    expect(player.calls).toEqual(['seekTo:73.5', 'play', 'pause']);
  });
});
