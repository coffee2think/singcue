// 음성 제어 훅. PRD F2-1~F2-6, 기술 설계 문서의 "음성 명령 처리 흐름"과 "오류 처리"를 따른다.
// speechAdapter의 인식 결과를 commandMatcher.decide()로 판별하고, 그 결과만 따라 usePlayback의 재생·정지를 부른다.

import { useEffect, useEffectEvent, useReducer, useRef, useState } from 'react';
import { MIN_DB, startMicMeter, type MicEvent, type MicMeter } from '../adapters/micMeter/index.ts';
import {
  createSpeechAdapter,
  isSpeechSupported,
  type SpeechAdapter,
  type SpeechError,
  type SpeechEvent,
  type SpeechResult,
} from '../adapters/speechAdapter/index.ts';
import type { StorageAdapter } from '../adapters/storage.ts';
import { DEBOUNCE_MS, decide } from '../core/commandMatcher.ts';
import type { Decision, IgnoreReason, PlaybackState, Section, Settings } from '../types.ts';
import type { UsePlayback } from './usePlayback.ts';

/** 시작 명령 후 이 시간(ms) 안에 재생 상태가 되지 않으면 자동재생 차단 가능성을 안내한다(PRD F2-3) */
export const AUTOPLAY_TIMEOUT_MS = 3000;

/** 화면에 남기는 판별 기록 수 */
export const MAX_LOG_ENTRIES = 10;

export type VoiceStatus = 'off' | 'starting' | 'on';

/** 판별 기록 하나. 실행한 명령과 무시한 발화를 이유와 함께 보여 준다(PRD F2-4) */
export type VoiceLogEntry = {
  id: string;
  /** 첫 번째 인식 후보 */
  text: string;
  outcome: 'stop' | 'start' | 'phrase' | 'ignore';
  /** 무시했거나 실행하지 못한 이유. 실행한 명령이면 null */
  reason: string | null;
};

export type VoiceState = {
  status: VoiceStatus;
  /** 사용 중인 마이크 장치 이름. 마이크를 열기 전이면 null */
  deviceLabel: string | null;
  /** 입력 레벨(dB, 정수로 반올림) */
  level: number;
  /** 마지막으로 들은 말(중간 결과 포함) */
  heard: string | null;
  /** 마이크·인식 오류 안내 */
  error: string | null;
  /** 입력이 들어오지 않을 때의 장치 확인 안내 */
  silent: boolean;
  /** 새것이 앞에 온다 */
  log: VoiceLogEntry[];
};

export type VoiceAction =
  | { type: 'enable' }
  | { type: 'disable' }
  | { type: 'micReady'; deviceLabel: string }
  | { type: 'micError'; message: string }
  | { type: 'level'; db: number }
  | { type: 'silence' }
  | { type: 'speechStart' }
  | { type: 'speechError'; error: SpeechError }
  | { type: 'speechEnd'; restarting: boolean }
  | { type: 'heard'; text: string }
  | { type: 'log'; entry: VoiceLogEntry };

export const INITIAL_VOICE_STATE: VoiceState = {
  status: 'off',
  deviceLabel: null,
  level: MIN_DB,
  heard: null,
  error: null,
  silent: false,
  log: [],
};

export function voiceReducer(state: VoiceState, action: VoiceAction): VoiceState {
  switch (action.type) {
    case 'enable':
      return { ...state, status: 'starting', error: null, silent: false, heard: null };
    case 'disable':
      return { ...state, status: 'off', level: MIN_DB, silent: false };
    case 'micReady':
      return { ...state, deviceLabel: action.deviceLabel };
    case 'micError':
      return { ...state, status: 'off', level: MIN_DB, error: action.message };
    case 'level': {
      const level = Math.round(action.db);
      return level === state.level ? state : { ...state, level };
    }
    case 'silence':
      return { ...state, silent: true };
    case 'speechStart':
      // 자동 재시작 때마다 온다. 꺼진 뒤 늦게 온 이벤트로 다시 켜지지 않게 한다
      return state.status === 'off' ? state : { ...state, status: 'on' };
    case 'speechError':
      return action.error.fatal
        ? { ...state, status: 'off', level: MIN_DB, error: action.error.message }
        : { ...state, error: action.error.message };
    case 'speechEnd':
      return action.restarting ? state : { ...state, status: 'off', level: MIN_DB };
    case 'heard':
      // 말이 들어오면 일시적인 안내(소리 없음 등)는 지운다
      return { ...state, heard: action.text, silent: false, error: null };
    case 'log':
      return { ...state, log: [action.entry, ...state.log].slice(0, MAX_LOG_ENTRIES) };
  }
}

type JudgeInput = {
  state: PlaybackState;
  settings: Pick<Settings, 'stopWords' | 'startWords' | 'shortRuleChars' | 'stopOnInterim'>;
  lastCommandAt: number | null;
  now: number;
  /** 이미 명령을 실행한 발화 ID */
  handled: ReadonlySet<string>;
};

/**
 * 인식 결과 하나를 판별할지 정하고 판별한다. 판별하지 않으면 null이다.
 * - 이미 명령을 실행한 발화의 뒤따르는 결과는 보지 않는다(같은 발화에서 한 번만 실행)
 * - 중간 결과는 정지 즉시 실행(stopOnInterim)이 켜져 있을 때 정지 명령만 받는다. 나머지는 최종 결과를 기다린다
 */
export function judgeResult(result: SpeechResult, input: JudgeInput): Decision | null {
  if (input.handled.has(result.utteranceId)) return null;
  if (!result.isFinal && !input.settings.stopOnInterim) return null;
  const decision = decide(result.candidates, input.state, input.settings, input.lastCommandAt, input.now);
  if (!result.isFinal && decision.action !== 'stop') return null;
  return decision;
}

const STATE_LABELS: Record<PlaybackState, string> = {
  unready: '영상 준비 전',
  stopped: '정지',
  playing: '재생 중',
};

/** 무시한 이유를 화면에 보여 줄 문장으로 바꾼다 */
export function ignoreReasonText(reason: IgnoreReason, state: PlaybackState, shortRuleChars: number): string {
  switch (reason) {
    case 'short-rule':
      return `명령어를 뺀 나머지가 ${shortRuleChars}자를 넘어 가사로 봤습니다`;
    case 'state':
      return state === 'unready'
        ? '영상이 준비되기 전에는 음성 명령을 받지 않습니다'
        : `${STATE_LABELS[state]} 상태에서는 받지 않는 명령입니다`;
    case 'debounce':
      return `직전 명령 후 ${DEBOUNCE_MS / 1000}초 안의 명령입니다`;
    case 'no-match':
      return '인식된 글자가 없습니다';
  }
}

export const NO_SECTION_REASON = '연습할 구간을 고르지 않아 재생하지 않았습니다';
export const PHRASE_REASON = '구절 인식 점프는 아직 지원하지 않습니다';

/** 자동재생 차단 안내를 보일지. 시작 명령 후 시간이 지났고 아직 재생 상태가 아닐 때만 보인다 */
export function isAutoplayBlocked(
  startRequest: number | null,
  timedOutRequest: number | null,
  state: PlaybackState,
): boolean {
  return startRequest !== null && timedOutRequest === startRequest && state !== 'playing';
}

export type UseVoice = VoiceState & {
  supported: boolean;
  /** 시작 명령 후 3초 안에 재생되지 않음 */
  autoplayBlocked: boolean;
  enable: () => void;
  disable: () => void;
};

type Options = {
  playback: Pick<UsePlayback, 'state' | 'play' | 'stop'>;
  /** 시작 명령으로 재생할 연습 구간 */
  section: Section | null;
  storage: StorageAdapter;
};

/**
 * 설정은 인식 결과가 올 때마다 `singcue:settings`에서 읽는다. 설정 패널에서 저장한 명령어가 바로 반영된다.
 * 마이크 측정기는 장치 이름과 입력 레벨을 보여 주는 데만 쓰고, 인식은 speechAdapter가 따로 마이크를 연다.
 */
export function useVoice({ playback, section, storage }: Options): UseVoice {
  const [voice, dispatch] = useReducer(voiceReducer, INITIAL_VOICE_STATE);
  const [supported] = useState(isSpeechSupported);
  const speechRef = useRef<SpeechAdapter | null>(null);
  const meterRef = useRef<MicMeter | null>(null);
  /** 켜기·끄기마다 늘려, 끈 뒤에 늦게 열린 마이크를 닫는다 */
  const sessionRef = useRef(0);
  const lastCommandAtRef = useRef<number | null>(null);
  const handledRef = useRef(new Set<string>());

  // 자동재생 차단 감시. 시작 명령마다 번호를 붙이고, 3초가 지나면 그 번호를 기록한다
  const [startRequest, setStartRequest] = useState<number | null>(null);
  const [timedOutRequest, setTimedOutRequest] = useState<number | null>(null);
  if (playback.state === 'playing' && startRequest !== null) {
    // 재생되면(버튼으로 눌러도) 감시를 끝낸다. 렌더 중 상태 조정이라 효과를 거치지 않는다
    setStartRequest(null);
    setTimedOutRequest(null);
  }
  useEffect(() => {
    if (startRequest === null || playback.state === 'playing') return;
    const timer = setTimeout(() => setTimedOutRequest(startRequest), AUTOPLAY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [startRequest, playback.state]);

  const stopMeter = () => {
    meterRef.current?.stop();
    meterRef.current = null;
  };

  const handleResult = (result: SpeechResult) => {
    dispatch({ type: 'heard', text: result.candidates[0] });
    const settings = storage.loadSettings();
    const state = playback.state;
    const now = performance.now();
    const decision = judgeResult(result, {
      state,
      settings,
      lastCommandAt: lastCommandAtRef.current,
      now,
      handled: handledRef.current,
    });
    if (decision === null) return;

    const entry = (outcome: VoiceLogEntry['outcome'], reason: string | null) =>
      dispatch({ type: 'log', entry: { id: `${result.utteranceId}:${now}`, text: result.candidates[0], outcome, reason } });

    switch (decision.action) {
      case 'stop':
      case 'start': {
        if (decision.action === 'start' && section === null) {
          entry('ignore', NO_SECTION_REASON);
          return;
        }
        handledRef.current.add(result.utteranceId);
        lastCommandAtRef.current = now;
        if (decision.action === 'stop') {
          playback.stop();
        } else {
          playback.play(section);
          setStartRequest((current) => (current ?? 0) + 1);
          setTimedOutRequest(null);
        }
        entry(decision.action, null);
        return;
      }
      case 'phrase':
        entry('phrase', PHRASE_REASON);
        return;
      case 'ignore':
        entry('ignore', ignoreReasonText(decision.reason, state, settings.shortRuleChars));
        return;
    }
  };

  const onSpeechEvent = useEffectEvent((event: SpeechEvent) => {
    switch (event.type) {
      case 'start':
        dispatch({ type: 'speechStart' });
        return;
      case 'result':
        handleResult(event.result);
        return;
      case 'error':
        dispatch({ type: 'speechError', error: event.error });
        if (event.error.fatal) stopMeter();
        return;
      case 'end':
        dispatch({ type: 'speechEnd', restarting: event.restarting });
        if (!event.restarting) stopMeter();
        return;
    }
  });

  useEffect(() => {
    const speech = createSpeechAdapter((event) => onSpeechEvent(event));
    speechRef.current = speech;
    // 화면 요소가 아닌 숫자라 정리 때의 최신 값을 늘리면 된다
    const sessions = sessionRef;
    return () => {
      sessions.current++;
      speech.stop();
      speechRef.current = null;
      meterRef.current?.stop();
      meterRef.current = null;
    };
  }, []);

  function onMicEvent(event: MicEvent) {
    switch (event.type) {
      case 'level':
        dispatch({ type: 'level', db: event.db });
        return;
      case 'silence':
        dispatch({ type: 'silence' });
        return;
      case 'error':
        dispatch({ type: 'micError', message: event.error.message });
        return;
    }
  }

  async function enable() {
    if (voice.status !== 'off') return;
    const session = ++sessionRef.current;
    dispatch({ type: 'enable' });
    // 마이크 권한을 먼저 받는다. 거부되면 인식도 켜지 못하므로 여기서 멈춘다
    const meter = await startMicMeter(onMicEvent);
    if (meter === null) return;
    if (session !== sessionRef.current) {
      meter.stop();
      return;
    }
    meterRef.current = meter;
    dispatch({ type: 'micReady', deviceLabel: meter.deviceLabel });
    handledRef.current.clear();
    speechRef.current?.start();
  }

  function disable() {
    sessionRef.current++;
    speechRef.current?.stop();
    stopMeter();
    dispatch({ type: 'disable' });
  }

  return {
    ...voice,
    supported,
    autoplayBlocked: isAutoplayBlocked(startRequest, timedOutRequest, playback.state),
    enable: () => void enable(),
    disable,
  };
}
