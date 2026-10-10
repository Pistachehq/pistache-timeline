import { createId } from '@timeline/shared';
import { type FrameRate, type MediaTime } from '../time/rational';
import { EMPTY_CLIP_ANIMATION } from './animation';
import { type ClipText } from './text';
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_CLIP_AUDIO,
  DEFAULT_CLIP_EFFECTS,
  DEFAULT_CLIP_TRANSFORM,
  DEFAULT_CLIP_TRANSITIONS,
  DEFAULT_PROJECT_NAME,
  DEFAULT_SEQUENCE_SETTINGS,
} from './defaults';
import {
  type AudioTrack,
  type Clip,
  type ClipId,
  type MediaAsset,
  type MediaAssetId,
  type MediaBinFolderId,
  type MediaKind,
  type MediaSourceRef,
  type MetadataValue,
  type Project,
  type ProjectId,
  type Resolution,
  type Sequence,
  type SequenceId,
  type TrackId,
  type TrackKind,
  type VideoTrack,
} from './types';

export const newProjectId = (): ProjectId => createId('project') as ProjectId;
export const newSequenceId = (): SequenceId => createId('seq') as SequenceId;
export const newTrackId = (): TrackId => createId('track') as TrackId;
export const newClipId = (): ClipId => createId('clip') as ClipId;
export const newMediaAssetId = (): MediaAssetId => createId('asset') as MediaAssetId;
export const newMediaBinFolderId = (): MediaBinFolderId => createId('bin') as MediaBinFolderId;

export function trackName(kind: TrackKind, index: number): string {
  return `${kind === 'video' ? 'V' : 'A'}${index + 1}`;
}

export function createVideoTrack(index: number, id: TrackId = newTrackId()): VideoTrack {
  return {
    id,
    kind: 'video',
    name: trackName('video', index),
    enabled: true,
    locked: false,
    visible: true,
    clipIds: [],
  };
}

export function createAudioTrack(index: number, id: TrackId = newTrackId()): AudioTrack {
  return {
    id,
    kind: 'audio',
    name: trackName('audio', index),
    enabled: true,
    locked: false,
    muted: false,
    volume: 100,
    clipIds: [],
  };
}

export interface CreateSequenceOptions {
  readonly id?: SequenceId;
  readonly name?: string;
  readonly resolution?: Resolution;
  readonly frameRate?: FrameRate;
  readonly videoTrackCount?: number;
  readonly audioTrackCount?: number;
}

export function createSequence(options: CreateSequenceOptions = {}): Sequence {
  const videoTrackCount = options.videoTrackCount ?? DEFAULT_SEQUENCE_SETTINGS.videoTrackCount;
  const audioTrackCount = options.audioTrackCount ?? DEFAULT_SEQUENCE_SETTINGS.audioTrackCount;
  return {
    id: options.id ?? newSequenceId(),
    name: options.name ?? DEFAULT_SEQUENCE_SETTINGS.name,
    resolution: options.resolution ?? DEFAULT_SEQUENCE_SETTINGS.resolution,
    frameRate: options.frameRate ?? DEFAULT_SEQUENCE_SETTINGS.frameRate,
    videoTracks: Array.from({ length: videoTrackCount }, (_, i) => createVideoTrack(i)),
    audioTracks: Array.from({ length: audioTrackCount }, (_, i) => createAudioTrack(i)),
    clips: {},
  };
}

export interface CreateProjectOptions {
  readonly id?: ProjectId;
  readonly name?: string;
  readonly now?: Date;
  readonly sequence?: CreateSequenceOptions;
}

/** Creates an empty project containing one default sequence. */
export function createProject(options: CreateProjectOptions = {}): Project {
  const timestamp = (options.now ?? new Date()).toISOString();
  const sequence = createSequence(options.sequence);
  return {
    id: options.id ?? newProjectId(),
    name: options.name ?? DEFAULT_PROJECT_NAME,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: timestamp,
    modifiedAt: timestamp,
    mediaAssets: {},
    mediaBinFolders: {},
    sequences: { [sequence.id]: sequence },
    activeSequenceId: sequence.id,
  };
}

export interface CreateMediaAssetOptions {
  readonly id?: MediaAssetId;
  readonly name: string;
  readonly kind: MediaKind;
  readonly source: MediaSourceRef;
  readonly duration: MediaTime;
  readonly hasVideo: boolean;
  readonly hasAudio: boolean;
  readonly resolution?: Resolution | null;
  readonly frameRate?: FrameRate | null;
  readonly metadata?: Readonly<Record<string, MetadataValue>>;
  readonly folderId?: MediaBinFolderId | null;
  readonly now?: Date;
}

export function createMediaAsset(options: CreateMediaAssetOptions): MediaAsset {
  return {
    id: options.id ?? newMediaAssetId(),
    name: options.name,
    kind: options.kind,
    folderId: options.folderId ?? null,
    source: options.source,
    duration: options.duration,
    hasVideo: options.hasVideo,
    hasAudio: options.hasAudio,
    resolution: options.resolution ?? null,
    frameRate: options.frameRate ?? null,
    metadata: options.metadata ?? {},
    importedAt: (options.now ?? new Date()).toISOString(),
  };
}

export interface CreateClipOptions {
  readonly id?: ClipId;
  readonly assetId: MediaAssetId | null;
  readonly text?: ClipText | null;
  readonly trackId: TrackId;
  readonly name: string;
  readonly start: number;
  readonly sourceIn: number;
  readonly sourceOut: number;
  readonly linkId?: ClipId | null;
  readonly captionSourceId?: ClipId | null;
}

export function createClip(options: CreateClipOptions): Clip {
  return {
    id: options.id ?? newClipId(),
    assetId: options.assetId,
    text: options.text ?? null,
    trackId: options.trackId,
    name: options.name,
    enabled: true,
    start: options.start,
    sourceIn: options.sourceIn,
    sourceOut: options.sourceOut,
    speed: 100,
    transform: DEFAULT_CLIP_TRANSFORM,
    animation: EMPTY_CLIP_ANIMATION,
    audio: DEFAULT_CLIP_AUDIO,
    transitions: DEFAULT_CLIP_TRANSITIONS,
    effects: DEFAULT_CLIP_EFFECTS,
    linkId: options.linkId ?? null,
    captionSourceId: options.captionSourceId ?? null,
  };
}
