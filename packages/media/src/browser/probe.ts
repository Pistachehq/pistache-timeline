import { type MediaKind } from '@timeline/core';
import { TimelineError } from '@timeline/shared';
import { type MediaHandle, type MediaMetadata } from '../types';
import { createProbeElement, releaseMediaElement, waitForMediaEvent } from './media-element';

interface AudioTrackHints {
  audioTracks?: { length: number };
  mozHasAudio?: boolean;
}

function detectAudio(element: HTMLMediaElement, kind: MediaKind): boolean {
  if (kind === 'audio') return true;
  const hints = element as HTMLMediaElement & AudioTrackHints;
  if (typeof hints.mozHasAudio === 'boolean') return hints.mozHasAudio;
  if (hints.audioTracks) return hints.audioTracks.length > 0;
  // Chromium does not expose audio track presence before playback; assume
  // audio exists so it is never silently dropped.
  return true;
}

/**
 * Some files (notably WebM produced by MediaRecorder) report an infinite
 * duration until the browser scans to the end. Seeking far ahead forces the
 * real duration to be computed.
 */
async function resolveFiniteDuration(element: HTMLMediaElement, signal?: AbortSignal): Promise<number> {
  if (Number.isFinite(element.duration)) return element.duration;
  element.currentTime = Number.MAX_SAFE_INTEGER;
  await waitForMediaEvent(element, 'durationchange', { signal, timeoutMs: 10_000 });
  if (!Number.isFinite(element.duration)) {
    throw new TimelineError('UNSUPPORTED_MEDIA', 'The media duration could not be determined.');
  }
  return element.duration;
}

/** Reads basic metadata using a native media element. Works in every modern browser. */
export async function probeWithMediaElement(
  handle: MediaHandle,
  kind: MediaKind,
  signal?: AbortSignal,
): Promise<MediaMetadata> {
  const element = createProbeElement(kind === 'video' ? 'video' : 'audio', handle.url);
  try {
    if (element.readyState < HTMLMediaElement.HAVE_METADATA) {
      await waitForMediaEvent(element, 'loadedmetadata', { signal });
    }
    const durationSeconds = await resolveFiniteDuration(element, signal);
    const video = element instanceof HTMLVideoElement ? element : null;
    const hasVideo = !!video && video.videoWidth > 0 && video.videoHeight > 0;
    if (kind === 'video' && !hasVideo) {
      throw new TimelineError('UNSUPPORTED_MEDIA', 'No decodable video stream was found.');
    }
    return {
      durationSeconds,
      hasVideo,
      hasAudio: detectAudio(element, kind),
      width: hasVideo ? video.videoWidth : null,
      height: hasVideo ? video.videoHeight : null,
      frameRate: null,
      videoCodec: null,
      audioCodec: null,
      probedBy: 'media-element',
    };
  } finally {
    releaseMediaElement(element);
  }
}
