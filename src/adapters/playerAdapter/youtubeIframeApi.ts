// YouTube IFrame Player API 스크립트 불러오기와, 이 앱이 쓰는 부분만 옮긴 타입.
// 문서: https://developers.google.com/youtube/iframe_api_reference

export const IFRAME_API_SRC = 'https://www.youtube.com/iframe_api';

export interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  cueVideoById(videoId: string): void;
  destroy(): void;
}

export type YTPlayerOptions = {
  videoId?: string;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (event: { target: YTPlayer }) => void;
    onStateChange?: (event: { data: number; target: YTPlayer }) => void;
    onError?: (event: { data: number; target: YTPlayer }) => void;
  };
};

export type YTNamespace = {
  Player: new (element: HTMLElement | string, options: YTPlayerOptions) => YTPlayer;
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

/** IFrame API 스크립트를 한 번만 넣고, 준비되면 `YT`를 돌려준다. 스크립트를 못 불러오면 다음 호출에서 다시 시도한다 */
export function loadYouTubeIframeApi(): Promise<YTNamespace> {
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }

    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT?.Player) resolve(window.YT);
      else fail(new Error('YouTube IFrame API가 준비됐지만 YT.Player가 없습니다.'));
    };

    const script = document.createElement('script');
    script.src = IFRAME_API_SRC;
    script.async = true;
    script.onerror = () => {
      script.remove();
      fail(new Error('YouTube IFrame API를 불러오지 못했습니다. 인터넷 연결을 확인하세요.'));
    };
    document.head.appendChild(script);

    function fail(error: Error) {
      window.onYouTubeIframeAPIReady = previous;
      apiPromise = null;
      reject(error);
    }
  });

  return apiPromise;
}
