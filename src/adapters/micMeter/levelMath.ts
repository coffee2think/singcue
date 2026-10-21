// 입력 레벨(dB) 계산과 무음 판정. 브라우저 API 없이 동작해 테스트로 고정한다.

/** 신호가 전혀 없을 때(RMS 0) 돌려주는 값 */
export const MIN_DB = -100;

/** 이 값보다 낮은 레벨이 `SILENCE_DURATION_MS` 동안 이어지면 무음으로 본다(기술 설계 문서 "오류 처리") */
export const SILENCE_THRESHOLD_DB = -55;
export const SILENCE_DURATION_MS = 4000;

/**
 * `AnalyserNode.getByteTimeDomainData`로 받은 파형(0~255, 128이 0)의 RMS를 dBFS로 바꾼다.
 * PoC와 같은 계산이라 −55dB 기준도 PoC에서 잰 값과 같은 뜻이다.
 */
export function byteSamplesToDb(samples: Uint8Array): number {
  if (samples.length === 0) return MIN_DB;
  let sum = 0;
  for (const sample of samples) {
    const v = (sample - 128) / 128;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / samples.length);
  return rms > 0 ? Math.max(MIN_DB, 20 * Math.log10(rms)) : MIN_DB;
}

export type SilenceDetector = {
  /** 레벨과 시각(ms)을 넣는다. 무음이 기준 시간을 넘긴 순간에만 true를 돌려준다 */
  update(db: number, now: number): boolean;
  reset(): void;
};

/**
 * 기준보다 낮은 레벨이 `durationMs` 넘게 이어지면 한 번 알린다.
 * 레벨이 기준 이상으로 올라오면 다시 처음부터 잰다.
 */
export function createSilenceDetector(
  thresholdDb = SILENCE_THRESHOLD_DB,
  durationMs = SILENCE_DURATION_MS,
): SilenceDetector {
  let quietSince: number | null = null;
  let notified = false;

  return {
    update(db, now) {
      if (db >= thresholdDb) {
        quietSince = null;
        notified = false;
        return false;
      }
      if (quietSince === null) {
        quietSince = now;
        return false;
      }
      if (!notified && now - quietSince >= durationMs) {
        notified = true;
        return true;
      }
      return false;
    },
    reset() {
      quietSince = null;
      notified = false;
    },
  };
}
