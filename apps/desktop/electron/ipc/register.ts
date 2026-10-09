import { ipcMain, shell, type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { IpcChannel, type DesktopDocumentState } from '@timeline/shared';
import { pickMediaFiles, probeGrantedMedia, releaseGrantedMedia, resolveMediaPath } from './media';
import { openProjectFile, saveProjectFile } from './project';
import { isNonEmptyString, isObject } from './validate';

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isDocumentState(value: unknown): value is DesktopDocumentState {
  return isObject(value) && isNonEmptyString(value.title, 512) && typeof value.dirty === 'boolean';
}

/**
 * Registers the narrowly scoped IPC handlers used by the preload bridge.
 * Every incoming payload is validated before any native operation runs.
 */
export function registerIpcHandlers(
  window: BrowserWindow,
  onDocumentState: (state: DesktopDocumentState) => void,
): void {
  const assertSender = (event: IpcMainInvokeEvent | IpcMainEvent) => {
    if (event.sender !== window.webContents) throw new Error('Unauthorized IPC sender.');
  };

  ipcMain.handle(IpcChannel.MediaPick, (event, options: unknown) => {
    assertSender(event);
    return pickMediaFiles(window, options);
  });
  ipcMain.handle(IpcChannel.MediaResolve, (event, filePath: unknown) => {
    assertSender(event);
    return resolveMediaPath(filePath);
  });
  ipcMain.handle(IpcChannel.MediaProbe, (event, token: unknown) => {
    assertSender(event);
    return probeGrantedMedia(token);
  });
  ipcMain.handle(IpcChannel.MediaRelease, (event, token: unknown) => {
    assertSender(event);
    releaseGrantedMedia(token);
  });
  ipcMain.handle(IpcChannel.ProjectOpen, (event) => {
    assertSender(event);
    return openProjectFile(window);
  });
  ipcMain.handle(IpcChannel.ProjectSave, (event, request: unknown) => {
    assertSender(event);
    return saveProjectFile(window, request);
  });
  ipcMain.handle(IpcChannel.ShellOpenExternal, async (event, url: unknown) => {
    assertSender(event);
    if (!isNonEmptyString(url, 2048) || !isHttpsUrl(url)) {
      throw new Error('Only https URLs can be opened.');
    }
    await shell.openExternal(url);
  });
  ipcMain.on(IpcChannel.WindowSetDocumentState, (event, state: unknown) => {
    assertSender(event);
    if (isDocumentState(state)) onDocumentState(state);
  });
}

const INVOKE_CHANNELS = [
  IpcChannel.MediaPick,
  IpcChannel.MediaResolve,
  IpcChannel.MediaProbe,
  IpcChannel.MediaRelease,
  IpcChannel.ProjectOpen,
  IpcChannel.ProjectSave,
  IpcChannel.ShellOpenExternal,
] as const;

export function unregisterIpcHandlers(): void {
  for (const channel of INVOKE_CHANNELS) ipcMain.removeHandler(channel);
  ipcMain.removeAllListeners(IpcChannel.WindowSetDocumentState);
}
