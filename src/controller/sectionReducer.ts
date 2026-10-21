// 구간 마킹·저장·선택 상태. PRD F1-2~F1-4, 기술 설계 문서의 "기능과 모듈 대응"(구간 reducer)을 따른다.
// 순수 함수라 화면과 저장소에 의존하지 않는다. 저장은 sections가 바뀌었을 때 호출하는 쪽(useSections)이 맡는다.

import type { Section } from '../types.ts';

/** 마킹이 받아들여지지 않은 이유. 화면이 안내 문구로 바꾼다 */
export type SectionNotice = 'no-start' | 'end-before-start';

export type SectionState = {
  /** 이 영상에 저장한 구간 */
  sections: Section[];
  /** "여기부터"로 표시한 시작 위치(초). 끝을 마킹해 구간이 저장되면 비운다 */
  start: number | null;
  /** 연습 구간으로 고른 구간 id */
  selectedId: string | null;
  notice: SectionNotice | null;
};

export type SectionAction =
  | { type: 'markStart'; time: number }
  /** 시작이 표시돼 있고 끝이 시작보다 뒤면 구간 하나로 저장한다. `id`는 새 구간의 id */
  | { type: 'markEnd'; time: number; id: string }
  | { type: 'select'; id: string };

export function initialSectionState(sections: Section[]): SectionState {
  return { sections, start: null, selectedId: null, notice: null };
}

export function sectionReducer(state: SectionState, action: SectionAction): SectionState {
  switch (action.type) {
    case 'markStart':
      return { ...state, start: toMarkTime(action.time), notice: null };
    case 'markEnd': {
      if (state.start === null) return { ...state, notice: 'no-start' };
      const end = toMarkTime(action.time);
      // 길이가 0인 구간은 연습할 수 없으므로 끝이 시작과 같아도 저장하지 않는다
      if (end <= state.start) return { ...state, notice: 'end-before-start' };
      const section: Section = {
        id: action.id,
        name: `구간 ${state.sections.length + 1}`,
        start: state.start,
        end,
      };
      return { ...state, sections: [...state.sections, section], start: null, notice: null };
    }
    case 'select':
      if (!state.sections.some((section) => section.id === action.id)) return state;
      return { ...state, selectedId: action.id, notice: null };
  }
}

export function selectedSection(state: SectionState): Section | null {
  return state.sections.find((section) => section.id === state.selectedId) ?? null;
}

/** 플레이어 위치는 소수점 아래가 길어 0.1초 단위로 맞춘다. 음수는 0으로 본다 */
function toMarkTime(seconds: number): number {
  return Math.max(0, Math.round(seconds * 10) / 10);
}
