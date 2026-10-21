import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../core/defaultSettings.ts';
import type { PracticeRecord, Settings, VideoData } from '../types.ts';
import {
  BACKUP_VERSION,
  createStorage,
  exportBackup,
  importBackup,
  LOG_KEY,
  parseBackup,
  serializeBackup,
  SETTINGS_KEY,
  videoKey,
  type BackupStore,
  type KeyValueStore,
} from './storage.ts';

/** localStorage와 같은 동작을 하는 메모리 저장소 */
function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, String(value));
    },
  };
}

/** 쓰기마다 지정한 예외를 던지는 저장소 */
function failingStore(error: unknown): KeyValueStore {
  return {
    getItem: () => null,
    setItem: () => {
      throw error;
    },
  };
}

const customSettings: Settings = {
  endAction: 'repeat',
  preroll: 2,
  stopWords: ['그만'],
  startWords: ['가자'],
  stopOnInterim: true,
  shortRuleChars: 3,
  similarityThreshold: 0.6,
  minPracticeSeconds: 5,
};

// 가사는 저장소에 넣지 않는다(PRD F3-5). 직접 만든 가상의 구절만 쓴다.
const video: VideoData = {
  videoId: 'abc123XYZ_-',
  sections: [{ id: 's1', name: '후렴', start: 30, end: 45.5 }],
  lines: [
    { t: 30, text: '가상의 첫 구절' },
    { t: 34.2, text: '가상의 둘째 구절' },
  ],
  endT: 38,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('저장 키', () => {
  it('설계 문서의 키 이름을 쓴다', () => {
    expect(SETTINGS_KEY).toBe('singcue:settings');
    expect(videoKey('abc123XYZ_-')).toBe('singcue:video:abc123XYZ_-');
  });
});

describe('설정 읽기·쓰기', () => {
  it('저장한 설정을 singcue:settings에 JSON으로 쓰고 그대로 읽는다', () => {
    const store = memoryStore();
    const storage = createStorage(store);

    expect(storage.saveSettings(customSettings)).toEqual({ ok: true });
    expect(JSON.parse(store.data.get('singcue:settings')!)).toEqual(customSettings);
    expect(createStorage(store).loadSettings()).toEqual(customSettings);
  });

  it('저장된 값이 없으면 기본값을 돌려준다', () => {
    expect(createStorage(memoryStore()).loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it.each([
    ['손상된 JSON', '{"endAction":'],
    ['빈 문자열', ''],
    ['null', 'null'],
    ['배열', '[1,2]'],
    ['숫자', '42'],
  ])('%s이면 기본값을 돌려준다', (_, raw) => {
    const storage = createStorage(memoryStore({ [SETTINGS_KEY]: raw }));
    expect(storage.loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('빠지거나 형식이 틀린 항목만 기본값으로 채운다', () => {
    const raw = JSON.stringify({ endAction: 'continue', preroll: '2', stopWords: ['그만', 1], shortRuleChars: 4 });
    const settings = createStorage(memoryStore({ [SETTINGS_KEY]: raw })).loadSettings();

    expect(settings).toEqual({ ...DEFAULT_SETTINGS, endAction: 'continue', shortRuleChars: 4 });
  });

  it('돌려준 기본값을 바꿔도 DEFAULT_SETTINGS는 바뀌지 않는다', () => {
    const settings = createStorage(memoryStore()).loadSettings();
    settings.stopWords.push('추가');

    expect(DEFAULT_SETTINGS.stopWords).not.toContain('추가');
  });
});

describe('영상 데이터 읽기·쓰기', () => {
  it('영상마다 singcue:video:<videoId>에 쓰고 그대로 읽는다', () => {
    const store = memoryStore();
    const storage = createStorage(store);
    const other: VideoData = { videoId: 'other', sections: [], lines: [{ t: 1, text: '다른 영상' }], endT: null };

    expect(storage.saveVideo(video)).toEqual({ ok: true });
    expect(storage.saveVideo(other)).toEqual({ ok: true });

    expect(JSON.parse(store.data.get('singcue:video:abc123XYZ_-')!)).toEqual(video);
    expect(createStorage(store).loadVideo('abc123XYZ_-')).toEqual(video);
    expect(createStorage(store).loadVideo('other')).toEqual(other);
  });

  it('저장된 값이 없으면 빈 기본값을 돌려준다', () => {
    expect(createStorage(memoryStore()).loadVideo('none')).toEqual({
      videoId: 'none',
      sections: [],
      lines: [],
      endT: null,
    });
  });

  it.each([
    ['손상된 JSON', '{"sections":[{'],
    ['null', 'null'],
    ['문자열', '"video"'],
  ])('%s이면 빈 기본값을 돌려준다', (_, raw) => {
    const storage = createStorage(memoryStore({ [videoKey('v1')]: raw }));
    expect(storage.loadVideo('v1')).toEqual({ videoId: 'v1', sections: [], lines: [], endT: null });
  });

  it('형식이 틀린 구간·구절은 버리고 나머지는 살린다', () => {
    const raw = JSON.stringify({
      videoId: 'v1',
      sections: [video.sections[0], { id: 's2', name: '빠진 끝', start: 1 }],
      lines: [video.lines[0], { t: '3', text: '시간이 문자열' }, null],
      endT: 'later',
    });
    const loaded = createStorage(memoryStore({ [videoKey('v1')]: raw })).loadVideo('v1');

    expect(loaded).toEqual({ videoId: 'v1', sections: [video.sections[0]], lines: [video.lines[0]], endT: null });
  });

  it('videoId는 요청한 키의 값을 쓴다', () => {
    const raw = JSON.stringify({ ...video, videoId: 'wrong' });
    expect(createStorage(memoryStore({ [videoKey('v1')]: raw })).loadVideo('v1').videoId).toBe('v1');
  });
});

describe('쓰기 실패', () => {
  it('저장 공간 부족 예외를 던지지 않고 quota-exceeded 결과를 돌려준다', () => {
    const error = new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    const storage = createStorage(failingStore(error));

    expect(() => storage.saveSettings(customSettings)).not.toThrow();
    expect(storage.saveSettings(customSettings)).toEqual({ ok: false, reason: 'quota-exceeded', error });
    expect(storage.saveVideo(video)).toEqual({ ok: false, reason: 'quota-exceeded', error });
  });

  it('예전 Firefox의 저장 공간 부족 이름도 quota-exceeded로 본다', () => {
    const error = new DOMException('quota', 'NS_ERROR_DOM_QUOTA_REACHED');
    expect(createStorage(failingStore(error)).saveVideo(video)).toMatchObject({ ok: false, reason: 'quota-exceeded' });
  });

  it('그 밖의 쓰기 예외는 write-error 결과를 돌려준다', () => {
    const error = new DOMException('denied', 'SecurityError');
    expect(createStorage(failingStore(error)).saveSettings(customSettings)).toEqual({
      ok: false,
      reason: 'write-error',
      error,
    });
  });

  it('쓰기에 실패해도 기존 값을 읽을 수 있다', () => {
    const store = memoryStore({ [SETTINGS_KEY]: JSON.stringify(customSettings) });
    const storage = createStorage({
      getItem: store.getItem,
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
    });

    expect(storage.saveSettings(DEFAULT_SETTINGS).ok).toBe(false);
    expect(storage.loadSettings()).toEqual(customSettings);
  });
});

describe('localStorage를 쓸 수 없는 환경', () => {
  it('저장소가 없으면 읽기는 기본값, 쓰기는 write-error를 돌려준다', () => {
    const storage = createStorage(null);

    expect(storage.loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(storage.loadVideo('v1')).toEqual({ videoId: 'v1', sections: [], lines: [], endT: null });
    expect(storage.saveSettings(customSettings)).toMatchObject({ ok: false, reason: 'write-error' });
  });

  it('읽기 예외가 나도 기본값을 돌려준다', () => {
    const storage = createStorage({
      getItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
      setItem: () => {},
    });

    expect(storage.loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('저장소를 넘기지 않으면 전역 localStorage를 쓴다', () => {
    const store = memoryStore();
    vi.stubGlobal('localStorage', store);

    expect(createStorage().saveVideo(video)).toEqual({ ok: true });
    expect(store.data.has('singcue:video:abc123XYZ_-')).toBe(true);
  });
});

/** 키 목록·삭제까지 되는 메모리 저장소. quota를 주면 키와 값의 글자 수 합이 넘칠 때 localStorage처럼 예외를 던진다 */
function backupStore(initial: Record<string, string> = {}, quota = Infinity): BackupStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  const size = () => [...data].reduce((sum, [key, value]) => sum + key.length + value.length, 0);
  return {
    data,
    get length() {
      return data.size;
    },
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      const old = data.get(key);
      const next = size() - (old === undefined ? 0 : key.length + old.length) + key.length + String(value).length;
      if (next > quota) throw new DOMException('quota', 'QuotaExceededError');
      data.set(key, String(value));
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

const otherVideo: VideoData = {
  videoId: 'otherVid_02',
  sections: [],
  lines: [{ t: 3.5, text: '가상의 다른 구절' }],
  endT: null,
};

const record: PracticeRecord = { videoId: video.videoId, sectionId: 's1', at: '2026-10-21T09:00:00.000Z', seconds: 12.5 };

/** 설정·영상 둘·연습 기록과 관계없는 키가 든 저장소 */
function filledStore() {
  return backupStore({
    [SETTINGS_KEY]: JSON.stringify(customSettings),
    [videoKey(video.videoId)]: JSON.stringify(video),
    [videoKey(otherVideo.videoId)]: JSON.stringify(otherVideo),
    [LOG_KEY]: JSON.stringify([record]),
    'other-app:key': '"관계없는 값"',
  });
}

describe('연습 기록 읽기·덧붙이기', () => {
  const second: PracticeRecord = { videoId: video.videoId, sectionId: 's2', at: '2026-10-21T09:01:00.000Z', seconds: 4 };

  it('기록을 singcue:log 끝에 덧붙이고, 새로 만든 저장소에서도 그대로 읽힌다', () => {
    const store = memoryStore();
    expect(createStorage(store).appendLog([record])).toEqual({ ok: true });
    expect(createStorage(store).appendLog([second])).toEqual({ ok: true });

    // 새로고침과 같은 상황: 같은 저장소로 어댑터를 다시 만든다
    expect(createStorage(store).loadLog()).toEqual([record, second]);
    expect(JSON.parse(store.data.get(LOG_KEY)!)).toEqual([record, second]);
  });

  it('저장된 기록이 없거나 손상되면 빈 목록을 읽는다', () => {
    expect(createStorage(memoryStore()).loadLog()).toEqual([]);
    expect(createStorage(memoryStore({ [LOG_KEY]: '[' })).loadLog()).toEqual([]);
    expect(createStorage(memoryStore({ [LOG_KEY]: '{}' })).loadLog()).toEqual([]);
    expect(createStorage(null).loadLog()).toEqual([]);
  });

  it('형식이 틀린 기록은 읽지 않고, 덧붙여 쓸 때도 빼고 쓴다', () => {
    const store = memoryStore({ [LOG_KEY]: JSON.stringify([record, { videoId: 1 }]) });
    expect(createStorage(store).loadLog()).toEqual([record]);
    createStorage(store).appendLog([second]);
    expect(JSON.parse(store.data.get(LOG_KEY)!)).toEqual([record, second]);
  });

  it('덧붙일 기록이 없으면 쓰지 않는다', () => {
    const store = memoryStore();
    expect(createStorage(store).appendLog([])).toEqual({ ok: true });
    expect(store.data.has(LOG_KEY)).toBe(false);
  });

  it('저장 공간이 부족하면 quota-exceeded를 돌려주고 기존 기록은 그대로다', () => {
    const store = backupStore({ [LOG_KEY]: JSON.stringify([record]) }, 0);
    const result = createStorage(store).appendLog([second]);
    expect(result).toMatchObject({ ok: false, reason: 'quota-exceeded' });
    expect(createStorage(store).loadLog()).toEqual([record]);
  });

  it('localStorage를 쓸 수 없으면 write-error를 돌려준다', () => {
    expect(createStorage(null).appendLog([record])).toMatchObject({ ok: false, reason: 'write-error' });
  });

  it('덧붙인 기록은 JSON 백업 내보내기에 들어간다', () => {
    const store = backupStore();
    createStorage(store).appendLog([record, second]);
    expect(exportBackup(store).log).toEqual([record, second]);
  });
});

describe('백업 내보내기', () => {
  it('{ version, settings, videos, log } 형식으로 전체 데이터를 모은다', () => {
    expect(exportBackup(filledStore())).toEqual({
      version: BACKUP_VERSION,
      settings: customSettings,
      videos: [video, otherVideo],
      log: [record],
    });
  });

  it('저장된 것이 없으면 기본 설정과 빈 목록을 내보낸다', () => {
    expect(exportBackup(backupStore())).toEqual({ version: 1, settings: DEFAULT_SETTINGS, videos: [], log: [] });
  });

  it('localStorage를 쓸 수 없어도 기본값으로 내보낸다', () => {
    expect(exportBackup(null)).toEqual({ version: 1, settings: DEFAULT_SETTINGS, videos: [], log: [] });
  });

  it('손상된 연습 기록은 빈 목록으로, 형식이 틀린 기록은 빼고 내보낸다', () => {
    expect(exportBackup(backupStore({ [LOG_KEY]: '[' })).log).toEqual([]);
    expect(exportBackup(backupStore({ [LOG_KEY]: JSON.stringify([record, { videoId: 1 }]) })).log).toEqual([record]);
  });

  it('직렬화한 내용은 다시 읽으면 같은 백업이 된다', () => {
    const backup = exportBackup(filledStore());
    expect(parseBackup(serializeBackup(backup))).toEqual({ ok: true, backup });
  });
});

describe('백업 불러오기', () => {
  it('내보낸 파일을 빈 저장소에 불러오면 같은 구절과 시간이 복원된다', () => {
    const text = serializeBackup(exportBackup(filledStore()));
    const target = backupStore();

    expect(importBackup(text, target)).toMatchObject({ ok: true });
    const storage = createStorage(target);
    expect(storage.loadVideo(video.videoId)).toEqual(video);
    expect(storage.loadVideo(otherVideo.videoId)).toEqual(otherVideo);
    expect(storage.loadSettings()).toEqual(customSettings);
    expect(exportBackup(target)).toEqual(exportBackup(filledStore()));
  });

  it('설정과 연습 기록은 바꾸고, 영상은 파일에 있는 것만 덮어쓴다', () => {
    const text = serializeBackup({ version: 1, settings: DEFAULT_SETTINGS, videos: [otherVideo], log: [] });
    const changedOther = { ...otherVideo, lines: [{ t: 9, text: '가상의 바뀐 구절' }] };
    const target = backupStore({
      [SETTINGS_KEY]: JSON.stringify(customSettings),
      [videoKey(video.videoId)]: JSON.stringify(video),
      [videoKey(otherVideo.videoId)]: JSON.stringify(changedOther),
      [LOG_KEY]: JSON.stringify([record]),
    });

    expect(importBackup(text, target)).toMatchObject({ ok: true });
    const storage = createStorage(target);
    expect(storage.loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(storage.loadVideo(otherVideo.videoId)).toEqual(otherVideo);
    expect(storage.loadVideo(video.videoId)).toEqual(video);
    expect(JSON.parse(target.data.get(LOG_KEY)!)).toEqual([]);
  });

  const valid = { version: 1, settings: customSettings, videos: [video], log: [record] };
  const withVideo = (patch: object) => JSON.stringify({ ...valid, videos: [{ ...video, ...patch }] });
  it.each([
    ['JSON이 아님', '노래 연습 기록', 'invalid-json'],
    ['손상된 JSON', '{"version":1,', 'invalid-json'],
    ['빈 파일', '', 'invalid-json'],
    ['배열', '[]', 'invalid-format'],
    ['version 없음', JSON.stringify({ ...valid, version: undefined }), 'invalid-format'],
    ['다른 version', JSON.stringify({ ...valid, version: 2 }), 'unsupported-version'],
    ['문자열 version', JSON.stringify({ ...valid, version: '1' }), 'unsupported-version'],
    ['settings 없음', JSON.stringify({ ...valid, settings: undefined }), 'invalid-format'],
    ['settings 항목이 빠짐', JSON.stringify({ ...valid, settings: { ...customSettings, preroll: undefined } }), 'invalid-format'],
    ['videos가 객체', JSON.stringify({ ...valid, videos: {} }), 'invalid-format'],
    ['구절 시간이 문자열', withVideo({ lines: [{ t: '30', text: '가상' }] }), 'invalid-format'],
    ['구간 끝이 없음', withVideo({ sections: [{ id: 's', name: '가', start: 1 }] }), 'invalid-format'],
    ['endT가 문자열', withVideo({ endT: '38' }), 'invalid-format'],
    ['videoId가 빈 문자열', withVideo({ videoId: '' }), 'invalid-format'],
    ['같은 영상이 두 번', JSON.stringify({ ...valid, videos: [video, video] }), 'invalid-format'],
    ['log 없음', JSON.stringify({ ...valid, log: undefined }), 'invalid-format'],
    ['기록 시간이 숫자가 아님', JSON.stringify({ ...valid, log: [{ ...record, seconds: '12' }] }), 'invalid-format'],
  ])('%s이면 기존 데이터를 건드리지 않고 이유를 알린다', (_, text, reason) => {
    const target = filledStore();
    const before = new Map(target.data);

    expect(importBackup(text, target)).toEqual({ ok: false, reason });
    expect(target.data).toEqual(before);
  });

  it('쓰는 도중 저장 공간이 부족하면 쓴 키를 원래 값으로 되돌린다', () => {
    const initial = { [SETTINGS_KEY]: JSON.stringify(DEFAULT_SETTINGS), [videoKey('keepVid_003')]: '{"lines":[]}' };
    const text = serializeBackup(exportBackup(filledStore()));
    // 설정·기록·첫 영상까지는 들어가고 둘째 영상에서 넘친다
    const firstThree = [SETTINGS_KEY, LOG_KEY, videoKey(video.videoId)];
    const quota =
      videoKey('keepVid_003').length +
      initial[videoKey('keepVid_003')].length +
      firstThree.reduce((sum, key) => sum + key.length + filledStore().data.get(key)!.length, 0) +
      10;
    const target = backupStore(initial, quota);

    expect(importBackup(text, target)).toMatchObject({ ok: false, reason: 'quota-exceeded' });
    expect(Object.fromEntries(target.data)).toEqual(initial);
  });

  it('localStorage를 쓸 수 없으면 write-error로 알린다', () => {
    const text = serializeBackup(exportBackup(filledStore()));
    expect(importBackup(text, null)).toMatchObject({ ok: false, reason: 'write-error' });
  });

  it('형식 확인이 먼저라 저장소가 없어도 형식 오류를 알린다', () => {
    expect(importBackup('{', null)).toEqual({ ok: false, reason: 'invalid-json' });
  });

  it('파일에 있던 알 수 없는 항목은 저장하지 않는다', () => {
    const text = JSON.stringify({ ...valid, extra: true, videos: [{ ...video, audioFile: 'x.mp3' }] });
    const target = backupStore();

    expect(importBackup(text, target)).toMatchObject({ ok: true });
    expect(JSON.parse(target.data.get(videoKey(video.videoId))!)).toEqual(video);
    expect(target.data.has('extra')).toBe(false);
  });
});
