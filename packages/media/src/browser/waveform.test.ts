import { describe, expect, it } from 'vitest';
import { computeWaveformPeaks } from './waveform';

describe('computeWaveformPeaks', () => {
  it('summarizes a sine wave into min/max buckets', () => {
    const length = 4800;
    const data = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      data[i] = Math.sin((2 * Math.PI * 440 * i) / 48000);
    }
    const buffer = {
      numberOfChannels: 1,
      getChannelData: (index: number) => (index === 0 ? data : new Float32Array(0)),
    } as AudioBuffer;
    const peaks = computeWaveformPeaks(buffer, 8);
    expect(peaks.channelCount).toBe(1);
    expect(peaks.bucketCount).toBe(8);
    expect(peaks.minMax.length).toBe(16);
    const maxPeak = Math.max(...peaks.minMax.filter((_, i) => i % 2 === 1));
    expect(maxPeak).toBeGreaterThan(0.9);
    const minPeak = Math.min(...peaks.minMax.filter((_, i) => i % 2 === 0));
    expect(minPeak).toBeLessThan(-0.9);
  });
});
