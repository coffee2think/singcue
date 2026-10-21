import { useReducer, useRef } from 'react';
import type { PlayerAdapter } from '../adapters/playerAdapter/index.ts';
import { PlayerView } from './PlayerView.tsx';
import { SectionPanel } from './SectionPanel.tsx';
import { VideoInputForm } from './VideoInputForm.tsx';
import { initialVideoLoadState, videoLoadReducer, type VideoLoadState } from './videoLoadState.ts';
import './app.css';

export function App() {
  const [video, dispatch] = useReducer(videoLoadReducer, initialVideoLoadState);
  const playerRef = useRef<PlayerAdapter | null>(null);

  return (
    <main className="app">
      <header>
        <h1>singcue</h1>
        <p>음성 명령으로 노래 연습 구간을 제어하는 웹 앱</p>
      </header>

      <section className="video-panel" aria-label="영상">
        <VideoInputForm onLoad={(videoId) => dispatch({ type: 'request', videoId })} />
        {/* 플레이어가 화면을 채워도 안내가 보이도록 플레이어 위에 둔다 */}
        <VideoStatus video={video} />
        {video.status === 'empty' ? (
          <p className="player player--empty">영상을 불러오면 여기에 플레이어가 표시됩니다.</p>
        ) : (
          <PlayerView request={video.request} dispatch={dispatch} playerRef={playerRef} />
        )}
      </section>

      {video.status === 'ready' && (
        <SectionPanel
          key={video.request.videoId}
          videoId={video.request.videoId}
          getCurrentTime={() => playerRef.current?.getCurrentTime() ?? null}
        />
      )}
    </main>
  );
}

function VideoStatus({ video }: { video: VideoLoadState }) {
  switch (video.status) {
    case 'empty':
      return null;
    case 'loading':
      return (
        <p className="message" role="status">
          영상을 불러오는 중입니다…
        </p>
      );
    case 'ready':
      return (
        <p className="message" role="status">
          영상이 준비됐습니다({video.request.videoId}).
        </p>
      );
    case 'error':
      return (
        <p className="message message--error" role="alert">
          {video.code !== null && <strong>플레이어 오류 코드 {video.code}: </strong>}
          {video.message}
        </p>
      );
  }
}
