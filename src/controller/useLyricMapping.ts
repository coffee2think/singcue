// 영상 하나의 가사 매핑 상태와 저장. 매핑이 바뀔 때마다 `singcue:video:<videoId>`에 저장한다.

import { useState } from 'react';
import type { SaveResult, StorageAdapter } from '../adapters/storage.ts';
import type { Line } from '../types.ts';
import {
  initialLyricMappingState,
  lyricMappingReducer,
  type LyricMappingAction,
  type LyricMappingState,
} from './lyricMappingReducer.ts';

/**
 * 같은 영상의 구간(sections)은 다른 화면이 바꿀 수 있으므로, 저장 직전에 다시 읽어 매핑만 바꾼다.
 */
export function saveLyricMapping(
  storage: StorageAdapter,
  videoId: string,
  lines: Line[],
  endT: number | null,
): SaveResult {
  return storage.saveVideo({ ...storage.loadVideo(videoId), lines, endT });
}

export type UseLyricMapping = {
  state: LyricMappingState;
  /** 마지막 저장이 실패했으면 그 결과. 성공하면 null로 돌아간다 */
  saveFailure: Extract<SaveResult, { ok: false }> | null;
  dispatch: (action: LyricMappingAction) => void;
};

/**
 * `videoId`가 바뀌면 다른 영상의 상태가 섞이지 않도록, 이 훅을 쓰는 컴포넌트에 `key={videoId}`를 줘 새로 만든다.
 * 저장은 동작을 처리하는 시점에 한 번 하므로 효과(useEffect)를 쓰지 않는다.
 */
export function useLyricMapping(videoId: string, storage: StorageAdapter): UseLyricMapping {
  const [state, setState] = useState(() => {
    const saved = storage.loadVideo(videoId);
    return initialLyricMappingState(saved.lines, saved.endT);
  });
  const [saveFailure, setSaveFailure] = useState<UseLyricMapping['saveFailure']>(null);

  function dispatch(action: LyricMappingAction) {
    const next = lyricMappingReducer(state, action);
    setState(next);
    if (next.lines === state.lines && next.endT === state.endT) return;
    const result = saveLyricMapping(storage, videoId, next.lines, next.endT);
    setSaveFailure(result.ok ? null : result);
  }

  return { state, saveFailure, dispatch };
}
