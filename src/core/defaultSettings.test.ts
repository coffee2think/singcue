import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './defaultSettings.ts';

describe('DEFAULT_SETTINGS', () => {
  it('PRD 설정 항목 8개의 기본값과 같다', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      endAction: 'stop',
      preroll: 1.5,
      stopWords: ['잠깐', '스탑', '스톱', '정지', '멈춰', 'stop'],
      startWords: ['시작', '재생해', '틀어줘', '음악큐'],
      stopOnInterim: false,
      shortRuleChars: 2,
      similarityThreshold: 0.5,
      minPracticeSeconds: 3,
    });
    expect(Object.keys(DEFAULT_SETTINGS)).toHaveLength(8);
  });

  it('실수로 바꿀 수 없다', () => {
    expect(Object.isFrozen(DEFAULT_SETTINGS)).toBe(true);
  });
});
