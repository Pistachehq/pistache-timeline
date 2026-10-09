import {
  type DocumentState,
  type EditorPlatform,
  type OpenedProjectFile,
  type ProjectLocation,
  type ProjectStorage,
} from '@timeline/editor';
import { createDesktopMediaEngine } from '@timeline/media';
import { APP_NAME, DESKTOP_API_KEY, type TimelineDesktopApi } from '@timeline/shared';

function desktopApi(): TimelineDesktopApi {
  const api = window.timelineDesktop;
  if (!api) {
    throw new Error(`${DESKTOP_API_KEY} is not available. The preload bridge did not load.`);
  }
  return api;
}

function createDesktopStorage(api: TimelineDesktopApi): ProjectStorage {
  return {
    async open(): Promise<OpenedProjectFile | null> {
      const opened = await api.project.open();
      if (!opened) return null;
      return {
        contents: opened.contents,
        location: { displayName: fileName(opened.filePath), ref: opened.filePath },
      };
    },
    async save(request): Promise<ProjectLocation | null> {
      const existingPath = typeof request.location?.ref === 'string' ? request.location.ref : null;
      const saved = await api.project.save({
        contents: request.contents,
        filePath: existingPath,
        suggestedName: request.suggestedName,
      });
      if (!saved) return null;
      return { displayName: fileName(saved.filePath), ref: saved.filePath };
    },
  };
}

function fileName(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] ?? filePath;
}

function platformLabel(api: TimelineDesktopApi): string {
  switch (api.platform) {
    case 'win32':
      return 'Desktop (Windows)';
    case 'darwin':
      return 'Desktop (macOS)';
    case 'linux':
      return 'Desktop (Linux)';
    default:
      return `Desktop (${api.platform})`;
  }
}

/** Electron renderer host: native dialogs and FFprobe run in the main process. */
export function createDesktopPlatform(): EditorPlatform {
  const api = desktopApi();
  return {
    kind: 'desktop',
    label: platformLabel(api),
    media: createDesktopMediaEngine(api.media),
    storage: createDesktopStorage(api),
    setDocumentState(state: DocumentState) {
      document.title = state.title || APP_NAME;
      api.window.setDocumentState(state);
    },
    openExternal(url: string) {
      void api.shell.openExternal(url);
    },
  };
}
