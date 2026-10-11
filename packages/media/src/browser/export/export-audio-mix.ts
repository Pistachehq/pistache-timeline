import {
  applyStereoPan,
  audioEffectGainDb,
  clipPitchAmount,
  clipSpeedPercent,
  clipTransitionAudioMultiplier,
  combinedClipTrackLinearGain,
  effectiveClipLinearGain,
  findTrack,
  framesToSeconds,
  getAudibleClipsAt,
  getSequenceDuration,
  pitchRatioFromAmount,
  pitchWetMix,
  secondsToFrames,
  type Clip,
  type FrameRate,
  type MediaAssetId,
  type Project,
  type Sequence,
} from '@timeline/core';
import { TimelineError, throwIfAborted } from '@timeline/shared';
import { type ExportOptions } from '../../types';
import { audioEncoderSupported } from './export-codecs';
import { decodeAudioFromHandle } from './decode-audio';
import { type BrowserExportContext } from './export-context';

export const EXPORT_AUDIO_SAMPLE_RATE = 48_000;
const OPUS_FRAME_SAMPLES = 1024;

function readSample(buffer: AudioBuffer, sourceSeconds: number, channel: number): number {
  const index = sourceSeconds * buffer.sampleRate;
  const i0 = Math.floor(index);
  if (i0 < 0 || i0 >= buffer.length) return 0;
  const frac = index - i0;
  const ch = Math.min(channel, buffer.numberOfChannels - 1);
  const data = buffer.getChannelData(ch);
  const s0 = data[i0] ?? 0;
  const s1 = data[Math.min(i0 + 1, buffer.length - 1)] ?? 0;
  return s0 + frac * (s1 - s0);
}

function stereoSample(buffer: AudioBuffer, sourceSeconds: number): [number, number] {
  if (buffer.numberOfChannels === 1) {
    const m = readSample(buffer, sourceSeconds, 0);
    return [m, m];
  }
  return [readSample(buffer, sourceSeconds, 0), readSample(buffer, sourceSeconds, 1)];
}

function applyClipGain(
  left: number,
  right: number,
  clip: Clip,
  sequence: Sequence,
  sequenceFrame: number,
): [number, number] {
  const track = findTrack(sequence, clip.trackId);
  let gain =
    track?.kind === 'audio'
      ? combinedClipTrackLinearGain(clip.audio, track.volume, track.muted)
      : effectiveClipLinearGain(clip);
  gain *= clipTransitionAudioMultiplier(clip, sequenceFrame);
  gain *= 10 ** (audioEffectGainDb(clip.effects) / 20);
  return applyStereoPan(left, right, clip.audio.pan, gain);
}

const PITCH_GRAIN_SECONDS = 0.1;

/** Maps timeline time (seconds) to source media time for a clip, including speed. */
function sourceSecondsForClip(clip: Clip, timeSeconds: number, rate: FrameRate): number {
  const seqFrameFloat = (timeSeconds * rate.numerator) / rate.denominator;
  const local = Math.max(0, seqFrameFloat - clip.start);
  const raw = clip.sourceIn + local * (clipSpeedPercent(clip.speed) / 100);
  const last = Math.max(clip.sourceIn, clip.sourceOut - 1);
  return (Math.min(last, raw) * rate.denominator) / rate.numerator;
}

function pitchedStereo(
  buffer: AudioBuffer,
  sourceSeconds: number,
  ratio: number,
  phase: number,
): { readonly sample: [number, number]; readonly phase: number } {
  if (Math.abs(ratio - 1) < 0.0001) return { sample: stereoSample(buffer, sourceSeconds), phase: 0 };
  const next = (phase + 1 / (PITCH_GRAIN_SECONDS * EXPORT_AUDIO_SAMPLE_RATE)) % 1;
  const depth = PITCH_GRAIN_SECONDS * Math.abs(ratio - 1);
  const delayAt = (p: number) => (ratio > 1 ? 1 - p : p) * depth;
  const hann = (p: number) => 0.5 * (1 - Math.cos(2 * Math.PI * p));
  const second = (next + 0.5) % 1;
  const a = stereoSample(buffer, sourceSeconds - delayAt(next));
  const b = stereoSample(buffer, sourceSeconds - delayAt(second));
  const w1 = hann(next);
  const w2 = hann(second);
  return {
    sample: [a[0] * w1 + b[0] * w2, a[1] * w1 + b[1] * w2],
    phase: next,
  };
}

function uniqueAudioAssetIds(sequence: Sequence, project: Project): MediaAssetId[] {
  const ids = new Set<MediaAssetId>();
  for (const clip of Object.values(sequence.clips)) {
    if (!clip.assetId) continue;
    const asset = project.mediaAssets[clip.assetId];
    if (asset?.hasAudio) ids.add(clip.assetId);
  }
  return [...ids];
}

function throwEncoderFailure(error: Error | null): void {
  if (error !== null) throw error;
}

export interface MixedAudio {
  readonly left: Float32Array;
  readonly right: Float32Array;
  readonly sampleRate: number;
}

export async function mixSequenceAudio(
  sequence: Sequence,
  project: Project,
  context: BrowserExportContext,
  options: ExportOptions = {},
): Promise<MixedAudio | null> {
  const { signal } = options;
  throwIfAborted(signal);

  const assetIds = uniqueAudioAssetIds(sequence, project);
  if (assetIds.length === 0) return null;

  const buffers = new Map<MediaAssetId, AudioBuffer>();
  for (const assetId of assetIds) {
    throwIfAborted(signal);
    const asset = project.mediaAssets[assetId];
    if (!asset) continue;
    const handle = await context.resolve(asset.source);
    if (!handle) {
      throw new TimelineError('MEDIA_UNAVAILABLE', `${asset.name} is offline and cannot be exported.`);
    }
    buffers.set(assetId, await decodeAudioFromHandle(handle, signal));
  }

  const durationSeconds = framesToSeconds(getSequenceDuration(sequence), sequence.frameRate);
  const totalSamples = Math.ceil(durationSeconds * EXPORT_AUDIO_SAMPLE_RATE);
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);
  const pitchPhase = new Map<string, number>();

  for (let sample = 0; sample < totalSamples; sample++) {
    throwIfAborted(signal);
    if (sample > 0 && sample % EXPORT_AUDIO_SAMPLE_RATE === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      options.onProgress?.({ phase: 'audio', progress: (sample / totalSamples) * 0.2 });
    }
    const t = sample / EXPORT_AUDIO_SAMPLE_RATE;
    const seqFrame = Math.min(
      getSequenceDuration(sequence) - 1,
      Math.max(0, secondsToFrames(t, sequence.frameRate, 'floor')),
    );
    let l = 0;
    let r = 0;
    for (const clip of getAudibleClipsAt(sequence, seqFrame, project.mediaAssets)) {
      if (!clip.assetId) continue;
      const buffer = buffers.get(clip.assetId);
      if (!buffer) continue;
      const sourceSeconds = sourceSecondsForClip(clip, t, sequence.frameRate);
      const pitchAmount = clipPitchAmount(clip.effects.audio);
      const wet = pitchWetMix(pitchAmount);
      let sl: number;
      let sr: number;
      if (wet === 0) {
        [sl, sr] = stereoSample(buffer, sourceSeconds);
      } else {
        const pitched = pitchedStereo(buffer, sourceSeconds, pitchRatioFromAmount(pitchAmount), pitchPhase.get(clip.id) ?? 0);
        pitchPhase.set(clip.id, pitched.phase);
        if (wet >= 1) {
          [sl, sr] = pitched.sample;
        } else {
          const dry = stereoSample(buffer, sourceSeconds);
          const wetGain = Math.sin(wet * Math.PI * 0.5);
          const dryGain = Math.cos(wet * Math.PI * 0.5);
          sl = dry[0] * dryGain + pitched.sample[0] * wetGain;
          sr = dry[1] * dryGain + pitched.sample[1] * wetGain;
        }
      }
      const [gl, gr] = applyClipGain(sl, sr, clip, sequence, seqFrame);
      l += gl;
      r += gr;
    }
    left[sample] = Math.max(-1, Math.min(1, l));
    right[sample] = Math.max(-1, Math.min(1, r));
  }

  return { left, right, sampleRate: EXPORT_AUDIO_SAMPLE_RATE };
}

export async function encodeMixedAudioToMuxer(
  mix: MixedAudio,
  muxer: { addAudioChunk(chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata): void },
  options: ExportOptions = {},
  audioCodec: 'aac' | 'opus' = 'opus',
): Promise<void> {
  const { signal, onProgress } = options;
  throwIfAborted(signal);

  if (typeof AudioEncoder === 'undefined') {
    throw new TimelineError('NOT_IMPLEMENTED', 'Exporting audio requires AudioEncoder (WebCodecs) support.');
  }

  if (!(await audioEncoderSupported(audioCodec, mix.sampleRate))) {
    throw new TimelineError('NOT_IMPLEMENTED', 'Audio encoding is not supported in this browser.');
  }
  const encoderConfig: AudioEncoderConfig =
    audioCodec === 'aac'
      ? { codec: 'mp4a.40.2', sampleRate: mix.sampleRate, numberOfChannels: 2, bitrate: 192_000 }
      : { codec: 'opus', sampleRate: mix.sampleRate, numberOfChannels: 2, bitrate: 160_000 };

  let encoderError: Error | null = null;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (error: Error) => {
      encoderError = error;
    },
  });

  encoder.configure(encoderConfig);

  const { left, right, sampleRate } = mix;
  const totalSamples = left.length;
  const chunkCount = Math.ceil(totalSamples / OPUS_FRAME_SAMPLES);

  for (let chunk = 0; chunk < chunkCount; chunk++) {
    throwIfAborted(signal);
    throwEncoderFailure(encoderError);

    const offset = chunk * OPUS_FRAME_SAMPLES;
    const frames = Math.min(OPUS_FRAME_SAMPLES, totalSamples - offset);
    const interleaved = new Float32Array(frames * 2);
    for (let i = 0; i < frames; i++) {
      interleaved[i * 2] = left[offset + i] ?? 0;
      interleaved[i * 2 + 1] = right[offset + i] ?? 0;
    }

    const audioData = new AudioData({
      format: 'f32',
      sampleRate,
      numberOfFrames: frames,
      numberOfChannels: 2,
      timestamp: Math.round((offset / sampleRate) * 1_000_000),
      data: interleaved,
    });
    encoder.encode(audioData);
    audioData.close();

    onProgress?.({ phase: 'audio', progress: (chunk + 1) / chunkCount });
  }

  await encoder.flush();
  throwEncoderFailure(encoderError);
  encoder.close();
}
