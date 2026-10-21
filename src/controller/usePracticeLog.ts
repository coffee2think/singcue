// 연습 기록 훅. PRD F5-1·F5-2, 기술 설계 문서의 "연습 기록 시점", #24 결정(자동 반복은 바퀴마다 1회)을 따른다.
// 재생 상태 전이와 usePlayback의 바퀴 완료를 practiceCounter 입력(PracticeEvent)으로 바꿔 넘기고,
// 판정된 연습 1회를 `singcue:log`에 덧붙인다.

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { SaveResult, StorageAdapter } from '../adapters/storage.ts';
import {
  INITIAL_PRACTICE_COUNTER_STATE,
  practiceCounterReducer,
  type PracticeEvent,
} from '../core/practiceCounter.ts';
import type { PracticeRecord, Section } from '../types.ts';
import type { LapComplete } from './playback.ts';
import type { UsePlayback } from './usePlayback.ts';

/** 연습 기록 저장 실패 이유. 화면이 이유에 맞춰 안내하고 JSON 내보내기를 권한다 */
export type PracticeLogError = Extract<SaveResult, { ok: false }>['reason'];

/**
 * 바퀴 완료를 lap 이벤트로 바꾼다.
 * 바퀴가 끝난 시각은 `startedAt + seconds`로 되살린다. usePlayback이 `seconds`를 `(끝난 시각 - startedAt) / 1000`으로
 * 계산하므로 같은 값이고, 리스너가 불린 때의 Date.now()에 기대지 않아도 usePlayback이 다음 바퀴 시작으로 잡은 시각과 맞는다
 */
export function lapEvent(lap: LapComplete): PracticeEvent {
  return { type: 'lap', at: lap.startedAt + lap.seconds * 1000 };
}

export type PracticeLogger = {
  /** 이벤트를 판정하고, 연습 1회가 생기면 `singcue:log`에 덧붙인다 */
  handle(event: PracticeEvent): void;
  /** 마지막 저장 실패 이유. 다음 저장에 성공하거나 안내를 닫으면 null */
  getError(): PracticeLogError | null;
  dismissError(): void;
  subscribe(listener: () => void): () => void;
};

/**
 * 판정 상태와 저장을 묶은 객체. React 밖에서 테스트할 수 있도록 훅에서 떼어 둔다.
 * 최소 재생 시간은 판정할 때마다 `singcue:settings`에서 읽어, 설정 패널에서 바꾼 값이 다음 판정부터 반영된다.
 * 저장에 실패한 기록은 메모리에 두었다가 다음 기록과 함께 다시 저장한다(그사이 새로고침하면 사라진다)
 */
export function createPracticeLogger(storage: StorageAdapter): PracticeLogger {
  let state = INITIAL_PRACTICE_COUNTER_STATE;
  let pending: PracticeRecord[] = [];
  let error: PracticeLogError | null = null;
  const listeners = new Set<() => void>();

  function setError(next: PracticeLogError | null) {
    if (error === next) return;
    error = next;
    listeners.forEach((listener) => listener());
  }

  return {
    handle(event) {
      const result = practiceCounterReducer(state, event, storage.loadSettings().minPracticeSeconds);
      state = result.state;
      if (result.records.length === 0) return;
      const records = [...pending, ...result.records];
      const saved = storage.appendLog(records);
      pending = saved.ok ? [] : records;
      setError(saved.ok ? null : saved.reason);
    },
    getError: () => error,
    dismissError: () => setError(null),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type UsePracticeLog = {
  error: PracticeLogError | null;
  dismissError: () => void;
};

type Options = {
  playback: Pick<UsePlayback, 'state' | 'subscribeLap'>;
  /** 불러온 영상. 준비 전이면 null */
  videoId: string | null;
  /** 고른 연습 구간. 없으면 재생해도 기록하지 않는다 */
  section: Section | null;
  storage: StorageAdapter;
};

/**
 * 재생 중이 되면 start, 재생 중이 끝나면 stop을 넘긴다. 재생 중에 구간을 바꿔 고르면 이전 구간의 바퀴를 닫고
 * 새 구간으로 다시 시작한다(정지 후 시작과 같은 판정). 자동 반복의 바퀴 완료는 subscribeLap으로 받아 lap을 넘긴다.
 */
export function usePracticeLog({ playback, videoId, section, storage }: Options): UsePracticeLog {
  const [logger] = useState(() => createPracticeLogger(storage));
  const error = useSyncExternalStore(logger.subscribe, logger.getError);

  const playing = playback.state === 'playing';
  const sectionId = section?.id ?? null;
  useEffect(() => {
    if (!playing || videoId === null) return;
    logger.handle({ type: 'start', at: Date.now(), videoId, sectionId });
    // 재생이 끝나거나 영상·구간이 바뀌거나 화면에서 빠지면 진행 중인 바퀴를 닫는다
    return () => logger.handle({ type: 'stop', at: Date.now() });
  }, [logger, playing, videoId, sectionId]);

  const { subscribeLap } = playback;
  useEffect(() => subscribeLap((lap) => logger.handle(lapEvent(lap))), [logger, subscribeLap]);

  return { error, dismissError: logger.dismissError };
}
