import {
  framesToSeconds,
  frameRateToNumber,
  getSequence,
  getTopmostVideoClipAt,
  type Clip,
  type FrameRate,
  type MediaAssetId,
  type Sequence,
} from '@timeline/core';
import { TimelineError, throwIfAborted } from '@timeline/shared';
import { ArrayBufferTarget, Muxer } from 'webm-muxer';
import { type ExportOptions, type ExportRequest, type ExportResult } from '../../types';
import { waitForMediaEvent } from '../media-element';
import { drawGapFrame, drawProgramFrame } from './compose-frame';
import { type BrowserExportContext } from './export-context';
import { encodeMixedAudioToMuxer, EXPORT_AUDIO_SAMPLE_RATE, mixSequenceAudio } from './export-audio-mix';
import { getExportFrameCount, sequenceFrameForOutputFrame, validateExportOutput } from './export-output';
import { downloadExportBlob } from './save-export';

export type { BrowserExportContext } from './export-context';

function sourceTimeForFrame(clip: Clip, frame: number, rate: FrameRate): number {
  const sourceFrame = clip.sourceIn + (frame - clip.start);
  return framesToSeconds(sourceFrame + 0.5, rate);
}

async function seekVideoForExport(video: HTMLVideoElement, seconds: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  if (Math.abs(video.currentTime - seconds) < 0.0005) return;
  video.pause();
  const seeked = waitForMediaEvent(video, 'seeked', { signal, timeoutMs: 60_000 });
  video.currentTime = seconds;
  await seeked;
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function loadVideo(handle: { url: string }, signal?: AbortSignal): Promise<HTMLVideoElement> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  if (!handle.url.startsWith('blob:')) video.crossOrigin = 'anonymous';
  video.src = handle.url;
  await waitForMediaEvent(video, 'loadedmetadata', { signal, timeoutMs: 120_000 });
  await waitForMediaEvent(video, 'canplay', { signal, timeoutMs: 120_000 });
  return video;
}

async function drainVideoEncoder(encoder: VideoEncoder): Promise<void> {
  while (encoder.encodeQueueSize > 0) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

async function pickVideoCodec(width: number, height: number, fps: number): Promise<{ codec: string; muxerCodec: 'V_VP9' | 'V_VP8' }> {
  const bitrate = Math.max(2_000_000, Math.round(width * height * fps * 0.08));
  const vp9 = await VideoEncoder.isConfigSupported({
    codec: 'vp09.00.10.08',
    width,
    height,
    bitrate,
    framerate: fps,
  });
  if (vp9.supported) return { codec: 'vp09.00.10.08', muxerCodec: 'V_VP9' };
  const vp8 = await VideoEncoder.isConfigSupported({
    codec: 'vp8',
    width,
    height,
    bitrate,
    framerate: fps,
  });
  if (vp8.supported) return { codec: 'vp8', muxerCodec: 'V_VP8' };
  throw new TimelineError('NOT_IMPLEMENTED', 'Neither VP9 nor VP8 video encoding is supported in this browser.');
}

function uniqueVideoAssetIds(sequence: Sequence): MediaAssetId[] {
  const ids = new Set<MediaAssetId>();
  for (const clip of Object.values(sequence.clips)) ids.add(clip.assetId);
  return [...ids];
}

function throwEncoderFailure(error: Error | null): void {
  if (error !== null) throw error;
}

function sanitizeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex -- strip illegal filename characters
  const cleaned = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim();
  return cleaned.length > 0 ? cleaned : 'export';
}

/**
 * Renders the active sequence to WebM using WebCodecs (VP9 + Opus). Video
 * uses topmost-track compositing; audio mixes audio tracks and the program clip.
 */
export async function exportSequenceToWebm(
  request: ExportRequest,
  context: BrowserExportContext,
  options: ExportOptions = {},
): Promise<ExportResult> {
  const { signal, onProgress } = options;
  throwIfAborted(signal);

  if (request.format.container !== 'webm') {
    throw new TimelineError(
      'NOT_IMPLEMENTED',
      `Export to ${request.format.container} is not supported in the browser yet. Choose WebM.`,
    );
  }

  const sequence = getSequence(request.project, request.sequenceId);
  if (!sequence) throw new TimelineError('NOT_FOUND', 'The sequence to export does not exist.');

  validateExportOutput(request.output);
  const { width, height, frameRate: outputFrameRate } = request.output;
  const outputFrames = getExportFrameCount(sequence, outputFrameRate);
  if (outputFrames <= 0) {
    throw new TimelineError('INVALID_ARGUMENT', 'There is nothing to export: the sequence has no clips.');
  }

  onProgress?.({ phase: 'preparing', progress: 0 });

  const fps = frameRateToNumber(outputFrameRate);
  const frameDurationUs = Math.round(1_000_000 / fps);
  const keyFrameInterval = Math.max(1, Math.round(fps));
  const drawOptions = { width, height, sequence };

  const videos = new Map<MediaAssetId, HTMLVideoElement>();
  for (const assetId of uniqueVideoAssetIds(sequence)) {
    throwIfAborted(signal);
    const asset = request.project.mediaAssets[assetId];
    if (!asset?.hasVideo) continue;
    const handle = await context.resolve(asset.source);
    if (!handle) {
      throw new TimelineError('MEDIA_UNAVAILABLE', `${asset.name} is offline and cannot be exported.`);
    }
    videos.set(assetId, await loadVideo(handle, signal));
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new TimelineError('UNKNOWN', 'Could not create an export canvas.');

  const target = new ArrayBufferTarget();
  const audioMix = await mixSequenceAudio(sequence, request.project, context, {
    ...options,
    onProgress: (p) => onProgress?.({ phase: 'audio', progress: p.progress * 0.25 }),
  });

  const videoCodec = await pickVideoCodec(width, height, fps);

  const muxerOptions = {
    target,
    video: { codec: videoCodec.muxerCodec, width, height, frameRate: fps },
    firstTimestampBehavior: 'offset' as const,
    ...(audioMix
      ? {
          audio: {
            codec: 'A_OPUS',
            numberOfChannels: 2,
            sampleRate: EXPORT_AUDIO_SAMPLE_RATE,
          },
        }
      : {}),
  };
  const muxer = new Muxer(muxerOptions);

  if (audioMix) {
    await encodeMixedAudioToMuxer(audioMix, muxer, {
      ...options,
      onProgress: (p) => onProgress?.({ phase: 'audio', progress: 0.25 + p.progress * 0.15 }),
    });
  }

  let encoderError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (error: Error) => {
      encoderError = error;
    },
  });

  encoder.configure({
    codec: videoCodec.codec,
    width,
    height,
    bitrate: Math.max(2_000_000, Math.round(width * height * fps * 0.08)),
    framerate: fps,
  });

  onProgress?.({ phase: 'rendering', progress: audioMix ? 0.4 : 0 });
  await new Promise<void>((resolve) => setTimeout(resolve, 0));

  const videoProgressStart = audioMix ? 0.4 : 0;
  const videoProgressSpan = audioMix ? 0.55 : 1;
  let lastSeekKey = '';

  for (let outFrame = 0; outFrame < outputFrames; outFrame++) {
    throwIfAborted(signal);
    throwEncoderFailure(encoderError);

    const seqFrame = sequenceFrameForOutputFrame(outFrame, outputFrameRate, sequence);
    const active = getTopmostVideoClipAt(sequence, seqFrame);
    if (active) {
      const video = videos.get(active.clip.assetId);
      if (video) {
        const seconds = sourceTimeForFrame(active.clip, seqFrame, sequence.frameRate);
        const seekKey = `${active.clip.id}:${seqFrame}`;
        if (seekKey !== lastSeekKey) {
          await seekVideoForExport(video, seconds, signal);
          lastSeekKey = seekKey;
        }
        drawProgramFrame(ctx, drawOptions, active.clip, video);
      } else {
        drawGapFrame(ctx, width, height);
      }
    } else {
      drawGapFrame(ctx, width, height);
    }

    const videoFrame = new VideoFrame(canvas, {
      timestamp: outFrame * frameDurationUs,
      duration: frameDurationUs,
    });
    encoder.encode(videoFrame, { keyFrame: outFrame % keyFrameInterval === 0 });
    videoFrame.close();
    await drainVideoEncoder(encoder);

    onProgress?.({
      phase: 'rendering',
      progress: videoProgressStart + ((outFrame + 1) / outputFrames) * videoProgressSpan,
    });

    if (outFrame % 4 === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  await encoder.flush();
  throwEncoderFailure(encoderError);

  onProgress?.({ phase: 'finalizing', progress: 1 });
  muxer.finalize();
  encoder.close();

  for (const video of videos.values()) {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }

  const fileName = `${sanitizeFileName(sequence.name)}.webm`;
  downloadExportBlob(new Blob([target.buffer], { type: 'video/webm' }), fileName);
  return { displayName: fileName };
}
