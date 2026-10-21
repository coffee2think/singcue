// 버튼 재생·정지의 순수 로직. PRD F1-5, F2-7, 기술 설계 문서의 "상태 머신"을 따른다.
// 플레이어 이벤트를 playbackMachine 이벤트로 바꾸고, 구간 재생 위치를 계산해 플레이어에 명령한다.

import type { PlayerAdapter, PlayerEvent as AdapterEvent } from '../adapters/playerAdapter/index.ts';
import { prerollStart, type PlayerEvent as MachineEvent } from '../core/playbackMachine.ts';
import type { PlaybackState, Section } from '../types.ts';

/**
 * playerAdapter 이벤트를 상태 머신 이벤트로 바꾼다.
 * 준비는 영상이 준비된 정지 상태이고, 어댑터의 'stopped'는 일시정지·끝남·준비됨을 모두 포함하므로 'paused'로 보낸다.
 */
export function toMachineEvent(event: AdapterEvent): MachineEvent {
  switch (event.type) {
    case 'ready':
      return { type: 'loaded' };
    case 'stateChange':
      return { type: event.status === 'playing' ? 'playing' : 'paused' };
    case 'error':
      return { type: 'error' };
  }
}

/** 재생 버튼을 누를 수 있는지. 플레이어가 준비되고 연습 구간을 골랐을 때만 재생한다 */
export function canPlay(state: PlaybackState, section: Section | null): section is Section {
  return state !== 'unready' && section !== null;
}

/** 정지 버튼을 누를 수 있는지. 버퍼링도 재생 중으로 본다 */
export function canStop(state: PlaybackState): boolean {
  return state === 'playing';
}

/**
 * 구간 시작에서 프리롤만큼 앞으로 옮긴 뒤 재생한다. 옮긴 위치(초)를 돌려준다.
 * 재생 중에 눌러도 구간 처음부터 다시 재생한다. 상태는 플레이어 이벤트로 바뀌므로 여기서 바꾸지 않는다.
 */
export function playSection(player: Pick<PlayerAdapter, 'seekTo' | 'play'>, section: Section, preroll: number): number {
  const from = prerollStart(section.start, preroll);
  player.seekTo(from);
  player.play();
  return from;
}
