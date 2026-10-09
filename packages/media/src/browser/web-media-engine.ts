import { type LocalFileSource, type MediaSourceRef } from '@timeline/core';
import { createId } from '@timeline/shared';
import { browserExportSupported, exportBrowserSequence } from './export-sequence';
import { MEDIA_ACCEPT } from '../media-kind';
import {
  type MediaEngine,
  type MediaHandle,
  type PickMediaResult,
} from '../types';
import { pickMediaFromFiles } from './import-local-files';
import { pickFiles } from './file-picker';
import { MediaElementPlayer } from './media-element-player';
import { probeWithMediaElement } from './probe';
import { captureVideoThumbnail } from './thumbnail';

interface SessionFile {
  readonly handle: MediaHandle;
  readonly fingerprint: string;
}

function fingerprint(source: Pick<LocalFileSource, 'fileName' | 'size' | 'lastModified'>): string {
  return `${source.fileName}\u0000${source.size}\u0000${source.lastModified}`;
}

export interface WebMediaEngineOptions {
  /** Overrides the file chooser (used by tests and alternative pickers). */
  readonly pickFiles?: (options: { accept: string; multiple: boolean }) => Promise<File[]>;
}

/**
 * Browser media engine. Files are read through `File` objects and exposed to
 * native media elements via object URLs that live for the session only.
 * Browsers cannot reopen a file from a saved path, so projects reopened in a
 * new session show their media as offline until relinked.
 */
export function createWebMediaEngine(options: WebMediaEngineOptions = {}): MediaEngine {
  const choose = options.pickFiles ?? pickFiles;
  const files = new Map<string, SessionFile>();

  const register = (file: File): MediaHandle => {
    const source = { fileName: file.name, size: file.size, lastModified: file.lastModified };
    const key = fingerprint(source);
    for (const entry of files.values()) {
      if (entry.fingerprint === key) return entry.handle;
    }
    const handle: MediaHandle = { id: createId('media'), url: URL.createObjectURL(file) };
    files.set(handle.id, { handle, fingerprint: key });
    return handle;
  };

  const engine: MediaEngine = {
    platform: 'web',
    capabilities: {
      metadata: 'media-element',
      persistentFileAccess: false,
      thumbnails: true,
      frameDecoding: false,
      export: browserExportSupported(),
    },

    async pickMedia({ multiple }): Promise<PickMediaResult> {
      const selected = await choose({ accept: MEDIA_ACCEPT, multiple });
      return pickMediaFromFiles(selected, register);
    },

    importLocalFiles(files: readonly File[]): Promise<PickMediaResult> {
      return Promise.resolve(pickMediaFromFiles(files, register));
    },

    resolve(source: MediaSourceRef): Promise<MediaHandle | null> {
      const key = fingerprint(source);
      for (const entry of files.values()) {
        if (entry.fingerprint === key) return Promise.resolve(entry.handle);
      }
      return Promise.resolve(null);
    },

    probe: (handle, kind, signal) => probeWithMediaElement(handle, kind, signal),
    createThumbnail: (handle, request) => captureVideoThumbnail(handle, request),
    createPlayer: (element) => new MediaElementPlayer(element),
    exportSequence: (request, options) =>
      exportBrowserSequence(request, { resolve: (source: MediaSourceRef) => engine.resolve(source) }, options),

    release(handle) {
      if (!files.delete(handle.id)) return;
      URL.revokeObjectURL(handle.url);
    },

    dispose() {
      for (const { handle } of files.values()) URL.revokeObjectURL(handle.url);
      files.clear();
    },
  };
  return engine;
}
