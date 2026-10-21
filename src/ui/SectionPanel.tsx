import { createStorage, type SaveResult, type StorageAdapter } from '../adapters/storage.ts';
import { selectedSection, type SectionNotice } from '../controller/sectionReducer.ts';
import { useSections } from '../controller/useSections.ts';
import type { Section } from '../types.ts';
import { formatTime } from './formatTime.ts';

const defaultStorage = createStorage();

type Props = {
  videoId: string;
  /** 현재 재생 위치(초). 플레이어가 아직 없으면 null */
  getCurrentTime: () => number | null;
  /** 목록에서 연습 구간을 고르면 알린다 */
  onSelect?: (section: Section) => void;
  storage?: StorageAdapter;
};

/** 시작·끝 마킹과 구간 목록. 영상이 바뀌면 `key={videoId}`로 새로 만든다 */
export function SectionPanel({ videoId, getCurrentTime, onSelect, storage = defaultStorage }: Props) {
  const { state, saveFailure, dispatch } = useSections(videoId, storage);
  const selected = selectedSection(state);

  function mark(type: 'markStart' | 'markEnd') {
    const time = getCurrentTime();
    if (time === null) return;
    if (type === 'markStart') dispatch({ type, time });
    else dispatch({ type, time, id: crypto.randomUUID() });
  }

  return (
    <section className="section-panel" aria-label="연습 구간">
      <div className="section-panel__marks">
        <button type="button" onClick={() => mark('markStart')}>
          여기부터
        </button>
        <button type="button" onClick={() => mark('markEnd')}>
          여기까지
        </button>
        <p className="message" aria-live="polite">
          {state.start === null ? '시작 위치를 표시하세요.' : `시작 ${formatTime(state.start)}`}
        </p>
      </div>
      {state.notice && (
        <p className="message message--error" role="alert">
          {NOTICE_MESSAGES[state.notice]}
        </p>
      )}
      {saveFailure && (
        <p className="message message--error" role="alert">
          {saveFailureMessage(saveFailure)}
        </p>
      )}

      <h2>구간 목록</h2>
      {state.sections.length === 0 ? (
        <p className="message">저장한 구간이 없습니다. 시작과 끝을 마킹해 구간을 저장하세요.</p>
      ) : (
        <ul className="section-list">
          {state.sections.map((section) => (
            <li key={section.id}>
              <button
                type="button"
                aria-pressed={section.id === state.selectedId}
                onClick={() => {
                  dispatch({ type: 'select', id: section.id });
                  onSelect?.(section);
                }}
              >
                {section.name} <span>{formatTime(section.start)} ~ {formatTime(section.end)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="message" role="status">
        {selected
          ? `연습 구간: ${selected.name} (${formatTime(selected.start)} ~ ${formatTime(selected.end)})`
          : '연습할 구간을 목록에서 고르세요.'}
      </p>
    </section>
  );
}

const NOTICE_MESSAGES: Record<SectionNotice, string> = {
  'no-start': '먼저 "여기부터"로 시작 위치를 표시하세요.',
  'end-before-start': '끝 위치가 시작 위치보다 앞서거나 같아 구간을 저장하지 않았습니다. 시작 뒤에서 다시 마킹하세요.',
};

function saveFailureMessage(failure: Extract<SaveResult, { ok: false }>): string {
  return failure.reason === 'quota-exceeded'
    ? '브라우저 저장 공간이 부족해 구간을 저장하지 못했습니다. 새로고침하면 이번에 마킹한 구간이 사라집니다.'
    : '브라우저 저장소에 쓰지 못해 구간을 저장하지 못했습니다. 새로고침하면 이번에 마킹한 구간이 사라집니다.';
}
