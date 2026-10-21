import { describe, expect, it } from 'vitest';
import { formatTime, parseLyrics, serializeLyrics } from './lyricParser.ts';
import { normalize } from './normalize.ts';

// 직접 만든 가상의 구절만 쓴다(examples/sample-video.json과 같은 구절)
const SAMPLE = [
  '0:12 창문 너머 초록 버스가 지나가고',
  '0:18.4 주머니 속 동전 세 개를 세어 보네',
  '0:24.7 오늘은 조금 늦게 걸어도 괜찮아',
  '0:31 라라라 노란 우산을 펴고',
  '0:37.2 빗방울 숫자만큼 웃어 볼래',
  '0:44.8 라라라 내일 또 만나자',
  '0:52.5',
].join('\n');

describe('parseLyrics', () => {
  it('"분:초 구절" 줄을 구절 목록으로 파싱한다', () => {
    const result = parseLyrics(SAMPLE);
    expect(result.lines.map(({ t, text }) => ({ t, text }))).toEqual([
      { t: 12, text: '창문 너머 초록 버스가 지나가고' },
      { t: 18.4, text: '주머니 속 동전 세 개를 세어 보네' },
      { t: 24.7, text: '오늘은 조금 늦게 걸어도 괜찮아' },
      { t: 31, text: '라라라 노란 우산을 펴고' },
      { t: 37.2, text: '빗방울 숫자만큼 웃어 볼래' },
      { t: 44.8, text: '라라라 내일 또 만나자' },
    ]);
    expect(result.skipped).toEqual([]);
  });

  it('분은 여러 자리, 초는 한 자리도 읽는다', () => {
    const { lines } = parseLyrics('12:05 열두 시 방향\n1:5 짧은 초');
    expect(lines.map((l) => l.t)).toEqual([725, 65]);
  });

  it('줄 앞뒤 공백과 시간 뒤 여러 칸 공백, CRLF를 허용한다', () => {
    const { lines } = parseLyrics('  0:12    파란 의자에 앉아  \r\n\t1:00\t노래하는 고양이\r\n');
    expect(lines.map(({ t, text }) => ({ t, text }))).toEqual([
      { t: 12, text: '파란 의자에 앉아' },
      { t: 60, text: '노래하는 고양이' },
    ]);
  });

  it('형식에 맞지 않는 줄은 구절로 세지 않고 줄 번호를 남긴다', () => {
    const input = [
      '0:12 첫 구절', // 1
      '시간 없는 줄', // 2
      '0:60 초가 60', // 3
      '0:12구절 붙여 씀', // 4
      '12 분 없는 시간', // 5
      '', // 6 빈 줄은 skipped에 넣지 않는다
      '1:02:03 시:분:초', // 7
      '-0:05 음수', // 8
      '0:20 둘째 구절', // 9
    ].join('\n');
    const result = parseLyrics(input);
    expect(result.lines.map((l) => l.text)).toEqual(['첫 구절', '둘째 구절']);
    expect(result.skipped).toEqual([2, 3, 4, 5, 7, 8]);
    expect(result.endT).toBeNull();
  });

  it('구절 수는 lines의 길이다', () => {
    expect(parseLyrics(SAMPLE).lines).toHaveLength(6);
    expect(parseLyrics('').lines).toHaveLength(0);
  });

  describe('마지막 구절 다음 위치(endT)', () => {
    it('목록 끝에 시간만 적은 줄은 endT로 쓰고 구절 수에 세지 않는다', () => {
      const result = parseLyrics(SAMPLE);
      expect(result.endT).toBe(52.5);
      expect(result.lines).toHaveLength(6);
      expect(result.lines.some((l) => l.t === 52.5)).toBe(false);
    });

    it('시간만 적은 줄이 없으면 null이다', () => {
      expect(parseLyrics('0:12 하나\n0:20 둘').endT).toBeNull();
    });

    it('끝 뒤의 빈 줄과 형식에 맞지 않는 줄은 상관없다', () => {
      const result = parseLyrics('0:12 하나\n0:30\n\n메모');
      expect(result.endT).toBe(30);
      expect(result.skipped).toEqual([4]);
    });

    it('구절 사이에 있는 시간만 적은 줄은 endT가 아니고 구절로도 세지 않는다', () => {
      const result = parseLyrics('0:12 하나\n0:15\n0:20 둘');
      expect(result.endT).toBeNull();
      expect(result.lines).toHaveLength(2);
      expect(result.skipped).toEqual([2]);
    });

    it('끝에 시간만 적은 줄이 여러 개면 마지막 줄을 쓰고 나머지는 세지 않는다', () => {
      const result = parseLyrics('0:12 하나\n0:30\n0:40');
      expect(result.endT).toBe(40);
      expect(result.skipped).toEqual([2]);
    });

    it('구절이 하나도 없으면 시간만 적은 줄은 endT가 아니다', () => {
      const result = parseLyrics('0:30');
      expect(result.endT).toBeNull();
      expect(result.lines).toEqual([]);
      expect(result.skipped).toEqual([1]);
    });
  });

  describe('정규화', () => {
    it('파싱할 때 commandMatcher와 같은 normalize로 정규화해 norm에 둔다', () => {
      const { lines } = parseLyrics('0:12 Hello, 노란 우산!\n0:20 라라라~ 내일 또...');
      expect(lines.map((l) => l.norm)).toEqual(['hello노란우산', '라라라내일또']);
      for (const line of lines) expect(line.norm).toBe(normalize(line.text));
    });

    it('원문 text는 바꾸지 않는다', () => {
      const { lines } = parseLyrics('0:12 Hello, 노란 우산!');
      expect(lines[0].text).toBe('Hello, 노란 우산!');
    });

    it('기호만 있는 구절도 구절로 세고 norm은 빈 문자열이다', () => {
      const { lines } = parseLyrics('0:12 ~~~');
      expect(lines).toEqual([{ t: 12, text: '~~~', norm: '' }]);
    });
  });
});

describe('formatTime', () => {
  it('초를 분:초(초 두 자리)로 쓴다', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(725)).toBe('12:05');
  });

  it('소수점 아래는 밀리초까지 남기고 끝의 0을 지운다', () => {
    expect(formatTime(78.4)).toBe('1:18.4');
    expect(formatTime(18.25)).toBe('0:18.25');
    expect(formatTime(1.0004)).toBe('0:01');
    expect(formatTime(59.9996)).toBe('1:00');
  });
});

describe('serializeLyrics', () => {
  it('매핑을 한 줄에 구절 하나, 끝에 endT 줄로 쓴다', () => {
    const { lines, endT } = parseLyrics(SAMPLE);
    expect(serializeLyrics(lines, endT)).toBe(SAMPLE);
  });

  it('endT가 null이면 시간만 적은 줄을 쓰지 않는다', () => {
    expect(serializeLyrics([{ t: 12, text: '하나' }], null)).toBe('0:12 하나');
  });

  it('구절이 없으면 endT 줄만 쓰고, 다시 파싱하면 endT는 null이다', () => {
    expect(serializeLyrics([], null)).toBe('');
    expect(serializeLyrics([], 30)).toBe('0:30');
    expect(parseLyrics(serializeLyrics([], 30)).endT).toBeNull();
  });

  it('구절 텍스트 안의 줄바꿈은 공백으로 바꾼다', () => {
    expect(serializeLyrics([{ t: 12, text: '첫 줄\n둘째 줄' }], null)).toBe('0:12 첫 줄 둘째 줄');
  });

  it('직렬화한 텍스트를 다시 파싱하면 같은 매핑이 나온다', () => {
    const lines = [
      { t: 3.5, text: '작은 별이 깜빡이면' },
      { t: 61.25, text: 'Hello 노란 우산' },
      { t: 125, text: '라라라 내일 또 만나자' },
    ];
    const parsed = parseLyrics(serializeLyrics(lines, 140.75));
    expect(parsed.lines.map(({ t, text }) => ({ t, text }))).toEqual(lines);
    expect(parsed.endT).toBe(140.75);
    expect(parsed.skipped).toEqual([]);
  });
});
