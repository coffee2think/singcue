import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../core/defaultSettings.ts';
import type { Settings, VideoData } from '../types.ts';
import { createStorage, SETTINGS_KEY, videoKey, type KeyValueStore } from './storage.ts';

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
