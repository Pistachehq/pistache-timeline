import { type MediaKind } from '@timeline/core';
import { AUDIO_EXTENSIONS, getExtension, VIDEO_EXTENSIONS } from '@timeline/shared';

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  ogv: 'video/ogg',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  opus: 'audio/opus',
};

/** `accept` attribute value for media file pickers. */
export const MEDIA_ACCEPT = [
  'video/*',
  'audio/*',
  ...[...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS].map((ext) => `.${ext}`),
].join(',');

export function guessMimeType(fileName: string): string | null {
  return MIME_BY_EXTENSION[getExtension(fileName)] ?? null;
}

/** Determines whether a file is video or audio from its MIME type or extension. */
export function detectMediaKind(fileName: string, mimeType?: string | null): MediaKind | null {
  if (mimeType?.startsWith('video/')) return 'video';
  if (mimeType?.startsWith('audio/')) return 'audio';
  const ext = getExtension(fileName);
  if ((VIDEO_EXTENSIONS as readonly string[]).includes(ext)) return 'video';
  if ((AUDIO_EXTENSIONS as readonly string[]).includes(ext)) return 'audio';
  return null;
}
