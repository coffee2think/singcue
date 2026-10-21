import { describe, expect, it } from 'vitest';
import { normalize } from './normalize.ts';

describe('normalize', () => {
  it('소문자로 바꾼다', () => {
    expect(normalize('STOP')).toBe('stop');
  });

  it('공백과 기호를 지운다', () => {
    expect(normalize('  멈춰, 잠깐!  ')).toBe('멈춰잠깐');
    expect(normalize('…시작을 하다 보면')).toBe('시작을하다보면');
    expect(normalize('"재생-해"?~·')).toBe('재생해');
  });

  it('한글·영문·숫자는 남긴다', () => {
    expect(normalize('Stop 2번')).toBe('stop2번');
  });

  it('남는 글자가 없으면 빈 문자열이다', () => {
    expect(normalize(' .,!? ')).toBe('');
  });
});
