import { describe, expect, it } from 'vitest';
import { INPUT_ERROR_MESSAGES, readVideoInput } from './videoInput.ts';

const ID = 'dQw4w9WgXcQ';

describe('readVideoInput', () => {
  it.each([
    ['영상 ID', ID],
    ['watch 주소', `https://www.youtube.com/watch?v=${ID}`],
    ['youtu.be 주소', `https://youtu.be/${ID}`],
    ['shorts 주소', `https://www.youtube.com/shorts/${ID}`],
    ['embed 주소', `https://www.youtube.com/embed/${ID}`],
  ])('%s에서 영상 ID를 꺼낸다', (_, input) => {
    expect(readVideoInput(input)).toEqual({ ok: true, videoId: ID });
  });

  it.each(['', '   ', '\n'])('빈 입력 %j은 입력을 요청한다', (input) => {
    expect(readVideoInput(input)).toEqual({ ok: false, message: INPUT_ERROR_MESSAGES.empty });
  });

  it.each(['hello', 'https://example.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/', 'dQw4w9WgXc'])(
    '해석할 수 없는 입력 %j은 오류로 안내한다',
    (input) => {
      expect(readVideoInput(input)).toEqual({ ok: false, message: INPUT_ERROR_MESSAGES.invalid });
    },
  );
});
