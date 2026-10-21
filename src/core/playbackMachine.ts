// 재생 상태 머신과 프리롤 계산. 기술 설계 문서의 "상태 머신"을 따른다.
// 어댑터에 의존하지 않도록 플레이어 이벤트 타입을 여기서 정의하고, playerAdapter가 이 형태로 바꿔 전달한다.

import type { PlaybackState } from '../types.ts';

/**
 * reducer가 받는 플레이어 이벤트. YouTube onStateChange·onError를 앱 기준으로 옮긴 것이다.
 * - loaded: 영상이 준비되어 재생 전(cued, unstarted)
 * - playing / buffering: 재생 중. 버퍼링도 재생 중으로 본다
 * - paused / ended: 멈춤. 끝까지 재생된 경우 포함
 * - error: 임베드 불가 등으로 영상을 재생할 수 없음
 * - unloaded: 불러온 영상이 없어짐
 */
export type PlayerEvent =
  | { type: 'loaded' }
  | { type: 'playing' }
  | { type: 'buffering' }
  | { type: 'paused' }
  | { type: 'ended' }
  | { type: 'error' }
  | { type: 'unloaded' };

/** 영상을 불러오기 전 상태 */
export const INITIAL_PLAYBACK_STATE: PlaybackState = 'unready';

/**
 * 플레이어 이벤트에 따른 재생 상태 전이. 순수 함수다.
 * 상태의 기준은 플레이어이므로, 사용자가 영상 화면을 직접 눌러 생긴 이벤트도 같은 규칙으로 반영한다.
 */
export function playbackReducer(state: PlaybackState, event: PlayerEvent): PlaybackState {
  switch (event.type) {
    case 'playing':
    case 'buffering':
      return 'playing';
    case 'loaded':
    case 'paused':
    case 'ended':
      return 'stopped';
    case 'error':
    case 'unloaded':
      return 'unready';
    default:
      return state;
  }
}

/** 재생 시작 위치(초). 구간 시작보다 프리롤만큼 앞이고, 0초보다 앞이면 0초다(PRD F2-7) */
export function prerollStart(start: number, preroll: number): number {
  return Math.max(0, start - preroll);
}
