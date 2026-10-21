import { canPlay, canStop } from '../controller/playback.ts';
import type { PlaybackState, Section } from '../types.ts';
import { formatTime } from './formatTime.ts';

type Props = {
  state: PlaybackState;
  /** 연습 구간. 고르지 않았으면 null */
  section: Section | null;
  onPlay: () => void;
  onStop: () => void;
};

const STATE_LABELS: Record<PlaybackState, string> = {
  unready: '준비 전',
  stopped: '정지',
  playing: '재생 중',
};

/** 재생·정지 버튼(PRD F1-5). 상태는 플레이어 이벤트를 따르므로 영상 화면을 직접 눌러도 같이 바뀐다 */
export function PlaybackControls({ state, section, onPlay, onStop }: Props) {
  return (
    <section className="playback" aria-label="재생">
      <div className="playback__buttons">
        <button type="button" onClick={onPlay} disabled={!canPlay(state, section)}>
          재생
        </button>
        <button type="button" onClick={onStop} disabled={!canStop(state)}>
          정지
        </button>
      </div>
      <p className="message" role="status">
        <strong>{STATE_LABELS[state]}</strong>
        {' · '}
        {section
          ? `${section.name} ${formatTime(section.start)}부터(프리롤 적용)`
          : '연습할 구간을 고르면 재생할 수 있습니다.'}
      </p>
    </section>
  );
}
