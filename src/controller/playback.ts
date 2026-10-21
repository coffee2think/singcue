// 버튼 재생·정지와 구간 끝 동작의 순수 로직. PRD F1-5, F2-7, F2-8, 기술 설계 문서의 "상태 머신"을 따른다.
// 플레이어 이벤트를 playbackMachine 이벤트로 바꾸고, 구간 재생 위치를 계산해 플레이어에 명령한다.

import type { PlayerAdapter, PlayerEvent as AdapterEvent } from '../adapters/playerAdapter/index.ts';
import { prerollStart, type PlayerEvent as MachineEvent } from '../core/playbackMachine.ts';
import type { PlaybackState, Section, Settings } from '../types.ts';

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

/** 구간 끝 확인 간격(ms). 기술 설계 문서의 "구간 끝 감지"(0.25초)로, PRD F2-8의 "1초 이내"를 만족한다 */
export const SECTION_END_CHECK_MS = 250;

/**
 * 자동 반복에서 바퀴 하나가 끝났다는 알림. 구간 끝에 도달해 구간 시작으로 돌아갈 때마다 보낸다(#24 결정).
 * 연습 1회 판정(practiceCounter)이 바퀴마다 최소 재생 시간 규칙을 적용할 수 있도록 바퀴의 시작 시각과 재생 시간을 담는다.
 */
export type LapComplete = {
  section: Section;
  /** 바퀴를 재생하기 시작한 시각. `Date.now()` 기준 ms */
  startedAt: number;
  /** 바퀴의 재생 시간(초). 프리롤 구간도 포함한다 */
  seconds: number;
};

/**
 * 구간 끝 확인에 필요한 진행 상태. 재생 중이 될 때 `startSectionEndWatch`로 만들고 확인할 때마다 갱신한다.
 * - lastTime: 직전 확인 때의 재생 위치(초). 위치를 새로 옮긴 직후에는 null
 * - lapStartedAt: 지금 바퀴를 시작한 시각(`Date.now()` 기준 ms)
 */
export type SectionEndWatch = { lastTime: number | null; lapStartedAt: number };

export function startSectionEndWatch(now: number): SectionEndWatch {
  return { lastTime: null, lapStartedAt: now };
}

/**
 * 직전 확인 위치에서 이번 위치 사이에 구간 끝을 지났는지.
 * 끝 위치를 "지나는 순간"만 본다. 구간 끝 뒤에서 영상 화면을 직접 눌러 재생하거나, 자동 정지 뒤 이어서 재생해도
 * 다시 멈추지 않게 하기 위해서다.
 */
export function crossedSectionEnd(lastTime: number | null, currentTime: number, end: number): boolean {
  return lastTime !== null && lastTime < end && currentTime >= end;
}

/**
 * 재생 중 확인 한 번. 구간 끝을 지났으면 설정의 구간 끝 동작대로 플레이어에 명령한다.
 * - 자동 정지: 일시정지. 상태는 플레이어 이벤트로 정지가 된다
 * - 자동 반복: `playSection`과 같이 프리롤만큼 앞에서 다시 재생해 재생 중을 유지하고, 끝난 바퀴를 돌려준다(#24 결정).
 *   프리롤은 바퀴마다 설정에서 읽어, 반복 중에 바꾼 값이 다음 바퀴부터 반영된다
 * - 계속 재생: 아무것도 하지 않는다
 * 설정은 끝을 지났을 때만 읽는다. `watch`는 이 함수가 갱신한다.
 */
export function checkSectionEnd(
  player: Pick<PlayerAdapter, 'getCurrentTime' | 'pause' | 'seekTo' | 'play'>,
  section: Section,
  watch: SectionEndWatch,
  loadSettings: () => Pick<Settings, 'endAction' | 'preroll'>,
  now: number,
): LapComplete | null {
  const currentTime = player.getCurrentTime();
  const crossed = crossedSectionEnd(watch.lastTime, currentTime, section.end);
  watch.lastTime = currentTime;
  if (!crossed) return null;

  const { endAction, preroll } = loadSettings();
  switch (endAction) {
    case 'stop':
      player.pause();
      return null;
    case 'continue':
      return null;
    case 'repeat': {
      const lap: LapComplete = { section, startedAt: watch.lapStartedAt, seconds: (now - watch.lapStartedAt) / 1000 };
      playSection(player, section, preroll);
      // 이동 직후 getCurrentTime이 이전 위치를 돌려줄 수 있어, 다음 확인 위치부터 다시 비교한다
      watch.lastTime = null;
      watch.lapStartedAt = now;
      return lap;
    }
  }
}
