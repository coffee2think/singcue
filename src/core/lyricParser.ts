// 가사·시간 매핑 입력 파싱과 직렬화. PRD F3-1, F3-3과 기술 설계 문서의 "구절 매칭 설계"를 따른다.
// "분:초 구절" 줄은 구절, 목록 끝에 시간만 적은 줄은 마지막 구절 다음 위치(endT)다.

import type { Line } from '../types.ts';
import { normalize } from './normalize.ts';

/** 파싱한 구절. 매칭에 쓸 정규화 텍스트를 파싱할 때 한 번만 만들어 둔다 */
export type ParsedLine = Line & { norm: string };

export type ParsedLyrics = {
  /** 입력 순서대로의 구절 목록. 길이가 인식된 구절 수다 */
  lines: ParsedLine[];
  /** 마지막 구절 다음 위치(초). 없으면 null */
  endT: number | null;
  /** 구절로 세지 않은 줄 번호(1부터). 빈 줄은 넣지 않는다 */
  skipped: number[];
};

/** 분:초. 초는 0~59이고 소수점 아래를 붙일 수 있다 */
const TIME = String.raw`(\d+):([0-5]?\d(?:\.\d+)?)`;
const PHRASE_LINE = new RegExp(String.raw`^${TIME}\s+(.*\S)$`);
const TIME_ONLY_LINE = new RegExp(`^${TIME}$`);

/**
 * 입력 텍스트를 구절 목록과 마지막 구절 다음 위치로 나눈다. 순수 함수다.
 * - "분:초 구절" 줄만 구절로 센다. 형식에 맞지 않는 줄은 `skipped`에 줄 번호를 남긴다
 * - 시간만 적은 줄은 마지막 구절 뒤에 있을 때만 `endT`로 쓴다. 여러 개면 마지막 줄을 쓴다
 */
export function parseLyrics(input: string): ParsedLyrics {
  const lines: ParsedLine[] = [];
  const skipped: number[] = [];
  // 아직 뒤에 구절이 나오지 않은 시간만 적은 줄들
  let pendingTimes: { lineNo: number; t: number }[] = [];

  input.split(/\r?\n/).forEach((raw, index) => {
    const lineNo = index + 1;
    const row = raw.trim();
    if (row === '') return;

    const phrase = PHRASE_LINE.exec(row);
    if (phrase) {
      // 구절 앞에 있던 시간만 적은 줄은 목록 끝이 아니므로 구절로 세지 않은 줄이다
      skipped.push(...pendingTimes.map((p) => p.lineNo));
      pendingTimes = [];
      const text = phrase[3];
      lines.push({ t: toSeconds(phrase[1], phrase[2]), text, norm: normalize(text) });
      return;
    }

    const timeOnly = TIME_ONLY_LINE.exec(row);
    if (timeOnly) {
      pendingTimes.push({ lineNo, t: toSeconds(timeOnly[1], timeOnly[2]) });
      return;
    }

    skipped.push(lineNo);
  });

  let endT: number | null = null;
  if (lines.length > 0 && pendingTimes.length > 0) {
    endT = pendingTimes[pendingTimes.length - 1].t;
    skipped.push(...pendingTimes.slice(0, -1).map((p) => p.lineNo));
  } else {
    // 구절이 하나도 없으면 "마지막 구절 다음 위치"도 없다
    skipped.push(...pendingTimes.map((p) => p.lineNo));
  }
  skipped.sort((a, b) => a - b);

  return { lines, endT, skipped };
}

/**
 * 매핑을 `parseLyrics`가 읽을 수 있는 텍스트로 되돌린다. 한 줄에 구절 하나, 끝에 endT 줄을 둔다.
 * 구절 텍스트 안의 줄바꿈은 공백으로 바꾼다.
 */
export function serializeLyrics(lines: readonly Line[], endT: number | null): string {
  const rows = lines.map((line) => `${formatTime(line.t)} ${line.text.replace(/\s*\r?\n\s*/g, ' ').trim()}`);
  if (endT !== null) rows.push(formatTime(endT));
  return rows.join('\n');
}

/** 초를 "분:초"로 쓴다. 초는 두 자리, 소수점 아래는 밀리초까지 남기고 끝의 0은 지운다(예: 78.4 → "1:18.4") */
export function formatTime(seconds: number): string {
  const ms = Math.round(seconds * 1000);
  const minutes = Math.floor(ms / 60000);
  const rest = ms - minutes * 60000;
  const whole = String(Math.floor(rest / 1000)).padStart(2, '0');
  const fraction = rest % 1000;
  if (fraction === 0) return `${minutes}:${whole}`;
  return `${minutes}:${whole}.${String(fraction).padStart(3, '0').replace(/0+$/, '')}`;
}

function toSeconds(minutes: string, seconds: string): number {
  return Number(minutes) * 60 + Number(seconds);
}
