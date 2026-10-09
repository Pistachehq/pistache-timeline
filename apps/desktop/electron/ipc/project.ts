import { dialog, type BrowserWindow } from 'electron';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { collectMediaPaths } from '@timeline/core';
import {
  MAX_PROJECT_FILE_BYTES,
  PROJECT_FILE_EXTENSION,
  type DesktopOpenedProject,
  type DesktopSaveProjectRequest,
} from '@timeline/shared';
import { assertReadableMediaFile, grantForFile } from './grants';
import { isObject, isNonEmptyString } from './validate';

const PROJECT_FILTERS = [{ name: 'Timeline project', extensions: [PROJECT_FILE_EXTENSION] }];

function isSaveRequest(value: unknown): value is DesktopSaveProjectRequest {
  return (
    isObject(value) &&
    isNonEmptyString(value.contents, MAX_PROJECT_FILE_BYTES) &&
    isNonEmptyString(value.suggestedName, 255) &&
    (value.filePath === null || isNonEmptyString(value.filePath))
  );
}

async function grantProjectMedia(contents: string): Promise<void> {
  for (const mediaPath of collectMediaPaths(contents)) {
    try {
      const file = await assertReadableMediaFile(mediaPath);
      grantForFile(file);
    } catch {
      // Offline media is resolved later in the renderer.
    }
  }
}

export async function openProjectFile(window: BrowserWindow): Promise<DesktopOpenedProject | null> {
  const result = await dialog.showOpenDialog(window, {
    title: 'Open Project',
    properties: ['openFile'],
    filters: PROJECT_FILTERS,
  });
  const filePath = result.filePaths[0];
  if (result.canceled || !filePath) return null;
  const info = await stat(filePath);
  if (!info.isFile()) throw new Error('Not a file.');
  if (info.size > MAX_PROJECT_FILE_BYTES) throw new Error('The project file is too large.');
  const contents = await readFile(filePath, 'utf8');
  await grantProjectMedia(contents);
  return { filePath, contents };
}

export async function saveProjectFile(
  window: BrowserWindow,
  request: unknown,
): Promise<{ filePath: string } | null> {
  if (!isSaveRequest(request)) throw new Error('Invalid save request.');
  let filePath = request.filePath;
  if (!filePath) {
    const result = await dialog.showSaveDialog(window, {
      title: 'Save Project',
      defaultPath: request.suggestedName,
      filters: PROJECT_FILTERS,
    });
    if (result.canceled || !result.filePath) return null;
    filePath = result.filePath.endsWith(`.${PROJECT_FILE_EXTENSION}`)
      ? result.filePath
      : `${result.filePath}.${PROJECT_FILE_EXTENSION}`;
  }
  const resolved = path.resolve(filePath);
  await writeFile(resolved, request.contents, 'utf8');
  return { filePath: resolved };
}
