import { describe, expect, it } from 'vitest';
import { toSpeechError, type SpeechResult } from '../adapters/speechAdapter/index.ts';
import { DEFAULT_SETTINGS } from '../core/defaultSettings.ts';
import type { PlaybackState } from '../types.ts';
import {
  INITIAL_VOICE_STATE,
  MAX_LOG_ENTRIES,
  ignoreReasonText,
  isAutoplayBlocked,
  judgeResult,
  voiceReducer,
  type VoiceLogEntry,
  type VoiceState,
} from './useVoice.ts';

function result(candidates: string[], isFinal = true, utteranceId = '1-0'): SpeechResult {
  return { utteranceId, isFinal, candidates };
}

function input(state: PlaybackState, overrides: Partial<Parameters<typeof judgeResult>[1]> = {}) {
  return {
    state,
    settings: DEFAULT_SETTINGS,
    lastCommandAt: null,
    now: 10_000,
    handled: new Set<string>(),
    ...overrides,
  };
}

describe('judgeResult', () => {
  it('재생 중 최종 결과의 정지 명령은 정지, 정지 상태의 시작 명령은 시작으로 판별한다', () => {
    expect(judgeResult(result(['멈춰']), input('playing'))).toEqual({ action: 'stop' });
    expect(judgeResult(result(['시작']), input('stopped'))).toEqual({ action: 'start' });
  });

  it('상태에 맞지 않는 명령, 짧은 발화 규칙, 중복은 이유와 함께 무시한다', () => {
    expect(judgeResult(result(['시작']), input('playing'))).toEqual({ action: 'ignore', reason: 'state' });
    expect(judgeResult(result(['멈춰']), input('unready'))).toEqual({ action: 'ignore', reason: 'state' });
    // 명령어가 섞인 가사 문장(가상의 문장)
    expect(judgeResult(result(['이제 시작하는 우리 이야기']), input('stopped'))).toEqual({
      action: 'ignore',
      reason: 'short-rule',
    });
    expect(judgeResult(result(['멈춰']), input('playing', { lastCommandAt: 9_500 }))).toEqual({
      action: 'ignore',
      reason: 'debounce',
    });
  });

  it('정지 즉시 실행이 꺼져 있으면 중간 결과는 판별하지 않는다', () => {
    expect(judgeResult(result(['멈춰'], false), input('playing'))).toBeNull();
  });

  it('정지 즉시 실행이 켜져 있으면 중간 결과의 정지 명령만 판별한다', () => {
    const settings = { ...DEFAULT_SETTINGS, stopOnInterim: true };
    expect(judgeResult(result(['멈춰'], false), input('playing', { settings }))).toEqual({ action: 'stop' });
    // 시작·무시는 최종 결과를 기다린다
    expect(judgeResult(result(['시작'], false), input('stopped', { settings }))).toBeNull();
    expect(judgeResult(result(['멈춰 보면 알 거야'], false), input('playing', { settings }))).toBeNull();
  });

  it('이미 명령을 실행한 발화의 뒤따르는 결과는 보지 않는다', () => {
    const handled = new Set(['1-0']);
    expect(judgeResult(result(['멈춰'], true, '1-0'), input('playing', { handled }))).toBeNull();
    expect(judgeResult(result(['멈춰'], true, '1-1'), input('playing', { handled }))).toEqual({ action: 'stop' });
  });

  it('명령어가 없는 발화는 구절로 판별한다', () => {
    expect(judgeResult(result(['테스트 구절입니다']), input('stopped'))).toEqual({
      action: 'phrase',
      candidates: ['테스트 구절입니다'],
    });
  });
});

describe('ignoreReasonText', () => {
  it('이유마다 화면에 보일 문장을 만든다', () => {
    expect(ignoreReasonText('short-rule', 'stopped', 2)).toContain('2자');
    expect(ignoreReasonText('state', 'playing', 2)).toContain('재생 중');
    expect(ignoreReasonText('state', 'unready', 2)).toContain('영상이 준비되기 전');
    expect(ignoreReasonText('debounce', 'playing', 2)).toContain('0.8초');
    expect(ignoreReasonText('no-match', 'stopped', 2)).not.toBe('');
  });
});

describe('isAutoplayBlocked', () => {
  it('시작 명령 후 시간이 지났고 아직 재생 상태가 아닐 때만 안내한다', () => {
    expect(isAutoplayBlocked(null, null, 'stopped')).toBe(false);
    expect(isAutoplayBlocked(1, null, 'stopped')).toBe(false);
    expect(isAutoplayBlocked(1, 1, 'stopped')).toBe(true);
    expect(isAutoplayBlocked(1, 1, 'playing')).toBe(false);
    // 앞선 시작 명령의 시간 초과는 새 시작 명령에 쓰지 않는다
    expect(isAutoplayBlocked(2, 1, 'stopped')).toBe(false);
  });
});

describe('voiceReducer', () => {
  const on: VoiceState = { ...INITIAL_VOICE_STATE, status: 'on', deviceLabel: '테스트 마이크', level: -40 };

  it('켜면 켜는 중이 되고, 인식이 시작되면 듣는 중이 된다', () => {
    const starting = voiceReducer({ ...INITIAL_VOICE_STATE, error: '이전 오류' }, { type: 'enable' });
    expect(starting).toMatchObject({ status: 'starting', error: null });
    const ready = voiceReducer(starting, { type: 'micReady', deviceLabel: '테스트 마이크' });
    expect(voiceReducer(ready, { type: 'speechStart' })).toMatchObject({ status: 'on', deviceLabel: '테스트 마이크' });
  });

  it('꺼진 뒤 늦게 온 인식 시작 이벤트로 다시 켜지지 않는다', () => {
    expect(voiceReducer(INITIAL_VOICE_STATE, { type: 'speechStart' }).status).toBe('off');
  });

  it('마이크 권한이 거부되면 꺼지고 안내를 남긴다', () => {
    const state = voiceReducer(voiceReducer(INITIAL_VOICE_STATE, { type: 'enable' }), {
      type: 'micError',
      message: '권한 거부 안내',
    });
    expect(state).toMatchObject({ status: 'off', error: '권한 거부 안내' });
  });

  it('되살릴 수 없는 인식 오류는 끄고, 나머지는 안내만 한다', () => {
    expect(voiceReducer(on, { type: 'speechError', error: toSpeechError('not-allowed') }).status).toBe('off');
    const noSpeech = voiceReducer(on, { type: 'speechError', error: toSpeechError('no-speech') });
    expect(noSpeech.status).toBe('on');
    expect(noSpeech.error).toBe(toSpeechError('no-speech').message);
  });

  it('세션이 끝나도 다시 시작하는 중이면 켜진 상태를 유지한다', () => {
    expect(voiceReducer(on, { type: 'speechEnd', restarting: true })).toBe(on);
    expect(voiceReducer(on, { type: 'speechEnd', restarting: false }).status).toBe('off');
  });

  it('입력 레벨은 정수로 반올림하고 같으면 상태를 바꾸지 않는다', () => {
    expect(voiceReducer(on, { type: 'level', db: -40.2 })).toBe(on);
    expect(voiceReducer(on, { type: 'level', db: -30.6 }).level).toBe(-31);
  });

  it('말이 들어오면 소리 없음 안내와 일시적인 오류를 지운다', () => {
    const silent = voiceReducer({ ...on, error: '소리 없음' }, { type: 'silence' });
    expect(silent.silent).toBe(true);
    expect(voiceReducer(silent, { type: 'heard', text: '멈춰' })).toMatchObject({ heard: '멈춰', silent: false, error: null });
  });

  it('판별 기록은 새것을 앞에 두고 최대 개수만 남긴다', () => {
    let state = on;
    for (let i = 0; i < MAX_LOG_ENTRIES + 2; i++) {
      const entry: VoiceLogEntry = { id: String(i), text: '시작', outcome: 'ignore', reason: '이유' };
      state = voiceReducer(state, { type: 'log', entry });
    }
    expect(state.log).toHaveLength(MAX_LOG_ENTRIES);
    expect(state.log[0].id).toBe(String(MAX_LOG_ENTRIES + 1));
  });
});
