import { getExtension } from '@timeline/shared';

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
  timeline: 'application/json',
  json: 'application/json',
};

export function mimeFromFileName(fileName: string): string {
  return MIME_BY_EXTENSION[getExtension(fileName)] ?? 'application/octet-stream';
}
