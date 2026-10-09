import {
  applyStereoPan,
  combinedClipTrackLinearGain,
  effectiveClipLinearGain,
  findTrack,
  framesToSeconds,
  getActiveAudioClipsAt,
  getSequenceDuration,
  getTopmostVideoClipAt,
  clipContributesEmbeddedAudio,
  secondsToFrames,
  type Clip,
  type FrameRate,
  type MediaAssetId,
  type Project,
  type Sequence,
} from '@timeline/core';
import { TimelineError, throwIfAborted } from '@timeline/shared';
import { type ExportOptions } from '../../types';
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

function applyClipGain(left: number, right: number, clip: Clip, sequence: Sequence): [number, number] {
  const track = findTrack(sequence, clip.trackId);
  const gain =
    track?.kind === 'audio'
      ? combinedClipTrackLinearGain(clip.audio, track.volume, track.muted)
      : effectiveClipLinearGain(clip);
  return applyStereoPan(left, right, clip.audio.pan, gain);
}

/** Maps timeline time (seconds) to source media time for a clip. */
function sourceSecondsForClip(clip: Clip, timeSeconds: number, rate: FrameRate): number {
  const seqFrameFloat = (timeSeconds * rate.numerator) / rate.denominator;
  const sourceFrameFloat = clip.sourceIn + (seqFrameFloat - clip.start);
  return (sourceFrameFloat * rate.denominator) / rate.numerator;
}

function uniqueAudioAssetIds(sequence: Sequence, project: Project): MediaAssetId[] {
  const ids = new Set<MediaAssetId>();
  for (const clip of Object.values(sequence.clips)) {
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
    for (const { clip } of getActiveAudioClipsAt(sequence, seqFrame)) {
      const asset = project.mediaAssets[clip.assetId];
      if (!asset?.hasAudio) continue;
      const buffer = buffers.get(clip.assetId);
      if (!buffer) continue;
      const sourceSeconds = sourceSecondsForClip(clip, t, sequence.frameRate);
      const [sl, sr] = stereoSample(buffer, sourceSeconds);
      const [gl, gr] = applyClipGain(sl, sr, clip, sequence);
      l += gl;
      r += gr;
    }
    const program = getTopmostVideoClipAt(sequence, seqFrame);
    if (program && clipContributesEmbeddedAudio(program.clip)) {
      const asset = project.mediaAssets[program.clip.assetId];
      const buffer = asset?.hasAudio ? buffers.get(program.clip.assetId) : undefined;
      if (buffer) {
        const sourceSeconds = sourceSecondsForClip(program.clip, t, sequence.frameRate);
        const [sl, sr] = stereoSample(buffer, sourceSeconds);
        const [gl, gr] = applyClipGain(sl, sr, program.clip, sequence);
        l += gl;
        r += gr;
      }
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
): Promise<void> {
  const { signal, onProgress } = options;
  throwIfAborted(signal);

  if (typeof AudioEncoder === 'undefined') {
    throw new TimelineError('NOT_IMPLEMENTED', 'Exporting audio requires AudioEncoder (WebCodecs) support.');
  }

  const supported = await AudioEncoder.isConfigSupported({
    codec: 'opus',
    sampleRate: mix.sampleRate,
    numberOfChannels: 2,
    bitrate: 160_000,
  });
  if (!supported.supported) {
    throw new TimelineError('NOT_IMPLEMENTED', 'Opus audio encoding is not supported in this browser.');
  }

  let encoderError: Error | null = null;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (error: Error) => {
      encoderError = error;
    },
  });

  encoder.configure({
    codec: 'opus',
    sampleRate: mix.sampleRate,
    numberOfChannels: 2,
    bitrate: 160_000,
  });

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
