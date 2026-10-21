// YouTube IFrame 플레이어를 감싸 재생 제어와 PlayerEvent만 바깥에 보인다.

import {
  toPlayerError,
  toPlayerStatus,
  YT_PLAYER_STATE,
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
 * 버퍼링 중에 `pause()`를 보낸 뒤 이 시간(ms)이 지나도 버퍼링이면 정지로 알린다(#53).
 * 이동 직후 버퍼링 중에 일시정지하면 YouTube가 버퍼링(3)에 머문 채 위치만 멈추고 일시정지(2)를 보내지 않는다.
 * 버퍼링이 먼저 끝나면 100ms 안팎에 일시정지가 오므로, 그보다 넉넉하면서 정지 반응 1초 이내를 지키는 값이다.
 * 처음 재생할 때(-1, 3, -1, ...)나 자동재생이 막혔을 때는 시작 전(-1)에 머무를 수 있어 시작 전도 같이 본다.
 */
export const PAUSE_STUCK_MS = 500;

/**
 * `element`(요소나 요소 id) 자리에 플레이어를 만들고 `videoId`를 준비한다. 플레이어가 준비되면 끝난다.
 * 상태 변경은 'playing' | 'stopped'로 바꾸고, 같은 상태가 이어지면 한 번만 알린다.
 * 처음 만든 직후에는 상태 변경이 오지 않으므로 'ready'를 영상이 준비된 정지 상태로 보면 된다.
 * 예외로, 재생 중 알림 뒤 버퍼링·시작 전 상태에서 `pause()`를 보내고 `PAUSE_STUCK_MS`가 지나도 그대로면
 * 이벤트 없이도 'stopped'를 알린다.
 * 정지 요청이 없는 버퍼링은 그대로 재생 중이고, 뒤에 재생(1)이 오면 원래대로 'playing'을 알린다.
 */
export async function createPlayer(
  element: HTMLElement | string,
  videoId: string,
  onEvent: PlayerEventListener,
): Promise<PlayerAdapter> {
  const YT = await loadYouTubeIframeApi();
  let lastStatus: PlayerStatus | null = null;
  /** 마지막으로 받은 YouTube 상태 값. 정지 요청에 아직 답하지 않은 상태(버퍼링, 시작 전)인지 본다 */
  let lastYtState: number | null = null;
  let pauseTimer: ReturnType<typeof setTimeout> | null = null;

  function clearPauseTimer() {
    if (pauseTimer === null) return;
    clearTimeout(pauseTimer);
    pauseTimer = null;
  }

  function notify(status: PlayerStatus) {
    if (status === lastStatus) return;
    lastStatus = status;
    onEvent({ type: 'stateChange', status });
  }

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
          lastYtState = data;
          // 재생·일시정지·끝남·준비됨이 오면 YouTube가 정지 요청에 답한 것이므로 대신 알리지 않는다
          if (!isPending(data)) clearPauseTimer();
          const status = toPlayerStatus(data);
          if (status !== null) notify(status);
        },
        onError: ({ data }) => onEvent({ type: 'error', error: toPlayerError(data) }),
      },
    });
  });

  return {
    play: () => {
      // 정지 직후 다시 재생하면 기다리던 정지 알림은 더 이상 맞지 않는다
      clearPauseTimer();
      player.playVideo();
    },
    pause: () => {
      player.pauseVideo();
      if (lastStatus !== 'playing' || !isPending(lastYtState) || pauseTimer !== null) return;
      pauseTimer = setTimeout(() => {
        pauseTimer = null;
        if (isPending(lastYtState)) notify('stopped');
      }, PAUSE_STUCK_MS);
    },
    seekTo: (seconds) => player.seekTo(Math.max(0, seconds), true),
    getCurrentTime: () => player.getCurrentTime(),
    load: (nextVideoId) => {
      clearPauseTimer();
      player.cueVideoById(nextVideoId);
    },
    destroy: () => {
      clearPauseTimer();
      player.destroy();
    },
  };
}

/** 정지 요청에 아직 답하지 않은 YouTube 상태인지. 버퍼링(3)과 시작 전(-1)이다 */
function isPending(ytState: number | null): boolean {
  return ytState === YT_PLAYER_STATE.BUFFERING || ytState === YT_PLAYER_STATE.UNSTARTED;
}

/** PoC와 같은 설정. http(s)에서는 origin을 넘겨 API 메시지 출처를 고정한다 */
function playerVars(): Record<string, string | number> {
  const vars: Record<string, string | number> = { playsinline: 1, rel: 0 };
  if (window.location.protocol.startsWith('http')) vars.origin = window.location.origin;
  return vars;
}
