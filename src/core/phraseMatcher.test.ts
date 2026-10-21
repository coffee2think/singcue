import { describe, expect, it } from 'vitest';
import type { Line } from '../types.ts';
import { parseLyrics } from './lyricParser.ts';
import { levenshtein, matchPhrase, phraseSimilarity, similarity } from './phraseMatcher.ts';

// 직접 만든 가상의 구절만 쓴다(examples/sample-video.json과 같은 구절)
const SAMPLE = parseLyrics(
  [
    '0:12 창문 너머 초록 버스가 지나가고',
    '0:18.4 주머니 속 동전 세 개를 세어 보네',
    '0:24.7 오늘은 조금 늦게 걸어도 괜찮아',
    '0:31 라라라 노란 우산을 펴고',
    '0:37.2 빗방울 숫자만큼 웃어 볼래',
    '0:44.8 라라라 내일 또 만나자',
    '0:52.5',
  ].join('\n'),
);
const THRESHOLD = 0.5;

function match(candidates: string[], threshold = THRESHOLD) {
  return matchPhrase(candidates, SAMPLE.lines, SAMPLE.endT, threshold);
}

describe('levenshtein', () => {
  it('삽입·삭제·치환을 1씩 센다', () => {
    expect(levenshtein('', '')).toBe(0);
    expect(levenshtein('가나다', '가나다')).toBe(0);
    expect(levenshtein('가나다', '가다')).toBe(1);
    expect(levenshtein('가다', '가나다')).toBe(1);
    expect(levenshtein('가나다', '가니다')).toBe(1);
    expect(levenshtein('', '가나')).toBe(2);
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });
});

describe('similarity', () => {
  it('1 − 거리 / 더 긴 길이다', () => {
    expect(similarity('가나다라', '가나다라')).toBe(1);
    expect(similarity('가나다라', '가나다마')).toBe(0.75);
    expect(similarity('가나', '가나다라')).toBe(0.5);
    expect(similarity('kitten', 'sitting')).toBe(1 - 3 / 7);
  });

  it('한쪽이라도 비어 있으면 0이다', () => {
    expect(similarity('', '가나')).toBe(0);
    expect(similarity('가나', '')).toBe(0);
    expect(similarity('', '')).toBe(0);
  });
});

describe('phraseSimilarity', () => {
  it('줄 전체 비교와 들은 말 길이만큼 앞부분 비교 중 큰 값을 쓴다', () => {
    // 전체 비교는 2/8, 앞부분 "가나"와 비교하면 1
    expect(similarity('가나', '가나다라마바사아')).toBe(0.25);
    expect(phraseSimilarity('가나', '가나다라마바사아')).toBe(1);
    // 앞부분만 맞지 않으면 전체 비교가 더 클 수 있다
    expect(phraseSimilarity('나다라마바사아', '가나다라마바사아')).toBe(similarity('나다라마바사아', '가나다라마바사아'));
  });

  it('들은 말이 줄보다 길면 줄 전체와 비교한 값이다', () => {
    expect(phraseSimilarity('가나다라', '가나')).toBe(0.5);
  });
});

describe('matchPhrase', () => {
  it('가장 비슷한 줄을 고르고 통과하면 다음 줄의 시작 시간을 돌려준다', () => {
    expect(match(['창문 너머 초록 버스가 지나가고'])).toEqual({ lineIndex: 0, score: 1, passed: true, seekTo: 18.4 });
    expect(match(['오늘은 조금 늦게 걸어도 괜찮아'])).toEqual({ lineIndex: 2, score: 1, passed: true, seekTo: 31 });
  });

  it('공백·기호·대소문자 차이는 무시한다', () => {
    expect(match(['창문너머, 초록버스가... 지나가고!'])).toMatchObject({ lineIndex: 0, score: 1 });
  });

  it('줄의 앞부분만 말해도 그 줄을 고른다', () => {
    expect(match(['창문 너머'])).toEqual({ lineIndex: 0, score: 1, passed: true, seekTo: 18.4 });
  });

  it('후보 모두를 모든 줄과 비교해 가장 높은 점수의 줄을 고른다', () => {
    const result = match(['오늘은 점심 뭐 먹지', '빗방울 숫자 많큼 우서 볼래', '비 방울 수자 만큼 웃어볼래']);
    expect(result.lineIndex).toBe(4);
    expect(result.score).toBeCloseTo(9 / 11);
    expect(result.seekTo).toBe(44.8);
  });

  it('후보는 앞에서부터 5개만 본다', () => {
    const noise = ['쿠', '퀴', '큐', '캬', '켜'];
    expect(match([...noise, '창문 너머 초록 버스가 지나가고']).score).toBeLessThan(THRESHOLD);
    expect(match([...noise.slice(0, 4), '창문 너머 초록 버스가 지나가고']).score).toBe(1);
  });

  it('passed는 score >= threshold다', () => {
    const { score } = match(['라라 노랑 우산 펴고']);
    expect(match(['라라 노랑 우산 펴고'], score).passed).toBe(true);
    expect(match(['라라 노랑 우산 펴고'], score + 0.001).passed).toBe(false);
    expect(match(['창문 너머 초록 버스가 지나가고'], 1).passed).toBe(true);
    expect(match(['창문 너머 초록 버스가 지나가고'], 0).passed).toBe(true);
  });

  it('기준 미만이면 가장 가까운 줄과 점수를 돌려주고 이동하지 않는다', () => {
    const result = match(['오늘은 점심 뭐 먹지']);
    expect(result).toMatchObject({ lineIndex: 2, passed: false, seekTo: null });
    expect(result.score).toBeCloseTo(0.375);
  });

  it('마지막 줄이면 endT를 돌려준다', () => {
    expect(match(['라라라 내일 또 만나자'])).toEqual({ lineIndex: 5, score: 1, passed: true, seekTo: 52.5 });
  });

  it('마지막 줄에 endT가 없으면 통과해도 seekTo는 null이다', () => {
    expect(matchPhrase(['라라라 내일 또 만나자'], SAMPLE.lines, null, THRESHOLD)).toEqual({
      lineIndex: 5,
      score: 1,
      passed: true,
      seekTo: null,
    });
  });

  it('seekTo에서 프리롤을 빼지 않는다(호출 측이 적용한다)', () => {
    expect(match(['창문 너머 초록 버스가 지나가고']).seekTo).toBe(SAMPLE.lines[1].t);
  });

  it('ParsedLine이면 norm을 쓰고, Line이면 text를 정규화한다', () => {
    const parsed = [{ t: 0, text: '원문', norm: '가나다' }];
    expect(matchPhrase(['가나다'], parsed, null, THRESHOLD).score).toBe(1);
    const plain: Line[] = [{ t: 0, text: '가나, 다!' }];
    expect(matchPhrase(['가나다'], plain, null, THRESHOLD).score).toBe(1);
  });

  it('정규화하면 비는 줄(기호만 있는 줄)은 점수 0이라 골라지지 않는다', () => {
    const { lines, endT } = parseLyrics('0:01 ~~~\n0:05 파란 의자에 앉아\n0:09');
    expect(matchPhrase(['파란 의자'], lines, endT, THRESHOLD)).toMatchObject({ lineIndex: 1, seekTo: 9 });
  });

  it('비교할 후보나 줄이 없으면 lineIndex -1, 통과하지 않음이다', () => {
    const none = { lineIndex: -1, score: 0, passed: false, seekTo: null };
    expect(matchPhrase([], SAMPLE.lines, SAMPLE.endT, 0)).toEqual(none);
    expect(matchPhrase([' ', '...'], SAMPLE.lines, SAMPLE.endT, 0)).toEqual(none);
    expect(matchPhrase(['창문 너머'], [], 10, 0)).toEqual(none);
  });
});

// PoC의 점수 분포를 가상의 구절과 가상의 오인식으로 재현한다(기술 설계 문서 "구절 매칭 설계")
describe('PoC 점수 분포 재현', () => {
  it.each([
    ['창문 너머 초록 버스가 지나가고', 0, 1],
    ['창문너머 초록버스가 지나가구', 0, 1 - 1 / 13],
    ['주머니 속 동전 세게를 세어 보네', 1, 1 - 1 / 13],
    ['창문너머 초록바스가', 0, 1 - 1 / 9],
  ])('정확 인식(0.85~1.00): "%s" → %i번 줄', (heard, lineIndex, score) => {
    const result = match([heard]);
    expect(result.lineIndex).toBe(lineIndex);
    expect(result.score).toBeCloseTo(score);
    expect(result.score).toBeGreaterThanOrEqual(0.85);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.passed).toBe(true);
  });

  it.each([
    ['창문 넘어 초롱 버스 가지 나가고', 0, 1 - 3 / 13],
    ['주먹이 속 동정 세개를 새어 보내', 1, 1 - 5 / 13],
    ['오늘 조금 늦게 걸어 두 괜찮아', 2, 1 - 2 / 13],
    ['라라 노랑 우산 펴고', 3, 1 - 3 / 10],
    ['빗방울 숫자 많큼 우서 볼래', 4, 1 - 3 / 11],
    ['비 방울 수자 만큼 웃어볼래', 4, 1 - 2 / 11],
    ['빈 방 숫자만 웃어 보래', 4, 1 - 4 / 11],
  ])('어려운 구절(0.50~0.89)도 기준 0.5에서 통과: "%s" → %i번 줄', (heard, lineIndex, score) => {
    const result = match([heard]);
    expect(result.lineIndex).toBe(lineIndex);
    expect(result.score).toBeCloseTo(score);
    expect(result.score).toBeGreaterThanOrEqual(0.5);
    expect(result.score).toBeLessThanOrEqual(0.89);
    expect(result).toMatchObject({ passed: true, seekTo: SAMPLE.lines[lineIndex + 1].t });
  });

  it('가사와 관계없는 말은 기준 0.5에서 통과하지 않는다', () => {
    expect(match(['오늘은 점심 뭐 먹지']).passed).toBe(false);
    expect(match(['오느른 조금 느께 거러도 괜차나']).passed).toBe(false);
  });
});

// 결정 기록 #20: 최고 점수가 정확히 같은 줄이 여럿이면 hint(최근 재생 위치)로 고른다
describe('반복 구절 선택(hint)', () => {
  const CHORUS = parseLyrics(
    [
      '0:10 하나 둘 셋 별을 세면',
      '0:16 바다 건너 바람이 불어',
      '0:22 하나 둘 셋 별을 세면',
      '0:28 구름 위로 날아가자',
      '0:34',
    ].join('\n'),
  );
  const sing = (hint?: number | null) => matchPhrase(['하나 둘 셋 별을 세면'], CHORUS.lines, CHORUS.endT, THRESHOLD, hint);

  it('1. hint 이하에서 시작하는 줄 중 시작 시간이 가장 큰 줄을 고른다', () => {
    expect(sing(25)).toEqual({ lineIndex: 2, score: 1, passed: true, seekTo: 28 });
    expect(sing(50)).toMatchObject({ lineIndex: 2, seekTo: 28 });
    expect(sing(15)).toMatchObject({ lineIndex: 0, seekTo: 16 });
    // 시작 시간과 hint가 같으면 그 줄도 hint 이하다
    expect(sing(22)).toMatchObject({ lineIndex: 2, seekTo: 28 });
  });

  it('2. hint 이하인 줄이 없으면 hint와 가장 가까운 줄을 고른다', () => {
    expect(sing(3)).toMatchObject({ lineIndex: 0, seekTo: 16 });
    // 입력 순서와 시간이 다를 때도 시간 차이로 고른다
    const unordered: Line[] = [
      { t: 40, text: '하나 둘 셋 별을 세면' },
      { t: 46, text: '바다 건너 바람이 불어' },
      { t: 30, text: '하나 둘 셋 별을 세면' },
      { t: 36, text: '구름 위로 날아가자' },
    ];
    expect(matchPhrase(['하나 둘 셋 별을 세면'], unordered, null, THRESHOLD, 5)).toMatchObject({ lineIndex: 2, seekTo: 36 });
  });

  it('2. 시간 차이도 같으면 앞 줄을 고른다', () => {
    const sameTime: Line[] = [
      { t: 20, text: '하나 둘 셋 별을 세면' },
      { t: 26, text: '바다 건너 바람이 불어' },
      { t: 20, text: '하나 둘 셋 별을 세면' },
      { t: 32, text: '구름 위로 날아가자' },
    ];
    expect(matchPhrase(['하나 둘 셋 별을 세면'], sameTime, null, THRESHOLD, 5)).toMatchObject({ lineIndex: 0, seekTo: 26 });
    // hint 이하인 줄의 시작 시간이 같을 때도 앞 줄이다
    expect(matchPhrase(['하나 둘 셋 별을 세면'], sameTime, null, THRESHOLD, 25)).toMatchObject({ lineIndex: 0 });
  });

  it('3. hint가 없으면 첫 번째 줄을 고른다', () => {
    expect(sing()).toMatchObject({ lineIndex: 0, seekTo: 16 });
    expect(sing(null)).toMatchObject({ lineIndex: 0, seekTo: 16 });
    expect(sing(Number.NaN)).toMatchObject({ lineIndex: 0, seekTo: 16 });
  });

  it('최고 점수가 하나뿐이면 hint와 관계없이 그 줄을 고른다', () => {
    expect(
      matchPhrase(['바다 건너 바람이 불어'], CHORUS.lines, CHORUS.endT, THRESHOLD, 30),
    ).toMatchObject({ lineIndex: 1, seekTo: 22 });
  });

  it('점수가 조금이라도 다르면 같은 점수로 보지 않는다(변형 후렴)', () => {
    const variant = parseLyrics('0:10 하나 둘 셋 별을 세면\n0:16 바다 건너\n0:22 하나 둘 셋 별을 세며\n0:28 구름 위로\n0:34');
    expect(
      matchPhrase(['하나 둘 셋 별을 세면'], variant.lines, variant.endT, THRESHOLD, 25),
    ).toMatchObject({ lineIndex: 0, score: 1, seekTo: 16 });
  });
});
