// 음성 인식 어댑터가 컨트롤러(useVoice)에 넘기는 이벤트와 오류 변환 규칙.
// SpeechRecognition 객체와 이벤트는 이 폴더 밖으로 내보내지 않는다.

/** 인식 결과 하나. 같은 발화의 중간 결과와 최종 결과는 같은 `utteranceId`로 온다 */
export type SpeechResult = {
  /** 발화 ID. 인식 세션이 다시 시작돼도 겹치지 않는다 */
  utteranceId: string;
  /** false면 중간 결과(정지 즉시 실행, PRD F2-6), true면 최종 결과 */
  isFinal: boolean;
  /** 인식 후보(최대 5개). 앞쪽일수록 가능성이 높다. 앞뒤 공백은 지운다 */
  candidates: string[];
};

export type SpeechError = {
  /** Web Speech API의 `error` 값. 브라우저가 지원하지 않으면 'not-supported', 시작하지 못하면 'start-failed' */
  code: string;
  /** 화면에 보여 줄 안내 문구 */
  message: string;
  /** true면 인식을 끄고 자동 재시작하지 않는다 */
  fatal: boolean;
};

export type SpeechEvent =
  /** 인식 세션이 시작돼 듣는 중. 자동 재시작 때마다 다시 온다 */
  | { type: 'start' }
  | { type: 'result'; result: SpeechResult }
  | { type: 'error'; error: SpeechError }
  /** 인식 세션이 끝남. `restarting`이 true면 곧 다시 시작하고, false면 인식이 꺼진 상태다 */
  | { type: 'end'; restarting: boolean };

export type SpeechEventListener = (event: SpeechEvent) => void;

/**
 * 계속 시도해도 나아지지 않는 오류. 자동 재시작하면 같은 오류가 되풀이되므로 인식을 끈다.
 * 'no-speech', 'network', 'aborted' 등 나머지는 세션이 끝난 뒤 다시 시작한다.
 */
const FATAL_ERRORS: ReadonlySet<string> = new Set([
  'not-allowed',
  'service-not-allowed',
  'audio-capture',
  'language-not-supported',
  'not-supported',
  'start-failed',
]);

/** Web Speech API 문서의 `error` 값별 안내 문구 */
export const SPEECH_ERROR_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  'not-allowed':
    '마이크 권한이 거부되어 음성 인식을 켜지 못했습니다. 브라우저 주소창에서 마이크 권한을 허용하세요. 버튼 조작은 계속 쓸 수 있습니다.',
  'service-not-allowed':
    '브라우저가 음성 인식 서비스를 허용하지 않아 음성 인식을 켜지 못했습니다. Chrome에서 HTTPS나 localhost 주소로 열었는지 확인하세요. 버튼 조작은 계속 쓸 수 있습니다.',
  'audio-capture':
    '마이크를 찾지 못했습니다. 마이크가 연결되어 있는지, 다른 앱이 사용 중이 아닌지 확인하세요.',
  'no-speech': '소리가 들어오지 않습니다. 사용 중인 마이크 장치와 입력 레벨을 확인하세요.',
  network: '음성 인식 서버에 연결하지 못했습니다. 인터넷 연결을 확인하세요.',
  aborted: '음성 인식이 중단되었습니다.',
  'language-not-supported': '이 브라우저는 한국어 음성 인식을 지원하지 않습니다. Chrome을 사용하세요.',
  'bad-grammar': '음성 인식 설정에 문제가 있습니다.',
  'not-supported': '이 브라우저는 음성 인식(Web Speech API)을 지원하지 않습니다. Chrome을 사용하세요.',
  'start-failed': '음성 인식을 시작하지 못했습니다. 음성 인식을 다시 켜 보세요.',
});

export function toSpeechError(code: string): SpeechError {
  return {
    code,
    message:
      SPEECH_ERROR_MESSAGES[code] ??
      `음성 인식 오류가 발생했습니다(${code}). 음성 인식을 다시 켜 보세요.`,
    fatal: FATAL_ERRORS.has(code),
  };
}
