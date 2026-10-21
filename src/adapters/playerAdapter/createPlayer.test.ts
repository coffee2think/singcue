// 모의 YT.Player로 이벤트 변환과 재생 제어 위임만 확인한다. 실제 YouTube 플레이어 동작은 확인하지 않는다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerEvent } from './playerEvents.ts';
import type { YTPlayer, YTPlayerOptions } from './youtubeIframeApi.ts';

let created: { element: HTMLElement | string; options: YTPlayerOptions; player: YTPlayer }[];

class FakePlayer {
  playVideo = vi.fn();
  pauseVideo = vi.fn();
  seekTo = vi.fn();
  getCurrentTime = vi.fn(() => 12.5);
  cueVideoById = vi.fn();
  destroy = vi.fn();

  constructor(element: HTMLElement | string, options: YTPlayerOptions) {
    created.push({ element, options, player: this });
  }
}

beforeEach(() => {
  vi.resetModules();
  created = [];
  vi.stubGlobal('window', {
    YT: { Player: FakePlayer },
    location: { protocol: 'http:', origin: 'http://localhost:5173' },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 플레이어를 만들고 onReady까지 보낸 상태를 돌려준다 */
async function setup() {
  const { createPlayer } = await import('./createPlayer.ts');
  const events: PlayerEvent[] = [];
  const pending = createPlayer('player', 'dQw4w9WgXcQ', (event) => events.push(event));
  await vi.waitFor(() => expect(created).toHaveLength(1));

  const { options, player } = created[0];
  options.events?.onReady?.({ target: player });
  const adapter = await pending;
  const fire = {
    state: (data: number) => options.events?.onStateChange?.({ data, target: player }),
    error: (data: number) => options.events?.onError?.({ data, target: player }),
  };
  return { adapter, events, player: player as unknown as FakePlayer, options, fire };
}

describe('createPlayer', () => {
  it('영상 ID와 PoC와 같은 playerVars로 플레이어를 만들고, 준비되면 ready를 알린다', async () => {
    const { events, options } = await setup();

    expect(created[0].element).toBe('player');
    expect(options.videoId).toBe('dQw4w9WgXcQ');
    expect(options.playerVars).toEqual({ playsinline: 1, rel: 0, origin: 'http://localhost:5173' });
    expect(events).toEqual([{ type: 'ready' }]);
  });

  it('play, pause, seekTo, getCurrentTime을 플레이어에 넘긴다', async () => {
    const { adapter, player } = await setup();

    adapter.play();
    adapter.pause();
    adapter.seekTo(42.3);
    adapter.seekTo(-1.5);

    expect(player.playVideo).toHaveBeenCalledOnce();
    expect(player.pauseVideo).toHaveBeenCalledOnce();
    expect(player.seekTo).toHaveBeenNthCalledWith(1, 42.3, true);
    expect(player.seekTo).toHaveBeenNthCalledWith(2, 0, true);
    expect(adapter.getCurrentTime()).toBe(12.5);
  });

  // 아래 상태 순서는 실제 Chrome 계열 브라우저(앱 내 브라우저)에서 기록한 값이다.
  it('처음 재생할 때(-1, 3, -1, 3, 1) 재생 중을 한 번만 알린다', async () => {
    const { events, fire } = await setup();
    events.length = 0;

    [-1, 3, -1, 3, 1].forEach(fire.state);

    expect(events).toEqual([{ type: 'stateChange', status: 'playing' }]);
  });

  it('버퍼링은 재생 중으로 바꿔 전달하고, 같은 상태는 한 번만 알린다', async () => {
    const { events, fire } = await setup();
    events.length = 0;

    fire.state(3); // 버퍼링
    fire.state(1); // 재생 중
    fire.state(3); // 재생 중 이동으로 버퍼링
    fire.state(1);
    fire.state(2); // 일시정지
    fire.state(0); // 끝남

    expect(events).toEqual([
      { type: 'stateChange', status: 'playing' },
      { type: 'stateChange', status: 'stopped' },
    ]);
  });

  it('onError 코드를 안내 문구와 함께 전달한다', async () => {
    const { events, fire } = await setup();
    events.length = 0;

    fire.error(150);

    expect(events).toEqual([
      { type: 'error', error: { code: 150, message: expect.stringContaining('다른 영상') } },
    ]);
  });

  it('load는 자동재생 없이 영상을 준비하고, 재생 중이었으면 정지를 한 번 알린다', async () => {
    const { adapter, events, player, fire } = await setup();
    fire.state(1);
    events.length = 0;

    adapter.load('a-b_c-d_e-f');
    [2, -1, 5].forEach(fire.state); // 재생 중이던 영상을 바꿀 때의 순서

    expect(player.cueVideoById).toHaveBeenCalledWith('a-b_c-d_e-f');
    expect(player.playVideo).not.toHaveBeenCalled();
    expect(events).toEqual([{ type: 'stateChange', status: 'stopped' }]);
  });

  it('destroy는 플레이어를 없앤다', async () => {
    const { adapter, player } = await setup();
    adapter.destroy();
    expect(player.destroy).toHaveBeenCalledOnce();
  });
});
