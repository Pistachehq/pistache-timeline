import { type MediaHandle } from '../types';
import { decodeAudioFromHandle } from './export/decode-audio';

/** Fixed-resolution peak envelope for one media file (session cache, not persisted). */
export interface WaveformPeaks {
  readonly channelCount: 1 | 2;
  readonly bucketCount: number;
  /** Per bucket, per channel: min then max (−1…1). Stereo order: Lmin, Lmax, Rmin, Rmax. */
  readonly minMax: Float32Array;
}

export const DEFAULT_WAVEFORM_BUCKETS = 2048;

function peaksForChannel(data: Float32Array, bucketCount: number): Float32Array {
  const samples = data.length;
  const out = new Float32Array(bucketCount * 2);
  for (let b = 0; b < bucketCount; b++) {
    const start = Math.floor((b / bucketCount) * samples);
    const end = Math.max(start + 1, Math.floor(((b + 1) / bucketCount) * samples));
    let min = 1;
    let max = -1;
    for (let i = start; i < end; i++) {
      const v = data[i]!;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (min > max) {
      min = 0;
      max = 0;
    }
    out[b * 2] = min;
    out[b * 2 + 1] = max;
  }
  return out;
}

export function computeWaveformPeaks(buffer: AudioBuffer, bucketCount = DEFAULT_WAVEFORM_BUCKETS): WaveformPeaks {
  const channels = buffer.numberOfChannels;
  const channelCount = channels >= 2 ? 2 : 1;
  if (channelCount === 1) {
    return {
      channelCount: 1,
      bucketCount,
      minMax: peaksForChannel(buffer.getChannelData(0), bucketCount),
    };
  }
  const left = peaksForChannel(buffer.getChannelData(0), bucketCount);
  const right = peaksForChannel(buffer.getChannelData(1), bucketCount);
  const minMax = new Float32Array(bucketCount * 4);
  for (let b = 0; b < bucketCount; b++) {
    const i = b * 4;
    minMax[i] = left[b * 2]!;
    minMax[i + 1] = left[b * 2 + 1]!;
    minMax[i + 2] = right[b * 2]!;
    minMax[i + 3] = right[b * 2 + 1]!;
  }
  return { channelCount: 2, bucketCount, minMax };
}

export async function buildWaveformFromHandle(
  handle: MediaHandle,
  signal?: AbortSignal,
): Promise<WaveformPeaks> {
  const buffer = await decodeAudioFromHandle(handle, signal);
  return computeWaveformPeaks(buffer);
}
