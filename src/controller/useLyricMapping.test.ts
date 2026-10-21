import { describe, expect, it } from 'vitest';
import { createStorage, videoKey, type KeyValueStore } from '../adapters/storage.ts';
import type { Line, Section, VideoData } from '../types.ts';
import { saveLyricMapping } from './useLyricMapping.ts';
import { saveSections } from './useSections.ts';

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

const ID = 'dQw4w9WgXcQ';
const OTHER = 'a-b_c-d_e-f';
// 가사는 저장소에 넣지 않는다(PRD F3-5). 직접 만든 가상의 구절만 쓴다.
const lines: Line[] = [
  { t: 12, text: '창문 너머 초록 버스가 지나가고' },
  { t: 18.4, text: '주머니 속 동전 세 개를 세어 보네' },
];
const section: Section = { id: 'a', name: '구간 1', start: 10, end: 20 };

describe('saveLyricMapping', () => {
  it('매핑을 영상별 키에 저장하고, 새로 만든 저장소에서도 그대로 읽힌다', () => {
    const store = memoryStore();
    expect(saveLyricMapping(createStorage(store), ID, lines, 25)).toEqual({ ok: true });

    // 새로고침과 같은 상황: 같은 저장소로 어댑터를 다시 만든다
    const reloaded = createStorage(store);
    expect(reloaded.loadVideo(ID)).toEqual({ videoId: ID, sections: [], lines, endT: 25 });
    expect(reloaded.loadVideo(OTHER)).toEqual({ videoId: OTHER, sections: [], lines: [], endT: null });
  });

  it('같은 영상의 구간은 지우거나 덮어쓰지 않는다', () => {
    const existing: VideoData = { videoId: ID, sections: [section], lines: [], endT: null };
    const store = memoryStore({ [videoKey(ID)]: JSON.stringify(existing) });

    saveLyricMapping(createStorage(store), ID, lines, 25);
    expect(JSON.parse(store.data.get(videoKey(ID)) ?? 'null')).toEqual({ ...existing, lines, endT: 25 });
  });

  it('구간 저장과 매핑 저장을 번갈아 해도 서로의 데이터가 남는다', () => {
    // 두 패널이 같은 어댑터로 같은 영상을 따로 저장하는 상황
    const store = memoryStore();
    const storage = createStorage(store);
    saveLyricMapping(storage, ID, lines, null);
    saveSections(storage, ID, [section]);
    saveLyricMapping(storage, ID, [{ ...lines[0], t: 11 }, lines[1]], 30);

    expect(createStorage(store).loadVideo(ID)).toEqual({
      videoId: ID,
      sections: [section],
      lines: [{ ...lines[0], t: 11 }, lines[1]],
      endT: 30,
    });
  });

  it('다른 영상의 데이터는 건드리지 않는다', () => {
    const other: VideoData = { videoId: OTHER, sections: [section], lines: [{ t: 1, text: '다른 구절' }], endT: 5 };
    const store = memoryStore({ [videoKey(OTHER)]: JSON.stringify(other) });

    saveLyricMapping(createStorage(store), ID, lines, null);
    expect(JSON.parse(store.data.get(videoKey(OTHER)) ?? 'null')).toEqual(other);
  });

  it('쓰기에 실패하면 실패 결과를 돌려준다', () => {
    const error = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    const store: KeyValueStore = {
      getItem: () => null,
      setItem: () => {
        throw error;
      },
    };
    expect(saveLyricMapping(createStorage(store), ID, lines, null)).toEqual({ ok: false, reason: 'quota-exceeded', error });
  });
});
