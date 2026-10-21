// 영상 불러오기 화면의 상태. 불러오기 요청마다 requestId를 붙여, 앞선 요청의 플레이어가 늦게 보낸 이벤트는 버린다.

import type { PlayerEvent } from '../adapters/playerAdapter/index.ts';

export type VideoRequest = { requestId: number; videoId: string };

export type VideoLoadState =
  | { status: 'empty' }
  | { status: 'loading'; request: VideoRequest }
  | { status: 'ready'; request: VideoRequest }
  /** `code`는 플레이어 오류 코드. IFrame API를 불러오지 못한 경우처럼 플레이어 밖의 오류면 null */
  | { status: 'error'; request: VideoRequest; code: number | null; message: string };

export type VideoLoadAction =
  | { type: 'request'; videoId: string }
  | { type: 'playerEvent'; requestId: number; event: PlayerEvent }
  | { type: 'failed'; requestId: number; message: string };

export const initialVideoLoadState: VideoLoadState = { status: 'empty' };

export function videoLoadReducer(state: VideoLoadState, action: VideoLoadAction): VideoLoadState {
  if (action.type === 'request') {
    const requestId = state.status === 'empty' ? 1 : state.request.requestId + 1;
    return { status: 'loading', request: { requestId, videoId: action.videoId } };
  }

  if (state.status === 'empty' || action.requestId !== state.request.requestId) return state;

  if (action.type === 'failed') {
    return { status: 'error', request: state.request, code: null, message: action.message };
  }

  const { event } = action;
  if (event.type === 'error') {
    // 오류는 준비된 뒤에도 올 수 있어 상태와 관계없이 받는다
    return { status: 'error', request: state.request, ...event.error };
  }
  // 오류가 난 뒤 늦게 온 준비·상태 변경이 오류 안내를 지우지 않게 한다
  return state.status === 'loading' ? { status: 'ready', request: state.request } : state;
}
