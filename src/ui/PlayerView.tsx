import { useEffect, useRef } from 'react';
import { createPlayer, type PlayerEventListener } from '../adapters/playerAdapter/index.ts';
import type { VideoLoadAction, VideoRequest } from './videoLoadState.ts';

type Props = {
  request: VideoRequest;
  dispatch: (action: VideoLoadAction) => void;
};

/**
 * 요청마다 플레이어를 새로 만든다. IFrame API가 넘겨준 요소를 iframe으로 바꾸므로
 * React가 그리지 않는 요소를 직접 붙여 넘기고, 요청이 바뀌거나 화면에서 빠지면 지운다.
 */
export function PlayerView({ request, dispatch }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const { requestId, videoId } = request;
    let cancelled = false;
    const mount = document.createElement('div');
    host.replaceChildren(mount);

    const onEvent: PlayerEventListener = (event) => {
      if (!cancelled) dispatch({ type: 'playerEvent', requestId, event });
    };

    const pending = createPlayer(mount, videoId, onEvent).catch((error: unknown) => {
      if (!cancelled) dispatch({ type: 'failed', requestId, message: failureMessage(error) });
      return null;
    });

    return () => {
      cancelled = true;
      // 준비되기 전에 바뀌면 준비된 뒤 지운다. 준비 신호가 끝내 오지 않아도 iframe은 아래에서 빠진다
      void pending.then((player) => player?.destroy());
      host.replaceChildren();
    };
  }, [request, dispatch]);

  return <div className="player" ref={hostRef} />;
}

function failureMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : '플레이어를 만들지 못했습니다. 페이지를 새로고침한 뒤 다시 불러오세요.';
}
