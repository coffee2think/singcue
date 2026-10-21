// 음성 명령 판별. 기술 설계 문서의 "음성 명령 처리 흐름"을 따른다.
// 명령어 포함 → 짧은 발화 → 상태 → 중복 순서로 확인해 실행·무시·구절 매칭 중 하나로 분류한다.

import type { Decision, PlaybackState, Settings } from '../types.ts';
import { normalize } from './normalize.ts';

/** 확인하는 인식 후보 수(PRD F4-1) */
export const MAX_CANDIDATES = 5;

/** 직전 명령 후 이 시간(ms) 안의 명령은 무시한다(PRD F2-5) */
export const DEBOUNCE_MS = 800;

type CommandSettings = Pick<Settings, 'stopWords' | 'startWords' | 'shortRuleChars'>;

/**
 * 인식 결과 하나를 판별한다. 순수 함수다.
 * @param candidates 인식 후보. 앞에서부터 최대 5개만 본다
 * @param state 현재 재생 상태
 * @param settings 명령어 목록과 짧은 발화 기준
 * @param lastCommandAt 직전 명령을 실행한 시각(ms). 없으면 null
 * @param now 판별 시각(ms). lastCommandAt과 같은 시계를 쓴다
 */
export function decide(
  candidates: readonly string[],
  state: PlaybackState,
  settings: CommandSettings,
  lastCommandAt: number | null,
  now: number,
): Decision {
  const texts = candidates.slice(0, MAX_CANDIDATES);
  const normalized = texts.map(normalize).filter((text) => text !== '');
  if (normalized.length === 0) return { action: 'ignore', reason: 'no-match' };

  const stopWords = normalizeWords(settings.stopWords);
  const startWords = normalizeWords(settings.startWords);
  // 명령어를 뺀 나머지 글자를 셀 때는 정지·시작 명령어를 모두 뺀다. "시작 멈춰"도 짧은 발화로 본다
  const allWords = [...stopWords, ...startWords].sort((a, b) => b.length - a.length);
  const isShort = (text: string) => remainder(text, allWords).length <= settings.shortRuleChars;

  let hasCommandWord = false;
  let stopPassed = false;
  let startPassed = false;
  for (const text of normalized) {
    const hasStop = stopWords.some((word) => text.includes(word));
    const hasStart = startWords.some((word) => text.includes(word));
    if (!hasStop && !hasStart) continue;
    hasCommandWord = true;
    if (!isShort(text)) continue;
    if (hasStop) stopPassed = true;
    else startPassed = true;
  }

  // 정지를 먼저 확인한다. 한 발화에 정지와 시작이 함께 있으면 정지를 따른다
  let decision: Decision;
  if (stopPassed) decision = { action: 'stop' };
  else if (startPassed) decision = { action: 'start' };
  else if (hasCommandWord) return { action: 'ignore', reason: 'short-rule' };
  else decision = { action: 'phrase', candidates: texts.filter((text) => normalize(text) !== '') };

  if (!allowedIn(decision.action, state)) return { action: 'ignore', reason: 'state' };
  if (lastCommandAt !== null && now - lastCommandAt < DEBOUNCE_MS) {
    return { action: 'ignore', reason: 'debounce' };
  }
  return decision;
}

/** 재생 중에는 정지만, 정지 상태에서는 시작과 구절만 받는다. 준비 전에는 모두 무시한다(PRD F2-5) */
function allowedIn(action: 'stop' | 'start' | 'phrase', state: PlaybackState): boolean {
  if (state === 'playing') return action === 'stop';
  if (state === 'stopped') return action !== 'stop';
  return false;
}

function normalizeWords(words: readonly string[]): string[] {
  return words.map(normalize).filter((word) => word !== '');
}

function remainder(text: string, words: readonly string[]): string {
  return words.reduce((rest, word) => rest.split(word).join(''), text);
}
