// 브라우저 없이 window, document를 모의 객체로 바꿔 스크립트 삽입과 준비 콜백만 확인한다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { YTNamespace } from './youtubeIframeApi.ts';

type FakeScript = { src: string; async: boolean; onerror: (() => void) | null; remove: () => void };

let scripts: FakeScript[];
let fakeWindow: { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void };

const fakeYT = { Player: vi.fn() } as unknown as YTNamespace;

async function importLoader() {
  return (await import('./youtubeIframeApi.ts')).loadYouTubeIframeApi;
}

beforeEach(() => {
  vi.resetModules();
  scripts = [];
  fakeWindow = {};
  vi.stubGlobal('window', fakeWindow);
  vi.stubGlobal('document', {
    createElement: () => {
      const script: FakeScript = { src: '', async: false, onerror: null, remove: vi.fn() };
      return script;
    },
    head: { appendChild: (script: FakeScript) => scripts.push(script) },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadYouTubeIframeApi', () => {
  it('스크립트를 넣고 onYouTubeIframeAPIReady가 불리면 YT를 돌려준다', async () => {
    const load = await importLoader();
    const promise = load();

    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toBe('https://www.youtube.com/iframe_api');

    fakeWindow.YT = fakeYT;
    fakeWindow.onYouTubeIframeAPIReady?.();
    await expect(promise).resolves.toBe(fakeYT);
  });

  it('여러 번 불러도 스크립트는 한 번만 넣는다', async () => {
    const load = await importLoader();
    const first = load();
    const second = load();

    expect(second).toBe(first);
    expect(scripts).toHaveLength(1);
  });

  it('이미 YT가 있으면 스크립트를 넣지 않는다', async () => {
    fakeWindow.YT = fakeYT;
    const load = await importLoader();

    await expect(load()).resolves.toBe(fakeYT);
    expect(scripts).toHaveLength(0);
  });

  it('기존 onYouTubeIframeAPIReady 콜백도 그대로 부른다', async () => {
    const previous = vi.fn();
    fakeWindow.onYouTubeIframeAPIReady = previous;
    const load = await importLoader();
    const promise = load();

    fakeWindow.YT = fakeYT;
    fakeWindow.onYouTubeIframeAPIReady?.();
    await promise;
    expect(previous).toHaveBeenCalledOnce();
  });

  it('스크립트를 못 불러오면 거부하고, 다음 호출에서 다시 시도한다', async () => {
    const load = await importLoader();
    const failed = load();
    scripts[0].onerror?.();

    await expect(failed).rejects.toThrow('불러오지 못했습니다');
    expect(scripts[0].remove).toHaveBeenCalled();

    const retry = load();
    expect(retry).not.toBe(failed);
    expect(scripts).toHaveLength(2);
  });
});
