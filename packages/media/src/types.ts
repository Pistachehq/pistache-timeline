import {
  type FrameRate,
  type MediaKind,
  type MediaSourceRef,
  type Project,
  type SequenceId,
} from '@timeline/core';

/*
 * The editor talks to media exclusively through these interfaces. Platform
 * adapters (browser, desktop) implement them with the best native tools
 * available; they do not need to share low-level implementations.
 */

/**
 * A live, playable reference to a media file for the current session.
 * Handles are runtime-only and must never be persisted in project files.
 */
export interface MediaHandle {
  readonly id: string;
  /** URL usable by native media elements (`blob:` or `timeline-media:`). */
  readonly url: string;
}

/** A file the user selected for import. */
export interface PickedMedia {
  readonly handle: MediaHandle;
  readonly kind: MediaKind;
  readonly source: MediaSourceRef;
  /** Parent folder names from a directory import (excluding the file name). */
  readonly binPath: readonly string[];
}

export interface RejectedMedia {
  readonly fileName: string;
  readonly reason: string;
}

export interface PickMediaResult {
  readonly files: readonly PickedMedia[];
  readonly rejected: readonly RejectedMedia[];
}

export interface PickMediaOptions {
  readonly multiple: boolean;
}

export interface MediaMetadata {
  readonly durationSeconds: number;
  readonly hasVideo: boolean;
  readonly hasAudio: boolean;
  readonly width: number | null;
  readonly height: number | null;
  readonly frameRate: FrameRate | null;
  readonly videoCodec: string | null;
  readonly audioCodec: string | null;
  /** Which backend produced the metadata, e.g. `media-element` or `ffprobe`. */
  readonly probedBy: string;
}

export interface ThumbnailRequest {
  readonly timeSeconds: number;
  readonly maxWidth: number;
  readonly signal?: AbortSignal;
}

export interface Thumbnail {
  /** Small encoded image (data URL). Decoded frames are not retained. */
  readonly url: string;
  readonly width: number;
  readonly height: number;
}

/**
 * Plays one media source at a time on a native media element. The sequence
 * playback controller drives it; the player itself knows nothing about
 * timelines.
 */
export interface MediaPlayer {
  readonly element: HTMLMediaElement;
  /** URL of the loaded source, or `null` when empty. */
  readonly source: string | null;
  readonly currentTime: number;
  readonly paused: boolean;
  /** Whether the current source has enough data to render a frame. */
  readonly ready: boolean;
  load(handle: MediaHandle | null): void;
  seek(seconds: number): void;
  play(): Promise<void>;
  pause(): void;
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
  dispose(): void;
}

export interface ExportFormat {
  readonly container: 'mp4' | 'webm' | 'mov';
  readonly videoCodec: string;
  readonly audioCodec: string;
}

/** Render size and frame rate for export (may differ from the sequence settings). */
export interface ExportOutputSettings {
  readonly width: number;
  readonly height: number;
  readonly frameRate: FrameRate;
}

export interface ExportRequest {
  readonly project: Project;
  readonly sequenceId: SequenceId;
  readonly format: ExportFormat;
  readonly output: ExportOutputSettings;
}

export interface ExportProgress {
  readonly phase: 'preparing' | 'audio' | 'rendering' | 'finalizing';
  /** 0–1. */
  readonly progress: number;
}

export interface ExportOptions {
  readonly onProgress?: (progress: ExportProgress) => void;
  readonly signal?: AbortSignal;
}

export interface ExportResult {
  readonly displayName: string;
  /** True when the video frames were encoded with a hardware H.264 encoder. */
  readonly hardwareAccelerated: boolean;
}

export interface MediaCapabilities {
  /** Backend used to read metadata. */
  readonly metadata: 'media-element' | 'ffprobe-with-fallback';
  /** Whether the user can re-open previously referenced files without a picker. */
  readonly persistentFileAccess: boolean;
  readonly thumbnails: boolean;
  /** Frame-accurate decoding (WebCodecs / FFmpeg). Not implemented yet. */
  readonly frameDecoding: boolean;
  /** Rendering a sequence to a file (H.264 or WebM via WebCodecs where supported). */
  readonly export: boolean;
}

export interface MediaEngine {
  readonly platform: 'web' | 'desktop';
  readonly capabilities: MediaCapabilities;

  /** Lets the user choose media files. Must be called from a user gesture on the web. */
  pickMedia(options: PickMediaOptions): Promise<PickMediaResult>;
  /** Chooses a folder and imports supported audio, video, and image files inside it. */
  pickMediaFolder(): Promise<PickMediaResult>;
  /** Registers files from drag-and-drop or other OS delivery (no file picker). */
  importLocalFiles(files: readonly File[]): Promise<PickMediaResult>;
  /** Re-opens a referenced file. Resolves `null` when it is not accessible (offline). */
  resolve(source: MediaSourceRef): Promise<MediaHandle | null>;
  probe(handle: MediaHandle, kind: MediaKind, signal?: AbortSignal): Promise<MediaMetadata>;
  createThumbnail(handle: MediaHandle, request: ThumbnailRequest, kind?: MediaKind): Promise<Thumbnail | null>;
  createPlayer(element: HTMLMediaElement): MediaPlayer;
  exportSequence(request: ExportRequest, options?: ExportOptions): Promise<ExportResult>;
  /** Frees resources (object URLs, file grants) associated with a handle. */
  release(handle: MediaHandle): void;
  /** Releases every resource held by the engine. */
  dispose(): void;
}
