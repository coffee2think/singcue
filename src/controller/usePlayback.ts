// 버튼 재생·정지 훅. 재생 상태의 기준은 플레이어 이벤트(onStateChange)라서,
// 사용자가 영상 화면을 직접 눌러 재생·정지해도 같은 경로로 상태가 바뀐다.

import { useCallback, useReducer, type RefObject } from 'react';
import type { PlayerAdapter, PlayerEvent } from '../adapters/playerAdapter/index.ts';
import type { StorageAdapter } from '../adapters/storage.ts';
import { INITIAL_PLAYBACK_STATE, playbackReducer } from '../core/playbackMachine.ts';
import type { PlaybackState, Section } from '../types.ts';
import { canPlay, canStop, playSection, toMachineEvent } from './playback.ts';

export type UsePlayback = {
  state: PlaybackState;
  /** 플레이어 이벤트를 상태에 반영한다. 렌더마다 같은 함수다 */
  onPlayerEvent: (event: PlayerEvent) => void;
  /** 영상을 다시 불러오거나 화면에서 뺄 때 준비 전으로 돌린다. 렌더마다 같은 함수다 */
  unload: () => void;
  /** 구간 시작에서 프리롤만큼 앞부터 재생한다. 재생할 수 없으면 아무것도 하지 않는다 */
  play: (section: Section | null) => void;
  stop: () => void;
};

/**
 * 프리롤은 누를 때마다 `singcue:settings`에서 읽는다. 설정 패널에서 저장한 값이 바로 다음 재생에 반영된다.
 */
export function usePlayback(playerRef: RefObject<PlayerAdapter | null>, storage: StorageAdapter): UsePlayback {
  const [state, dispatch] = useReducer(playbackReducer, INITIAL_PLAYBACK_STATE);

  const onPlayerEvent = useCallback((event: PlayerEvent) => dispatch(toMachineEvent(event)), []);
  const unload = useCallback(() => dispatch({ type: 'unloaded' }), []);

  function play(section: Section | null) {
    const player = playerRef.current;
    if (!player || !canPlay(state, section)) return;
    playSection(player, section, storage.loadSettings().preroll);
  }

  function stop() {
    if (canStop(state)) playerRef.current?.pause();
  }

  return { state, onPlayerEvent, unload, play, stop };
}
