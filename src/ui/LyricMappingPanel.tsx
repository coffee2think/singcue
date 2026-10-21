import { createStorage, type SaveResult, type StorageAdapter } from '../adapters/storage.ts';
import { formatTime } from '../core/lyricParser.ts';
import { previewDraft } from '../controller/lyricMappingReducer.ts';
import { useLyricMapping } from '../controller/useLyricMapping.ts';

const defaultStorage = createStorage();

type Props = {
  videoId: string;
  /** 현재 재생 위치(초). 플레이어가 아직 없으면 null */
  getCurrentTime: () => number | null;
  storage?: StorageAdapter;
};

/** "분:초 구절" 입력과 구절 목록, 재생하며 시작 시간 찍기. 영상이 바뀌면 `key={videoId}`로 새로 만든다 */
export function LyricMappingPanel({ videoId, getCurrentTime, storage = defaultStorage }: Props) {
  const { state, saveFailure, dispatch } = useLyricMapping(videoId, storage);
  const preview = previewDraft(state.draft);

  function stamp() {
    const time = getCurrentTime();
    if (time === null) return;
    dispatch({ type: 'stamp', time });
  }

  return (
    <section className="lyric-panel" aria-label="가사 매핑">
      <h2>가사 매핑</h2>
      <label className="lyric-panel__field">
        <span>구절 입력("분:초 구절"을 한 줄에 하나씩, 끝에 시간만 적으면 마지막 구절 다음 위치)</span>
        <textarea
          rows={6}
          value={state.draft}
          placeholder={'0:12 첫 번째 구절\n0:18.4 두 번째 구절\n0:25'}
          onChange={(event) => dispatch({ type: 'edit', draft: event.target.value })}
        />
      </label>
      <div className="lyric-panel__actions">
        <button type="button" onClick={() => dispatch({ type: 'apply' })}>
          목록 만들기
        </button>
        <p className="message" aria-live="polite">
          인식된 구절 {preview.lineCount}개
          {preview.hasEnd && ', 마지막 구절 다음 위치 있음'}
          {preview.skipped.length > 0 && ` (구절로 세지 않은 줄: ${preview.skipped.join(', ')}번)`}
        </p>
      </div>
      {saveFailure && (
        <p className="message message--error" role="alert">
          {saveFailureMessage(saveFailure)}
        </p>
      )}

      <h3>구절 목록</h3>
      {state.lines.length === 0 ? (
        <p className="message">저장한 구절이 없습니다. 구절을 입력하고 "목록 만들기"를 누르세요.</p>
      ) : (
        <>
          <div className="lyric-panel__actions">
            <button type="button" onClick={stamp} disabled={state.selected === null}>
              지금 위치로 시작 시간 찍기
            </button>
            <p className="message">구절을 고르고 재생 중에 누르면 현재 위치가 기록되고 다음 구절로 넘어갑니다.</p>
          </div>
          <ol className="lyric-list">
            {state.lines.map((line, index) => (
              <li key={index}>
                <button
                  type="button"
                  aria-pressed={state.selected === index}
                  onClick={() => dispatch({ type: 'select', target: index })}
                >
                  <span className="lyric-list__time">{formatTime(line.t)}</span> {line.text}
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                aria-pressed={state.selected === 'end'}
                onClick={() => dispatch({ type: 'select', target: 'end' })}
              >
                <span className="lyric-list__time">{state.endT === null ? '-' : formatTime(state.endT)}</span>{' '}
                마지막 구절 다음 위치
              </button>
            </li>
          </ol>
        </>
      )}
    </section>
  );
}

function saveFailureMessage(failure: Extract<SaveResult, { ok: false }>): string {
  return failure.reason === 'quota-exceeded'
    ? '브라우저 저장 공간이 부족해 가사 매핑을 저장하지 못했습니다. 새로고침하면 이번에 바꾼 내용이 사라집니다.'
    : '브라우저 저장소에 쓰지 못해 가사 매핑을 저장하지 못했습니다. 새로고침하면 이번에 바꾼 내용이 사라집니다.';
}
