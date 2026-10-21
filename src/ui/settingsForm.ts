// 설정 패널 입력값 확인. PRD "설정 항목"의 범위(프리롤 0초 이상, 짧은 발화 허용 글자 수 0 이상의 정수)를 따른다.
// 연습 1회 최소 재생 시간(단계 5)은 PRD에 "변경 가능"으로만 정해져 있어 프리롤과 같이 0초 이상의 숫자로 받는다.
// 유사도 기준(단계 4, F4-4)은 PRD의 범위대로 0~1 사이의 숫자로 받는다.
// 화면은 입력란 문자열을 그대로 들고 있고, 저장할 때 이 파일의 함수로 Settings로 바꾼다.

import { DEFAULT_SETTINGS } from '../core/defaultSettings.ts';
import { normalize } from '../core/normalize.ts';
import type { EndAction, Settings } from '../types.ts';

/** 설정 패널에서 바꾸는 항목(단계 2, 단계 4의 유사도 기준, 단계 5의 최소 재생 시간) */
export type PanelSettings = Pick<
  Settings,
  | 'endAction'
  | 'preroll'
  | 'stopWords'
  | 'startWords'
  | 'stopOnInterim'
  | 'shortRuleChars'
  | 'similarityThreshold'
  | 'minPracticeSeconds'
>;

/** 입력란 상태. 숫자와 명령어 목록은 입력한 글자 그대로 둔다 */
export type SettingsDraft = {
  endAction: EndAction;
  preroll: string;
  stopWords: string;
  startWords: string;
  stopOnInterim: boolean;
  shortRuleChars: string;
  similarityThreshold: string;
  minPracticeSeconds: string;
};

export type DraftField =
  | 'preroll'
  | 'shortRuleChars'
  | 'similarityThreshold'
  | 'minPracticeSeconds'
  | 'stopWords'
  | 'startWords';
export type DraftErrors = Partial<Record<DraftField, string>>;

export const SETTINGS_ERROR_MESSAGES = Object.freeze({
  preroll: '프리롤은 0 이상의 숫자(초)로 입력하세요.',
  shortRuleChars: '짧은 발화 허용 글자 수는 0 이상의 정수로 입력하세요.',
  similarityThreshold: '유사도 기준은 0 이상 1 이하의 숫자로 입력하세요.',
  minPracticeSeconds: '최소 재생 시간은 0 이상의 숫자(초)로 입력하세요.',
  stopWords: '정지 명령어를 하나 이상 입력하세요.',
  startWords: '시작 명령어를 하나 이상 입력하세요.',
  overlap: (words: readonly string[]) =>
    `정지 명령어가 들어 있는 시작 명령어는 정지로 인식됩니다(${words.join(', ')}). 바꾸거나 빼세요.`,
});

export const END_ACTION_LABELS: Readonly<Record<EndAction, string>> = Object.freeze({
  stop: '자동 정지',
  repeat: '자동 반복',
  continue: '계속 재생',
});

/** 명령어 목록은 한 줄에 하나씩 보여 준다 */
export function toDraft(settings: PanelSettings): SettingsDraft {
  return {
    endAction: settings.endAction,
    preroll: String(settings.preroll),
    stopWords: settings.stopWords.join('\n'),
    startWords: settings.startWords.join('\n'),
    stopOnInterim: settings.stopOnInterim,
    shortRuleChars: String(settings.shortRuleChars),
    similarityThreshold: String(settings.similarityThreshold),
    minPracticeSeconds: String(settings.minPracticeSeconds),
  };
}

/** 기본값으로 되돌릴 때의 입력란 상태 */
export function defaultDraft(): SettingsDraft {
  return toDraft(DEFAULT_SETTINGS);
}

/** 0 이상의 유한한 숫자. 빈 입력, "1e400", "-0.5", "1.5초"는 받지 않는다 */
export function parsePreroll(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** 0 이상의 정수. "2.0", "-1", "1e2"는 받지 않는다 */
export function parseShortRuleChars(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

/** 0 이상 1 이하의 숫자. "1.5", "-0.1", "50%", "1e-1"은 받지 않는다 */
export function parseSimilarityThreshold(text: string): number | null {
  const value = parsePreroll(text);
  return value !== null && value <= 1 ? value : null;
}

/**
 * 줄바꿈이나 쉼표로 나눈 명령어 목록. 앞뒤 공백을 지우고, 판별에 쓰이지 않는 항목(정규화하면 빈 글자)과
 * 정규화한 결과가 앞 항목과 같은 중복("Stop"과 "stop")을 뺀다
 */
export function parseWordList(text: string): string[] {
  const seen = new Set<string>();
  const words: string[] = [];
  for (const raw of text.split(/[\n,]/)) {
    const word = raw.trim();
    const key = normalize(word);
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    words.push(word);
  }
  return words;
}

/**
 * 정지 명령어가 들어 있는 시작 명령어. commandMatcher는 발화에 정지 명령어가 있으면 정지로 보므로
 * 이런 시작 명령어("정지"가 들어 있는 "정지해제" 등)로는 시작할 수 없다
 */
export function overlappingWords(stopWords: readonly string[], startWords: readonly string[]): string[] {
  const stopKeys = stopWords.map(normalize).filter((key) => key !== '');
  return startWords.filter((word) => stopKeys.some((key) => normalize(word).includes(key)));
}

export type DraftResult = { ok: true; settings: PanelSettings } | { ok: false; errors: DraftErrors };

/** 입력란 상태를 확인한다. 하나라도 틀리면 항목별 안내를 돌려준다 */
export function readDraft(draft: SettingsDraft): DraftResult {
  const preroll = parsePreroll(draft.preroll);
  const shortRuleChars = parseShortRuleChars(draft.shortRuleChars);
  const similarityThreshold = parseSimilarityThreshold(draft.similarityThreshold);
  // 프리롤과 같은 범위(0 이상의 유한한 숫자)라 같은 함수로 읽는다
  const minPracticeSeconds = parsePreroll(draft.minPracticeSeconds);
  const stopWords = parseWordList(draft.stopWords);
  const startWords = parseWordList(draft.startWords);

  const errors: DraftErrors = {};
  if (preroll === null) errors.preroll = SETTINGS_ERROR_MESSAGES.preroll;
  if (shortRuleChars === null) errors.shortRuleChars = SETTINGS_ERROR_MESSAGES.shortRuleChars;
  if (similarityThreshold === null) errors.similarityThreshold = SETTINGS_ERROR_MESSAGES.similarityThreshold;
  if (minPracticeSeconds === null) errors.minPracticeSeconds = SETTINGS_ERROR_MESSAGES.minPracticeSeconds;
  // 목록을 비우면 음성으로 정지·시작할 수 없게 되므로 막는다
  if (stopWords.length === 0) errors.stopWords = SETTINGS_ERROR_MESSAGES.stopWords;
  if (startWords.length === 0) errors.startWords = SETTINGS_ERROR_MESSAGES.startWords;
  const overlap = overlappingWords(stopWords, startWords);
  if (overlap.length > 0) errors.startWords = SETTINGS_ERROR_MESSAGES.overlap(overlap);
  if (
    preroll === null ||
    shortRuleChars === null ||
    similarityThreshold === null ||
    minPracticeSeconds === null ||
    Object.keys(errors).length > 0
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    settings: {
      endAction: draft.endAction,
      preroll,
      stopWords,
      startWords,
      stopOnInterim: draft.stopOnInterim,
      shortRuleChars,
      similarityThreshold,
      minPracticeSeconds,
    },
  };
}
