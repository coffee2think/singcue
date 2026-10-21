import { describe, expect, it } from 'vitest';
import { PLAYER_ERROR_MESSAGES, toPlayerError, toPlayerStatus, YT_PLAYER_STATE } from './playerEvents.ts';

describe('toPlayerStatus', () => {
  it('재생 중과 버퍼링은 재생 중으로 바꾼다', () => {
    expect(toPlayerStatus(YT_PLAYER_STATE.PLAYING)).toBe('playing');
    expect(toPlayerStatus(YT_PLAYER_STATE.BUFFERING)).toBe('playing');
  });

  it('시작 전은 알리지 않는다', () => {
    expect(toPlayerStatus(YT_PLAYER_STATE.UNSTARTED)).toBeNull();
  });

  it('끝남, 일시정지, 준비됨은 정지로 바꾼다', () => {
    expect(toPlayerStatus(YT_PLAYER_STATE.ENDED)).toBe('stopped');
    expect(toPlayerStatus(YT_PLAYER_STATE.PAUSED)).toBe('stopped');
    expect(toPlayerStatus(YT_PLAYER_STATE.CUED)).toBe('stopped');
  });
});

describe('toPlayerError', () => {
  it('YouTube 문서의 오류 코드마다 안내 문구가 있다', () => {
    for (const code of [2, 5, 100, 101, 150, 153]) {
      const error = toPlayerError(code);
      expect(error.code).toBe(code);
      expect(error.message).toBe(PLAYER_ERROR_MESSAGES[code]);
      expect(error.message.length).toBeGreaterThan(0);
    }
  });

  it('임베드가 막힌 영상(101, 150)은 다른 영상을 불러오라고 안내한다', () => {
    expect(toPlayerError(101).message).toContain('다른 영상');
    expect(toPlayerError(150).message).toBe(toPlayerError(101).message);
  });

  it('모르는 코드도 코드 번호와 함께 안내한다', () => {
    expect(toPlayerError(999)).toEqual({
      code: 999,
      message: expect.stringContaining('코드 999'),
    });
  });
});
