import { describe, expect, it } from 'vitest';
import type { PlaybackState } from '../types.ts';
import { DEBOUNCE_MS, decide, MAX_CANDIDATES } from './commandMatcher.ts';
import { DEFAULT_SETTINGS } from './defaultSettings.ts';

const NOW = 10_000;

/** 직전 명령 없이 판별한다 */
function judge(candidates: string[], state: PlaybackState, settings = DEFAULT_SETTINGS) {
  return decide(candidates, state, settings, null, NOW);
}

describe('decide', () => {
  describe('정지·시작 명령', () => {
    it.each(DEFAULT_SETTINGS.stopWords)('재생 중 "%s"는 정지다', (word) => {
      expect(judge([word], 'playing')).toEqual({ action: 'stop' });
    });

    it.each(DEFAULT_SETTINGS.startWords)('정지 상태에서 "%s"는 시작이다', (word) => {
      expect(judge([word], 'stopped')).toEqual({ action: 'start' });
    });

    it('대소문자, 공백, 기호를 무시한다', () => {
      expect(judge(['STOP!'], 'playing')).toEqual({ action: 'stop' });
      expect(judge([' 재생 해. '], 'stopped')).toEqual({ action: 'start' });
    });

    it('설정의 명령어도 정규화해 비교한다', () => {
      const settings = { ...DEFAULT_SETTINGS, startWords: ['Go Go'] };
      expect(judge(['gogo'], 'stopped', settings)).toEqual({ action: 'start' });
    });
  });

  describe('정지 우선', () => {
    it('한 후보에 정지와 시작이 함께 있으면 정지다', () => {
      expect(judge(['시작 멈춰'], 'playing')).toEqual({ action: 'stop' });
      expect(judge(['멈춰 시작'], 'playing')).toEqual({ action: 'stop' });
    });

    it('정지 상태에서도 정지를 따르므로 상태 때문에 무시된다', () => {
      expect(judge(['시작 정지'], 'stopped')).toEqual({ action: 'ignore', reason: 'state' });
    });

    it('후보끼리 정지와 시작이 갈리면 정지다', () => {
      expect(judge(['시작', '스탑'], 'playing')).toEqual({ action: 'stop' });
      expect(judge(['시작', '스탑'], 'stopped')).toEqual({ action: 'ignore', reason: 'state' });
    });
  });

  describe('인식 후보', () => {
    it('첫 후보가 아니어도 조건을 만족하는 후보가 있으면 통과한다', () => {
      expect(judge(['오늘 날씨가 좋네요', '멈추다', '멈춰'], 'playing')).toEqual({ action: 'stop' });
    });

    it(`앞에서부터 ${MAX_CANDIDATES}개까지만 본다`, () => {
      const filler = ['하나', '둘', '셋', '넷', '다섯'];
      expect(judge([...filler.slice(0, 4), '멈춰'], 'playing')).toEqual({ action: 'stop' });
      expect(judge([...filler, '멈춰'], 'playing')).toEqual({ action: 'ignore', reason: 'state' });
    });

    it('한 후보가 짧은 발화 규칙에 걸려도 다른 후보가 통과하면 통과한다', () => {
      expect(judge(['정지 버튼을 눌러요', '정지'], 'playing')).toEqual({ action: 'stop' });
    });

    it('후보가 없거나 모두 비어 있으면 no-match다', () => {
      expect(judge([], 'stopped')).toEqual({ action: 'ignore', reason: 'no-match' });
      expect(judge(['', ' ...'], 'stopped')).toEqual({ action: 'ignore', reason: 'no-match' });
    });
  });

  describe('짧은 발화 규칙', () => {
    it('명령어를 뺀 나머지가 2자 이하이면 통과한다', () => {
      expect(judge(['시작해'], 'stopped')).toEqual({ action: 'start' });
      expect(judge(['시작해요'], 'stopped')).toEqual({ action: 'start' });
      expect(judge(['잠깐만요'], 'playing')).toEqual({ action: 'stop' });
    });

    it('나머지가 2자를 넘으면 short-rule로 무시한다', () => {
      expect(judge(['시작해볼까'], 'stopped')).toEqual({ action: 'ignore', reason: 'short-rule' });
      expect(judge(['잠깐만요여기'], 'playing')).toEqual({ action: 'ignore', reason: 'short-rule' });
    });

    it('정지와 시작 명령어를 모두 빼고 센다', () => {
      expect(judge(['잠깐 멈춰'], 'playing')).toEqual({ action: 'stop' });
    });

    it('기준 글자 수는 설정값을 따른다', () => {
      const strict = { ...DEFAULT_SETTINGS, shortRuleChars: 0 };
      expect(judge(['시작해'], 'stopped', strict)).toEqual({ action: 'ignore', reason: 'short-rule' });
      expect(judge(['시작'], 'stopped', strict)).toEqual({ action: 'start' });
      const loose = { ...DEFAULT_SETTINGS, shortRuleChars: 3 };
      expect(judge(['시작해볼까'], 'stopped', loose)).toEqual({ action: 'start' });
    });

    it('재생 중이든 정지 상태든 명령어가 섞인 문장은 구절로도 넘기지 않는다', () => {
      expect(judge(['다시 시작해 볼까요'], 'playing')).toEqual({ action: 'ignore', reason: 'short-rule' });
      expect(judge(['다시 시작해 볼까요'], 'stopped')).toEqual({ action: 'ignore', reason: 'short-rule' });
    });
  });

  describe('상태별 통과 규칙', () => {
    it('재생 중에는 정지만 통과한다', () => {
      expect(judge(['멈춰'], 'playing')).toEqual({ action: 'stop' });
      expect(judge(['시작'], 'playing')).toEqual({ action: 'ignore', reason: 'state' });
      expect(judge(['아무 구절이나'], 'playing')).toEqual({ action: 'ignore', reason: 'state' });
    });

    it('정지 상태에서는 시작과 구절만 통과한다', () => {
      expect(judge(['멈춰'], 'stopped')).toEqual({ action: 'ignore', reason: 'state' });
      expect(judge(['시작'], 'stopped')).toEqual({ action: 'start' });
      expect(judge(['아무 구절이나', '아무 구절 이나'], 'stopped')).toEqual({
        action: 'phrase',
        candidates: ['아무 구절이나', '아무 구절 이나'],
      });
    });

    it('구절 후보는 원문 그대로, 빈 후보와 6번째 이후 후보는 빼고 넘긴다', () => {
      const candidates = ['가', ' ', '나', '다', '라', '마'];
      expect(judge(candidates, 'stopped')).toEqual({
        action: 'phrase',
        candidates: ['가', '나', '다', '라'],
      });
    });

    it('준비 전에는 모두 무시한다', () => {
      expect(judge(['멈춰'], 'unready')).toEqual({ action: 'ignore', reason: 'state' });
      expect(judge(['시작'], 'unready')).toEqual({ action: 'ignore', reason: 'state' });
      expect(judge(['아무 구절이나'], 'unready')).toEqual({ action: 'ignore', reason: 'state' });
    });
  });

  describe('중복 방지', () => {
    it(`직전 명령 후 ${DEBOUNCE_MS}ms 안이면 debounce로 무시한다`, () => {
      expect(decide(['멈춰'], 'playing', DEFAULT_SETTINGS, NOW - 1, NOW)).toEqual({
        action: 'ignore',
        reason: 'debounce',
      });
      expect(decide(['시작'], 'stopped', DEFAULT_SETTINGS, NOW - DEBOUNCE_MS + 1, NOW)).toEqual({
        action: 'ignore',
        reason: 'debounce',
      });
      expect(decide(['구절'], 'stopped', DEFAULT_SETTINGS, NOW - 500, NOW)).toEqual({
        action: 'ignore',
        reason: 'debounce',
      });
    });

    it(`${DEBOUNCE_MS}ms가 지나면 통과한다`, () => {
      expect(decide(['멈춰'], 'playing', DEFAULT_SETTINGS, NOW - DEBOUNCE_MS, NOW)).toEqual({
        action: 'stop',
      });
      expect(decide(['멈춰'], 'playing', DEFAULT_SETTINGS, NOW - 5_000, NOW)).toEqual({
        action: 'stop',
      });
    });

    it('직전 명령이 없으면 시간을 보지 않는다', () => {
      expect(decide(['멈춰'], 'playing', DEFAULT_SETTINGS, null, 0)).toEqual({ action: 'stop' });
    });

    it('상태나 짧은 발화 규칙에 먼저 걸리면 그 이유를 돌려준다', () => {
      expect(decide(['시작'], 'playing', DEFAULT_SETTINGS, NOW, NOW)).toEqual({
        action: 'ignore',
        reason: 'state',
      });
      expect(decide(['시작해볼까'], 'stopped', DEFAULT_SETTINGS, NOW, NOW)).toEqual({
        action: 'ignore',
        reason: 'short-rule',
      });
    });
  });

  // PoC 로그(2026-10-21)에서 가사가 시작 명령으로 오인식된 2건. 저장소에 가사를 넣지 않으므로
  // 이슈 #8에 적힌 조각만 쓴다. 실제 발화는 정규화 후 각각 10자, 9자였다.
  describe('PoC 오인식 회귀', () => {
    it.each(['playing', 'stopped'] as const)('"…시작을 하다 보면"은 %s 상태에서 short-rule이다', (state) => {
      expect(judge(['…시작을 하다 보면'], state)).toEqual({ action: 'ignore', reason: 'short-rule' });
    });

    it.each(['playing', 'stopped'] as const)('"시작이고…"는 %s 상태에서 short-rule이다', (state) => {
      // 조각만으로는 나머지가 "이고" 2자라 규칙 경계에 걸리지 않는다. "…" 뒤에 이어진 가사 자리를
      // 가사가 아닌 자리표시 글자로 채워 실제 발화 길이(정규화 후 9자)를 맞춘다.
      expect(judge(['시작이고… 가나다라마'], state)).toEqual({ action: 'ignore', reason: 'short-rule' });
    });
  });
});
