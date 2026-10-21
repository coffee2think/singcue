// 플레이어가 컨트롤러와 상태 머신(playbackMachine)에 넘기는 이벤트와 변환 규칙.
// YouTube의 상태 값과 오류 코드는 이 파일 밖으로 내보내지 않는다.

import type { PlaybackState } from '../../types.ts';

/** 플레이어가 알리는 재생 상태. 'unready'는 영상을 불러오기 전 앱의 상태라 플레이어가 보내지 않는다 */
export type PlayerStatus = Exclude<PlaybackState, 'unready'>;

export type PlayerError = {
  /** YouTube `onError` 코드 */
  code: number;
  /** 화면에 보여 줄 안내 문구 */
  message: string;
};

export type PlayerEvent =
  | { type: 'ready' }
  | { type: 'stateChange'; status: PlayerStatus }
  | { type: 'error'; error: PlayerError };

export type PlayerEventListener = (event: PlayerEvent) => void;

/** YouTube IFrame Player API의 `onStateChange` 값(YT.PlayerState) */
export const YT_PLAYER_STATE = Object.freeze({
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
});

/**
 * 버퍼링은 재생 중으로 본다(기술 설계 문서 "상태 머신"). 끝남, 일시정지, 준비됨은 정지다.
 * 시작 전(-1)은 알리지 않고 null을 돌려준다. 처음 재생할 때 -1, 3, -1, 3, 1 순서로 와서
 * 그대로 바꾸면 재생 도중 잠깐 정지로 보이기 때문이다. 영상을 바꿀 때는 뒤이어 준비됨(5)이 온다.
 */
export function toPlayerStatus(ytState: number): PlayerStatus | null {
  if (ytState === YT_PLAYER_STATE.UNSTARTED) return null;
  return ytState === YT_PLAYER_STATE.PLAYING || ytState === YT_PLAYER_STATE.BUFFERING
    ? 'playing'
    : 'stopped';
}

// 실제 브라우저에서 없는 영상 ID를 불러왔을 때도 100이 아닌 150이 왔으므로 볼 수 없는 영상도 함께 안내한다.
const EMBED_BLOCKED =
  '이 영상은 다른 사이트에서 재생할 수 없습니다. 소유자가 퍼가기를 막았거나 볼 수 없는 영상일 수 있으니 다른 영상을 불러오세요.';

/** YouTube IFrame Player API 문서의 `onError` 코드별 안내 문구 */
export const PLAYER_ERROR_MESSAGES: Readonly<Record<number, string>> = Object.freeze({
  2: '영상 주소나 ID가 올바르지 않습니다. 주소를 확인한 뒤 다시 불러오세요.',
  5: '브라우저에서 이 영상을 재생하지 못했습니다. 페이지를 새로고침하거나 다른 영상을 불러오세요.',
  100: '영상을 찾을 수 없습니다. 삭제되었거나 비공개인 영상일 수 있으니 다른 영상을 불러오세요.',
  101: EMBED_BLOCKED,
  150: EMBED_BLOCKED,
  153: '플레이어가 이 페이지의 주소 정보를 받지 못했습니다. 앱을 localhost나 HTTPS 주소로 열었는지 확인하세요.',
});

export function toPlayerError(code: number): PlayerError {
  return {
    code,
    message:
      PLAYER_ERROR_MESSAGES[code] ??
      `플레이어 오류가 발생했습니다(코드 ${code}). 다른 영상을 불러오거나 페이지를 새로고침하세요.`,
  };
}
