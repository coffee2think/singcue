import { describe, expect, it } from 'vitest';
import type { PlayerEvent } from '../adapters/playerAdapter/index.ts';
import { DEFAULT_SETTINGS } from '../core/defaultSettings.ts';
import { INITIAL_PLAYBACK_STATE, playbackReducer } from '../core/playbackMachine.ts';
import type { PlaybackState, Section } from '../types.ts';
import { canPlay, canStop, playSection, toMachineEvent } from './playback.ts';

const section: Section = { id: 'a', name: '구간 1', start: 75, end: 100 };

function fakePlayer() {
  const calls: string[] = [];
  return {
    calls,
    seekTo: (seconds: number) => calls.push(`seekTo:${seconds}`),
    play: () => calls.push('play'),
  };
}

/** 플레이어 이벤트를 차례로 받아 컨트롤러가 갖게 될 상태 */
function run(events: PlayerEvent[], from: PlaybackState = INITIAL_PLAYBACK_STATE): PlaybackState {
  return events.reduce((state, event) => playbackReducer(state, toMachineEvent(event)), from);
}

describe('toMachineEvent', () => {
  it('준비는 영상이 준비된 정지 상태로 바꾼다', () => {
    expect(run([{ type: 'ready' }])).toBe('stopped');
  });

  it('재생·정지 상태 변경을 그대로 따른다', () => {
    expect(run([{ type: 'stateChange', status: 'playing' }], 'stopped')).toBe('playing');
    expect(run([{ type: 'stateChange', status: 'stopped' }], 'playing')).toBe('stopped');
  });

  it('오류가 나면 준비 전으로 돌아간다', () => {
    expect(run([{ type: 'error', error: { code: 150, message: '' } }], 'playing')).toBe('unready');
  });

  it('영상 화면을 직접 눌러 생긴 재생·정지도 버튼과 같은 상태가 된다', () => {
    // 버튼 재생 → 화면 클릭 정지 → 화면 클릭 재생 → 버튼 정지
    const events: PlayerEvent[] = [
      { type: 'ready' },
      { type: 'stateChange', status: 'playing' },
      { type: 'stateChange', status: 'stopped' },
    ];
    expect(run(events)).toBe('stopped');
    expect(run([...events, { type: 'stateChange', status: 'playing' }])).toBe('playing');
  });
});

describe('canPlay / canStop', () => {
  it('준비 전이거나 구간을 고르지 않았으면 재생할 수 없다', () => {
    expect(canPlay('unready', section)).toBe(false);
    expect(canPlay('stopped', null)).toBe(false);
    expect(canPlay('stopped', section)).toBe(true);
    // 재생 중에 누르면 구간 처음부터 다시 재생한다
    expect(canPlay('playing', section)).toBe(true);
  });

  it('재생 중일 때만 정지할 수 있다', () => {
    expect(canStop('playing')).toBe(true);
    expect(canStop('stopped')).toBe(false);
    expect(canStop('unready')).toBe(false);
  });
});

describe('playSection', () => {
  it('구간 시작에서 프리롤만큼 앞으로 옮긴 뒤 재생한다', () => {
    const player = fakePlayer();
    expect(playSection(player, section, DEFAULT_SETTINGS.preroll)).toBe(73.5);
    expect(player.calls).toEqual(['seekTo:73.5', 'play']);
  });

  it('시작 위치가 프리롤보다 앞이면 0초부터 재생한다', () => {
    const player = fakePlayer();
    expect(playSection(player, { ...section, start: 1 }, 1.5)).toBe(0);
    expect(player.calls).toEqual(['seekTo:0', 'play']);
  });

  it('프리롤이 0이면 구간 시작 위치에서 재생한다', () => {
    const player = fakePlayer();
    playSection(player, section, 0);
    expect(player.calls).toEqual(['seekTo:75', 'play']);
  });
});
