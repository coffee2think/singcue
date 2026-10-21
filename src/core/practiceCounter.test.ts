import { describe, expect, it } from 'vitest';
import type { PracticeRecord } from '../types.ts';
import { DEFAULT_SETTINGS } from './defaultSettings.ts';
import {
  INITIAL_PRACTICE_COUNTER_STATE,
  isPractice,
  practiceCounterReducer,
  type PracticeCounterState,
  type PracticeEvent,
} from './practiceCounter.ts';

const MIN = DEFAULT_SETTINGS.minPracticeSeconds;
const T0 = Date.UTC(2026, 9, 22, 12, 0, 0);
const start: PracticeEvent = { type: 'start', at: T0, videoId: 'vid', sectionId: 's1' };

/** 이벤트를 차례로 넣고 나온 기록을 모두 모은다 */
function run(events: PracticeEvent[], min = MIN): { state: PracticeCounterState; records: PracticeRecord[] } {
  let state = INITIAL_PRACTICE_COUNTER_STATE;
  const records: PracticeRecord[] = [];
  for (const event of events) {
    const result = practiceCounterReducer(state, event, min);
    state = result.state;
    records.push(...result.records);
  }
  return { state, records };
}

describe('isPractice', () => {
  it('최소 재생 시간 이상이면 연습 1회다', () => {
    expect(isPractice(3, 3)).toBe(true);
    expect(isPractice(10, 3)).toBe(true);
  });

  it('최소 재생 시간보다 짧으면 연습이 아니다', () => {
    expect(isPractice(2.999, 3)).toBe(false);
  });
});

describe('practiceCounterReducer: 재생 중 → 정지', () => {
  it('처음 상태는 재생 중이 아니다', () => {
    expect(INITIAL_PRACTICE_COUNTER_STATE).toBeNull();
  });

  it('재생을 시작하면 바퀴 시작 시각을 기억하고 아직 기록하지 않는다', () => {
    const result = practiceCounterReducer(null, start, MIN);
    expect(result.state).toEqual({ videoId: 'vid', sectionId: 's1', lapStartedAt: T0 });
    expect(result.records).toEqual([]);
  });

  it('최소 재생 시간(기본 3초) 이상 재생하고 멈추면 PracticeRecord를 만든다', () => {
    const { state, records } = run([start, { type: 'stop', at: T0 + 5_000 }]);
    expect(state).toBeNull();
    expect(records).toEqual([
      { videoId: 'vid', sectionId: 's1', at: new Date(T0).toISOString(), seconds: 5 },
    ]);
  });

  it('정확히 최소 재생 시간만큼 재생해도 기록한다', () => {
    const { records } = run([start, { type: 'stop', at: T0 + 3_000 }]);
    expect(records).toHaveLength(1);
    expect(records[0].seconds).toBe(3);
  });

  it('최소 재생 시간보다 짧게 멈추면 기록하지 않는다', () => {
    const { state, records } = run([start, { type: 'stop', at: T0 + 2_999 }]);
    expect(state).toBeNull();
    expect(records).toEqual([]);
  });

  it('설정에서 바꾼 최소 재생 시간을 따른다', () => {
    const events: PracticeEvent[] = [start, { type: 'stop', at: T0 + 5_000 }];
    expect(run(events, 10).records).toEqual([]);
    expect(run(events, 1).records).toHaveLength(1);
  });

  it('at은 재생을 시작한 시각의 ISO 문자열이다', () => {
    const { records } = run([start, { type: 'stop', at: T0 + 4_000 }]);
    expect(records[0].at).toBe('2026-10-22T12:00:00.000Z');
  });

  it('멈췄다가 다시 재생하면 재생 구간마다 따로 판정한다', () => {
    const { records } = run([
      start,
      { type: 'stop', at: T0 + 4_000 },
      { ...start, at: T0 + 10_000 },
      { type: 'stop', at: T0 + 11_000 },
      { ...start, at: T0 + 20_000 },
      { type: 'stop', at: T0 + 26_500 },
    ]);
    expect(records.map((r) => r.seconds)).toEqual([4, 6.5]);
  });

  it('구간 없이 재생하면 시간이 길어도 기록하지 않는다', () => {
    const { records } = run([
      { type: 'start', at: T0, videoId: 'vid', sectionId: null },
      { type: 'stop', at: T0 + 60_000 },
    ]);
    expect(records).toEqual([]);
  });

  it('재생 중이 아닐 때의 정지·바퀴 완료는 무시한다', () => {
    expect(practiceCounterReducer(null, { type: 'stop', at: T0 }, MIN)).toEqual({ state: null, records: [] });
    expect(practiceCounterReducer(null, { type: 'lap', at: T0 }, MIN)).toEqual({ state: null, records: [] });
  });

  it('시각이 거꾸로 들어와도 음수 재생 시간으로 기록하지 않는다', () => {
    expect(run([start, { type: 'stop', at: T0 - 5_000 }], 0).records[0].seconds).toBe(0);
    expect(run([start, { type: 'stop', at: T0 - 5_000 }]).records).toEqual([]);
  });

  it('알 수 없는 이벤트는 상태를 유지하고 기록하지 않는다', () => {
    const state = practiceCounterReducer(null, start, MIN).state;
    const result = practiceCounterReducer(state, { type: 'unknown' } as unknown as PracticeEvent, MIN);
    expect(result).toEqual({ state, records: [] });
  });
});

describe('practiceCounterReducer: 재생 중 구간이 바뀜', () => {
  it('재생 중에 다시 start가 오면 이전 바퀴를 닫아 판정하고 새 구간으로 시작한다', () => {
    const { state, records } = run([
      start,
      { type: 'start', at: T0 + 4_000, videoId: 'vid', sectionId: 's2' },
      { type: 'stop', at: T0 + 9_000 },
    ]);
    expect(state).toBeNull();
    expect(records).toEqual([
      { videoId: 'vid', sectionId: 's1', at: new Date(T0).toISOString(), seconds: 4 },
      { videoId: 'vid', sectionId: 's2', at: new Date(T0 + 4_000).toISOString(), seconds: 5 },
    ]);
  });
});

describe('practiceCounterReducer: 자동 반복(#24 결정, 바퀴마다 1회)', () => {
  it('바퀴 완료마다 그 바퀴의 재생 시간으로 1회씩 기록하고 다음 바퀴 시작 시각을 다시 잡는다', () => {
    // 프리롤 1.5초 + 구간 8초 = 바퀴마다 9.5초. 프리롤도 재생 시간에 포함한다
    const lap = 9_500;
    const { state, records } = run([
      start,
      { type: 'lap', at: T0 + lap },
      { type: 'lap', at: T0 + 2 * lap },
      { type: 'lap', at: T0 + 3 * lap },
    ]);
    expect(records).toEqual([0, 1, 2].map((i) => ({
      videoId: 'vid',
      sectionId: 's1',
      at: new Date(T0 + i * lap).toISOString(),
      seconds: 9.5,
    })));
    expect(state).toEqual({ videoId: 'vid', sectionId: 's1', lapStartedAt: T0 + 3 * lap });
  });

  it('자동 반복 중 정지하면 마지막 바퀴 완료 이후 재생한 시간에 같은 규칙을 적용한다', () => {
    const { records } = run([
      start,
      { type: 'lap', at: T0 + 9_500 },
      { type: 'lap', at: T0 + 19_000 },
      { type: 'stop', at: T0 + 23_000 },
    ]);
    expect(records.map((r) => r.seconds)).toEqual([9.5, 9.5, 4]);
    expect(records[2].at).toBe(new Date(T0 + 19_000).toISOString());
  });

  it('마지막 바퀴가 최소 재생 시간보다 짧으면 그 바퀴만 기록하지 않는다', () => {
    const { state, records } = run([
      start,
      { type: 'lap', at: T0 + 9_500 },
      { type: 'stop', at: T0 + 11_000 },
    ]);
    expect(state).toBeNull();
    expect(records.map((r) => r.seconds)).toEqual([9.5]);
  });

  it('최소 재생 시간보다 짧은 바퀴는 기록하지 않고, 그 시간을 다음 바퀴로 넘기지 않는다', () => {
    // 구간이 짧아 바퀴가 2초인 경우
    const { state, records } = run([
      start,
      { type: 'lap', at: T0 + 2_000 },
      { type: 'lap', at: T0 + 4_000 },
      { type: 'stop', at: T0 + 6_000 },
    ]);
    expect(records).toEqual([]);
    expect(state).toBeNull();
  });

  it('바퀴 완료 직후 바로 멈추면 마지막 바퀴는 0초라 기록하지 않는다', () => {
    const { records } = run([start, { type: 'lap', at: T0 + 9_500 }, { type: 'stop', at: T0 + 9_500 }]);
    expect(records.map((r) => r.seconds)).toEqual([9.5]);
  });
});
