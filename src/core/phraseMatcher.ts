// 구절 매칭. 기술 설계 문서의 "구절 매칭 설계"와 결정 기록 #20(반복 구절 선택)을 따른다.
// 인식 후보를 모든 가사 줄과 비교해 가장 비슷한 줄을 고르고, 기준 이상이면 그 다음 위치를 돌려준다.

import type { Line } from '../types.ts';
import { MAX_CANDIDATES } from './commandMatcher.ts';
import type { ParsedLine } from './lyricParser.ts';
import { normalize } from './normalize.ts';

export type MatchResult = {
  /** 가장 비슷한 줄. 비교할 후보나 줄이 없으면 -1 */
  lineIndex: number;
  /** 0~1 */
  score: number;
  /** score >= threshold. 비교할 후보나 줄이 없으면 false */
  passed: boolean;
  /** 이동할 시간(초). 프리롤은 빼지 않는다. 통과하지 못했거나 마지막 줄에 다음 위치가 없으면 null */
  seekTo: number | null;
};

/**
 * 인식 후보와 가장 비슷한 가사 줄을 고른다. 순수 함수다.
 * - 후보는 앞에서부터 최대 5개만 보고, 모든 후보 × 모든 줄의 점수 중 최고 점수의 줄을 고른다
 * - 최고 점수와 정확히 같은 줄이 여럿이면 `hint`로 하나를 고른다(`pickByHint`)
 * @param candidates 인식 후보 원문. 여기서 정규화한다
 * @param lines 입력 순서대로의 가사 줄. `ParsedLine`이면 `norm`을 그대로 쓴다
 * @param endT 마지막 구절 다음 위치(초). 없으면 null
 * @param threshold 통과 기준(0~1)
 * @param hint 최근 재생 위치(초). 보통 매칭 시점의 플레이어 현재 위치다
 */
export function matchPhrase(
  candidates: readonly string[],
  lines: readonly (Line | ParsedLine)[],
  endT: number | null,
  threshold: number,
  hint?: number | null,
): MatchResult {
  const heard = candidates
    .slice(0, MAX_CANDIDATES)
    .map(normalize)
    .filter((text) => text !== '');
  if (heard.length === 0 || lines.length === 0) {
    return { lineIndex: -1, score: 0, passed: false, seekTo: null };
  }

  let best = -1;
  let tied: number[] = [];
  lines.forEach((line, index) => {
    const norm = 'norm' in line ? line.norm : normalize(line.text);
    const score = Math.max(...heard.map((text) => phraseSimilarity(text, norm)));
    if (score > best) {
      best = score;
      tied = [index];
    } else if (score === best) {
      tied.push(index);
    }
  });

  const lineIndex = tied.length === 1 ? tied[0] : pickByHint(tied, lines, hint);
  const passed = best >= threshold;
  return { lineIndex, score: best, passed, seekTo: passed ? nextPosition(lineIndex, lines, endT) : null };
}

/**
 * 들은 말과 가사 줄의 유사도(0~1). 줄 전체와 비교한 값과,
 * 들은 말의 길이만큼 줄의 앞부분만 잘라 비교한 값 중 큰 값이다. 둘 다 정규화한 텍스트를 받는다.
 */
export function phraseSimilarity(heard: string, line: string): number {
  return Math.max(similarity(heard, line), similarity(heard, line.slice(0, heard.length)));
}

/** `1 − 편집 거리 / 더 긴 길이`. 한쪽이라도 비어 있으면 0이다 */
export function similarity(a: string, b: string): number {
  if (a === '' || b === '') return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

/** 글자(UTF-16 코드 단위) 단위 Levenshtein 편집 거리 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  // 한 행만 두고 갱신한다. prev[j]는 a의 앞 i글자와 b의 앞 j글자 사이 거리다
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = row;
  }
  return prev[b.length];
}

/**
 * 최고 점수가 같은 줄 중 하나를 고른다(결정 기록 #20).
 * 1. 시작 시간이 `hint` 이하인 줄 중 시작 시간이 가장 큰 줄(방금 부른 구절)
 * 2. 그런 줄이 없으면 `hint`와 시작 시간의 차이가 가장 작은 줄, 같으면 앞 줄
 * 3. `hint`가 없으면 첫 번째 줄
 */
function pickByHint(tied: readonly number[], lines: readonly Line[], hint: number | null | undefined): number {
  if (hint === null || hint === undefined || !Number.isFinite(hint)) return tied[0];

  let before: number | null = null;
  for (const index of tied) {
    // 시작 시간도 같으면 앞 줄을 남긴다
    if (lines[index].t <= hint && (before === null || lines[index].t > lines[before].t)) before = index;
  }
  if (before !== null) return before;

  let nearest = tied[0];
  for (const index of tied) {
    if (Math.abs(lines[index].t - hint) < Math.abs(lines[nearest].t - hint)) nearest = index;
  }
  return nearest;
}

/** 고른 줄의 다음 줄 시작 시간. 마지막 줄이면 `endT` */
function nextPosition(lineIndex: number, lines: readonly Line[], endT: number | null): number | null {
  return lineIndex + 1 < lines.length ? lines[lineIndex + 1].t : endT;
}
