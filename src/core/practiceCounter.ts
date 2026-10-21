// 연습 1회 판정. PRD F5-1, 기술 설계 문서의 "연습 기록 시점", #24 결정(자동 반복은 바퀴마다 1회)을 따른다.
// 어댑터·React에 의존하지 않도록 입력 이벤트 타입을 여기서 정의하고, 컨트롤러가 이 형태로 바꿔 전달한다.
// 시각은 Date.now() 기준 ms, 재생 시간과 최소 재생 시간은 초 단위다.

import type { PracticeRecord } from '../types.ts';

/**
 * practiceCounter가 받는 입력 이벤트.
 * - start: 재생 상태가 정지·준비 전에서 재생 중으로 바뀜. 재생하는 구간을 함께 알린다.
 *   구간이 없는 재생(sectionId: null)은 기록하지 않는다.
 * - lap: 자동 반복에서 구간 끝에 도달해 구간 시작으로 돌아감(#13의 "바퀴 완료")
 * - stop: 재생 중에서 정지·준비 전으로 바뀜(정지 버튼·음성 명령·자동 정지·영상 직접 조작 모두)
 */
export type PracticeEvent =
  | { type: 'start'; at: number; videoId: string; sectionId: string | null }
  | { type: 'lap'; at: number }
  | { type: 'stop'; at: number };

/** 진행 중인 바퀴. 재생 중이 아니면 null */
export type PracticeCounterState = {
  videoId: string;
  sectionId: string | null;
  /** 이번 바퀴의 시작 시각(Date.now() 기준 ms) */
  lapStartedAt: number;
} | null;

export const INITIAL_PRACTICE_COUNTER_STATE: PracticeCounterState = null;

export type PracticeCounterResult = {
  state: PracticeCounterState;
  /** 이번 입력으로 기록할 연습 1회. 없으면 빈 배열 */
  records: PracticeRecord[];
};

/** 재생한 시간이 최소 재생 시간 이상이면 연습 1회다(PRD F5-1) */
export function isPractice(seconds: number, minPracticeSeconds: number): boolean {
  return seconds >= minPracticeSeconds;
}

/** 진행 중인 바퀴를 at 시각에 끝내고, 규칙을 만족하면 기록을 만든다 */
function closeLap(state: NonNullable<PracticeCounterState>, at: number, minPracticeSeconds: number): PracticeRecord[] {
  if (state.sectionId === null) return [];
  const seconds = Math.max(0, at - state.lapStartedAt) / 1000;
  if (!isPractice(seconds, minPracticeSeconds)) return [];
  return [
    {
      videoId: state.videoId,
      sectionId: state.sectionId,
      at: new Date(state.lapStartedAt).toISOString(),
      seconds,
    },
  ];
}

/**
 * 입력 이벤트에 따른 연습 1회 판정. 순수 함수다.
 * - stop: 마지막 바퀴(재생 시작 또는 마지막 바퀴 완료 이후 재생한 시간)에 최소 재생 시간 규칙을 적용한다.
 * - lap: 끝난 바퀴에 같은 규칙을 적용하고, 다음 바퀴의 시작 시각을 그 시점으로 다시 잡는다.
 *   기록되지 않은 짧은 바퀴의 시간은 다음 바퀴로 넘기지 않는다.
 * - start: 재생 중에 다시 들어오면(재생 중 구간이 바뀐 경우 등) 진행 중이던 바퀴를 정지처럼 닫고 새 바퀴를 시작한다.
 * 재생 중이 아닐 때의 lap·stop은 무시한다.
 */
export function practiceCounterReducer(
  state: PracticeCounterState,
  event: PracticeEvent,
  minPracticeSeconds: number,
): PracticeCounterResult {
  switch (event.type) {
    case 'start':
      return {
        state: { videoId: event.videoId, sectionId: event.sectionId, lapStartedAt: event.at },
        records: state ? closeLap(state, event.at, minPracticeSeconds) : [],
      };
    case 'lap':
      if (!state) return { state, records: [] };
      return {
        state: { ...state, lapStartedAt: event.at },
        records: closeLap(state, event.at, minPracticeSeconds),
      };
    case 'stop':
      if (!state) return { state, records: [] };
      return { state: null, records: closeLap(state, event.at, minPracticeSeconds) };
    default:
      return { state, records: [] };
  }
}
