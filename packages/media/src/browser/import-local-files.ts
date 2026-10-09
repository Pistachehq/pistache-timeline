import { type LocalFileSource } from '@timeline/core';
import { detectMediaKind } from '../media-kind';
import { type MediaHandle, type PickedMedia, type PickMediaResult, type RejectedMedia } from '../types';

function localSourceFromFile(file: File, path: string | null): LocalFileSource {
  return {
    kind: 'local-file',
    fileName: file.name,
    size: file.size,
    lastModified: file.lastModified,
    mimeType: file.type || null,
    path,
  };
}

/** Builds pick results from OS `File` objects (drag-and-drop or programmatic). */
export function pickMediaFromFiles(
  files: readonly File[],
  register: (file: File) => MediaHandle,
  resolvePath?: (file: File) => string | null,
): PickMediaResult {
  const picked: PickedMedia[] = [];
  const rejected: RejectedMedia[] = [];
  for (const file of files) {
    const kind = detectMediaKind(file.name, file.type);
    if (!kind) {
      rejected.push({ fileName: file.name, reason: 'Unsupported file type.' });
      continue;
    }
    picked.push({
      handle: register(file),
      kind,
      source: localSourceFromFile(file, resolvePath?.(file) ?? null),
    });
  }
  return { files: picked, rejected };
}
