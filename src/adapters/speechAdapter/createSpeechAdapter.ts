// Web Speech API(SpeechRecognition)를 감싸 인식 켜기·끄기와 SpeechEvent만 바깥에 보인다.

import { toSpeechError, type SpeechEventListener } from './speechEvents.ts';
import {
  getSpeechRecognition,
  type SpeechRecognitionLike,
  type SpeechRecognitionResultEventLike,
} from './webSpeechApi.ts';

export type SpeechAdapter = {
  /** 인식을 켠다. 이미 켜져 있으면 아무것도 하지 않는다 */
  start(): void;
  /** 인식을 끈다. 진행 중인 발화의 최종 결과는 끄기 전에 올 수 있다 */
  stop(): void;
  /** 사용자가 인식을 켜 둔 상태인지. 자동 재시작을 기다리는 동안에도 true */
  isEnabled(): boolean;
};

/** 인식 설정(기술 설계 문서 "음성 명령 처리 흐름", PoC와 같음) */
export const RECOGNITION_SETTINGS = Object.freeze({
  lang: 'ko-KR',
  continuous: true,
  interimResults: true,
  maxAlternatives: 5,
});

/** 세션이 끝난 뒤 다시 시작하기까지 기다리는 시간(ms). PoC와 같다 */
export const RESTART_DELAY_MS = 250;

export function isSpeechSupported(): boolean {
  return getSpeechRecognition() !== null;
}

/**
 * 인식을 켜면 세션이 끝날 때(`onend`)마다 자동으로 다시 시작하고, 끄거나 되살릴 수 없는 오류
 * (`not-allowed` 등, `SpeechError.fatal`)가 오면 멈춘다. 오류는 모두 호출 측에 전달한다.
 */
export function createSpeechAdapter(onEvent: SpeechEventListener): SpeechAdapter {
  let enabled = false;
  /** 지금 이벤트를 받는 인식 객체. 끈 뒤 바로 다시 켜면 새 객체로 바꿔 이전 객체의 이벤트를 무시한다 */
  let current: SpeechRecognitionLike | null = null;
  /** start()를 부른 뒤 onend가 오기 전까지 true */
  let sessionActive = false;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  /** 세션마다 늘려 발화 ID가 세션 사이에 겹치지 않게 한다(결과 번호는 세션마다 0부터 다시 센다) */
  let sessionCount = 0;

  const fail = (code: string) => {
    enabled = false;
    onEvent({ type: 'error', error: toSpeechError(code) });
  };

  const startSession = (recognition: SpeechRecognitionLike) => {
    try {
      recognition.start();
      sessionActive = true;
    } catch {
      fail('start-failed');
      onEvent({ type: 'end', restarting: false });
    }
  };

  const handleResult = (event: SpeechRecognitionResultEventLike) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const candidates: string[] = [];
      for (let j = 0; j < result.length; j++) {
        const transcript = result[j].transcript.trim();
        if (transcript) candidates.push(transcript);
      }
      if (candidates.length === 0) continue;
      onEvent({
        type: 'result',
        result: { utteranceId: `${sessionCount}-${i}`, isFinal: result.isFinal, candidates },
      });
    }
  };

  const createRecognition = (): SpeechRecognitionLike | null => {
    const Recognition = getSpeechRecognition();
    if (!Recognition) return null;

    const recognition = new Recognition();
    Object.assign(recognition, RECOGNITION_SETTINGS);
    recognition.onstart = () => {
      if (recognition !== current) return;
      sessionCount++;
      onEvent({ type: 'start' });
    };
    recognition.onresult = (event) => {
      if (recognition === current) handleResult(event);
    };
    recognition.onerror = (event) => {
      if (recognition !== current) return;
      const error = toSpeechError(event.error);
      if (error.fatal) enabled = false;
      onEvent({ type: 'error', error });
    };
    recognition.onend = () => {
      if (recognition !== current) return;
      sessionActive = false;
      onEvent({ type: 'end', restarting: enabled });
      if (!enabled) return;
      restartTimer = setTimeout(() => {
        restartTimer = null;
        if (enabled && recognition === current) startSession(recognition);
      }, RESTART_DELAY_MS);
    };
    return recognition;
  };

  return {
    start() {
      if (enabled) return;
      const recognition = createRecognition();
      if (!recognition) {
        fail('not-supported');
        return;
      }
      enabled = true;
      current = recognition;
      startSession(recognition);
    },
    stop() {
      if (!enabled) return;
      enabled = false;
      if (restartTimer !== null) {
        // 세션 사이라 onend가 다시 오지 않으므로 꺼짐을 직접 알린다
        clearTimeout(restartTimer);
        restartTimer = null;
        onEvent({ type: 'end', restarting: false });
      } else if (sessionActive) {
        current?.stop();
      }
    },
    isEnabled: () => enabled,
  };
}
