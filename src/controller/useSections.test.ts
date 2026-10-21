import { describe, expect, it } from 'vitest';
import { createStorage, videoKey, type KeyValueStore } from '../adapters/storage.ts';
import type { Section, VideoData } from '../types.ts';
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
const section: Section = { id: 'a', name: '구간 1', start: 10, end: 20 };

describe('saveSections', () => {
  it('구간을 영상별 키에 저장하고, 새로 만든 저장소에서도 그대로 읽힌다', () => {
    const store = memoryStore();
    expect(saveSections(createStorage(store), ID, [section])).toEqual({ ok: true });

    // 새로고침과 같은 상황: 같은 저장소로 어댑터를 다시 만든다
    const reloaded = createStorage(store);
    expect(reloaded.loadVideo(ID).sections).toEqual([section]);
    expect(reloaded.loadVideo(OTHER).sections).toEqual([]);
  });

  it('같은 영상의 가사 매핑은 건드리지 않는다', () => {
    // 가사는 저장소에 넣지 않는다(PRD F3-5). 직접 만든 가상의 구절만 쓴다.
    const existing: VideoData = { videoId: ID, sections: [], lines: [{ t: 3, text: '테스트 구절' }], endT: 9 };
    const store = memoryStore({ [videoKey(ID)]: JSON.stringify(existing) });

    saveSections(createStorage(store), ID, [section]);
    expect(JSON.parse(store.data.get(videoKey(ID)) ?? 'null')).toEqual({ ...existing, sections: [section] });
  });

  it('쓰기에 실패하면 실패 결과를 돌려준다', () => {
    const error = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    const store: KeyValueStore = {
      getItem: () => null,
      setItem: () => {
        throw error;
      },
    };
    expect(saveSections(createStorage(store), ID, [section])).toEqual({ ok: false, reason: 'quota-exceeded', error });
  });
});
