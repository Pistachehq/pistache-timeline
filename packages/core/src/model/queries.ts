import { MAX_STILL_IMAGE_TIMELINE_SECONDS } from './defaults';
import { timelineFrameCount } from './speed';
import { isCrossDissolveTransition } from './transition-resolve';
import { mediaTimeToFrames, secondsToFrames } from '../time/rational';
import {
  type AudioTrack,
  type Clip,
  type ClipId,
  type MediaAsset,
  type MediaBinFolder,
  type MediaBinFolderId,
  type Project,
  type Sequence,
  type SequenceId,
  type Track,
  type TrackId,
  type VideoTrack,
} from './types';

export function getSequence(project: Project, sequenceId: SequenceId): Sequence | undefined {
  return project.sequences[sequenceId];
}

export function getActiveSequence(project: Project): Sequence | undefined {
  return project.sequences[project.activeSequenceId];
}

export function getMediaAssets(project: Project): MediaAsset[] {
  return Object.values(project.mediaAssets);
}

export interface MediaBinFolderContents {
  readonly folders: readonly MediaBinFolder[];
  readonly assets: readonly MediaAsset[];
}

/** Folders and assets directly inside a bin folder (`null` = project bin root). */
export function listMediaBinFolderContents(
  project: Project,
  folderId: MediaBinFolderId | null,
): MediaBinFolderContents {
  const folders = Object.values(project.mediaBinFolders)
    .filter((folder) => folder.parentId === folderId)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const assets = Object.values(project.mediaAssets)
    .filter((asset) => (asset.folderId ?? null) === folderId)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return { folders, assets };
}

export function countMediaBinItems(project: Project): { folders: number; assets: number } {
  return {
    folders: Object.keys(project.mediaBinFolders).length,
    assets: Object.keys(project.mediaAssets).length,
  };
}

/** All tracks, video first (bottom to top) then audio. */
export function getTracks(sequence: Sequence): Track[] {
  return [...sequence.videoTracks, ...sequence.audioTracks];
}

export function findTrack(sequence: Sequence, trackId: TrackId): Track | undefined {
  return (
    sequence.videoTracks.find((track) => track.id === trackId) ??
    sequence.audioTracks.find((track) => track.id === trackId)
  );
}

export function getClip(sequence: Sequence, clipId: ClipId): Clip | undefined {
  return sequence.clips[clipId];
}

export function getClipDuration(clip: Clip): number {
  return timelineFrameCount(clip.sourceOut - clip.sourceIn, clip.speed);
}

/** Exclusive end frame of the clip on the sequence. */
export function getClipEnd(clip: Clip): number {
  return clip.start + getClipDuration(clip);
}

/**
 * Next clip on the same track that continues the same media without a gap
 * (typical razor split). Used for gapless playback across edit points.
 */
export function getSeamlessClipSuccessor(sequence: Sequence, clip: Clip): Clip | undefined {
  const track = findTrack(sequence, clip.trackId);
  if (!track) return undefined;
  const end = getClipEnd(clip);
  const next = getClipAtFrame(sequence, track, end);
  if (!next || next.start !== end) return undefined;
  if (next.assetId !== clip.assetId || next.sourceIn !== clip.sourceOut) return undefined;
  return next;
}

/**
 * When `linkId` is set, audio is expected on the paired A-track clip only
 * (Premiere-style linked clip). The video file's embedded audio is not mixed in.
 */
export function clipContributesEmbeddedAudio(clip: Clip): boolean {
  return clip.linkId === null && !clip.audio.muted;
}

export function getTrackClips(sequence: Sequence, track: Track): Clip[] {
  const clips: Clip[] = [];
  for (const id of track.clipIds) {
    const clip = sequence.clips[id];
    if (clip) clips.push(clip);
  }
  return clips;
}

/** Sequence duration in frames: the end of the last clip on any track. */
export function getSequenceDuration(sequence: Sequence): number {
  let end = 0;
  for (const clip of Object.values(sequence.clips)) {
    end = Math.max(end, getClipEnd(clip));
  }
  return end;
}

/** Number of whole sequence frames available in an asset. */
export function getAssetFrameCount(asset: MediaAsset, sequence: Sequence): number {
  return mediaTimeToFrames(asset.duration, sequence.frameRate, 'floor');
}

/**
 * Largest allowed `sourceOut` when trimming a clip. Stills can be held longer
 * on the timeline than the default import duration.
 */
export function isStillImageAsset(asset: MediaAsset): boolean {
  return asset.kind === 'image';
}

export function getMaxClipSourceOutFrames(asset: MediaAsset, sequence: Sequence): number {
  if (isStillImageAsset(asset)) {
    return secondsToFrames(MAX_STILL_IMAGE_TIMELINE_SECONDS, sequence.frameRate, 'floor');
  }
  return getAssetFrameCount(asset, sequence);
}

/**
 * Clips of a track that intersect `[startFrame, endFrame)`. Relies on the
 * ordering invariant (clips sorted and non-overlapping, so ends are sorted
 * too) to binary-search the first visible clip. Intended for virtualised
 * rendering of long timelines.
 */
export function getClipsInRange(
  sequence: Sequence,
  track: Track,
  startFrame: number,
  endFrame: number,
): Clip[] {
  const ids = track.clipIds;
  let low = 0;
  let high = ids.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    const clip = sequence.clips[ids[mid]!];
    if (clip && getClipEnd(clip) <= startFrame) low = mid + 1;
    else high = mid;
  }
  const result: Clip[] = [];
  for (let i = low; i < ids.length; i++) {
    const clip = sequence.clips[ids[i]!];
    if (!clip) continue;
    if (clip.start >= endFrame) break;
    result.push(clip);
  }
  return result;
}

export function getClipAtFrame(sequence: Sequence, track: Track, frame: number): Clip | undefined {
  return getClipsInRange(sequence, track, frame, frame + 1)[0];
}

/** Clips that can be split at `frame` (cut point strictly inside the clip). */
/** Audio track paired with a video track at the same index (V1 ↔ A1). */
export function pairedAudioTrack(sequence: Sequence, videoTrackId: TrackId): AudioTrack | undefined {
  const index = sequence.videoTracks.findIndex((track) => track.id === videoTrackId);
  return index >= 0 ? sequence.audioTracks[index] : undefined;
}

export function pairedVideoTrack(sequence: Sequence, audioTrackId: TrackId): VideoTrack | undefined {
  const index = sequence.audioTracks.findIndex((track) => track.id === audioTrackId);
  return index >= 0 ? sequence.videoTracks[index] : undefined;
}

/** Topmost active audio clip at `frame` (last matching track wins). */
export function getTopmostAudioClipAt(sequence: Sequence, frame: number): ActiveAudioClip | null {
  let active: ActiveAudioClip | null = null;
  for (const track of sequence.audioTracks) {
    if (!track.enabled || track.muted) continue;
    const clip = getClipAtFrame(sequence, track, frame);
    if (clip?.enabled && !clip.audio.muted) active = { clip, track };
  }
  return active;
}

export function getSplittableClipsAt(sequence: Sequence, frame: number): Clip[] {
  if (!Number.isInteger(frame) || frame < 0) return [];
  return Object.values(sequence.clips).filter((clip) => clip.start < frame && frame < getClipEnd(clip));
}

export interface ActiveVideoClip {
  readonly clip: Clip;
  readonly track: VideoTrack;
}

/**
 * The clip shown in the program monitor at `frame`: the topmost enabled,
 * visible video track that has an enabled clip under the playhead.
 */
export function getTopmostVideoClipAt(sequence: Sequence, frame: number): ActiveVideoClip | null {
  for (let i = sequence.videoTracks.length - 1; i >= 0; i--) {
    const track = sequence.videoTracks[i];
    if (!track?.enabled || !track.visible) continue;
    const clip = getClipAtFrame(sequence, track, frame);
    if (clip?.enabled) return { clip, track };
  }
  return null;
}

function previousClipOnTrack(sequence: Sequence, track: Track, clip: Clip): Clip | undefined {
  let prev: Clip | undefined;
  for (const id of track.clipIds) {
    const candidate = sequence.clips[id];
    if (!candidate || candidate.start >= clip.start) continue;
    if (!prev || candidate.start > prev.start) prev = candidate;
  }
  return prev;
}

/** Clip fading in before its start (cross-dissolve / audio crossfade with the previous cut). */
export function getCrossfadePreRollClipAt(sequence: Sequence, track: Track, frame: number): Clip | undefined {
  for (const id of track.clipIds) {
    const clip = sequence.clips[id];
    if (!clip?.enabled) continue;
    const edge = clip.transitions.in;
    if (!edge || edge.durationFrames <= 0) continue;
    const n = edge.durationFrames;
    if (frame < clip.start - n || frame >= clip.start) continue;
    const prev = previousClipOnTrack(sequence, track, clip);
    if (prev && getClipEnd(prev) === clip.start) return clip;
  }
  return undefined;
}

/** Video/image clips on enabled, visible tracks at `frame`, bottom track first (for compositing). */
export function getStackedVideoClipsAt(sequence: Sequence, frame: number): ActiveVideoClip[] {
  const stack: ActiveVideoClip[] = [];
  for (const track of sequence.videoTracks) {
    if (!track.enabled || !track.visible) continue;
    const seen = new Set<ClipId>();
    const clip = getClipAtFrame(sequence, track, frame);
    if (clip?.enabled) {
      stack.push({ clip, track });
      seen.add(clip.id);
    }
    const preRoll = getCrossfadePreRollClipAt(sequence, track, frame);
    if (
      preRoll &&
      !seen.has(preRoll.id) &&
      isCrossDissolveTransition(preRoll.transitions.in)
    ) {
      stack.push({ clip: preRoll, track });
    }
  }
  return stack;
}

export function assetPlaysOnVideoTrack(asset: MediaAsset): boolean {
  return asset.hasVideo || asset.kind === 'image';
}

export interface ActiveAudioClip {
  readonly clip: Clip;
  readonly track: AudioTrack;
}

/** Enabled, unmuted audio clips on enabled audio tracks at `frame`. */
export function getActiveAudioClipsAt(sequence: Sequence, frame: number): ActiveAudioClip[] {
  const active: ActiveAudioClip[] = [];
  for (const track of sequence.audioTracks) {
    if (!track.enabled || track.muted) continue;
    const seen = new Set<ClipId>();
    const clip = getClipAtFrame(sequence, track, frame);
    if (clip?.enabled && !clip.audio.muted) {
      active.push({ clip, track });
      seen.add(clip.id);
    }
    const preRoll = getCrossfadePreRollClipAt(sequence, track, frame);
    if (preRoll && !seen.has(preRoll.id) && !preRoll.audio.muted) {
      active.push({ clip: preRoll, track });
    }
  }
  return active;
}

/** Audio clips that should be heard at `frame` (audio tracks + embedded audio on video tracks). */
export function getAudibleClipsAt(
  sequence: Sequence,
  frame: number,
  assets: Readonly<Record<MediaAsset['id'], MediaAsset>>,
): Clip[] {
  const clips: Clip[] = [];
  const seen = new Set<ClipId>();
  const add = (clip: Clip) => {
    if (seen.has(clip.id) || !clip.assetId) return;
    const asset = assets[clip.assetId];
    if (!asset?.hasAudio) return;
    seen.add(clip.id);
    clips.push(clip);
  };
  for (const { clip } of getActiveAudioClipsAt(sequence, frame)) add(clip);
  for (const track of sequence.videoTracks) {
    if (!track.enabled || !track.visible) continue;
    const seen = new Set<ClipId>();
    const atFrame = getClipAtFrame(sequence, track, frame);
    if (atFrame) {
      if (clipContributesEmbeddedAudio(atFrame)) add(atFrame);
      seen.add(atFrame.id);
    }
    const preRoll = getCrossfadePreRollClipAt(sequence, track, frame);
    if (preRoll && !seen.has(preRoll.id) && clipContributesEmbeddedAudio(preRoll)) add(preRoll);
  }
  return clips;
}

/** Number of clips on the sequence that reference the given asset. */
export function countAssetUsage(sequence: Sequence, assetId: string): number {
  let count = 0;
  for (const clip of Object.values(sequence.clips)) {
    if (clip.assetId === assetId) count++;
  }
  return count;
}
