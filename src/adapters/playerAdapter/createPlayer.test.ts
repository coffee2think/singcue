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

  // #53: 이동 직후 버퍼링 중에 pauseVideo를 보내면 실제 YouTube는 버퍼링(3)에 머문 채 일시정지(2)를 보내지 않는다.
  // 가짜 플레이어는 pauseVideo에 아무 이벤트도 보내지 않아 그 동작을 흉내 낸다.
  describe('버퍼링 중 정지 요청(#53)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    /** 재생 중에 위치를 옮겨 버퍼링에 들어간 상태 */
    async function setupBuffering() {
      const ctx = await setup();
      ctx.fire.state(1);
      ctx.adapter.seekTo(30);
      ctx.adapter.play();
      ctx.fire.state(3);
      ctx.events.length = 0;
      return ctx;
    }

    it('버퍼링 중 pause 뒤 일시정지 이벤트가 오지 않으면 0.5초 뒤 정지를 한 번 알린다', async () => {
      const { PAUSE_STUCK_MS } = await import('./createPlayer.ts');
      const { adapter, events, player } = await setupBuffering();

      adapter.pause();
      expect(player.pauseVideo).toHaveBeenCalledOnce();
      vi.advanceTimersByTime(PAUSE_STUCK_MS - 1);
      expect(events).toEqual([]);
      vi.advanceTimersByTime(1);
      expect(events).toEqual([{ type: 'stateChange', status: 'stopped' }]);

      // 정지 버튼을 다시 눌러도 정지를 또 알리지 않는다
      adapter.pause();
      vi.advanceTimersByTime(PAUSE_STUCK_MS);
      expect(events).toHaveLength(1);
      expect(PAUSE_STUCK_MS).toBeLessThan(1000);
    });

    it('대신 정지를 알린 뒤 재생하면 재생 중을 다시 알린다', async () => {
      const { adapter, events, fire } = await setupBuffering();
      adapter.pause();
      vi.advanceTimersByTime(500);

      adapter.play();
      fire.state(1);

      expect(events).toEqual([
        { type: 'stateChange', status: 'stopped' },
        { type: 'stateChange', status: 'playing' },
      ]);
    });

    it('버퍼링이 먼저 끝나 실제 일시정지가 오면 그 이벤트만 알린다', async () => {
      const { adapter, events, fire } = await setupBuffering();

      adapter.pause();
      fire.state(1); // 실제 기록: 3, 1, 2 순서로 온다
      fire.state(2);
      vi.advanceTimersByTime(500);

      expect(events).toEqual([{ type: 'stateChange', status: 'stopped' }]);
    });

    it('정지 요청 뒤 버퍼링이 다시 와도 0.5초 기준을 지킨다', async () => {
      const { adapter, events, fire } = await setupBuffering();

      adapter.pause();
      vi.advanceTimersByTime(300);
      fire.state(3);
      vi.advanceTimersByTime(200);

      expect(events).toEqual([{ type: 'stateChange', status: 'stopped' }]);
    });

    it('pause 뒤 0.5초 안에 다시 재생하면 정지를 알리지 않는다', async () => {
      const { adapter, events } = await setupBuffering();

      adapter.pause();
      vi.advanceTimersByTime(200);
      adapter.play();
      vi.advanceTimersByTime(1000);

      expect(events).toEqual([]);
    });

    it('처음 재생 중 시작 전(-1)에 머문 채 pause에 답이 없어도 0.5초 뒤 정지를 알린다', async () => {
      const { adapter, events, fire } = await setup();
      events.length = 0;

      adapter.play();
      [-1, 3, -1].forEach(fire.state); // 실제 기록: 처음 재생 순서 중간에 멈춘 경우
      adapter.pause();
      vi.advanceTimersByTime(500);

      expect(events).toEqual([
        { type: 'stateChange', status: 'playing' },
        { type: 'stateChange', status: 'stopped' },
      ]);
    });

    it('정지 요청이 없는 버퍼링은 오래 이어져도 재생 중이다', async () => {
      const { events, fire } = await setup();
      events.length = 0;

      fire.state(3);
      vi.advanceTimersByTime(10_000);

      expect(events).toEqual([{ type: 'stateChange', status: 'playing' }]);
    });

    it('재생 중(버퍼링 아님)에 pause하면 타이머 없이 실제 일시정지 이벤트를 기다린다', async () => {
      const { adapter, events, fire } = await setup();
      fire.state(1);
      events.length = 0;

      adapter.pause();
      vi.advanceTimersByTime(10_000);
      expect(events).toEqual([]);

      fire.state(2);
      expect(events).toEqual([{ type: 'stateChange', status: 'stopped' }]);
    });
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
