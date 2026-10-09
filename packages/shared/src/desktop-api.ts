/**
 * Contract between the Electron preload bridge and the renderer.
 *
 * The preload script exposes an object implementing {@link TimelineDesktopApi}
 * as `window.timelineDesktop`. Every method maps to a single, narrowly scoped
 * IPC channel whose arguments are validated in the main process.
 */

export const DESKTOP_API_KEY = 'timelineDesktop';

export const IpcChannel = {
  MediaPick: 'timeline:media:pick',
  MediaResolve: 'timeline:media:resolve',
  MediaProbe: 'timeline:media:probe',
  MediaRelease: 'timeline:media:release',
  ProjectOpen: 'timeline:project:open',
  ProjectSave: 'timeline:project:save',
  WindowSetDocumentState: 'timeline:window:set-document-state',
  ShellOpenExternal: 'timeline:shell:open-external',
} as const;

export type IpcChannel = (typeof IpcChannel)[keyof typeof IpcChannel];

/** Custom protocol used to stream user-granted media files into the renderer. */
export const MEDIA_PROTOCOL = 'timeline-media';

/** A local media file the user granted access to (via dialog or an opened project). */
export interface DesktopMediaFile {
  /** Opaque token identifying the grant in the main process. */
  readonly token: string;
  /** `timeline-media://` URL that streams the file. */
  readonly url: string;
  /** Absolute path on this machine. Stored only as a hint in project files. */
  readonly path: string;
  readonly name: string;
  readonly size: number;
  readonly lastModified: number;
}

/** Metadata extracted with FFprobe in the main process, when available. */
export interface DesktopProbeResult {
  readonly durationSeconds: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly frameRate: { readonly numerator: number; readonly denominator: number } | null;
  readonly hasVideo: boolean;
  readonly hasAudio: boolean;
  readonly videoCodec: string | null;
  readonly audioCodec: string | null;
}

export interface DesktopOpenedProject {
  readonly filePath: string;
  readonly contents: string;
}

export interface DesktopSaveProjectRequest {
  readonly contents: string;
  /** Existing location to overwrite, or `null` to ask the user (Save As). */
  readonly filePath: string | null;
  readonly suggestedName: string;
}

export interface DesktopDocumentState {
  readonly title: string;
  readonly dirty: boolean;
}

export interface TimelineDesktopApi {
  readonly platform: string;
  readonly versions: {
    readonly electron: string;
    readonly chrome: string;
  };
  readonly media: {
    pick(options: { readonly multiple: boolean }): Promise<DesktopMediaFile[]>;
    resolve(path: string): Promise<DesktopMediaFile | null>;
    probe(token: string): Promise<DesktopProbeResult | null>;
    release(token: string): Promise<void>;
  };
  readonly project: {
    open(): Promise<DesktopOpenedProject | null>;
    save(request: DesktopSaveProjectRequest): Promise<{ filePath: string } | null>;
  };
  readonly window: {
    setDocumentState(state: DesktopDocumentState): void;
  };
  readonly shell: {
    openExternal(url: string): Promise<void>;
  };
}
