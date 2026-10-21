import { useEffect, useState, useSyncExternalStore } from 'react';
import { createStorage, LOG_KEY, type StorageAdapter } from '../adapters/storage.ts';
import { buildPracticeReport, recordVideoIds, type PracticeReport } from '../core/practiceReport.ts';
import type { PlaybackState } from '../types.ts';
import { formatTime } from './formatTime.ts';
import './ReportPanel.css';

const defaultStorage = createStorage();

type Props = {
  /** 재생이 끝날 때마다 기록을 다시 읽는다 */
  playbackState: PlaybackState;
  storage?: StorageAdapter;
};

type Snapshot = { report: PracticeReport; readAt: Date };

/** `singcue:log`를 읽고, 기록에 나오는 영상의 지금 구간 이름과 함께 집계한다 */
function readReport(storage: StorageAdapter): Snapshot {
  const records = storage.loadLog();
  const videos = recordVideoIds(records).map((videoId) => storage.loadVideo(videoId));
  return { report: buildPracticeReport(records, videos), readAt: new Date() };
}

type ReportStore = {
  getSnapshot(): Snapshot;
  /** 기록을 다시 읽고 화면에 알린다 */
  refresh(): void;
  subscribe(listener: () => void): () => void;
};

/**
 * 읽은 리포트를 들고 있는 객체. 저장소는 React 밖의 상태라 useSyncExternalStore로 구독한다(usePracticeLog와 같은 방식).
 * 구독하는 동안 다른 탭의 기록 변경(storage 이벤트)도 받는다. 같은 탭의 쓰기에는 이 이벤트가 오지 않는다
 */
function createReportStore(storage: StorageAdapter): ReportStore {
  let snapshot = readReport(storage);
  const listeners = new Set<() => void>();

  function refresh() {
    snapshot = readReport(storage);
    listeners.forEach((listener) => listener());
  }

  function onStorage(event: StorageEvent) {
    // key가 null이면 다른 탭이 저장소를 비운 것이다
    if (event.key === null || event.key === LOG_KEY) refresh();
  }

  return {
    getSnapshot: () => snapshot,
    refresh,
    subscribe(listener) {
      if (listeners.size === 0) window.addEventListener('storage', onStorage);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) window.removeEventListener('storage', onStorage);
      };
    },
  };
}

/**
 * 연습 리포트(PRD F5-3). 구간별 횟수·총 시간과 로컬 날짜별 추이를 보여 준다.
 * 화면을 열 때, 재생 중이 끝날 때(정지 기록이 저장된 뒤), 다른 탭이 기록을 바꿀 때, "다시 읽기"를 누를 때 다시 읽는다
 */
export function ReportPanel({ playbackState, storage = defaultStorage }: Props) {
  const [store] = useState(() => createReportStore(storage));
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);

  // usePracticeLog는 재생 중 effect의 정리 함수에서 정지 기록을 저장한다. React는 한 커밋의 정리 함수를 모두 실행한 뒤
  // 새 effect를 실행하므로, 재생 상태가 바뀐 커밋의 이 effect는 방금 저장된 기록까지 읽는다.
  // 자동 반복의 바퀴 기록은 재생 중에 저장되므로 정지할 때 함께 반영된다
  useEffect(() => {
    if (playbackState !== 'playing') store.refresh();
  }, [playbackState, store]);

  const { report, readAt } = snapshot;
  return (
    <section className="report" aria-labelledby="report-title">
      <div className="report__header">
        <h2 id="report-title">연습 리포트</h2>
        <button type="button" onClick={store.refresh}>
          다시 읽기
        </button>
      </div>
      <p className="report__hint">
        이 브라우저에 저장된 연습 기록 전체를 셉니다. 날짜는 이 기기의 시간대 기준이고, 시간은 초 아래를 버려 표시합니다.
        마지막으로 읽은 시각 {readAt.toLocaleTimeString()}.
      </p>

      {report.totalCount === 0 ? (
        <p className="report__empty">아직 연습 기록이 없습니다. 구간을 골라 재생하면 기록이 쌓입니다.</p>
      ) : (
        <>
          <p className="report__total" role="status">
            총 <strong>{report.totalCount}회</strong>, <strong>{formatTime(report.totalSeconds)}</strong> 연습했습니다.
          </p>
          <SectionTable report={report} />
          <DayTrend report={report} />
        </>
      )}
    </section>
  );
}

function SectionTable({ report }: { report: PracticeReport }) {
  return (
    <table className="report__table">
      <caption>구간별</caption>
      <thead>
        <tr>
          <th scope="col">구간</th>
          <th scope="col">영상</th>
          <th scope="col">횟수</th>
          <th scope="col">시간</th>
        </tr>
      </thead>
      <tbody>
        {report.sections.map((section) => (
          <tr key={`${section.videoId}/${section.sectionId}`}>
            <th scope="row">
              {section.name ?? (
                <span className="report__deleted" title={`구간 ID ${section.sectionId}`}>
                  삭제된 구간
                </span>
              )}
            </th>
            <td>{section.videoId}</td>
            <td className="report__number">{section.count}</td>
            <td className="report__number">{formatTime(section.seconds)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DayTrend({ report }: { report: PracticeReport }) {
  const maxCount = Math.max(...report.days.map((day) => day.count), 1);
  return (
    <div className="report__days">
      <h3>날짜별</h3>
      <ol className="report__day-list">
        {report.days.map((day) => (
          <li key={day.date} className="report__day">
            <span className="report__date">{day.date}</span>
            <span className="report__bar" aria-hidden="true">
              <span style={{ width: `${(day.count / maxCount) * 100}%` }} />
            </span>
            <span className="report__number">
              {day.count}회 · {formatTime(day.seconds)}
            </span>
          </li>
        ))}
      </ol>
      {report.undatedCount > 0 && (
        <p className="report__hint">
          날짜를 읽지 못한 기록 {report.undatedCount}회는 날짜별에서 빠지고 위 합계에는 들어 있습니다.
        </p>
      )}
    </div>
  );
}
