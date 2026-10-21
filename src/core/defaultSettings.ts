import type { Settings } from '../types.ts';

/** PRD "설정 항목"의 기본값 */
export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  endAction: 'stop',
  preroll: 1.5,
  stopWords: ['잠깐', '스탑', '스톱', '정지', '멈춰', 'stop'],
  startWords: ['시작', '재생해', '틀어줘', '음악큐'],
  // PRD 미확정: 구현 후 반응 시간을 측정해 기본값을 정한다(#15). 그 전까지 최종 결과로 실행한다.
  stopOnInterim: false,
  shortRuleChars: 2,
  similarityThreshold: 0.5,
  minPracticeSeconds: 3,
});
