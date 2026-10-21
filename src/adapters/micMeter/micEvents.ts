// 마이크 측정기가 컨트롤러에 넘기는 이벤트와 오류 변환 규칙.
// getUserMedia의 DOMException 이름은 이 파일 밖으로 내보내지 않는다.

export type MicErrorKind = 'permission-denied' | 'no-device' | 'device-busy' | 'unsupported' | 'unknown';

export type MicError = {
  kind: MicErrorKind;
  /** 화면에 보여 줄 안내 문구 */
  message: string;
};

export type MicEvent =
  /** 측정할 때마다(화면 갱신 주기) 보낸다 */
  | { type: 'level'; db: number }
  /** 입력 레벨이 −55dB 미만으로 4초 이어지면 한 번 보낸다. 장치 확인 안내에 쓸 장치 이름을 함께 준다 */
  | { type: 'silence'; deviceLabel: string }
  | { type: 'error'; error: MicError };

export type MicEventListener = (event: MicEvent) => void;

export const MIC_ERROR_MESSAGES: Readonly<Record<MicErrorKind, string>> = Object.freeze({
  'permission-denied':
    '마이크 권한이 거부되어 음성 인식을 켜지 못했습니다. 주소창의 마이크 권한을 허용한 뒤 다시 켜 주세요. 버튼 조작은 계속 쓸 수 있습니다.',
  'no-device': '사용할 수 있는 마이크를 찾지 못했습니다. 마이크나 이어폰이 연결되어 있는지 확인하세요.',
  'device-busy':
    '마이크를 열지 못했습니다. 다른 프로그램이 마이크를 쓰고 있거나 장치에 문제가 있을 수 있습니다.',
  unsupported:
    '이 브라우저나 주소에서는 마이크를 쓸 수 없습니다. Chrome에서 localhost나 HTTPS 주소로 열었는지 확인하세요.',
  unknown: '마이크를 시작하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도하세요.',
});

/** getUserMedia·AudioContext가 던진 오류를 앱의 오류로 바꾼다 */
export function toMicError(error: unknown): MicError {
  const kind = errorKind(error);
  return { kind, message: MIC_ERROR_MESSAGES[kind] };
}

function errorKind(error: unknown): MicErrorKind {
  const name = typeof error === 'object' && error !== null && 'name' in error ? error.name : undefined;
  switch (name) {
    // Chrome은 사용자가 거부하면 NotAllowedError를, 권한 정책으로 막히면 SecurityError를 던진다
    case 'NotAllowedError':
    case 'SecurityError':
      return 'permission-denied';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'no-device';
    case 'NotReadableError':
    case 'AbortError':
      return 'device-busy';
    default:
      return 'unknown';
  }
}
