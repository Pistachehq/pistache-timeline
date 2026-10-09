import { type MediaEngine } from '@timeline/media';

/**
 * Opaque description of where a project is stored. Each platform keeps its
 * own data (a file path on desktop, a file handle on the web) in `ref`.
 */
export interface ProjectLocation {
  readonly displayName: string;
  readonly ref: unknown;
}

export interface OpenedProjectFile {
  readonly contents: string;
  readonly location: ProjectLocation;
}

export interface SaveProjectRequest {
  readonly contents: string;
  /** Location to overwrite; `null` asks the user where to save. */
  readonly location: ProjectLocation | null;
  readonly suggestedName: string;
}

/** Platform-specific project persistence (file dialogs, File System Access API…). */
export interface ProjectStorage {
  /** Resolves `null` when the user cancels. */
  open(): Promise<OpenedProjectFile | null>;
  /** Resolves the saved location, or `null` when the user cancels. */
  save(request: SaveProjectRequest): Promise<ProjectLocation | null>;
}

export interface DocumentState {
  readonly title: string;
  readonly dirty: boolean;
}

/** Everything the shared editor needs from its host application. */
export interface EditorPlatform {
  readonly kind: 'web' | 'desktop';
  /** Human readable name shown in the status bar, e.g. "Web" or "Desktop (Windows)". */
  readonly label: string;
  readonly media: MediaEngine;
  readonly storage: ProjectStorage;
  /** Reflects the open document in the window title / unsaved-changes guards. */
  setDocumentState(state: DocumentState): void;
  openExternal(url: string): void;
}
