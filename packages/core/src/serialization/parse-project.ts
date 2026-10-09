import { type FrameRate, type MediaTime } from '../time/rational';
import {
  type AudioTrack,
  type Clip,
  type ClipId,
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
    kind: readEnum(obj, 'kind', path, ['video', 'audio']),
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
  };
}

function parseClip(value: unknown, path: string): Clip {
  const obj = readObject(value, path);
  const transform = readObject(obj.transform, `${path}.transform`);
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
    transform: {
      positionX: readNumber(transform, 'positionX', `${path}.transform`),
      positionY: readNumber(transform, 'positionY', `${path}.transform`),
      scale: readNumber(transform, 'scale', `${path}.transform`),
      rotation: readNumber(transform, 'rotation', `${path}.transform`),
      opacity: readNumber(transform, 'opacity', `${path}.transform`),
    },
    audio: {
      volume: readNumber(audio, 'volume', `${path}.audio`),
      muted: readBoolean(audio, 'muted', `${path}.audio`),
      pan: readNumber(audio, 'pan', `${path}.audio`),
    },
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
  return { ...parseTrackBase(obj, path), kind: 'audio', muted: readBoolean(obj, 'muted', path) };
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
    sequences: parseRecord(value.sequences, `${path}.sequences`, parseSequence),
    activeSequenceId: readString(value, 'activeSequenceId', path) as SequenceId,
  };
}
