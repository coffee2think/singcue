import { describe, expect, it } from 'vitest';
import type { PracticeRecord, VideoData } from '../types.ts';
import { buildPracticeReport, localDateKey, recordVideoIds, type TimezoneOffset } from './practiceReport.ts';

/** 한국 표준시(UTC+9). getTimezoneOffset 부호를 따라 -540 */
const KST: TimezoneOffset = () => -540;
/** UTC-5 */
const EST: TimezoneOffset = () => 300;
const UTC: TimezoneOffset = () => 0;

function record(videoId: string, sectionId: string, at: string, seconds: number): PracticeRecord {
  return { videoId, sectionId, at, seconds };
}

const videos: VideoData[] = [
  {
    videoId: 'vidA',
    sections: [
      { id: 'a2', name: '후렴', start: 60, end: 80 },
      { id: 'a1', name: '1절', start: 10, end: 30 },
    ],
    lines: [],
    endT: null,
  },
  { videoId: 'vidB', sections: [{ id: 'b1', name: '브리지', start: 5, end: 9 }], lines: [], endT: null },
];

describe('localDateKey', () => {
  it('UTC 자정 직전·직후 기록을 시간대에 따라 다른 날로 묶는다', () => {
    const before = '2026-10-21T23:59:30.000Z';
    const after = '2026-10-22T00:00:30.000Z';
    expect(localDateKey(before, UTC)).toBe('2026-10-21');
    expect(localDateKey(after, UTC)).toBe('2026-10-22');
    // KST에서는 둘 다 10월 22일 오전 9시 전후다
    expect(localDateKey(before, KST)).toBe('2026-10-22');
    expect(localDateKey(after, KST)).toBe('2026-10-22');
    // UTC-5에서는 둘 다 10월 21일 저녁이다
    expect(localDateKey(before, EST)).toBe('2026-10-21');
    expect(localDateKey(after, EST)).toBe('2026-10-21');
  });

  it('로컬 자정(KST 00:00 = UTC 15:00) 직전·직후를 다른 날로 나눈다', () => {
    expect(localDateKey('2026-10-21T14:59:59.999Z', KST)).toBe('2026-10-21');
    expect(localDateKey('2026-10-21T15:00:00.000Z', KST)).toBe('2026-10-22');
  });

  it('오프셋이 들어 있는 ISO 문자열도 같은 순간으로 읽는다', () => {
    expect(localDateKey('2026-10-22T08:30:00+09:00', UTC)).toBe('2026-10-21');
    expect(localDateKey('2026-10-22T08:30:00+09:00', KST)).toBe('2026-10-22');
  });

  it('오프셋은 그 시각 기준으로 묻는다(서머타임 전환)', () => {
    const asked: string[] = [];
    localDateKey('2026-03-08T07:30:00.000Z', (date) => {
      asked.push(date.toISOString());
      return 240;
    });
    expect(asked).toEqual(['2026-03-08T07:30:00.000Z']);
  });

  it('기본값은 기기 시간대의 로컬 날짜와 같다', () => {
    const at = '2026-10-21T23:59:30.000Z';
    const date = new Date(at);
    const pad = (n: number) => String(n).padStart(2, '0');
    expect(localDateKey(at)).toBe(`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`);
  });

  it('날짜로 읽을 수 없으면 null', () => {
    expect(localDateKey('어제', UTC)).toBeNull();
    expect(localDateKey('', UTC)).toBeNull();
  });
});

describe('buildPracticeReport', () => {
  it('기록이 없으면 모두 0이다', () => {
    expect(buildPracticeReport([], videos, UTC)).toEqual({
      totalCount: 0,
      totalSeconds: 0,
      sections: [],
      days: [],
      undatedCount: 0,
    });
  });

  it('구간별 횟수·시간을 세고 이름은 지금 영상 데이터에서 찾는다', () => {
    const report = buildPracticeReport(
      [
        record('vidA', 'a1', '2026-10-21T10:00:00.000Z', 8),
        record('vidA', 'a2', '2026-10-21T10:01:00.000Z', 5.5),
        record('vidA', 'a1', '2026-10-21T10:02:00.000Z', 7.25),
      ],
      videos,
      UTC,
    );
    expect(report.totalCount).toBe(3);
    expect(report.totalSeconds).toBe(20.75);
    // 같은 영상에서는 지금 구간 목록 순서(a2, a1)를 따른다
    expect(report.sections).toEqual([
      { videoId: 'vidA', sectionId: 'a2', name: '후렴', count: 1, seconds: 5.5 },
      { videoId: 'vidA', sectionId: 'a1', name: '1절', count: 2, seconds: 15.25 },
    ]);
  });

  it('삭제된 구간과 영상 데이터가 없는 영상의 기록도 이름 없이 세어 합계에 넣는다', () => {
    const report = buildPracticeReport(
      [
        record('vidA', 'gone', '2026-10-21T10:00:00.000Z', 4),
        record('vidA', 'a1', '2026-10-21T10:00:00.000Z', 3),
        record('vidZ', 'z1', '2026-10-21T10:00:00.000Z', 6),
        record('vidA', 'old', '2026-10-21T10:00:00.000Z', 2),
      ],
      videos,
      UTC,
    );
    expect(report.totalCount).toBe(4);
    expect(report.totalSeconds).toBe(15);
    expect(report.sections).toEqual([
      { videoId: 'vidA', sectionId: 'a1', name: '1절', count: 1, seconds: 3 },
      { videoId: 'vidA', sectionId: 'gone', name: null, count: 1, seconds: 4 },
      { videoId: 'vidA', sectionId: 'old', name: null, count: 1, seconds: 2 },
      { videoId: 'vidZ', sectionId: 'z1', name: null, count: 1, seconds: 6 },
    ]);
  });

  it('구간 ID가 같아도 영상이 다르면 따로 센다', () => {
    const report = buildPracticeReport(
      [record('vidA', 's', '2026-10-21T10:00:00.000Z', 3), record('vidB', 's', '2026-10-21T10:00:00.000Z', 4)],
      [],
      UTC,
    );
    expect(report.sections.map((s) => [s.videoId, s.count, s.seconds])).toEqual([
      ['vidA', 1, 3],
      ['vidB', 1, 4],
    ]);
  });

  it('날짜별 추이는 로컬 날짜로 묶고 오래된 날부터 둔다', () => {
    const records = [
      record('vidA', 'a1', '2026-10-22T00:00:30.000Z', 4),
      record('vidA', 'a1', '2026-10-21T23:59:30.000Z', 3),
      record('vidA', 'a1', '2026-10-20T12:00:00.000Z', 5),
    ];
    expect(buildPracticeReport(records, videos, UTC).days).toEqual([
      { date: '2026-10-20', count: 1, seconds: 5 },
      { date: '2026-10-21', count: 1, seconds: 3 },
      { date: '2026-10-22', count: 1, seconds: 4 },
    ]);
    // KST에서는 자정 직전·직후 기록이 같은 날(10월 22일)이다
    expect(buildPracticeReport(records, videos, KST).days).toEqual([
      { date: '2026-10-20', count: 1, seconds: 5 },
      { date: '2026-10-22', count: 2, seconds: 7 },
    ]);
  });

  it('날짜를 읽지 못한 기록은 날짜별 추이에서만 빼고 따로 센다', () => {
    const report = buildPracticeReport(
      [record('vidA', 'a1', 'broken', 4), record('vidA', 'a1', '2026-10-21T10:00:00.000Z', 3)],
      videos,
      UTC,
    );
    expect(report.totalCount).toBe(2);
    expect(report.sections[0]).toMatchObject({ count: 2, seconds: 7 });
    expect(report.days).toEqual([{ date: '2026-10-21', count: 1, seconds: 3 }]);
    expect(report.undatedCount).toBe(1);
  });

  it('집계 결과가 저장된 기록을 직접 센 값과 일치한다', () => {
    // 영상 3개 × 구간 4개(하나는 삭제됨) × 여러 날에 걸친 기록 200건을 결정적으로 만든다
    const sectionIds = ['a1', 'a2', 'b1', 'deleted'];
    const videoIds = ['vidA', 'vidB', 'vidC'];
    const records: PracticeRecord[] = [];
    for (let i = 0; i < 200; i++) {
      const at = new Date(Date.UTC(2026, 9, 15) + i * 97 * 60_000 + (i % 7) * 1000).toISOString();
      records.push(record(videoIds[i % 3], sectionIds[(i * 7) % 4], at, 3 + ((i * 37) % 50) / 4));
    }

    for (const offset of [UTC, KST, EST]) {
      const report = buildPracticeReport(records, videos, offset);
      expect(report.totalCount).toBe(records.length);
      expect(report.totalSeconds).toBeCloseTo(records.reduce((sum, r) => sum + r.seconds, 0), 9);
      expect(report.undatedCount).toBe(0);

      // 구간별: 영상·구간 쌍마다 직접 센다
      const pairs = new Set(records.map((r) => `${r.videoId}/${r.sectionId}`));
      expect(report.sections).toHaveLength(pairs.size);
      for (const summary of report.sections) {
        const matched = records.filter((r) => r.videoId === summary.videoId && r.sectionId === summary.sectionId);
        expect(summary.count).toBe(matched.length);
        expect(summary.seconds).toBeCloseTo(
          matched.reduce((sum, r) => sum + r.seconds, 0),
          9,
        );
      }
      expect(report.sections.reduce((sum, s) => sum + s.count, 0)).toBe(records.length);

      // 날짜별: 각 기록의 로컬 날짜를 직접 계산해 센다
      const dates = new Set(records.map((r) => localDateKey(r.at, offset)));
      expect(report.days).toHaveLength(dates.size);
      for (const day of report.days) {
        const matched = records.filter((r) => localDateKey(r.at, offset) === day.date);
        expect(day.count).toBe(matched.length);
        expect(day.seconds).toBeCloseTo(
          matched.reduce((sum, r) => sum + r.seconds, 0),
          9,
        );
      }
      expect(report.days.reduce((sum, d) => sum + d.count, 0)).toBe(records.length);
    }
  });
});

describe('recordVideoIds', () => {
  it('기록에 나오는 영상 ID를 한 번씩 정렬해 돌려준다', () => {
    expect(
      recordVideoIds([
        record('vidB', 's', '2026-10-21T10:00:00.000Z', 3),
        record('vidA', 's', '2026-10-21T10:00:00.000Z', 3),
        record('vidB', 't', '2026-10-21T10:00:00.000Z', 3),
      ]),
    ).toEqual(['vidA', 'vidB']);
  });
});
