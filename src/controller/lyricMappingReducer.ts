// 가사·시간 매핑 편집 상태. PRD F3-1~F3-3, 기술 설계 문서의 "기능과 모듈 대응"(lyricParser, 화면)을 따른다.
// 순수 함수라 화면과 저장소에 의존하지 않는다. 저장은 lines·endT가 바뀌었을 때 호출하는 쪽(useLyricMapping)이 맡는다.

import { parseLyrics, serializeLyrics } from '../core/lyricParser.ts';
import type { Line } from '../types.ts';

/** 시간을 찍을 대상. 구절 번호(0부터) 또는 마지막 구절 다음 위치 */
export type StampTarget = number | 'end';

export type LyricMappingState = {
  /** 저장한 구절 목록 */
  lines: Line[];
  /** 마지막 구절 다음 위치(초). 없으면 null */
  endT: number | null;
  /** 입력란의 텍스트. "목록 만들기"를 눌러야 lines·endT에 반영된다 */
  draft: string;
  /** 시간을 찍을 대상으로 고른 항목 */
  selected: StampTarget | null;
};

export type LyricMappingAction =
  | { type: 'edit'; draft: string }
  /** 입력란을 파싱해 구절 목록을 바꾼다 */
  | { type: 'apply' }
  | { type: 'select'; target: StampTarget }
  /** 고른 항목의 시간을 `time`으로 기록하고, 이어서 찍을 수 있도록 다음 구절을 고른다 */
  | { type: 'stamp'; time: number };

export function initialLyricMappingState(lines: Line[], endT: number | null): LyricMappingState {
  return { lines, endT, draft: lines.length > 0 ? serializeLyrics(lines, endT) : '', selected: null };
}

export function lyricMappingReducer(state: LyricMappingState, action: LyricMappingAction): LyricMappingState {
  switch (action.type) {
    case 'edit':
      return { ...state, draft: action.draft };
    case 'apply': {
      const parsed = parseLyrics(state.draft);
      // 매칭용 정규화 텍스트(norm)는 저장하지 않는다
      const lines = parsed.lines.map(({ t, text }) => ({ t, text }));
      return { ...state, lines, endT: parsed.endT, selected: lines.length > 0 ? 0 : null };
    }
    case 'select':
      if (!isValidTarget(state, action.target)) return state;
      return { ...state, selected: action.target };
    case 'stamp': {
      const target = state.selected;
      if (target === null || !isValidTarget(state, target)) return state;
      const time = toStampTime(action.time);
      const next =
        target === 'end'
          ? { ...state, endT: time }
          : {
              ...state,
              lines: state.lines.map((line, index) => (index === target ? { ...line, t: time } : line)),
              selected: nextTarget(state, target),
            };
      // 입력란을 고치던 중이 아니면 찍은 시간을 입력란에도 반영해, 다시 "목록 만들기"를 눌러도 되돌아가지 않게 한다
      const unedited = state.draft === serializeLyrics(state.lines, state.endT);
      return unedited ? { ...next, draft: serializeLyrics(next.lines, next.endT) } : next;
    }
  }
}

/** 입력란을 지금 파싱한 결과. 화면이 "인식된 구절 수"를 바로 보여 줄 때 쓴다 */
export function previewDraft(draft: string): { lineCount: number; skipped: number[]; hasEnd: boolean } {
  const parsed = parseLyrics(draft);
  return { lineCount: parsed.lines.length, skipped: parsed.skipped, hasEnd: parsed.endT !== null };
}

function isValidTarget(state: LyricMappingState, target: StampTarget): boolean {
  if (target === 'end') return state.lines.length > 0;
  return Number.isInteger(target) && target >= 0 && target < state.lines.length;
}

/** 마지막 구절을 찍으면 마지막 구절 다음 위치로 넘어간다 */
function nextTarget(state: LyricMappingState, index: number): StampTarget {
  return index + 1 < state.lines.length ? index + 1 : 'end';
}

/** 플레이어 위치는 소수점 아래가 길어 0.1초 단위로 맞춘다. 음수는 0으로 본다(구간 마킹과 같은 규칙) */
function toStampTime(seconds: number): number {
  return Math.max(0, Math.round(seconds * 10) / 10);
}
