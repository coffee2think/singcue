import { describe, expect, it } from 'vitest';
import { MIC_ERROR_MESSAGES, toMicError } from './micEvents.ts';

/** 브라우저의 DOMException처럼 name만 있는 오류 */
function domError(name: string) {
  return Object.assign(new Error(`${name} message`), { name });
}

describe('toMicError', () => {
  it('권한 거부(NotAllowedError, SecurityError)를 permission-denied로 바꾼다', () => {
    expect(toMicError(domError('NotAllowedError'))).toEqual({
      kind: 'permission-denied',
      message: MIC_ERROR_MESSAGES['permission-denied'],
    });
    expect(toMicError(domError('SecurityError')).kind).toBe('permission-denied');
  });

  it('장치 없음과 장치 사용 중을 구분한다', () => {
    expect(toMicError(domError('NotFoundError')).kind).toBe('no-device');
    expect(toMicError(domError('OverconstrainedError')).kind).toBe('no-device');
    expect(toMicError(domError('NotReadableError')).kind).toBe('device-busy');
    expect(toMicError(domError('AbortError')).kind).toBe('device-busy');
  });

  it('모르는 오류는 unknown으로 바꾼다', () => {
    expect(toMicError(domError('TypeError')).kind).toBe('unknown');
    expect(toMicError('문자열 오류').kind).toBe('unknown');
    expect(toMicError(null).kind).toBe('unknown');
  });

  it('권한 거부 안내는 버튼 조작을 계속 쓸 수 있다고 알린다', () => {
    expect(MIC_ERROR_MESSAGES['permission-denied']).toContain('버튼 조작은 계속 쓸 수 있습니다');
  });
});
