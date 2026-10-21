import { describe, expect, it } from 'vitest';
import { toSpeechError, type SpeechResult } from '../adapters/speechAdapter/index.ts';
import { DEFAULT_SETTINGS } from '../core/defaultSettings.ts';
import type { Line, PlaybackState } from '../types.ts';
import {
  INITIAL_VOICE_STATE,
  LATENCY_TIMEOUT_MS,
  MAX_LATENCY_RECORDS,
  MAX_LOG_ENTRIES,
  ignoreReasonText,
  isAutoplayBlocked,
  judgeResult,
  measureLatency,
  phraseReasonText,
  resolvePhrase,
  summarizeLatencies,
  voiceReducer,
  type LatencyRecord,
  type PendingLatency,
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

  it('정지 즉시 실행이 켜져 있으면 같은 발화의 중간·최종 결과 중 처음 정지 명령에서 한 번만 실행한다', () => {
    // useVoice가 하는 것처럼 실행한 발화 ID를 기억하며 같은 발화의 결과를 차례로 넣는다
    const settings = { ...DEFAULT_SETTINGS, stopOnInterim: true };
    const handled = new Set<string>();
    const sequence = [result(['멈'], false), result(['멈춰'], false), result(['멈춰'], false), result(['멈춰'], true)];
    const decisions = sequence.map((item) => {
      const decision = judgeResult(item, input('playing', { settings, handled }));
      if (decision?.action === 'stop') handled.add(item.utteranceId);
      return decision?.action ?? null;
    });
    // 명령이 아직 덜 들린 중간 결과는 무시로 기록하지 않고 넘어간다
    expect(decisions).toEqual([null, 'stop', null, null]);
  });

  it('정지 즉시 실행이 꺼져 있으면 같은 발화의 최종 결과에서만 실행한다', () => {
    const sequence = [result(['멈춰'], false), result(['멈춰'], false), result(['멈춰'], true)];
    expect(sequence.map((item) => judgeResult(item, input('playing'))?.action ?? null)).toEqual([null, null, 'stop']);
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
      const entry: VoiceLogEntry = {
        id: String(i),
        text: '시작',
        outcome: 'ignore',
        reason: '이유',
        source: 'final',
        latency: null,
      };
      state = voiceReducer(state, { type: 'log', entry });
    }
    expect(state.log).toHaveLength(MAX_LOG_ENTRIES);
    expect(state.log[0].id).toBe(String(MAX_LOG_ENTRIES + 1));
  });
});

describe('measureLatency', () => {
  const pending: PendingLatency = { entryId: 'a', from: 'playing', to: 'stopped', receivedAt: 1000, firstResultAt: 600 };

  it('명령이 만들 상태가 되면 인식 결과 수신부터와 첫 인식부터의 시간을 정수 ms로 낸다', () => {
    expect(measureLatency(pending, 'stopped', 1084.6)).toEqual({ ms: 85, sinceFirstResultMs: 485 });
  });

  it('아직 명령 전 상태면 기다린다', () => {
    expect(measureLatency(pending, 'playing', 1500)).toBeNull();
  });

  it('다른 상태가 되거나 너무 늦게 바뀌면 재지 않는다', () => {
    expect(measureLatency(pending, 'unready', 1100)).toBe('expired');
    expect(measureLatency(pending, 'stopped', 1000 + LATENCY_TIMEOUT_MS + 1)).toBe('expired');
    expect(measureLatency(pending, 'playing', 1000 + LATENCY_TIMEOUT_MS + 1)).toBe('expired');
  });
});

describe('summarizeLatencies', () => {
  it('정지(중간 결과), 정지(최종 결과), 시작 순서로 기록이 있는 것만 평균을 낸다', () => {
    const records: LatencyRecord[] = [
      { command: 'start', source: 'final', ms: 400, sinceFirstResultMs: 900 },
      { command: 'stop', source: 'final', ms: 90, sinceFirstResultMs: 700 },
      { command: 'stop', source: 'interim', ms: 80, sinceFirstResultMs: 200 },
      { command: 'stop', source: 'interim', ms: 101, sinceFirstResultMs: 301 },
    ];
    expect(summarizeLatencies(records)).toEqual([
      { command: 'stop', source: 'interim', count: 2, averageMs: 91, averageSinceFirstResultMs: 251 },
      { command: 'stop', source: 'final', count: 1, averageMs: 90, averageSinceFirstResultMs: 700 },
      { command: 'start', source: 'final', count: 1, averageMs: 400, averageSinceFirstResultMs: 900 },
    ]);
    expect(summarizeLatencies([])).toEqual([]);
  });
});

describe('voiceReducer 반응 시간', () => {
  const entry = (id: string, outcome: VoiceLogEntry['outcome'], source: VoiceLogEntry['source'] = 'final'): VoiceLogEntry => ({
    id,
    text: '멈춰',
    outcome,
    reason: null,
    source,
    latency: null,
  });

  it('실행한 명령의 기록에 반응 시간을 붙이고 명령·결과 종류와 함께 따로 남긴다', () => {
    const logged = voiceReducer(INITIAL_VOICE_STATE, { type: 'log', entry: entry('a', 'stop', 'interim') });
    const state = voiceReducer(logged, { type: 'latency', entryId: 'a', latency: { ms: 85, sinceFirstResultMs: 300 } });
    expect(state.log[0].latency).toEqual({ ms: 85, sinceFirstResultMs: 300 });
    expect(state.latencies).toEqual([{ command: 'stop', source: 'interim', ms: 85, sinceFirstResultMs: 300 }]);
  });

  it('기록이 없거나 명령을 실행하지 않은 기록이면 바꾸지 않는다', () => {
    const logged = voiceReducer(INITIAL_VOICE_STATE, { type: 'log', entry: entry('a', 'ignore') });
    const latency = { ms: 1, sinceFirstResultMs: 1 };
    expect(voiceReducer(logged, { type: 'latency', entryId: 'a', latency })).toBe(logged);
    expect(voiceReducer(logged, { type: 'latency', entryId: 'b', latency })).toBe(logged);
  });

  it('반응 시간 기록은 판별 기록과 따로 최대 개수까지 남긴다', () => {
    let state = INITIAL_VOICE_STATE;
    for (let i = 0; i < MAX_LATENCY_RECORDS + 2; i++) {
      state = voiceReducer(state, { type: 'log', entry: entry(String(i), 'stop') });
      state = voiceReducer(state, { type: 'latency', entryId: String(i), latency: { ms: i, sinceFirstResultMs: i } });
    }
    expect(state.log).toHaveLength(MAX_LOG_ENTRIES);
    expect(state.latencies).toHaveLength(MAX_LATENCY_RECORDS);
    expect(state.latencies[0].ms).toBe(MAX_LATENCY_RECORDS + 1);
  });
});

// 테스트용으로 지어낸 가상의 구절
const lines: Line[] = [
  { t: 10, text: '파란 우산을 펼쳐 들고' },
  { t: 20, text: '골목 끝까지 걸어가요' },
  { t: 30, text: '후렴처럼 다시 부르는 말' },
  { t: 40, text: '종이배를 띄워 보내요' },
  { t: 50, text: '후렴처럼 다시 부르는 말' },
];
const THRESHOLD = DEFAULT_SETTINGS.similarityThreshold;

describe('resolvePhrase', () => {
  it('기준 이상이면 그 다음 구절의 시작 시간으로 이동한다', () => {
    expect(resolvePhrase(['파란 우산을 펼쳐 들고'], { lines, endT: 60 }, THRESHOLD, 15)).toEqual({
      kind: 'jump',
      lineIndex: 0,
      text: '파란 우산을 펼쳐 들고',
      last: false,
      score: 1,
      threshold: THRESHOLD,
      target: 20,
      from: null,
    });
  });

  it('인식 후보 중 하나라도 맞으면 그 구절로 본다', () => {
    const outcome = resolvePhrase(['전혀 다른 말', '골목 끝까지 걸어가요'], { lines, endT: 60 }, THRESHOLD, 25);
    expect(outcome).toMatchObject({ kind: 'jump', lineIndex: 1, target: 30 });
  });

  it('기준 미만이면 이동하지 않고 가장 가까운 구절과 점수를 돌려준다', () => {
    const outcome = resolvePhrase(['종이컵을 태워 버려요'], { lines, endT: 60 }, 0.9, 0);
    expect(outcome).toMatchObject({ kind: 'below', lineIndex: 3, text: '종이배를 띄워 보내요', threshold: 0.9 });
    if (outcome.kind !== 'below') throw new Error('기준 미만이어야 한다');
    expect(outcome.score).toBeGreaterThan(0);
    expect(outcome.score).toBeLessThan(0.9);
  });

  it('바뀐 유사도 기준을 그대로 쓴다', () => {
    expect(resolvePhrase(['종이컵을 태워 버려요'], { lines, endT: 60 }, 0.2, 0)).toMatchObject({ kind: 'jump', target: 50 });
  });

  it('마지막 구절이면 endT로 이동하고, endT가 없으면 이동하지 않는다', () => {
    const last = ['후렴처럼 다시 부르는 말'];
    expect(resolvePhrase(last, { lines, endT: 60 }, THRESHOLD, 55)).toMatchObject({
      kind: 'jump',
      lineIndex: 4,
      last: true,
      target: 60,
    });
    expect(resolvePhrase(last, { lines, endT: null }, THRESHOLD, 55)).toMatchObject({
      kind: 'no-next',
      lineIndex: 4,
      last: true,
    });
  });

  it('반복 구절은 현재 재생 위치 힌트로 방금 부른 구절을 고른다(#20)', () => {
    const repeated = ['후렴처럼 다시 부르는 말'];
    expect(resolvePhrase(repeated, { lines, endT: 60 }, THRESHOLD, 35)).toMatchObject({ lineIndex: 2, target: 40 });
    expect(resolvePhrase(repeated, { lines, endT: 60 }, THRESHOLD, 52)).toMatchObject({ lineIndex: 4, target: 60 });
    // 힌트가 없으면 첫 번째 줄
    expect(resolvePhrase(repeated, { lines, endT: 60 }, THRESHOLD, null)).toMatchObject({ lineIndex: 2 });
  });

  it('가사 매핑이 없으면 비교하지 않는다', () => {
    expect(resolvePhrase(['파란 우산'], { lines: [], endT: null }, THRESHOLD, 0)).toEqual({ kind: 'no-lines' });
  });
});

describe('phraseReasonText', () => {
  const match = { lineIndex: 0, text: '파란 우산을 펼쳐 들고', last: false, score: 0.3, threshold: 0.5 };

  it('이동했으면 이유가 없다', () => {
    expect(phraseReasonText({ ...match, kind: 'jump', target: 20, from: 18.5 })).toBeNull();
  });

  it('이동하지 않은 이유와 다시 말할 안내를 만든다', () => {
    expect(phraseReasonText({ ...match, kind: 'below' })).toContain('0.50');
    expect(phraseReasonText({ ...match, kind: 'below' })).toContain('다시 말해');
    expect(phraseReasonText({ ...match, kind: 'no-next', last: true })).toContain('마지막 구절 다음 위치');
    expect(phraseReasonText({ kind: 'no-lines' })).toContain('가사 매핑');
    expect(phraseReasonText({ ...match, kind: 'jump', target: 20, from: null })).toContain('플레이어');
  });
});
