import { describe, expect, it } from 'vitest';
import { SPEECH_ERROR_MESSAGES, toSpeechError } from './speechEvents.ts';

describe('toSpeechError', () => {
  it.each(['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported'])(
    '%s는 다시 시도해도 나아지지 않으므로 fatal이다',
    (code) => {
      expect(toSpeechError(code)).toEqual({ code, message: SPEECH_ERROR_MESSAGES[code], fatal: true });
    },
  );

  it.each(['no-speech', 'network', 'aborted'])('%s는 자동 재시작할 수 있으므로 fatal이 아니다', (code) => {
    expect(toSpeechError(code)).toEqual({ code, message: SPEECH_ERROR_MESSAGES[code], fatal: false });
  });

  it('권한 거부는 버튼 조작을 계속 쓸 수 있다고 안내한다', () => {
    expect(toSpeechError('not-allowed').message).toContain('버튼 조작은 계속');
  });

  it('모르는 오류는 코드와 함께 일반 안내를 하고 재시작을 막지 않는다', () => {
    expect(toSpeechError('something-new')).toEqual({
      code: 'something-new',
      message: expect.stringContaining('something-new'),
      fatal: false,
    });
  });
});
