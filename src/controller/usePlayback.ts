// 버튼 재생·정지와 구간 끝 동작 훅. 재생 상태의 기준은 플레이어 이벤트(onStateChange)라서,
// 사용자가 영상 화면을 직접 눌러 재생·정지해도 같은 경로로 상태가 바뀐다.

import { useCallback, useEffect, useReducer, useRef, type RefObject } from 'react';
import type { PlayerAdapter, PlayerEvent } from '../adapters/playerAdapter/index.ts';
import type { StorageAdapter } from '../adapters/storage.ts';
import { INITIAL_PLAYBACK_STATE, playbackReducer } from '../core/playbackMachine.ts';
import type { PlaybackState, Section } from '../types.ts';
import {
  SECTION_END_CHECK_MS,
  canPlay,
  canPlayAt,
  canStop,
  checkSectionEnd,
  playFrom,
  playSection,
  startSectionEndWatch,
  toMachineEvent,
  type LapComplete,
  type SectionEndWatch,
} from './playback.ts';

export type LapListener = (lap: LapComplete) => void;

export type UsePlayback = {
  state: PlaybackState;
  /** 플레이어 이벤트를 상태에 반영한다. 렌더마다 같은 함수다 */
  onPlayerEvent: (event: PlayerEvent) => void;
  /** 영상을 다시 불러오거나 화면에서 뺄 때 준비 전으로 돌린다. 렌더마다 같은 함수다 */
  unload: () => void;
  /** 구간 시작에서 프리롤만큼 앞부터 재생한다. 재생할 수 없으면 아무것도 하지 않는다 */
  play: (section: Section | null) => void;
  /**
   * 임의 위치(초)에서 프리롤만큼 앞부터 재생한다(구절 인식 점프). 옮긴 위치(초)를 돌려주고, 재생할 수 없으면 null이다.
   * 구간 끝 확인은 마지막으로 `play`에 넘긴 구간을 그대로 쓴다. 영상 화면을 직접 눌러 재생할 때와 같다
   */
  playAt: (time: number) => number | null;
  stop: () => void;
  /**
   * 자동 반복의 바퀴 완료 알림을 받는다. 해제 함수를 돌려준다. 렌더마다 같은 함수다.
   * 연습 기록(#27)이 훅 호출 순서와 상관없이 연결할 수 있도록 옵션 대신 구독으로 연다.
   */
  subscribeLap: (listener: LapListener) => () => void;
};

/**
 * 프리롤과 구간 끝 동작은 쓸 때마다 `singcue:settings`에서 읽는다. 설정 패널에서 저장한 값이 바로 다음 재생·다음 구간 끝에 반영된다.
 * 구간 끝은 마지막으로 `play`에 넘긴 구간을 기준으로 재생 중에만 0.25초마다 확인한다(PRD F2-8).
 */
export function usePlayback(playerRef: RefObject<PlayerAdapter | null>, storage: StorageAdapter): UsePlayback {
  const [state, dispatch] = useReducer(playbackReducer, INITIAL_PLAYBACK_STATE);
  /** 마지막으로 재생한 연습 구간. 영상 화면을 직접 눌러 재생해도 이 구간의 끝을 확인한다 */
  const sectionRef = useRef<Section | null>(null);
  const watchRef = useRef<SectionEndWatch | null>(null);
  const lapListenersRef = useRef(new Set<LapListener>());

  const onPlayerEvent = useCallback((event: PlayerEvent) => dispatch(toMachineEvent(event)), []);
  const unload = useCallback(() => {
    sectionRef.current = null;
    dispatch({ type: 'unloaded' });
  }, []);
  const subscribeLap = useCallback((listener: LapListener) => {
    const listeners = lapListenersRef.current;
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  // 재생 중일 때만 위치를 확인한다. 재생 중이 될 때마다 바퀴를 새로 시작한다
  const playing = state === 'playing';
  useEffect(() => {
    if (!playing) return;
    const watch = startSectionEndWatch(Date.now());
    watchRef.current = watch;
    const timer = setInterval(() => {
      const player = playerRef.current;
      const section = sectionRef.current;
      if (!player || !section) return;
      const lap = checkSectionEnd(player, section, watch, () => storage.loadSettings(), Date.now());
      if (lap) lapListenersRef.current.forEach((listener) => listener(lap));
    }, SECTION_END_CHECK_MS);
    return () => {
      clearInterval(timer);
      watchRef.current = null;
    };
  }, [playing, playerRef, storage]);

  function play(section: Section | null) {
    const player = playerRef.current;
    if (!player || !canPlay(state, section)) return;
    sectionRef.current = section;
    // 재생 중에 다시 누르면 위치만 옮겨지므로 직전 위치를 버려 새 위치부터 비교한다. 바퀴 시작 시각은 그대로 둔다
    if (watchRef.current) watchRef.current.lastTime = null;
    playSection(player, section, storage.loadSettings().preroll);
  }

  function playAt(time: number): number | null {
    const player = playerRef.current;
    if (!player || !canPlayAt(state)) return null;
    // 위치가 옮겨지므로 직전 위치를 버려, 옮기기 전 위치와 비교해 구간 끝을 지났다고 보지 않게 한다
    if (watchRef.current) watchRef.current.lastTime = null;
    return playFrom(player, time, storage.loadSettings().preroll);
  }

  function stop() {
    if (canStop(state)) playerRef.current?.pause();
  }

  return { state, onPlayerEvent, unload, play, playAt, stop, subscribeLap };
}
