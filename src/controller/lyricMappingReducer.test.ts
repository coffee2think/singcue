import { describe, expect, it } from 'vitest';
import type { Line } from '../types.ts';
import { initialLyricMappingState, lyricMappingReducer, previewDraft, type LyricMappingState } from './lyricMappingReducer.ts';

// 직접 만든 가상의 구절만 쓴다(examples/sample-video.json과 같은 구절)
const DRAFT = [
  '0:12 창문 너머 초록 버스가 지나가고',
  '0:18.4 주머니 속 동전 세 개를 세어 보네',
  '0:24.7 오늘은 조금 늦게 걸어도 괜찮아',
  '0:31',
].join('\n');
const LINES: Line[] = [
  { t: 12, text: '창문 너머 초록 버스가 지나가고' },
  { t: 18.4, text: '주머니 속 동전 세 개를 세어 보네' },
  { t: 24.7, text: '오늘은 조금 늦게 걸어도 괜찮아' },
];

function applied(draft = DRAFT): LyricMappingState {
  return lyricMappingReducer(lyricMappingReducer(initialLyricMappingState([], null), { type: 'edit', draft }), { type: 'apply' });
}

describe('initialLyricMappingState', () => {
  it('저장된 매핑이 있으면 입력란을 같은 형식의 텍스트로 채운다', () => {
    const state = initialLyricMappingState(LINES, 31);
    expect(state.draft).toBe(DRAFT);
    expect(state.selected).toBeNull();
  });

  it('저장된 구절이 없으면 입력란은 비어 있다', () => {
    expect(initialLyricMappingState([], null).draft).toBe('');
  });
});

describe('previewDraft', () => {
  it('입력 중인 텍스트의 인식된 구절 수와 세지 않은 줄을 알려 준다', () => {
    expect(previewDraft(`${DRAFT}\n형식이 아닌 줄`)).toEqual({ lineCount: 3, skipped: [5], hasEnd: true });
    expect(previewDraft('0:40 시간만 적은 줄 앞의 구절\n0:45\n0:50 뒤 구절')).toEqual({ lineCount: 2, skipped: [2], hasEnd: false });
  });
});

describe('lyricMappingReducer', () => {
  it('목록 만들기를 누르면 입력란을 구절 목록과 마지막 구절 다음 위치로 바꾸고 첫 구절을 고른다', () => {
    const state = applied();
    expect(state.lines).toEqual(LINES);
    expect(state.endT).toBe(31);
    expect(state.selected).toBe(0);
  });

  it('저장할 구절에는 매칭용 정규화 텍스트를 넣지 않는다', () => {
    expect(Object.keys(applied().lines[0]).sort()).toEqual(['t', 'text']);
  });

  it('입력만 바꾸면 구절 목록은 그대로다', () => {
    const state = applied();
    const next = lyricMappingReducer(state, { type: 'edit', draft: '0:01 새 구절' });
    expect(next.lines).toBe(state.lines);
    expect(next.endT).toBe(state.endT);
  });

  it('고른 구절에 현재 위치를 0.1초 단위로 기록하고 다음 구절을 고른다', () => {
    const state = lyricMappingReducer(applied(), { type: 'select', target: 1 });
    const next = lyricMappingReducer(state, { type: 'stamp', time: 19.04 });
    expect(next.lines[1]).toEqual({ t: 19, text: LINES[1].text });
    expect(next.lines[0]).toBe(state.lines[0]);
    expect(next.selected).toBe(2);
  });

  it('마지막 구절을 찍으면 마지막 구절 다음 위치로 넘어가고, 그 위치도 찍을 수 있다', () => {
    let state = lyricMappingReducer(applied(), { type: 'select', target: 2 });
    state = lyricMappingReducer(state, { type: 'stamp', time: 25.26 });
    expect(state.lines[2].t).toBe(25.3);
    expect(state.selected).toBe('end');
    state = lyricMappingReducer(state, { type: 'stamp', time: 33.33 });
    expect(state.endT).toBe(33.3);
    expect(state.selected).toBe('end');
  });

  it('입력란을 고치던 중이 아니면 찍은 시간을 입력란에도 반영한다', () => {
    const next = lyricMappingReducer(applied(), { type: 'stamp', time: 10 });
    expect(next.draft.split('\n')[0]).toBe('0:10 창문 너머 초록 버스가 지나가고');
  });

  it('입력란을 고치던 중이면 찍어도 입력란을 덮어쓰지 않는다', () => {
    const editing = lyricMappingReducer(applied(), { type: 'edit', draft: `${DRAFT}\n0:40 고치는 중` });
    const next = lyricMappingReducer(editing, { type: 'stamp', time: 10 });
    expect(next.lines[0].t).toBe(10);
    expect(next.draft).toBe(editing.draft);
  });

  it('고른 항목이 없거나 범위를 벗어나면 아무것도 바꾸지 않는다', () => {
    const empty = initialLyricMappingState([], null);
    expect(lyricMappingReducer(empty, { type: 'stamp', time: 5 })).toBe(empty);
    expect(lyricMappingReducer(empty, { type: 'select', target: 'end' })).toBe(empty);
    const state = applied();
    expect(lyricMappingReducer(state, { type: 'select', target: 3 })).toBe(state);
    expect(lyricMappingReducer(state, { type: 'select', target: -1 })).toBe(state);
  });

  it('음수 위치는 0으로 기록한다', () => {
    expect(lyricMappingReducer(applied(), { type: 'stamp', time: -0.3 }).lines[0].t).toBe(0);
  });

  it('형식에 맞는 줄이 없으면 빈 목록이 되고 고른 항목이 없다', () => {
    const state = applied('구절만 있는 줄');
    expect(state.lines).toEqual([]);
    expect(state.endT).toBeNull();
    expect(state.selected).toBeNull();
  });
});
