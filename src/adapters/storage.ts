// localStorage 어댑터. 기술 설계 문서의 "데이터 구조와 저장", "오류 처리(저장 공간 부족)"를 따른다.
// 읽기는 값이 없거나 손상되어도 기본값을 돌려주고, 쓰기는 예외를 던지지 않고 결과로 알린다.
import { DEFAULT_SETTINGS } from '../core/defaultSettings.ts';
import type { EndAction, Line, PracticeRecord, Section, Settings, VideoData } from '../types.ts';

export const SETTINGS_KEY = 'singcue:settings';
const VIDEO_KEY_PREFIX = 'singcue:video:';

export function videoKey(videoId: string): string {
  return VIDEO_KEY_PREFIX + videoId;
}

/** 저장 결과. 실패해도 앱은 계속 동작하고, 화면이 이유에 맞춰 안내한다 */
export type SaveResult =
  | { ok: true }
  | {
      ok: false;
      /** quota-exceeded: 저장 공간 부족(JSON 내보내기를 권함), write-error: 그 밖의 쓰기 실패 */
      reason: 'quota-exceeded' | 'write-error';
      error: unknown;
    };

/** 어댑터가 쓰는 저장소 기능. 테스트에서는 메모리 구현을 넣는다 */
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

export type StorageAdapter = {
  loadSettings(): Settings;
  saveSettings(settings: Settings): SaveResult;
  loadVideo(videoId: string): VideoData;
  saveVideo(data: VideoData): SaveResult;
  /** `singcue:log`의 연습 기록. 형식이 맞는 기록만 읽는다 */
  loadLog(): PracticeRecord[];
  /** 연습 기록을 `singcue:log` 끝에 덧붙인다. 실패하면 저장소는 그대로다 */
  appendLog(records: readonly PracticeRecord[]): SaveResult;
};

export function createStorage(store: KeyValueStore | null = getLocalStorage()): StorageAdapter {
  function read(key: string): unknown {
    if (!store) return undefined;
    try {
      const raw = store.getItem(key);
      return raw === null ? undefined : JSON.parse(raw);
    } catch {
      return undefined;
    }
  }

  function write(key: string, value: unknown): SaveResult {
    if (!store) return { ok: false, reason: 'write-error', error: new Error('localStorage를 쓸 수 없음') };
    try {
      store.setItem(key, JSON.stringify(value));
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: isQuotaExceeded(error) ? 'quota-exceeded' : 'write-error', error };
    }
  }

  return {
    loadSettings: () => toSettings(read(SETTINGS_KEY)),
    saveSettings: (settings) => write(SETTINGS_KEY, settings),
    loadVideo: (videoId) => toVideoData(videoId, read(videoKey(videoId))),
    saveVideo: (data) => write(videoKey(data.videoId), data),
    loadLog: () => readLog(store),
    // 읽을 때 형식이 맞지 않는 기록은 버려지므로, 덧붙여 쓰면 그 기록도 저장소에서 빠진다(내보내기와 같은 기준)
    appendLog: (records) => (records.length === 0 ? { ok: true } : write(LOG_KEY, [...readLog(store), ...records])),
  };
}

/** 개인정보 보호 설정 등으로 localStorage 접근 자체가 막히면 null */
function getLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isQuotaExceeded(error: unknown): boolean {
  // 브라우저는 DOMException을 던진다. Chrome·Safari는 QuotaExceededError, 예전 Firefox는 NS_ERROR_DOM_QUOTA_REACHED
  const name = isRecord(error) ? error.name : undefined;
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED';
}

export function defaultVideoData(videoId: string): VideoData {
  return { videoId, sections: [], lines: [], endT: null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isEndAction(value: unknown): value is EndAction {
  return value === 'stop' || value === 'repeat' || value === 'continue';
}

/** 항목별로 형식을 확인해, 맞지 않거나 빠진 항목만 기본값으로 채운다 */
function toSettings(value: unknown): Settings {
  const saved = isRecord(value) ? value : {};
  const pick = <T>(key: keyof Settings, valid: (v: unknown) => v is T, fallback: T): T =>
    valid(saved[key]) ? (saved[key] as T) : fallback;
  return {
    endAction: pick('endAction', isEndAction, DEFAULT_SETTINGS.endAction),
    preroll: pick('preroll', isFiniteNumber, DEFAULT_SETTINGS.preroll),
    stopWords: [...pick('stopWords', isStringArray, DEFAULT_SETTINGS.stopWords)],
    startWords: [...pick('startWords', isStringArray, DEFAULT_SETTINGS.startWords)],
    stopOnInterim: pick('stopOnInterim', (v): v is boolean => typeof v === 'boolean', DEFAULT_SETTINGS.stopOnInterim),
    shortRuleChars: pick('shortRuleChars', isFiniteNumber, DEFAULT_SETTINGS.shortRuleChars),
    similarityThreshold: pick('similarityThreshold', isFiniteNumber, DEFAULT_SETTINGS.similarityThreshold),
    minPracticeSeconds: pick('minPracticeSeconds', isFiniteNumber, DEFAULT_SETTINGS.minPracticeSeconds),
  };
}

function isSection(value: unknown): value is Section {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isFiniteNumber(value.start) &&
    isFiniteNumber(value.end)
  );
}

function isLine(value: unknown): value is Line {
  return isRecord(value) && isFiniteNumber(value.t) && typeof value.text === 'string';
}

/** 형식이 맞지 않는 구간·구절은 버리고, 목록 자체가 없으면 빈 목록으로 둔다 */
function toVideoData(videoId: string, value: unknown): VideoData {
  if (!isRecord(value)) return defaultVideoData(videoId);
  return {
    videoId,
    sections: Array.isArray(value.sections) ? value.sections.filter(isSection) : [],
    lines: Array.isArray(value.lines) ? value.lines.filter(isLine) : [],
    endT: isFiniteNumber(value.endT) ? value.endT : null,
  };
}

// ── JSON 백업 내보내기·불러오기(PRD F3-4, F5-4). 기술 설계 문서의 "내보내기와 불러오기", "가져오기 형식 오류"를 따른다 ──

export const LOG_KEY = 'singcue:log';

/** 백업 파일 형식 버전. 형식이 바뀌면 올리고, 불러올 때 다른 버전은 거부하거나 변환한다 */
export const BACKUP_VERSION = 1;

/** 전체 데이터 백업. 영상은 저장 키마다 하나씩 목록으로 둔다 */
export type Backup = {
  version: typeof BACKUP_VERSION;
  settings: Settings;
  videos: VideoData[];
  log: PracticeRecord[];
};

/** 백업에 필요한 저장소 기능. 영상 키를 찾고, 불러오기에 실패하면 원래대로 되돌리려고 목록·삭제 기능까지 쓴다 */
export type BackupStore = KeyValueStore & Pick<Storage, 'length' | 'key' | 'removeItem'>;

export type BackupParseResult =
  | { ok: true; backup: Backup }
  | {
      ok: false;
      /** invalid-json: JSON이 아님, unsupported-version: 지원하지 않는 version, invalid-format: 구조나 값이 맞지 않음 */
      reason: 'invalid-json' | 'unsupported-version' | 'invalid-format';
    };

/** 불러오기 결과. 실패하면 저장소는 불러오기 전과 같다 */
export type ImportResult =
  | { ok: true; backup: Backup }
  | Extract<BackupParseResult, { ok: false }>
  | { ok: false; reason: 'quota-exceeded' | 'write-error'; error: unknown };

/** 저장소의 설정·영상 데이터·연습 기록을 모은다. 읽기 규칙은 loadSettings·loadVideo와 같다 */
export function exportBackup(store: BackupStore | null = getLocalStorage()): Backup {
  const storage = createStorage(store);
  const videoIds: string[] = [];
  if (store) {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key?.startsWith(VIDEO_KEY_PREFIX)) videoIds.push(key.slice(VIDEO_KEY_PREFIX.length));
    }
  }
  videoIds.sort();
  return {
    version: BACKUP_VERSION,
    settings: storage.loadSettings(),
    videos: videoIds.map((videoId) => storage.loadVideo(videoId)),
    log: readLog(store),
  };
}

export function serializeBackup(backup: Backup): string {
  return JSON.stringify(backup, null, 2) + '\n';
}

/**
 * 백업 파일 내용을 확인한다. 하나라도 맞지 않으면 전체를 거부한다.
 * 저장소에서 읽을 때와 달리 틀린 항목을 버리지 않는 것은, 일부만 복원된 것을 사용자가 알아채기 어렵기 때문이다
 */
export function parseBackup(text: string): BackupParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'invalid-json' };
  }
  if (!isRecord(value)) return { ok: false, reason: 'invalid-format' };
  if (value.version !== BACKUP_VERSION) {
    return { ok: false, reason: 'version' in value ? 'unsupported-version' : 'invalid-format' };
  }
  const { settings, videos, log } = value;
  if (!isSettings(settings) || !Array.isArray(videos) || !videos.every(isVideoData) || !Array.isArray(log)) {
    return { ok: false, reason: 'invalid-format' };
  }
  if (!log.every(isPracticeRecord)) return { ok: false, reason: 'invalid-format' };
  const ids = videos.map((video) => video.videoId);
  if (new Set(ids).size !== ids.length) return { ok: false, reason: 'invalid-format' };
  return {
    ok: true,
    backup: {
      version: BACKUP_VERSION,
      settings: toSettings(settings),
      videos: videos.map((video) => toVideoData(video.videoId, video)),
      log: log.map(({ videoId, sectionId, at, seconds }) => ({ videoId, sectionId, at, seconds })),
    },
  };
}

/**
 * 백업 파일을 불러와 저장소에 쓴다. 설정과 연습 기록은 파일 내용으로 바꾸고,
 * 영상 데이터는 파일에 있는 영상만 덮어쓴다(파일에 없는 영상은 그대로 둔다).
 * 형식이 맞지 않으면 아무것도 쓰지 않고, 쓰는 도중 실패하면 쓴 키를 원래 값으로 되돌린다
 */
export function importBackup(text: string, store: BackupStore | null = getLocalStorage()): ImportResult {
  const parsed = parseBackup(text);
  if (!parsed.ok) return parsed;
  if (!store) return { ok: false, reason: 'write-error', error: new Error('localStorage를 쓸 수 없음') };

  const { backup } = parsed;
  const entries: [string, unknown][] = [
    [SETTINGS_KEY, backup.settings],
    [LOG_KEY, backup.log],
    ...backup.videos.map((video): [string, unknown] => [videoKey(video.videoId), video]),
  ];
  const previous = new Map<string, string | null>();
  try {
    for (const [key] of entries) previous.set(key, store.getItem(key));
    for (const [key, value] of entries) store.setItem(key, JSON.stringify(value));
  } catch (error) {
    restore(store, previous);
    return { ok: false, reason: isQuotaExceeded(error) ? 'quota-exceeded' : 'write-error', error };
  }
  return { ok: true, backup };
}

function restore(store: BackupStore, previous: Map<string, string | null>) {
  // 쓴 키를 모두 지워 공간을 비운 뒤 원래 값을 쓴다. 원래 있던 값들이므로 보통은 다시 들어간다
  for (const key of previous.keys()) {
    try {
      store.removeItem(key);
    } catch {
      // 되돌리기도 실패하면 더 할 수 있는 일이 없다
    }
  }
  for (const [key, raw] of previous) {
    if (raw === null) continue;
    try {
      store.setItem(key, raw);
    } catch {
      // 위와 같다
    }
  }
}

/** 형식이 맞는 연습 기록만 읽는다. 값이 없거나 손상되면 빈 목록이다 */
function readLog(store: KeyValueStore | null): PracticeRecord[] {
  if (!store) return [];
  try {
    const raw = store.getItem(LOG_KEY);
    const value: unknown = raw === null ? undefined : JSON.parse(raw);
    return Array.isArray(value) ? value.filter(isPracticeRecord) : [];
  } catch {
    return [];
  }
}

function isSettings(value: unknown): value is Settings {
  return (
    isRecord(value) &&
    isEndAction(value.endAction) &&
    isFiniteNumber(value.preroll) &&
    isStringArray(value.stopWords) &&
    isStringArray(value.startWords) &&
    typeof value.stopOnInterim === 'boolean' &&
    isFiniteNumber(value.shortRuleChars) &&
    isFiniteNumber(value.similarityThreshold) &&
    isFiniteNumber(value.minPracticeSeconds)
  );
}

function isVideoData(value: unknown): value is VideoData {
  return (
    isRecord(value) &&
    typeof value.videoId === 'string' &&
    value.videoId !== '' &&
    Array.isArray(value.sections) &&
    value.sections.every(isSection) &&
    Array.isArray(value.lines) &&
    value.lines.every(isLine) &&
    (value.endT === null || isFiniteNumber(value.endT))
  );
}

function isPracticeRecord(value: unknown): value is PracticeRecord {
  return (
    isRecord(value) &&
    typeof value.videoId === 'string' &&
    typeof value.sectionId === 'string' &&
    typeof value.at === 'string' &&
    isFiniteNumber(value.seconds)
  );
}
