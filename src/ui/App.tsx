import { useCallback, useReducer, useRef, useState } from 'react';
import type { PlayerAdapter } from '../adapters/playerAdapter/index.ts';
import { createStorage } from '../adapters/storage.ts';
import { usePlayback } from '../controller/usePlayback.ts';
import { useVoice } from '../controller/useVoice.ts';
import type { Section } from '../types.ts';
import { LyricMappingPanel } from './LyricMappingPanel.tsx';
import { PlaybackControls } from './PlaybackControls.tsx';
import { PlayerView } from './PlayerView.tsx';
import { SectionPanel } from './SectionPanel.tsx';
import { SettingsPanel } from './SettingsPanel.tsx';
import { VideoInputForm } from './VideoInputForm.tsx';
import { VoicePanel } from './VoicePanel.tsx';
import {
  initialVideoLoadState,
  videoLoadReducer,
  type VideoLoadAction,
  type VideoLoadState,
} from './videoLoadState.ts';
import './app.css';

const storage = createStorage();

export function App() {
  const [video, videoDispatch] = useReducer(videoLoadReducer, initialVideoLoadState);
  const playerRef = useRef<PlayerAdapter | null>(null);
  const playback = usePlayback(playerRef, storage);
  const [section, setSection] = useState<Section | null>(null);
  const getCurrentTime = () => playerRef.current?.getCurrentTime() ?? null;
  const voice = useVoice({
    playback,
    section,
    // 구절은 정지 상태에서만 받으므로 준비된 영상의 가사 매핑과 비교한다
    videoId: video.status === 'ready' ? video.request.videoId : null,
    getCurrentTime,
    storage,
  });

  // 플레이어 이벤트를 영상 불러오기 상태와 재생 상태에 함께 반영한다. PlayerView가 효과를 다시 실행하지 않도록 렌더마다 같은 함수로 둔다
  const { onPlayerEvent, unload } = playback;
  const dispatch = useCallback(
    (action: VideoLoadAction) => {
      videoDispatch(action);
      if (action.type === 'playerEvent') onPlayerEvent(action.event);
      if (action.type === 'request') {
        // 새 영상을 부르면 구간 목록이 새로 만들어지므로 고른 구간도 비운다
        unload();
        setSection(null);
      }
    },
    [onPlayerEvent, unload],
  );

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
        <>
          <PlaybackControls
            state={playback.state}
            section={section}
            onPlay={() => playback.play(section)}
            onStop={playback.stop}
          />
          <SectionPanel
            key={video.request.videoId}
            videoId={video.request.videoId}
            getCurrentTime={getCurrentTime}
            onSelect={setSection}
          />
          <LyricMappingPanel
            // 같은 부모의 SectionPanel과 key가 겹치지 않게 앞에 구분자를 붙인다
            key={`lyrics:${video.request.videoId}`}
            videoId={video.request.videoId}
            getCurrentTime={getCurrentTime}
          />
        </>
      )}

      {/* 영상 준비 전에도 켤 수 있다. 그때 들어온 명령은 상태 규칙에 따라 무시로 표시한다 */}
      <VoicePanel voice={voice} />

      <SettingsPanel />
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
