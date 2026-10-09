import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { type DesktopProbeResult } from '@timeline/shared';
import { isObject } from './validate';

const execFileAsync = promisify(execFile);

function parseFrameRate(value: unknown): { numerator: number; denominator: number } | null {
  if (typeof value !== 'string' || !/^\d+\/\d+$/.test(value)) return null;
  const [numerator, denominator] = value.split('/').map(Number);
  if (!numerator || !denominator) return null;
  return { numerator, denominator };
}

function parseProbeJson(stdout: string): DesktopProbeResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (!isObject(parsed)) return null;
  const streams: unknown[] = Array.isArray(parsed.streams) ? parsed.streams : [];
  const format = isObject(parsed.format) ? parsed.format : {};
  const video = streams.find((stream): stream is Record<string, unknown> => isObject(stream) && stream.codec_type === 'video');
  const audio = streams.find((stream): stream is Record<string, unknown> => isObject(stream) && stream.codec_type === 'audio');
  const duration = Number(format.duration);
  return {
    durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : null,
    width: isObject(video) && typeof video.width === 'number' ? video.width : null,
    height: isObject(video) && typeof video.height === 'number' ? video.height : null,
    frameRate: isObject(video) ? parseFrameRate(video.r_frame_rate) : null,
    hasVideo: Boolean(video),
    hasAudio: Boolean(audio),
    videoCodec: isObject(video) && typeof video.codec_name === 'string' ? video.codec_name : null,
    audioCodec: isObject(audio) && typeof audio.codec_name === 'string' ? audio.codec_name : null,
  };
}

/**
 * Runs FFprobe when it is on PATH. Returns `null` so the renderer can fall
 * back to a media-element probe when FFmpeg is not installed.
 */
export async function probeWithFfprobe(filePath: string): Promise<DesktopProbeResult | null> {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath],
      { timeout: 20_000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 },
    );
    return parseProbeJson(stdout);
  } catch {
    return null;
  }
}
