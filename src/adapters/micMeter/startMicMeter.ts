// getUserMedia와 AnalyserNode로 마이크 장치 이름과 입력 레벨을 재고 MicEvent만 바깥에 보인다.

import { MIN_DB, byteSamplesToDb, createSilenceDetector } from './levelMath.ts';
import { MIC_ERROR_MESSAGES, toMicError, type MicEventListener } from './micEvents.ts';

export type MicMeter = {
  /** 사용 중인 마이크 장치 이름. 브라우저가 알려 주지 않으면 '이름 없음' */
  deviceLabel: string;
  /** 가장 최근에 잰 입력 레벨(dB) */
  getLevel(): number;
  /** 측정을 멈추고 마이크와 오디오 컨텍스트를 닫는다. 여러 번 불러도 된다 */
  stop(): void;
};

/** PoC와 같은 분석 크기 */
const FFT_SIZE = 1024;
const UNKNOWN_DEVICE = '이름 없음';

/**
 * 마이크를 열고 화면 갱신 주기마다 레벨을 알린다. 실패하면 'error'를 알리고 null을 돌려준다.
 * 권한 요청 창이 뜨므로 사용자가 버튼을 누른 뒤에 불러야 한다.
 */
export async function startMicMeter(onEvent: MicEventListener): Promise<MicMeter | null> {
  // 마이크는 HTTPS나 localhost에서만 열린다. 그 밖의 주소에서는 mediaDevices가 없다.
  if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined') {
    onEvent({ type: 'error', error: { kind: 'unsupported', message: MIC_ERROR_MESSAGES.unsupported } });
    return null;
  }

  let stream: MediaStream | null = null;
  let context: AudioContext | null = null;
  let analyser: AnalyserNode;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    context = new AudioContext();
    analyser = context.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    context.createMediaStreamSource(stream).connect(analyser);
    // 사용자 동작 없이 만들어지면 suspended로 시작할 수 있다
    if (context.state === 'suspended') await context.resume();
  } catch (error) {
    stream?.getTracks().forEach((track) => track.stop());
    void context?.close();
    onEvent({ type: 'error', error: toMicError(error) });
    return null;
  }

  const deviceLabel = stream.getAudioTracks()[0]?.label || UNKNOWN_DEVICE;
  const samples = new Uint8Array(analyser.fftSize);
  const silence = createSilenceDetector();
  let level = MIN_DB;
  let frame = 0;
  let stopped = false;

  const measure = (now: number) => {
    if (stopped) return;
    analyser.getByteTimeDomainData(samples);
    level = byteSamplesToDb(samples);
    onEvent({ type: 'level', db: level });
    if (silence.update(level, now)) onEvent({ type: 'silence', deviceLabel });
    frame = requestAnimationFrame(measure);
  };
  frame = requestAnimationFrame(measure);

  const openStream = stream;
  const openContext = context;
  return {
    deviceLabel,
    getLevel: () => level,
    stop() {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(frame);
      openStream.getTracks().forEach((track) => track.stop());
      void openContext.close();
    },
  };
}
