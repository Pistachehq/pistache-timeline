import { frameRateFromNumber, type MediaKind, type MediaSourceRef } from '@timeline/core';
import { type DesktopMediaFile, type TimelineDesktopApi } from '@timeline/shared';
import { MediaElementPlayer } from '../browser/media-element-player';
import { probeWithMediaElement } from '../browser/probe';
import { captureVideoThumbnail } from '../browser/thumbnail';
import { browserExportSupported, exportBrowserSequence } from '../browser/export-sequence';
import { detectMediaKind, guessMimeType } from '../media-kind';
import {
  type MediaEngine,
  type MediaHandle,
  type MediaMetadata,
  type PickedMedia,
  type RejectedMedia,
} from '../types';

export type DesktopMediaBridge = TimelineDesktopApi['media'];

function toHandle(file: DesktopMediaFile): MediaHandle {
  return { id: file.token, url: file.url };
}

/**
 * Desktop media engine. File access, grants and FFprobe run in the Electron
 * main process; the renderer only receives `timeline-media://` URLs that
 * native media elements can stream. When FFprobe is not installed, metadata
 * falls back to the media element probe.
 */
export function createDesktopMediaEngine(bridge: DesktopMediaBridge): MediaEngine {
  const handles = new Set<string>();

  const track = (file: DesktopMediaFile): MediaHandle => {
    handles.add(file.token);
    return toHandle(file);
  };

  const engine: MediaEngine = {
    platform: 'desktop',
    capabilities: {
      metadata: 'ffprobe-with-fallback',
      persistentFileAccess: true,
      thumbnails: true,
      frameDecoding: false,
      export: browserExportSupported(),
    },

    async pickMedia({ multiple }) {
      const files = await bridge.pick({ multiple });
      const picked: PickedMedia[] = [];
      const rejected: RejectedMedia[] = [];
      for (const file of files) {
        const mimeType = guessMimeType(file.name);
        const kind = detectMediaKind(file.name, mimeType);
        if (!kind) {
          rejected.push({ fileName: file.name, reason: 'Unsupported file type.' });
          void bridge.release(file.token);
          continue;
        }
        picked.push({
          handle: track(file),
          kind,
          source: {
            kind: 'local-file',
            fileName: file.name,
            size: file.size,
            lastModified: file.lastModified,
            mimeType,
            path: file.path,
          },
        });
      }
      return { files: picked, rejected };
    },

    async importLocalFiles(files: readonly File[]) {
      const picked: PickedMedia[] = [];
      const rejected: RejectedMedia[] = [];
      for (const file of files) {
        const mimeType = guessMimeType(file.name);
        const kind = detectMediaKind(file.name, mimeType);
        if (!kind) {
          rejected.push({ fileName: file.name, reason: 'Unsupported file type.' });
          continue;
        }
        const path = (file as File & { path?: string }).path;
        if (!path) {
          rejected.push({ fileName: file.name, reason: 'Could not read the file path.' });
          continue;
        }
        const desktopFile = await bridge.resolve(path);
        if (!desktopFile) {
          rejected.push({ fileName: file.name, reason: 'Could not access the file.' });
          continue;
        }
        picked.push({
          handle: track(desktopFile),
          kind,
          source: {
            kind: 'local-file',
            fileName: file.name,
            size: file.size,
            lastModified: file.lastModified,
            mimeType,
            path: desktopFile.path,
          },
        });
      }
      return { files: picked, rejected };
    },

    async resolve(source: MediaSourceRef) {
      if (!source.path) return null;
      const file = await bridge.resolve(source.path);
      return file ? track(file) : null;
    },

    async probe(handle: MediaHandle, kind: MediaKind, signal?: AbortSignal): Promise<MediaMetadata> {
      const result = await bridge.probe(handle.id).catch(() => null);
      if (!result?.durationSeconds) return probeWithMediaElement(handle, kind, signal);
      if (kind === 'video' && !result.hasVideo) return probeWithMediaElement(handle, kind, signal);
      const rate = result.frameRate;
      return {
        durationSeconds: result.durationSeconds,
        hasVideo: result.hasVideo,
        hasAudio: result.hasAudio,
        width: result.width,
        height: result.height,
        frameRate: rate ? frameRateFromNumber(rate.numerator / rate.denominator) : null,
        videoCodec: result.videoCodec,
        audioCodec: result.audioCodec,
        probedBy: 'ffprobe',
      };
    },

    createThumbnail: (handle, request) => captureVideoThumbnail(handle, request),
    createPlayer: (element) => new MediaElementPlayer(element),
    exportSequence: (request, options) =>
      exportBrowserSequence(
        request,
        {
          resolve: async (source: MediaSourceRef) => {
            if (source.kind !== 'local-file' || !source.path) return null;
            const file = await bridge.resolve(source.path);
            return file ? track(file) : null;
          },
        },
        options,
      ),

    release(handle) {
      if (!handles.delete(handle.id)) return;
      void bridge.release(handle.id);
    },

    dispose() {
      for (const token of handles) void bridge.release(token);
      handles.clear();
    },
  };
  return engine;
}
