import { describe, expect, it } from 'vitest';
import { formatTime } from './formatTime.ts';

describe('formatTime', () => {
  it('초를 분:초로 바꾸고 초는 두 자리로 맞춘다', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(75.4)).toBe('1:15');
    expect(formatTime(600)).toBe('10:00');
  });

  it('소수점 아래는 버린다', () => {
    expect(formatTime(59.99)).toBe('0:59');
  });

  it('1시간이 넘어도 분으로 센다', () => {
    expect(formatTime(3725)).toBe('62:05');
  });

  it('음수나 숫자가 아닌 값은 0:00으로 보인다', () => {
    expect(formatTime(-3)).toBe('0:00');
    expect(formatTime(Number.NaN)).toBe('0:00');
  });
});
