// 공통 타입. 기술 설계 문서의 "데이터 구조와 저장", "음성 명령 처리 흐름", "구절 매칭 설계"를 따른다.

/** 재생 상태. 준비 전(영상 없음), 정지, 재생 중(버퍼링 포함) */
export type PlaybackState = 'unready' | 'stopped' | 'playing';

/** 연습 구간. 시간은 초 단위 */
export type Section = { id: string; name: string; start: number; end: number };

/** 가사 구절과 시작 시간(초) */
export type Line = { t: number; text: string };

/** 영상 하나에 딸린 구간과 가사 매핑. `singcue:video:<videoId>`에 저장한다 */
export type VideoData = {
  videoId: string;
  sections: Section[];
  lines: Line[];
  /** 마지막 구절 다음 위치(초). 없으면 null */
  endT: number | null;
};

/** 연습 1회 기록. `singcue:log`에 목록으로 저장한다 */
export type PracticeRecord = {
  videoId: string;
  sectionId: string;
  /** ISO 날짜와 시각 */
  at: string;
  /** 실제 재생한 시간(초) */
  seconds: number;
};

export type EndAction = 'stop' | 'repeat' | 'continue';

/** 사용자 설정 8개 항목. `singcue:settings`에 저장한다 */
export type Settings = {
  endAction: EndAction;
  preroll: number;
  stopWords: string[];
  startWords: string[];
  stopOnInterim: boolean;
  shortRuleChars: number;
  similarityThreshold: number;
  minPracticeSeconds: number;
};

export type IgnoreReason = 'short-rule' | 'state' | 'debounce' | 'no-match';

/** 인식 결과 하나에 대한 판별 결과(commandMatcher.decide) */
export type Decision =
  | { action: 'stop' }
  | { action: 'start' }
  | { action: 'phrase'; candidates: string[] }
  | { action: 'ignore'; reason: IgnoreReason };

/** 구절 매칭 결과(phraseMatcher.matchPhrase) */
export type MatchResult = {
  /** 가장 비슷한 줄 */
  lineIndex: number;
  /** 0~1 */
  score: number;
  /** score >= threshold */
  passed: boolean;
  /** 이동할 시간(초). 마지막 줄에 다음 위치가 없으면 null */
  seekTo: number | null;
};
