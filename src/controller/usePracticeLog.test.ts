import { describe, expect, it, vi } from 'vitest';
import { createStorage, LOG_KEY, SETTINGS_KEY, type KeyValueStore } from '../adapters/storage.ts';
import { DEFAULT_SETTINGS } from '../core/defaultSettings.ts';
import type { Section } from '../types.ts';
import { createPracticeLogger, lapEvent } from './usePracticeLog.ts';

/** localStorage와 같은 동작을 하는 메모리 저장소. failing이 true인 동안 연습 기록 쓰기가 저장 공간 부족으로 실패한다 */
function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const store: KeyValueStore & { data: Map<string, string>; failing: boolean } = {
    data,
    failing: false,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      if (store.failing && key === LOG_KEY) throw new DOMException('quota', 'QuotaExceededError');
      data.set(key, String(value));
    },
  };
  return store;
}

const VIDEO = 'dQw4w9WgXcQ';
const section: Section = { id: 's1', name: '구간 1', start: 20, end: 26 };
/** 2026-10-22T10:00:00.000Z */
const T0 = Date.UTC(2026, 9, 22, 10, 0, 0);

describe('lapEvent', () => {
  it('바퀴가 끝난 시각을 startedAt + seconds로 되살린다', () => {
    expect(lapEvent({ section, startedAt: T0, seconds: 7.5 })).toEqual({ type: 'lap', at: T0 + 7500 });
  });
});

describe('createPracticeLogger', () => {
  it('재생 → 정지로 최소 재생 시간 이상이면 구간·시각·재생 시간을 singcue:log에 저장하고 새로고침해도 남는다', () => {
    const store = memoryStore();
    const logger = createPracticeLogger(createStorage(store));
    logger.handle({ type: 'start', at: T0, videoId: VIDEO, sectionId: 's1' });
    logger.handle({ type: 'stop', at: T0 + 5000 });

    const record = { videoId: VIDEO, sectionId: 's1', at: '2026-10-22T10:00:00.000Z', seconds: 5 };
    // 새로고침과 같은 상황: 같은 저장소로 어댑터를 다시 만든다
    expect(createStorage(store).loadLog()).toEqual([record]);
    expect(logger.getError()).toBeNull();
  });

  it('최소 재생 시간보다 짧으면 저장하지 않는다', () => {
    const store = memoryStore();
    const logger = createPracticeLogger(createStorage(store));
    logger.handle({ type: 'start', at: T0, videoId: VIDEO, sectionId: 's1' });
    logger.handle({ type: 'stop', at: T0 + 2999 });
    expect(store.data.has(LOG_KEY)).toBe(false);
  });

  it('최소 재생 시간은 판정할 때마다 설정에서 읽는다', () => {
    const store = memoryStore();
    const logger = createPracticeLogger(createStorage(store));
    logger.handle({ type: 'start', at: T0, videoId: VIDEO, sectionId: 's1' });
    logger.handle({ type: 'stop', at: T0 + 2000 });
    expect(createStorage(store).loadLog()).toHaveLength(0);

    createStorage(store).saveSettings({ ...DEFAULT_SETTINGS, minPracticeSeconds: 1 });
    logger.handle({ type: 'start', at: T0 + 10000, videoId: VIDEO, sectionId: 's1' });
    logger.handle({ type: 'stop', at: T0 + 12000 });
    expect(createStorage(store).loadLog()).toEqual([
      { videoId: VIDEO, sectionId: 's1', at: new Date(T0 + 10000).toISOString(), seconds: 2 },
    ]);
  });

  it('자동 반복은 바퀴 완료마다 1회씩 저장하고, 정지하면 마지막 바퀴를 판정한다', () => {
    const store = memoryStore({ [SETTINGS_KEY]: JSON.stringify({ ...DEFAULT_SETTINGS, endAction: 'repeat' }) });
    const logger = createPracticeLogger(createStorage(store));
    logger.handle({ type: 'start', at: T0, videoId: VIDEO, sectionId: 's1' });
    // usePlayback이 보내는 바퀴 완료. 다음 바퀴는 직전 바퀴가 끝난 시각에 시작한다
    logger.handle(lapEvent({ section, startedAt: T0, seconds: 7.5 }));
    logger.handle(lapEvent({ section, startedAt: T0 + 7500, seconds: 7.75 }));
    logger.handle({ type: 'stop', at: T0 + 15250 + 4000 });

    expect(createStorage(store).loadLog()).toEqual([
      { videoId: VIDEO, sectionId: 's1', at: new Date(T0).toISOString(), seconds: 7.5 },
      { videoId: VIDEO, sectionId: 's1', at: new Date(T0 + 7500).toISOString(), seconds: 7.75 },
      { videoId: VIDEO, sectionId: 's1', at: new Date(T0 + 15250).toISOString(), seconds: 4 },
    ]);
  });

  it('구간 없이 재생하면 기록하지 않는다', () => {
    const store = memoryStore();
    const logger = createPracticeLogger(createStorage(store));
    logger.handle({ type: 'start', at: T0, videoId: VIDEO, sectionId: null });
    logger.handle({ type: 'stop', at: T0 + 60000 });
    expect(store.data.has(LOG_KEY)).toBe(false);
  });

  it('기존 기록 뒤에 덧붙인다', () => {
    const old = { videoId: 'other', sectionId: 'x', at: '2026-10-21T09:00:00.000Z', seconds: 4 };
    const store = memoryStore({ [LOG_KEY]: JSON.stringify([old]) });
    const logger = createPracticeLogger(createStorage(store));
    logger.handle({ type: 'start', at: T0, videoId: VIDEO, sectionId: 's1' });
    logger.handle({ type: 'stop', at: T0 + 3000 });
    expect(createStorage(store).loadLog()).toEqual([
      old,
      { videoId: VIDEO, sectionId: 's1', at: new Date(T0).toISOString(), seconds: 3 },
    ]);
  });

  describe('저장 실패', () => {
    it('실패 이유를 알리고, 실패한 기록은 다음 기록과 함께 다시 저장한다', () => {
      const store = memoryStore();
      const logger = createPracticeLogger(createStorage(store));
      const listener = vi.fn();
      logger.subscribe(listener);

      store.failing = true;
      logger.handle({ type: 'start', at: T0, videoId: VIDEO, sectionId: 's1' });
      logger.handle({ type: 'stop', at: T0 + 5000 });
      expect(logger.getError()).toBe('quota-exceeded');
      expect(listener).toHaveBeenCalledTimes(1);
      expect(store.data.has(LOG_KEY)).toBe(false);

      store.failing = false;
      logger.handle({ type: 'start', at: T0 + 10000, videoId: VIDEO, sectionId: 's1' });
      logger.handle({ type: 'stop', at: T0 + 14000 });
      expect(logger.getError()).toBeNull();
      expect(listener).toHaveBeenCalledTimes(2);
      expect(createStorage(store).loadLog().map((record) => record.seconds)).toEqual([5, 4]);
    });

    it('localStorage를 쓸 수 없으면 write-error로 알린다', () => {
      const logger = createPracticeLogger(createStorage(null));
      logger.handle({ type: 'start', at: T0, videoId: VIDEO, sectionId: 's1' });
      logger.handle({ type: 'stop', at: T0 + 5000 });
      expect(logger.getError()).toBe('write-error');
    });

    it('안내를 닫으면 오류가 지워지고, 구독을 해제하면 더 알리지 않는다', () => {
      const store = memoryStore();
      store.failing = true;
      const logger = createPracticeLogger(createStorage(store));
      const listener = vi.fn();
      const unsubscribe = logger.subscribe(listener);
      logger.handle({ type: 'start', at: T0, videoId: VIDEO, sectionId: 's1' });
      logger.handle({ type: 'stop', at: T0 + 5000 });

      logger.dismissError();
      expect(logger.getError()).toBeNull();
      expect(listener).toHaveBeenCalledTimes(2);

      unsubscribe();
      logger.handle({ type: 'start', at: T0 + 10000, videoId: VIDEO, sectionId: 's1' });
      logger.handle({ type: 'stop', at: T0 + 15000 });
      expect(logger.getError()).toBe('quota-exceeded');
      expect(listener).toHaveBeenCalledTimes(2);
    });
  });
});
