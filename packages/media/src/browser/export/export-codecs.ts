import { TimelineError } from '@timeline/shared';
import { type ExportFormat } from '../../types';

export interface ChosenVideoEncoder {
  readonly container: 'mp4' | 'webm';
  readonly codec: string;
  readonly accelerated: boolean;
  readonly audioCodec: 'aac' | 'opus';
  readonly webmCodec: 'V_VP9' | 'V_VP8' | null;
  readonly config: VideoEncoderConfig;
}

function bitrateFor(width: number, height: number, fps: number): number {
  return Math.max(2_000_000, Math.round(width * height * fps * 0.08));
}

const AVC_CODECS = ['avc1.640033', 'avc1.640028', 'avc1.4d0028', 'avc1.42001f'] as const;

async function supportedConfig(config: VideoEncoderConfig): Promise<VideoEncoderConfig | null> {
  try {
    const result = await VideoEncoder.isConfigSupported(config);
    if (!result.supported) return null;
    return result.config ?? config;
  } catch {
    return null;
  }
}

async function pickAvc(width: number, height: number, fps: number, bitrate: number): Promise<ChosenVideoEncoder | null> {
  for (const hardwareAcceleration of ['prefer-hardware', 'prefer-software'] as const) {
    for (const codec of AVC_CODECS) {
      const config = await supportedConfig({
        codec,
        width,
        height,
        bitrate,
        framerate: fps,
        hardwareAcceleration,
        latencyMode: 'quality',
        avc: { format: 'avc' },
      });
      if (!config) continue;
      return {
        container: 'mp4',
        codec,
        accelerated: config.hardwareAcceleration === 'prefer-hardware',
        audioCodec: 'aac',
        webmCodec: null,
        config,
      };
    }
  }
  return null;
}

async function pickVp9(width: number, height: number, fps: number, bitrate: number): Promise<ChosenVideoEncoder> {
  const vp9 = await supportedConfig({
    codec: 'vp09.00.10.08',
    width,
    height,
    bitrate,
    framerate: fps,
  });
  if (vp9) {
    return {
      container: 'webm',
      codec: 'vp09.00.10.08',
      accelerated: false,
      audioCodec: 'opus',
      webmCodec: 'V_VP9',
      config: vp9,
    };
  }
  const vp8 = await supportedConfig({
    codec: 'vp8',
    width,
    height,
    bitrate,
    framerate: fps,
  });
  if (vp8) {
    return {
      container: 'webm',
      codec: 'vp8',
      accelerated: false,
      audioCodec: 'opus',
      webmCodec: 'V_VP8',
      config: vp8,
    };
  }
  throw new TimelineError('NOT_IMPLEMENTED', 'Neither H.264, VP9, nor VP8 video encoding is supported in this browser.');
}

/** Fast exports prefer hardware H.264. Anything else stays on VP9 in WebM. */
export async function chooseVideoEncoder(
  format: ExportFormat,
  width: number,
  height: number,
  fps: number,
): Promise<ChosenVideoEncoder> {
  const bitrate = bitrateFor(width, height, fps);
  const wantFast = format.container === 'mp4' || format.videoCodec === 'avc' || format.videoCodec === 'h264';
  if (wantFast) {
    const avc = await pickAvc(width, height, fps, bitrate);
    if (avc) return avc;
  }
  return pickVp9(width, height, fps, bitrate);
}

export async function audioEncoderSupported(codec: 'aac' | 'opus', sampleRate: number): Promise<boolean> {
  const config: AudioEncoderConfig =
    codec === 'aac'
      ? { codec: 'mp4a.40.2', sampleRate, numberOfChannels: 2, bitrate: 192_000 }
      : { codec: 'opus', sampleRate, numberOfChannels: 2, bitrate: 160_000 };
  try {
    const result = await AudioEncoder.isConfigSupported(config);
    return result.supported === true;
  } catch {
    return false;
  }
}
