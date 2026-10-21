import { describe, expect, it } from 'vitest';
import type { PlaybackState } from '../types.ts';
import { DEFAULT_SETTINGS } from './defaultSettings.ts';
import {
  INITIAL_PLAYBACK_STATE,
  playbackReducer,
  prerollStart,
  type PlayerEvent,
} from './playbackMachine.ts';

const STATES: PlaybackState[] = ['unready', 'stopped', 'playing'];

describe('playbackReducer', () => {
  it('처음 상태는 준비 전이다', () => {
    expect(INITIAL_PLAYBACK_STATE).toBe('unready');
  });

  const cases: [PlayerEvent['type'], PlaybackState][] = [
    ['loaded', 'stopped'],
    ['playing', 'playing'],
    ['buffering', 'playing'],
    ['paused', 'stopped'],
    ['ended', 'stopped'],
    ['error', 'unready'],
    ['unloaded', 'unready'],
  ];

  describe.each(STATES)('%s 상태에서', (from) => {
    it.each(cases)('%s 이벤트를 받으면 %s가 된다', (type, to) => {
      expect(playbackReducer(from, { type })).toBe(to);
    });
  });

  it('영상을 불러와 재생하고 멈추는 흐름을 따른다', () => {
    const events: PlayerEvent[] = [
      { type: 'loaded' },
      { type: 'buffering' },
      { type: 'playing' },
      { type: 'paused' },
      { type: 'playing' },
      { type: 'ended' },
      { type: 'unloaded' },
    ];
    const visited: PlaybackState[] = [];
    events.reduce((state, event) => {
      const next = playbackReducer(state, event);
      visited.push(next);
      return next;
    }, INITIAL_PLAYBACK_STATE);

    expect(visited).toEqual([
      'stopped',
      'playing',
      'playing',
      'stopped',
      'playing',
      'stopped',
      'unready',
    ]);
  });

  it('알 수 없는 이벤트는 상태를 바꾸지 않는다', () => {
    const unknown = { type: 'seeked' } as unknown as PlayerEvent;
    for (const state of STATES) {
      expect(playbackReducer(state, unknown)).toBe(state);
    }
  });
});

describe('prerollStart', () => {
  it('구간 시작보다 프리롤만큼 앞에서 시작한다', () => {
    expect(prerollStart(10, 1.5)).toBe(8.5);
    expect(prerollStart(10, DEFAULT_SETTINGS.preroll)).toBe(8.5);
  });

  it('시작 위치가 프리롤보다 앞이면 0초에서 시작한다', () => {
    expect(prerollStart(1, 1.5)).toBe(0);
    expect(prerollStart(0, 1.5)).toBe(0);
  });

  it('시작 위치와 프리롤이 같으면 0초다', () => {
    expect(prerollStart(1.5, 1.5)).toBe(0);
  });

  it('프리롤이 0이면 구간 시작 위치 그대로다', () => {
    expect(prerollStart(42.25, 0)).toBe(42.25);
  });
});
