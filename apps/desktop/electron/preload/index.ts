import { contextBridge, ipcRenderer } from 'electron';
import {
  DESKTOP_API_KEY,
  IpcChannel,
  type DesktopDocumentState,
  type DesktopSaveProjectRequest,
  type TimelineDesktopApi,
} from '@timeline/shared';

const api: TimelineDesktopApi = {
  platform: process.platform,
  versions: {
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? '',
  },
  media: {
    pick: (options) => ipcRenderer.invoke(IpcChannel.MediaPick, options),
    resolve: (filePath) => ipcRenderer.invoke(IpcChannel.MediaResolve, filePath),
    probe: (token) => ipcRenderer.invoke(IpcChannel.MediaProbe, token),
    release: (token) => ipcRenderer.invoke(IpcChannel.MediaRelease, token),
  },
  project: {
    open: () => ipcRenderer.invoke(IpcChannel.ProjectOpen),
    save: (request: DesktopSaveProjectRequest) => ipcRenderer.invoke(IpcChannel.ProjectSave, request),
  },
  window: {
    setDocumentState: (state: DesktopDocumentState) => {
      ipcRenderer.send(IpcChannel.WindowSetDocumentState, state);
    },
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke(IpcChannel.ShellOpenExternal, url),
  },
};

contextBridge.exposeInMainWorld(DESKTOP_API_KEY, api);
