import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { MEDIA_EXTENSIONS, MEDIA_PROTOCOL, createId } from '@timeline/shared';
import { mimeFromFileName } from './mime';

export interface MediaGrant {
  readonly token: string;
  readonly path: string;
  readonly name: string;
  readonly size: number;
  readonly lastModified: number;
}

const grants = new Map<string, MediaGrant>();

function isSupportedMedia(fileName: string): boolean {
  const extension = path.extname(fileName).slice(1).toLowerCase();
  return MEDIA_EXTENSIONS.includes(extension);
}

export async function assertReadableMediaFile(filePath: string): Promise<{
  path: string;
  name: string;
  size: number;
  lastModified: number;
}> {
  const resolved = path.resolve(filePath);
  if (resolved.includes('\0') || resolved.length > 4096) throw new Error('Invalid path.');
  const info = await stat(resolved);
  if (!info.isFile()) throw new Error('Not a file.');
  if (!isSupportedMedia(resolved)) throw new Error('Unsupported file type.');
  return {
    path: resolved,
    name: path.basename(resolved),
    size: info.size,
    lastModified: Math.trunc(info.mtimeMs),
  };
}

export function grantForFile(file: {
  path: string;
  name: string;
  size: number;
  lastModified: number;
}): MediaGrant {
  for (const existing of grants.values()) {
    if (existing.path === file.path) return existing;
  }
  const grant: MediaGrant = {
    token: createId('grant'),
    path: file.path,
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
  };
  grants.set(grant.token, grant);
  return grant;
}

export function getGrant(token: string): MediaGrant | undefined {
  return grants.get(token);
}

export function releaseGrant(token: string): void {
  grants.delete(token);
}

export function releaseAllGrants(): void {
  grants.clear();
}

export function mediaUrl(token: string): string {
  return `${MEDIA_PROTOCOL}://media/${token}`;
}

export function toDesktopFile(grant: MediaGrant) {
  return {
    token: grant.token,
    url: mediaUrl(grant.token),
    path: grant.path,
    name: grant.name,
    size: grant.size,
    lastModified: grant.lastModified,
  };
}

function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const startToken = match[1];
  const endToken = match[2];
  let start = startToken ? Number(startToken) : 0;
  let end = endToken ? Number(endToken) : size - 1;
  if (startToken === '' && endToken) {
    const suffix = Number(endToken);
    start = Math.max(0, size - suffix);
    end = size - 1;
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end >= size || start > end) {
    return null;
  }
  return { start, end };
}

/** Serves a granted media file, including HTTP Range requests required for seeking. */
export async function responseForMediaRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = url.pathname.replace(/^\/+/, '');
  const grant = token ? grants.get(token) : undefined;
  if (!grant) return new Response('Not found', { status: 404 });

  const info = await stat(grant.path).catch(() => null);
  if (!info?.isFile()) return new Response('Gone', { status: 410 });

  const size = info.size;
  const type = mimeFromFileName(grant.name);
  const range = parseRange(request.headers.get('range'), size);
  const headers = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Range',
    'Cache-Control': 'no-store',
  };

  if (range) {
    const { start, end } = range;
    const stream = createReadStream(grant.path, { start, end });
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        ...headers,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${size}`,
      },
    });
  }

  const stream = createReadStream(grant.path);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: 200,
    headers: {
      ...headers,
      'Content-Length': String(size),
    },
  });
}
