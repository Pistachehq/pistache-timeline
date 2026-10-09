import { type FrameRate, type MediaTime } from '../time/rational';

/*
 * Timeline project model.
 *
 * Time units and invariants:
 * - All positions on a sequence (`Clip.start`) are integer frames in the
 *   sequence's frame rate. Frame 0 is the start of the sequence.
 * - `Clip.sourceIn` / `Clip.sourceOut` are integer frame offsets into the
 *   source media, also expressed in the sequence frame rate. The range is
 *   half-open: `[sourceIn, sourceOut)`, so the clip duration is
 *   `sourceOut - sourceIn` and is always > 0.
 * - Clips on the same track never overlap and `Track.clipIds` is ordered by
 *   `Clip.start`. Every clip belongs to exactly one track and its `trackId`
 *   matches that track.
 * - Media durations use exact rational time (`MediaTime`) because their
 *   native timebase is independent of any sequence.
 * - All model objects are immutable. Editing operations return new objects
 *   and share unchanged branches structurally.
 */

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type ProjectId = Brand<string, 'ProjectId'>;
export type SequenceId = Brand<string, 'SequenceId'>;
export type TrackId = Brand<string, 'TrackId'>;
export type ClipId = Brand<string, 'ClipId'>;
export type MediaAssetId = Brand<string, 'MediaAssetId'>;
export type MediaBinFolderId = Brand<string, 'MediaBinFolderId'>;

export type TrackKind = 'video' | 'audio';
export type MediaKind = 'video' | 'audio' | 'image';

export interface Resolution {
  readonly width: number;
  readonly height: number;
}

/**
 * Portable description of where a media asset came from. It intentionally
 * contains no browser object URLs. `path` is an optional, machine-specific
 * hint used by the desktop app; the file name, size and modification time
 * allow the media to be relinked on any machine.
 */
export interface LocalFileSource {
  readonly kind: 'local-file';
  readonly fileName: string;
  readonly size: number;
  readonly lastModified: number;
  readonly mimeType: string | null;
  readonly path: string | null;
}

export type MediaSourceRef = LocalFileSource;

export type MetadataValue = string | number | boolean | null;

/** User-defined folder in the project media bin (`null` parent = top level). */
export interface MediaBinFolder {
  readonly id: MediaBinFolderId;
  readonly name: string;
  readonly parentId: MediaBinFolderId | null;
}

export interface MediaAsset {
  readonly id: MediaAssetId;
  readonly name: string;
  readonly kind: MediaKind;
  /** Folder in the project bin; `null` = bin root. */
  readonly folderId: MediaBinFolderId | null;
  readonly source: MediaSourceRef;
  readonly duration: MediaTime;
  readonly hasVideo: boolean;
  readonly hasAudio: boolean;
  /** Pixel dimensions; `null` for audio-only media. */
  readonly resolution: Resolution | null;
  /** Native frame rate when known; browsers cannot always report it. */
  readonly frameRate: FrameRate | null;
  /** Additional probed metadata such as codecs. */
  readonly metadata: Readonly<Record<string, MetadataValue>>;
  readonly importedAt: string;
}

export interface ClipTransform {
  /** Offset from the frame centre, in sequence pixels. */
  readonly positionX: number;
  readonly positionY: number;
  /** Horizontal scale in percent of the letterboxed media box (100 = original). */
  readonly scaleX: number;
  /** Vertical scale in percent of the letterboxed media box (100 = original). */
  readonly scaleY: number;
  /** When true, scale X and Y stay equal (uniform scaling). */
  readonly uniformScale: boolean;
  /** Rotation in degrees, clockwise. */
  readonly rotation: number;
  /** Opacity in percent, 0–100. */
  readonly opacity: number;
}

export interface ClipAudio {
  /** Linear volume in percent (100 = 0 dB, up to ~400 ≈ +12 dB). */
  readonly volume: number;
  readonly muted: boolean;
  /** Stereo balance, -100 (left) to 100 (right). */
  readonly pan: number;
}

export interface Clip {
  readonly id: ClipId;
  readonly assetId: MediaAssetId;
  readonly trackId: TrackId;
  readonly name: string;
  readonly enabled: boolean;
  /** First frame of the clip on the sequence. */
  readonly start: number;
  /** Inclusive source in-point, in sequence frames. */
  readonly sourceIn: number;
  /** Exclusive source out-point, in sequence frames. */
  readonly sourceOut: number;
  readonly transform: ClipTransform;
  readonly audio: ClipAudio;
  /** Optional paired clip on the other kind of track (video ↔ audio). */
  readonly linkId: ClipId | null;
}

interface TrackBase {
  readonly id: TrackId;
  readonly name: string;
  /** Disabled tracks are excluded from playback and export. */
  readonly enabled: boolean;
  /** Locked tracks reject all edits to their clips. */
  readonly locked: boolean;
  /** Clip identifiers ordered by `Clip.start`. */
  readonly clipIds: readonly ClipId[];
}

export interface VideoTrack extends TrackBase {
  readonly kind: 'video';
  readonly visible: boolean;
}

export interface AudioTrack extends TrackBase {
  readonly kind: 'audio';
  readonly muted: boolean;
  /** Track fader in percent, 0–100 (100% = 0 dB). */
  readonly volume: number;
}

export type Track = VideoTrack | AudioTrack;

export interface Sequence {
  readonly id: SequenceId;
  readonly name: string;
  readonly resolution: Resolution;
  readonly frameRate: FrameRate;
  /** Video tracks from bottom (V1, index 0) to top. Higher tracks cover lower ones. */
  readonly videoTracks: readonly VideoTrack[];
  /** Audio tracks from A1 (index 0) downwards. */
  readonly audioTracks: readonly AudioTrack[];
  readonly clips: Readonly<Record<ClipId, Clip>>;
}

export interface Project {
  readonly id: ProjectId;
  readonly name: string;
  readonly schemaVersion: number;
  readonly createdAt: string;
  readonly modifiedAt: string;
  readonly mediaAssets: Readonly<Record<MediaAssetId, MediaAsset>>;
  readonly mediaBinFolders: Readonly<Record<MediaBinFolderId, MediaBinFolder>>;
  readonly sequences: Readonly<Record<SequenceId, Sequence>>;
  readonly activeSequenceId: SequenceId;
}
