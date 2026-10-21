// 영상 하나의 구간 상태와 저장. 구간이 바뀔 때마다 `singcue:video:<videoId>`에 저장한다.

import { useState } from 'react';
import type { SaveResult, StorageAdapter } from '../adapters/storage.ts';
import type { Section } from '../types.ts';
import { initialSectionState, sectionReducer, type SectionAction, type SectionState } from './sectionReducer.ts';

/**
 * 같은 영상의 가사 매핑(lines, endT)은 다른 화면이 바꿀 수 있으므로, 저장 직전에 다시 읽어 구간만 바꾼다.
 */
export function saveSections(storage: StorageAdapter, videoId: string, sections: Section[]): SaveResult {
  return storage.saveVideo({ ...storage.loadVideo(videoId), sections });
}

export type UseSections = {
  state: SectionState;
  /** 마지막 저장이 실패했으면 그 결과. 성공하면 null로 돌아간다 */
  saveFailure: Extract<SaveResult, { ok: false }> | null;
  dispatch: (action: SectionAction) => void;
};

/**
 * `videoId`가 바뀌면 다른 영상의 상태가 섞이지 않도록, 이 훅을 쓰는 컴포넌트에 `key={videoId}`를 줘 새로 만든다.
 * 저장은 동작을 처리하는 시점에 한 번 하므로 효과(useEffect)를 쓰지 않는다.
 */
export function useSections(videoId: string, storage: StorageAdapter): UseSections {
  const [state, setState] = useState(() => initialSectionState(storage.loadVideo(videoId).sections));
  const [saveFailure, setSaveFailure] = useState<UseSections['saveFailure']>(null);

  function dispatch(action: SectionAction) {
    const next = sectionReducer(state, action);
    setState(next);
    if (next.sections === state.sections) return;
    const result = saveSections(storage, videoId, next.sections);
    setSaveFailure(result.ok ? null : result);
  }

  return { state, saveFailure, dispatch };
}
