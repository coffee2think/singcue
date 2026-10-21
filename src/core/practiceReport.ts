// 리포트 집계. PRD F5-3, 기술 설계 문서의 "PRD 대응표(화면 집계 함수)"를 따른다.
// 저장된 연습 기록(PracticeRecord)을 구간별·날짜별로 센다. 어댑터와 React에 의존하지 않는다.

import type { PracticeRecord, VideoData } from '../types.ts';

/** 구간 하나의 집계. 기록은 영상 ID와 구간 ID로 묶는다 */
export type SectionSummary = {
  videoId: string;
  sectionId: string;
  /** 지금 영상 데이터에 있는 구간 이름. 구간이 삭제됐거나 영상 데이터가 없으면 null */
  name: string | null;
  count: number;
  /** 재생 시간 합(초) */
  seconds: number;
};

/** 로컬 날짜 하루의 집계 */
export type DaySummary = {
  /** 사용자 기기 시간대 기준 YYYY-MM-DD */
  date: string;
  count: number;
  seconds: number;
};

export type PracticeReport = {
  totalCount: number;
  totalSeconds: number;
  /** 영상 ID 순, 같은 영상에서는 지금 구간 목록 순서이고 삭제된 구간은 그 뒤에 구간 ID 순 */
  sections: SectionSummary[];
  /** 기록이 있는 날만, 오래된 날부터 */
  days: DaySummary[];
  /** `at`을 날짜로 읽지 못한 기록 수. 구간별·전체 합계에는 들어가고 날짜별 추이에서만 빠진다 */
  undatedCount: number;
};

/** 시각의 UTC 오프셋(분, `Date.getTimezoneOffset`과 같은 부호). 테스트에서 시간대를 고정할 때 넘긴다 */
export type TimezoneOffset = (date: Date) => number;

const localOffset: TimezoneOffset = (date) => date.getTimezoneOffset();

/**
 * ISO 시각을 로컬 날짜(YYYY-MM-DD)로 바꾼다. 읽지 못하면 null.
 * 오프셋만큼 옮긴 시각의 UTC 날짜를 읽어, 기기 시간대에 기대지 않고도 시간대별 결과를 확인할 수 있다
 */
export function localDateKey(at: string, offset: TimezoneOffset = localOffset): string | null {
  const date = new Date(at);
  const time = date.getTime();
  if (Number.isNaN(time)) return null;
  const shifted = new Date(time - offset(date) * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/**
 * 기록을 집계한다. 구간 이름은 `videos`(지금 저장된 영상 데이터)에서 찾고,
 * 삭제된 구간의 기록도 이름 없이(null) 따로 세어 합계에서 빠지지 않게 한다
 */
export function buildPracticeReport(
  records: readonly PracticeRecord[],
  videos: readonly VideoData[],
  offset: TimezoneOffset = localOffset,
): PracticeReport {
  const sectionOrder = new Map<string, { name: string; index: number }>();
  for (const video of videos) {
    video.sections.forEach((section, index) => {
      sectionOrder.set(sectionKey(video.videoId, section.id), { name: section.name, index });
    });
  }

  const sections = new Map<string, SectionSummary>();
  const days = new Map<string, DaySummary>();
  let totalCount = 0;
  let totalSeconds = 0;
  let undatedCount = 0;

  for (const record of records) {
    totalCount += 1;
    totalSeconds += record.seconds;

    const key = sectionKey(record.videoId, record.sectionId);
    const section = sections.get(key) ?? {
      videoId: record.videoId,
      sectionId: record.sectionId,
      name: sectionOrder.get(key)?.name ?? null,
      count: 0,
      seconds: 0,
    };
    section.count += 1;
    section.seconds += record.seconds;
    sections.set(key, section);

    const date = localDateKey(record.at, offset);
    if (date === null) {
      undatedCount += 1;
      continue;
    }
    const day = days.get(date) ?? { date, count: 0, seconds: 0 };
    day.count += 1;
    day.seconds += record.seconds;
    days.set(date, day);
  }

  const order = (summary: SectionSummary) =>
    sectionOrder.get(sectionKey(summary.videoId, summary.sectionId))?.index ?? Number.POSITIVE_INFINITY;
  return {
    totalCount,
    totalSeconds,
    sections: [...sections.values()].sort(
      (a, b) =>
        compare(a.videoId, b.videoId) ||
        order(a) - order(b) ||
        // 둘 다 삭제된 구간이면 Infinity - Infinity가 NaN이라 구간 ID로 정한다
        compare(a.sectionId, b.sectionId),
    ),
    days: [...days.values()].sort((a, b) => compare(a.date, b.date)),
    undatedCount,
  };
}

/** 기록에 나오는 영상 ID. 영상 데이터를 읽어 올 목록이다 */
export function recordVideoIds(records: readonly PracticeRecord[]): string[] {
  return [...new Set(records.map((record) => record.videoId))].sort(compare);
}

function sectionKey(videoId: string, sectionId: string): string {
  return JSON.stringify([videoId, sectionId]);
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
