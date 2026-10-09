import { dialog, type BrowserWindow } from 'electron';
import { AUDIO_EXTENSIONS, VIDEO_EXTENSIONS, type DesktopMediaFile } from '@timeline/shared';
import { assertReadableMediaFile, getGrant, grantForFile, releaseGrant, toDesktopFile } from './grants';
import { probeWithFfprobe } from './probe';
import { isBoolean, isObject, requireNonEmptyString } from './validate';

const MEDIA_FILTERS = [
  {
    name: 'Media',
    extensions: [...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS],
  },
  { name: 'Video', extensions: [...VIDEO_EXTENSIONS] },
  { name: 'Audio', extensions: [...AUDIO_EXTENSIONS] },
];

export async function pickMediaFiles(
  window: BrowserWindow,
  options: unknown,
): Promise<DesktopMediaFile[]> {
  if (!isObject(options) || !isBoolean(options.multiple)) {
    throw new Error('Invalid pick options.');
  }
  const result = await dialog.showOpenDialog(window, {
    title: 'Import Media',
    properties: options.multiple ? ['openFile', 'multiSelections'] : ['openFile'],
    filters: MEDIA_FILTERS,
  });
  if (result.canceled) return [];
  const files: DesktopMediaFile[] = [];
  for (const filePath of result.filePaths) {
    const file = await assertReadableMediaFile(filePath);
    files.push(toDesktopFile(grantForFile(file)));
  }
  return files;
}

export async function resolveMediaPath(filePath: unknown): Promise<DesktopMediaFile | null> {
  const resolved = requireNonEmptyString(filePath, 'path');
  try {
    const file = await assertReadableMediaFile(resolved);
    return toDesktopFile(grantForFile(file));
  } catch {
    return null;
  }
}

export async function probeGrantedMedia(token: unknown) {
  const grant = getGrant(requireNonEmptyString(token, 'token', 128));
  if (!grant) return null;
  return probeWithFfprobe(grant.path);
}

export function releaseGrantedMedia(token: unknown): void {
  releaseGrant(requireNonEmptyString(token, 'token', 128));
}
