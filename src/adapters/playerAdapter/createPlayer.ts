// YouTube IFrame 플레이어를 감싸 재생 제어와 PlayerEvent만 바깥에 보인다.

import {
  toPlayerError,
  toPlayerStatus,
  type PlayerEventListener,
  type PlayerStatus,
} from './playerEvents.ts';
import { loadYouTubeIframeApi, type YTPlayer } from './youtubeIframeApi.ts';

export type PlayerAdapter = {
  play(): void;
  pause(): void;
  /** 초 단위. 0보다 앞이면 0으로 이동한다 */
  seekTo(seconds: number): void;
  /** 현재 재생 위치(초) */
  getCurrentTime(): number;
  /** 다른 영상을 자동재생 없이 준비한다 */
  load(videoId: string): void;
  destroy(): void;
};

/**
 * `element`(요소나 요소 id) 자리에 플레이어를 만들고 `videoId`를 준비한다. 플레이어가 준비되면 끝난다.
 * 상태 변경은 'playing' | 'stopped'로 바꾸고, 같은 상태가 이어지면 한 번만 알린다.
 * 처음 만든 직후에는 상태 변경이 오지 않으므로 'ready'를 영상이 준비된 정지 상태로 보면 된다.
 */
export async function createPlayer(
  element: HTMLElement | string,
  videoId: string,
  onEvent: PlayerEventListener,
): Promise<PlayerAdapter> {
  const YT = await loadYouTubeIframeApi();
  let lastStatus: PlayerStatus | null = null;

  const player = await new Promise<YTPlayer>((resolve) => {
    new YT.Player(element, {
      videoId,
      playerVars: playerVars(),
      events: {
        onReady: ({ target }) => {
          resolve(target);
          onEvent({ type: 'ready' });
        },
        onStateChange: ({ data }) => {
          const status = toPlayerStatus(data);
          if (status === null || status === lastStatus) return;
          lastStatus = status;
          onEvent({ type: 'stateChange', status });
        },
        onError: ({ data }) => onEvent({ type: 'error', error: toPlayerError(data) }),
      },
    });
  });

  return {
    play: () => player.playVideo(),
    pause: () => player.pauseVideo(),
    seekTo: (seconds) => player.seekTo(Math.max(0, seconds), true),
    getCurrentTime: () => player.getCurrentTime(),
    load: (nextVideoId) => player.cueVideoById(nextVideoId),
    destroy: () => player.destroy(),
  };
}

/** PoC와 같은 설정. http(s)에서는 origin을 넘겨 API 메시지 출처를 고정한다 */
function playerVars(): Record<string, string | number> {
  const vars: Record<string, string | number> = { playsinline: 1, rel: 0 };
  if (window.location.protocol.startsWith('http')) vars.origin = window.location.origin;
  return vars;
}
