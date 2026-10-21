// localStorage 어댑터. 기술 설계 문서의 "데이터 구조와 저장", "오류 처리(저장 공간 부족)"를 따른다.
// 읽기는 값이 없거나 손상되어도 기본값을 돌려주고, 쓰기는 예외를 던지지 않고 결과로 알린다.
import { DEFAULT_SETTINGS } from '../core/defaultSettings.ts';
import type { EndAction, Line, Section, Settings, VideoData } from '../types.ts';

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
