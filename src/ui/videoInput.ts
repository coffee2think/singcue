// 영상 입력란 값 확인. 해석은 playerAdapter의 parseVideoId가 맡고, 이 파일은 화면에 보여 줄 입력 오류 문구를 정한다.

import { parseVideoId } from '../adapters/playerAdapter/index.ts';

export const INPUT_ERROR_MESSAGES = Object.freeze({
  empty: 'YouTube 링크나 영상 ID를 입력하세요.',
  invalid:
    'YouTube 영상 링크나 영상 ID로 알아볼 수 없습니다. watch, youtu.be, shorts, embed 주소나 11자 영상 ID를 입력하세요.',
});

export type VideoInputResult = { ok: true; videoId: string } | { ok: false; message: string };

export function readVideoInput(input: string): VideoInputResult {
  if (!input.trim()) return { ok: false, message: INPUT_ERROR_MESSAGES.empty };
  const videoId = parseVideoId(input);
  return videoId ? { ok: true, videoId } : { ok: false, message: INPUT_ERROR_MESSAGES.invalid };
}
