import { describe, expect, it } from 'vitest';
import {
  MIN_DB,
  SILENCE_DURATION_MS,
  SILENCE_THRESHOLD_DB,
  byteSamplesToDb,
  createSilenceDetector,
} from './levelMath.ts';

/** 진폭 `amplitude`(0~1)인 사각파를 바이트 파형으로 만든다. RMS가 진폭과 같다 */
function squareWave(amplitude: number, length = 1024): Uint8Array {
  return Uint8Array.from({ length }, (_, i) => 128 + (i % 2 === 0 ? 1 : -1) * Math.round(amplitude * 128));
}

describe('byteSamplesToDb', () => {
  it('신호가 없으면(모두 128) 최솟값을 돌려준다', () => {
    expect(byteSamplesToDb(new Uint8Array(1024).fill(128))).toBe(MIN_DB);
    expect(byteSamplesToDb(new Uint8Array(0))).toBe(MIN_DB);
  });

  it('RMS를 dBFS로 바꾼다', () => {
    expect(byteSamplesToDb(squareWave(127 / 128))).toBeCloseTo(-0.07, 2);
    expect(byteSamplesToDb(squareWave(0.5))).toBeCloseTo(-6.02, 2);
    expect(byteSamplesToDb(squareWave(16 / 128))).toBeCloseTo(-18.06, 2);
  });

  it('한 칸(1/128) 흔들림은 약 −42dB라 기준 −55dB보다 크다', () => {
    const db = byteSamplesToDb(squareWave(1 / 128));
    expect(db).toBeCloseTo(-42.14, 2);
    expect(db).toBeGreaterThan(SILENCE_THRESHOLD_DB);
  });

  it('일부 샘플만 한 칸 흔들리면 −55dB 아래로 내려간다', () => {
    const samples = new Uint8Array(1024).fill(128);
    samples[0] = 129;
    samples[1] = 127;
    expect(byteSamplesToDb(samples)).toBeLessThan(SILENCE_THRESHOLD_DB);
  });
});

describe('createSilenceDetector', () => {
  it('기준과 시간은 −55dB, 4초다', () => {
    expect(SILENCE_THRESHOLD_DB).toBe(-55);
    expect(SILENCE_DURATION_MS).toBe(4000);
  });

  it('−55dB 미만이 4초 이어지면 그 순간 한 번만 알린다', () => {
    const detector = createSilenceDetector();
    expect(detector.update(-60, 1000)).toBe(false);
    expect(detector.update(-60, 4999)).toBe(false);
    expect(detector.update(-60, 5000)).toBe(true);
    expect(detector.update(-60, 6000)).toBe(false);
    expect(detector.update(-100, 60000)).toBe(false);
  });

  it('−55dB 이상은 무음이 아니고, 중간에 소리가 나면 처음부터 다시 잰다', () => {
    const detector = createSilenceDetector();
    detector.update(-60, 0);
    expect(detector.update(-55, 3000)).toBe(false);
    expect(detector.update(-60, 3500)).toBe(false);
    expect(detector.update(-60, 7000)).toBe(false);
    expect(detector.update(-60, 7500)).toBe(true);
  });

  it('소리가 난 뒤 다시 무음이 4초 이어지면 다시 알린다', () => {
    const detector = createSilenceDetector();
    detector.update(-60, 0);
    expect(detector.update(-60, 4000)).toBe(true);
    detector.update(-30, 5000);
    detector.update(-60, 6000);
    expect(detector.update(-60, 10000)).toBe(true);
  });

  it('reset 후에는 처음부터 다시 잰다', () => {
    const detector = createSilenceDetector();
    detector.update(-60, 0);
    detector.reset();
    detector.update(-60, 3000);
    expect(detector.update(-60, 4000)).toBe(false);
    expect(detector.update(-60, 7000)).toBe(true);
  });

  it('기준과 시간을 바꿀 수 있다', () => {
    const detector = createSilenceDetector(-40, 1000);
    detector.update(-45, 0);
    expect(detector.update(-45, 1000)).toBe(true);
  });
});
