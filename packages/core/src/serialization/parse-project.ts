import { type FrameRate, type MediaTime } from '../time/rational';
import {
  AUDIO_FADE_CURVES,
  DEFAULT_CLIP_EFFECTS,
  DEFAULT_CLIP_TRANSITIONS,
  VIDEO_EFFECT_KINDS,
  VIDEO_TRANSITION_KINDS,
  type AudioEffect,
  type ClipEdgeTransition,
  type ClipEffects,
  type ClipTransitions,
  type EffectRegion,
  type VideoEffect,
} from '../model/effects';
import {
  type AudioTrack,
  type Clip,
  type ClipId,
  type ClipTransform,
  type MediaBinFolder,
  type MediaBinFolderId,
  type MediaAsset,
  type MediaAssetId,
  type MetadataValue,
  type Project,
  type ProjectId,
  type Resolution,
  type Sequence,
  type SequenceId,
  type TrackId,
  type VideoTrack,
} from '../model/types';
import {
  invalid,
  isObject,
  type JsonObject,
  readArray,
  readBoolean,
  readEnum,
  readInteger,
  readNullableString,
  readNumber,
  readObject,
  readString,
} from './reader';

function parseResolution(value: unknown, path: string): Resolution {
  const obj = readObject(value, path);
  return { width: readInteger(obj, 'width', path, 1), height: readInteger(obj, 'height', path, 1) };
}

function parseFrameRate(value: unknown, path: string): FrameRate {
  const obj = readObject(value, path);
  return {
    numerator: readInteger(obj, 'numerator', path, 1),
    denominator: readInteger(obj, 'denominator', path, 1),
  };
}

function parseMediaTime(value: unknown, path: string): MediaTime {
  const obj = readObject(value, path);
  return { value: readInteger(obj, 'value', path, 0), timescale: readInteger(obj, 'timescale', path, 1) };
}

function parseMetadata(value: unknown, path: string): Record<string, MetadataValue> {
  if (value === undefined) return {};
  const obj = readObject(value, path);
  const result: Record<string, MetadataValue> = {};
  for (const [key, entry] of Object.entries(obj)) {
    if (key === '__proto__') throw invalid(`${path}.${key}`, 'a regular key');
    if (entry === null || ['string', 'number', 'boolean'].includes(typeof entry)) {
      result[key] = entry as MetadataValue;
    } else {
      throw invalid(`${path}.${key}`, 'a primitive value');
    }
  }
  return result;
}

function parseMediaAsset(value: unknown, path: string): MediaAsset {
  const obj = readObject(value, path);
  const sourcePath = `${path}.source`;
  const source = readObject(obj.source, sourcePath);
  readEnum(source, 'kind', sourcePath, ['local-file']);
  return {
    id: readString(obj, 'id', path) as MediaAssetId,
    name: readString(obj, 'name', path),
    kind: readEnum(obj, 'kind', path, ['video', 'audio', 'image']),
    source: {
      kind: 'local-file',
      fileName: readString(source, 'fileName', sourcePath),
      size: readInteger(source, 'size', sourcePath),
      lastModified: readInteger(source, 'lastModified', sourcePath),
      mimeType: readNullableString(source, 'mimeType', sourcePath),
      path: readNullableString(source, 'path', sourcePath),
    },
    duration: parseMediaTime(obj.duration, `${path}.duration`),
    hasVideo: readBoolean(obj, 'hasVideo', path),
    hasAudio: readBoolean(obj, 'hasAudio', path),
    resolution: obj.resolution == null ? null : parseResolution(obj.resolution, `${path}.resolution`),
    frameRate: obj.frameRate == null ? null : parseFrameRate(obj.frameRate, `${path}.frameRate`),
    metadata: parseMetadata(obj.metadata, `${path}.metadata`),
    importedAt: readString(obj, 'importedAt', path),
    folderId:
      obj.folderId == null ? null : (readString(obj, 'folderId', path) as MediaBinFolderId),
  };
}

function parseMediaBinFolder(value: unknown, path: string): MediaBinFolder {
  const obj = readObject(value, path);
  return {
    id: readString(obj, 'id', path) as MediaBinFolderId,
    name: readString(obj, 'name', path),
    parentId:
      obj.parentId == null ? null : (readString(obj, 'parentId', path) as MediaBinFolderId),
  };
}

function parseClipTransform(value: unknown, path: string): ClipTransform {
  const transform = readObject(value, path);
  const positionX = readNumber(transform, 'positionX', path);
  const positionY = readNumber(transform, 'positionY', path);
  const rotation = readNumber(transform, 'rotation', path);
  const opacity = readNumber(transform, 'opacity', path);
  let scaleX: number;
  let scaleY: number;
  if (isObject(transform) && 'scaleX' in transform && 'scaleY' in transform) {
    scaleX = readNumber(transform, 'scaleX', path);
    scaleY = readNumber(transform, 'scaleY', path);
  } else {
    const scale = readNumber(transform, 'scale', path);
    scaleX = scale;
    scaleY = scale;
  }
  const uniformScale =
    transform.uniformScale === undefined ? true : readBoolean(transform, 'uniformScale', path);
  return { positionX, positionY, scaleX, scaleY, uniformScale, rotation, opacity };
}

function parseClipEdgeTransition(value: unknown, path: string): ClipEdgeTransition | null {
  if (value == null) return null;
  const obj = readObject(value, path);
  const videoKind = readEnum(obj, 'videoKind', `${path}.videoKind`, [...VIDEO_TRANSITION_KINDS]);
  if (videoKind === 'none') return null;
  const libraryId =
    videoKind === 'library' && typeof obj.libraryId === 'string'
      ? readString(obj, 'libraryId', path)
      : null;
  return {
    durationFrames: readInteger(obj, 'durationFrames', path, 0),
    videoKind,
    libraryId,
    audioCurve: readEnum(obj, 'audioCurve', `${path}.audioCurve`, [...AUDIO_FADE_CURVES]),
    ...(obj.affectsVideo === false ? { affectsVideo: false } : {}),
  };
}

function parseClipTransitions(value: unknown, path: string): ClipTransitions {
  if (value == null) return DEFAULT_CLIP_TRANSITIONS;
  const obj = readObject(value, path);
  return {
    in: parseClipEdgeTransition(obj.in, `${path}.in`),
    out: parseClipEdgeTransition(obj.out, `${path}.out`),
  };
}

function parseEffectRegion(value: unknown, path: string): EffectRegion | null {
  if (value == null) return null;
  const obj = readObject(value, path);
  return {
    top: readNumber(obj, 'top', path),
    right: readNumber(obj, 'right', path),
    bottom: readNumber(obj, 'bottom', path),
    left: readNumber(obj, 'left', path),
    internal: obj.internal === undefined ? true : readBoolean(obj, 'internal', path),
  };
}

function parseVideoEffect(value: unknown, path: string): VideoEffect {
  const obj = readObject(value, path);
  const kind = readEnum(obj, 'kind', `${path}.kind`, [...VIDEO_EFFECT_KINDS]);
  switch (kind) {
    case 'blur':
      return { kind, amount: readNumber(obj, 'amount', path), region: parseEffectRegion(obj.region, `${path}.region`) };
    case 'brightness':
    case 'contrast':
    case 'saturation':
    case 'sharpen':
      return { kind, amount: readNumber(obj, 'amount', path) };
    case 'hue-rotate':
      return { kind, degrees: readNumber(obj, 'degrees', path) };
    case 'vignette':
      return { kind, amount: readNumber(obj, 'amount', path) };
    case 'crop':
      return {
        kind,
        top: readNumber(obj, 'top', path),
        right: readNumber(obj, 'right', path),
        bottom: readNumber(obj, 'bottom', path),
        left: readNumber(obj, 'left', path),
      };
    case 'round-corners':
      return { kind, radius: readNumber(obj, 'radius', path) };
    case 'brightness-contrast':
      return {
        kind,
        brightness: readNumber(obj, 'brightness', path),
        contrast: readNumber(obj, 'contrast', path),
      };
    case 'library':
      return {
        kind,
        libraryId: readString(obj, 'libraryId', path),
        amount: obj.amount === undefined ? 100 : readNumber(obj, 'amount', path),
      };
    default:
      throw invalid(path, 'a supported video effect');
  }
}

function parseAudioEffect(value: unknown, path: string): AudioEffect {
  const obj = readObject(value, path);
  const kind = readEnum(obj, 'kind', `${path}.kind`, [
    'gain',
    'highpass',
    'lowpass',
    'compressor',
    'noise-gate',
    'limiter',
  ]);
  switch (kind) {
    case 'gain':
      return { kind, gainDb: readNumber(obj, 'gainDb', path) };
    case 'highpass':
    case 'lowpass':
      return { kind, frequencyHz: readNumber(obj, 'frequencyHz', path) };
    case 'compressor':
      return {
        kind,
        thresholdDb: readNumber(obj, 'thresholdDb', path),
        ratio: readNumber(obj, 'ratio', path),
        attackMs: readNumber(obj, 'attackMs', path),
        releaseMs: readNumber(obj, 'releaseMs', path),
      };
    case 'noise-gate':
      return { kind, thresholdDb: readNumber(obj, 'thresholdDb', path) };
    case 'limiter':
      return { kind, ceilingDb: readNumber(obj, 'ceilingDb', path) };
    default:
      throw invalid(path, 'a supported audio effect');
  }
}

function parseClipEffects(value: unknown, path: string): ClipEffects {
  if (value == null) return DEFAULT_CLIP_EFFECTS;
  const obj = readObject(value, path);
  return {
    video: readArray(obj.video, `${path}.video`).map((item, i) => parseVideoEffect(item, `${path}.video[${i}]`)),
    audio: readArray(obj.audio, `${path}.audio`).map((item, i) => parseAudioEffect(item, `${path}.audio[${i}]`)),
  };
}

function parseClip(value: unknown, path: string): Clip {
  const obj = readObject(value, path);
  const audio = readObject(obj.audio, `${path}.audio`);
  return {
    id: readString(obj, 'id', path) as ClipId,
    assetId: readString(obj, 'assetId', path) as MediaAssetId,
    trackId: readString(obj, 'trackId', path) as TrackId,
    name: readString(obj, 'name', path),
    enabled: readBoolean(obj, 'enabled', path),
    start: readInteger(obj, 'start', path),
    sourceIn: readInteger(obj, 'sourceIn', path),
    sourceOut: readInteger(obj, 'sourceOut', path),
    transform: parseClipTransform(obj.transform, `${path}.transform`),
    audio: {
      volume: readNumber(audio, 'volume', `${path}.audio`),
      muted: readBoolean(audio, 'muted', `${path}.audio`),
      pan: readNumber(audio, 'pan', `${path}.audio`),
    },
    transitions: parseClipTransitions(obj.transitions, `${path}.transitions`),
    effects: parseClipEffects(obj.effects, `${path}.effects`),
    linkId: obj.linkId == null ? null : (readString(obj, 'linkId', path) as ClipId),
  };
}

function parseTrackBase(obj: JsonObject, path: string) {
  return {
    id: readString(obj, 'id', path) as TrackId,
    name: readString(obj, 'name', path),
    enabled: readBoolean(obj, 'enabled', path),
    locked: readBoolean(obj, 'locked', path),
    clipIds: readArray(obj.clipIds, `${path}.clipIds`).map((id, i) => {
      if (typeof id !== 'string') throw invalid(`${path}.clipIds[${i}]`, 'a string');
      return id as ClipId;
    }),
  };
}

function parseVideoTrack(value: unknown, path: string): VideoTrack {
  const obj = readObject(value, path);
  readEnum(obj, 'kind', path, ['video']);
  return { ...parseTrackBase(obj, path), kind: 'video', visible: readBoolean(obj, 'visible', path) };
}

function parseAudioTrack(value: unknown, path: string): AudioTrack {
  const obj = readObject(value, path);
  readEnum(obj, 'kind', path, ['audio']);
  const volume =
    obj.volume === undefined ? 100 : readNumber(obj, 'volume', path);
  return { ...parseTrackBase(obj, path), kind: 'audio', muted: readBoolean(obj, 'muted', path), volume };
}

function parseRecord<T>(value: unknown, path: string, parse: (entry: unknown, path: string) => T): Record<string, T> {
  const obj = readObject(value, path);
  const result: Record<string, T> = {};
  for (const [key, entry] of Object.entries(obj)) {
    if (key === '__proto__') throw invalid(`${path}.${key}`, 'a regular key');
    result[key] = parse(entry, `${path}.${key}`);
  }
  return result;
}

function parseSequence(value: unknown, path: string): Sequence {
  const obj = readObject(value, path);
  return {
    id: readString(obj, 'id', path) as SequenceId,
    name: readString(obj, 'name', path),
    resolution: parseResolution(obj.resolution, `${path}.resolution`),
    frameRate: parseFrameRate(obj.frameRate, `${path}.frameRate`),
    videoTracks: readArray(obj.videoTracks, `${path}.videoTracks`).map((t, i) =>
      parseVideoTrack(t, `${path}.videoTracks[${i}]`),
    ),
    audioTracks: readArray(obj.audioTracks, `${path}.audioTracks`).map((t, i) =>
      parseAudioTrack(t, `${path}.audioTracks[${i}]`),
    ),
    clips: parseRecord(obj.clips, `${path}.clips`, parseClip),
  };
}

/** Converts an untrusted, already-migrated JSON value into a typed Project. */
export function parseProject(value: unknown): Project {
  if (!isObject(value)) throw invalid('project', 'an object');
  const path = 'project';
  return {
    id: readString(value, 'id', path) as ProjectId,
    name: readString(value, 'name', path),
    schemaVersion: readInteger(value, 'schemaVersion', path, 1),
    createdAt: readString(value, 'createdAt', path),
    modifiedAt: readString(value, 'modifiedAt', path),
    mediaAssets: parseRecord(value.mediaAssets, `${path}.mediaAssets`, parseMediaAsset),
    mediaBinFolders:
      value.mediaBinFolders == null
        ? {}
        : parseRecord(value.mediaBinFolders, `${path}.mediaBinFolders`, parseMediaBinFolder),
    sequences: parseRecord(value.sequences, `${path}.sequences`, parseSequence),
    activeSequenceId: readString(value, 'activeSequenceId', path) as SequenceId,
  };
}
