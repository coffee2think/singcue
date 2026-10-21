import { describe, expect, it } from 'vitest';
import type { Section } from '../types.ts';
import {
  initialSectionState,
  sectionReducer,
  selectedSection,
  type SectionAction,
  type SectionState,
} from './sectionReducer.ts';

const saved: Section = { id: 'a', name: '구간 1', start: 10, end: 20 };

function run(actions: SectionAction[], from: SectionState = initialSectionState([])) {
  return actions.reduce(sectionReducer, from);
}

describe('sectionReducer', () => {
  it('처음에는 저장된 구간만 있고 시작 표시·선택·안내가 없다', () => {
    expect(initialSectionState([saved])).toEqual({
      sections: [saved],
      start: null,
      selectedId: null,
      notice: null,
    });
  });

  it('"여기부터"는 현재 위치를 시작으로 표시하고, 다시 누르면 새 위치로 바꾼다', () => {
    const first = run([{ type: 'markStart', time: 12.34 }]);
    expect(first.start).toBe(12.3);
    expect(first.sections).toEqual([]);

    expect(run([{ type: 'markStart', time: 30 }], first).start).toBe(30);
  });

  it('위치는 0.1초 단위로 맞추고 음수는 0으로 본다', () => {
    expect(run([{ type: 'markStart', time: 7.06 }]).start).toBe(7.1);
    expect(run([{ type: 'markStart', time: -0.2 }]).start).toBe(0);
  });

  it('시작 뒤에 끝을 마킹하면 구간 하나로 저장하고 시작 표시를 비운다', () => {
    const state = run([
      { type: 'markStart', time: 12 },
      { type: 'markEnd', time: 34.56, id: 'x' },
    ]);
    expect(state.sections).toEqual([{ id: 'x', name: '구간 1', start: 12, end: 34.6 }]);
    expect(state.start).toBeNull();
    expect(state.notice).toBeNull();
  });

  it('구간을 여러 개 저장하고 이름에 순서를 붙인다', () => {
    const state = run(
      [
        { type: 'markStart', time: 40 },
        { type: 'markEnd', time: 50, id: 'b' },
        { type: 'markStart', time: 5 },
        { type: 'markEnd', time: 8, id: 'c' },
      ],
      initialSectionState([saved]),
    );
    expect(state.sections.map(({ id, name }) => [id, name])).toEqual([
      ['a', '구간 1'],
      ['b', '구간 2'],
      ['c', '구간 3'],
    ]);
  });

  it('끝이 시작보다 앞서면 저장하지 않고 안내하며, 시작 표시는 남긴다', () => {
    const state = run([
      { type: 'markStart', time: 30 },
      { type: 'markEnd', time: 20, id: 'x' },
    ]);
    expect(state.sections).toEqual([]);
    expect(state.notice).toBe('end-before-start');
    expect(state.start).toBe(30);
  });

  it('끝이 시작과 같으면(0.1초 단위) 저장하지 않는다', () => {
    const state = run([
      { type: 'markStart', time: 30 },
      { type: 'markEnd', time: 30.04, id: 'x' },
    ]);
    expect(state.sections).toEqual([]);
    expect(state.notice).toBe('end-before-start');
  });

  it('시작을 표시하지 않고 끝을 마킹하면 저장하지 않고 안내한다', () => {
    const state = run([{ type: 'markEnd', time: 20, id: 'x' }]);
    expect(state.sections).toEqual([]);
    expect(state.notice).toBe('no-start');
  });

  it('안내 뒤 다시 마킹해 저장하면 안내가 사라진다', () => {
    const state = run([
      { type: 'markStart', time: 30 },
      { type: 'markEnd', time: 20, id: 'x' },
      { type: 'markEnd', time: 40, id: 'y' },
    ]);
    expect(state.notice).toBeNull();
    expect(state.sections).toEqual([{ id: 'y', name: '구간 1', start: 30, end: 40 }]);
  });

  it('목록에서 고른 구간이 연습 구간이 된다', () => {
    const other: Section = { id: 'b', name: '구간 2', start: 40, end: 50 };
    const state = run([{ type: 'select', id: 'b' }], initialSectionState([saved, other]));
    expect(state.selectedId).toBe('b');
    expect(selectedSection(state)).toEqual(other);

    expect(selectedSection(run([{ type: 'select', id: 'a' }], state))).toEqual(saved);
  });

  it('없는 구간은 고를 수 없다', () => {
    const state = initialSectionState([saved]);
    expect(run([{ type: 'select', id: 'none' }], state)).toBe(state);
    expect(selectedSection(state)).toBeNull();
  });

  it('구간을 저장해도 연습 구간 선택은 그대로다', () => {
    const state = run(
      [
        { type: 'select', id: 'a' },
        { type: 'markStart', time: 40 },
        { type: 'markEnd', time: 50, id: 'b' },
      ],
      initialSectionState([saved]),
    );
    expect(state.selectedId).toBe('a');
  });

  it('구간 목록이 바뀌지 않는 동작은 같은 목록을 유지한다', () => {
    const state = initialSectionState([saved]);
    expect(run([{ type: 'markStart', time: 1 }], state).sections).toBe(state.sections);
    expect(run([{ type: 'markEnd', time: 0, id: 'x' }], state).sections).toBe(state.sections);
    expect(run([{ type: 'select', id: 'a' }], state).sections).toBe(state.sections);
  });
});
