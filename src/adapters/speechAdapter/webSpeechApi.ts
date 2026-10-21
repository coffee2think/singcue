// Web Speech API의 SpeechRecognition 중 이 앱이 쓰는 부분만 옮긴 타입.
// TypeScript DOM 타입에 아직 없어 직접 선언한다.
// 문서: https://developer.mozilla.org/docs/Web/API/SpeechRecognition

export interface SpeechRecognitionAlternativeLike {
  readonly transcript: string;
  readonly confidence: number;
}

export interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

export interface SpeechRecognitionResultListLike {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike;
}

export type SpeechRecognitionResultEventLike = {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListLike;
};

export type SpeechRecognitionErrorEventLike = {
  readonly error: string;
  readonly message?: string;
};

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

/** 표준 이름을 먼저 찾고, 없으면 Chrome 계열의 webkit 접두사 이름을 쓴다. 지원하지 않으면 null */
export function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}
