import { clamp, isFiniteNumber, isNonNegativeInteger, ok, type Result, type TimelineError } from '@timeline/shared';
import { AUDIO_LIMITS, TRANSFORM_LIMITS } from '../model/defaults';
import { createClip } from '../model/factory';
import { maxTransitionFramesForClip } from '../model/effects';
import { DEFAULT_CLIP_TEXT, TEXT_CLIP_MAX_SOURCE_FRAMES, textClipName, type ClipText } from '../model/text';
import {
  findTrack,
  getAssetFrameCount,
  getClipDuration,
  getClipEnd,
  getMaxClipSourceOutFrames,
} from '../model/queries';
import {
  type Clip,
  type ClipAudio,
  type ClipId,
  type ClipTransform,
  type MediaAsset,
  type MediaAssetId,
  type Project,
  type Sequence,
  type SequenceId,
  type Track,
  type TrackId,
} from '../model/types';
import { isRangeFree } from '../timeline/placement';
import { eraseRangeOnTrack, type SplitClipStep } from '../timeline/overwrite';
import { transitionsForSplitLeft, transitionsForSplitRight } from './clip-transitions-edit';
import { type EditResult, fail, replaceTrack, sortClipIds, updateSequence } from './common';

export function canTrackHoldAsset(track: Track, asset: MediaAsset): boolean {
  if (track.kind === 'video') return asset.hasVideo || asset.kind === 'image';
  return asset.hasAudio;
}

export interface AddClipInput {
  readonly sequenceId: SequenceId;
  readonly trackId: TrackId;
  readonly assetId: MediaAssetId;
  readonly start: number;
  /** Defaults to 0. */
  readonly sourceIn?: number;
  /** Defaults to the full length of the asset. */
  readonly sourceOut?: number;
  readonly clipId?: ClipId;
}

/** Places a new clip referencing a media asset on a track. Rejects overlaps. */
export function addClip(project: Project, input: AddClipInput): EditResult {
  const asset = project.mediaAssets[input.assetId];
  if (!asset) return fail('NOT_FOUND', `Media asset ${input.assetId} does not exist.`);

  return updateSequence(project, input.sequenceId, (sequence) => {
    const track = findTrack(sequence, input.trackId);
    if (!track) return fail('NOT_FOUND', `Track ${input.trackId} does not exist.`);
    if (track.locked) return fail('LOCKED', `Track ${track.name} is locked.`);
    if (!canTrackHoldAsset(track, asset)) {
      return fail('INVALID_ARGUMENT', `${asset.name} has no ${track.kind} and cannot be placed on ${track.name}.`);
    }

    const available = getAssetFrameCount(asset, sequence);
    const sourceIn = input.sourceIn ?? 0;
    const sourceOut = input.sourceOut ?? available;
    if (!isNonNegativeInteger(input.start)) return fail('INVALID_ARGUMENT', 'Clip start must be a whole, non-negative frame.');
    if (!isNonNegativeInteger(sourceIn) || !isNonNegativeInteger(sourceOut) || sourceOut <= sourceIn) {
      return fail('INVALID_ARGUMENT', 'Clip source range is invalid or empty.');
    }
    if (sourceOut > available) return fail('INVALID_ARGUMENT', 'Clip source range exceeds the media duration.');
    if (input.clipId && sequence.clips[input.clipId]) return fail('CONFLICT', `Clip ${input.clipId} already exists.`);

    const duration = sourceOut - sourceIn;
    let seq = sequence;
    const range = { start: input.start, end: input.start + duration };
    if (!isRangeFree(seq, track, input.start, duration)) {
      seq = eraseRangeOnTrack(seq, track, range, null, splitClipForOverwrite);
    }

    const clip = createClip({
      ...(input.clipId ? { id: input.clipId } : {}),
      assetId: asset.id,
      trackId: track.id,
      name: asset.name,
      start: input.start,
      sourceIn,
      sourceOut,
    });
    const clips = { ...seq.clips, [clip.id]: clip };
    const trackOnSeq = findTrack(seq, track.id)!;
    const updatedTrack: Track = { ...trackOnSeq, clipIds: sortClipIds([...trackOnSeq.clipIds, clip.id], clips) };
    return ok(replaceTrack({ ...seq, clips }, updatedTrack));
  });
}

export interface AddTextClipInput {
  readonly sequenceId: SequenceId;
  readonly trackId: TrackId;
  readonly start: number;
  readonly durationFrames?: number;
  readonly clipId?: ClipId;
  readonly positionX?: number;
  readonly positionY?: number;
  readonly content?: string;
}

/** Places a generated text clip on a video track. It is not a media-bin asset. */
export function addTextClip(project: Project, input: AddTextClipInput): EditResult {
  return updateSequence(project, input.sequenceId, (sequence) => {
    const track = findTrack(sequence, input.trackId);
    if (!track) return fail('NOT_FOUND', `Track ${input.trackId} does not exist.`);
    if (track.kind !== 'video') return fail('INVALID_ARGUMENT', 'Text clips belong on video tracks.');
    if (track.locked) return fail('LOCKED', `Track ${track.name} is locked.`);
    if (!isNonNegativeInteger(input.start)) return fail('INVALID_ARGUMENT', 'Clip start must be a whole, non-negative frame.');
    if (input.clipId && sequence.clips[input.clipId]) return fail('CONFLICT', `Clip ${input.clipId} already exists.`);

    const fps = sequence.frameRate.numerator / sequence.frameRate.denominator;
    const duration = input.durationFrames ?? Math.max(1, Math.round(fps * 5));
    if (!isNonNegativeInteger(duration) || duration < 1 || duration > TEXT_CLIP_MAX_SOURCE_FRAMES) {
      return fail('INVALID_ARGUMENT', 'Text duration is invalid.');
    }

    const content = input.content ?? DEFAULT_CLIP_TEXT.content;
    const text: ClipText = { ...DEFAULT_CLIP_TEXT, content };
    let seq = sequence;
    const range = { start: input.start, end: input.start + duration };
    if (!isRangeFree(seq, track, input.start, duration)) {
      seq = eraseRangeOnTrack(seq, track, range, null, splitClipForOverwrite);
    }

    const clip = createClip({
      ...(input.clipId ? { id: input.clipId } : {}),
      assetId: null,
      text,
      trackId: track.id,
      name: textClipName(content),
      start: input.start,
      sourceIn: 0,
      sourceOut: duration,
    });
    const placed = {
      ...clip,
      transform: {
        ...clip.transform,
        positionX: input.positionX ?? 0,
        positionY: input.positionY ?? 0,
      },
    };
    const clips = { ...seq.clips, [placed.id]: placed };
    const trackOnSeq = findTrack(seq, track.id)!;
    const updatedTrack: Track = { ...trackOnSeq, clipIds: sortClipIds([...trackOnSeq.clipIds, placed.id], clips) };
    return ok(replaceTrack({ ...seq, clips }, updatedTrack));
  });
}

export interface UpdateClipTextInput {
  readonly sequenceId: SequenceId;
  readonly clipId: ClipId;
  readonly text: Partial<ClipText>;
}

export function updateClipText(project: Project, input: UpdateClipTextInput): EditResult {
  return updateClip(project, input.sequenceId, input.clipId, (clip) => {
    if (!clip.text) return clip;
    const maxFrames = Math.max(1, maxTransitionFramesForClip(getClipDuration(clip)));
    const requested = input.text.animationFrames ?? clip.text.animationFrames ?? DEFAULT_CLIP_TEXT.animationFrames;
    const text: ClipText = {
      ...clip.text,
      ...input.text,
      animationFrames: Math.round(Math.min(maxFrames, Math.max(1, requested))),
    };
    return { ...clip, text, name: textClipName(text.content) };
  });
}

export interface MoveClipInput {
  readonly sequenceId: SequenceId;
  readonly clipId: ClipId;
  readonly start: number;
  /** Destination track; defaults to the clip's current track. */
  readonly trackId?: TrackId;
}

/** Moves a clip in time and optionally to another track of the same kind. */
export function moveClip(project: Project, input: MoveClipInput): EditResult {
  return updateSequence(project, input.sequenceId, (sequence) => {
    const clip = sequence.clips[input.clipId];
    if (!clip) return fail('NOT_FOUND', `Clip ${input.clipId} does not exist.`);
    const source = findTrack(sequence, clip.trackId);
    const target = findTrack(sequence, input.trackId ?? clip.trackId);
    if (!source || !target) return fail('NOT_FOUND', 'Track does not exist.');
    if (source.locked || target.locked) return fail('LOCKED', 'Clips on locked tracks cannot be moved.');
    if (source.kind !== target.kind) return fail('INVALID_ARGUMENT', 'Clips can only move between tracks of the same kind.');
    if (!isNonNegativeInteger(input.start)) return fail('INVALID_ARGUMENT', 'Clip start must be a whole, non-negative frame.');
    if (input.start === clip.start && target.id === source.id) return ok(sequence);

    const duration = getClipDuration(clip);
    let seq = sequence;
    const range = { start: input.start, end: input.start + duration };
    if (!isRangeFree(seq, target, input.start, duration, clip.id)) {
      seq = eraseRangeOnTrack(seq, target, range, clip.id, splitClipForOverwrite);
    }

    const sourceOnSeq = findTrack(seq, source.id)!;
    const targetOnSeq = findTrack(seq, target.id)!;
    const clipOnSeq = seq.clips[input.clipId]!;

    const moved: Clip = { ...clipOnSeq, start: input.start, trackId: targetOnSeq.id };
    const clips = { ...seq.clips, [clip.id]: moved };
    if (sourceOnSeq.id === targetOnSeq.id) {
      return ok(replaceTrack({ ...seq, clips }, { ...sourceOnSeq, clipIds: sortClipIds(sourceOnSeq.clipIds, clips) }));
    }
    const withoutClip = replaceTrack(
      { ...seq, clips },
      { ...sourceOnSeq, clipIds: sourceOnSeq.clipIds.filter((id) => id !== clip.id) },
    );
    return ok(
      replaceTrack(withoutClip, { ...targetOnSeq, clipIds: sortClipIds([...targetOnSeq.clipIds, clip.id], clips) }),
    );
  });
}

export interface RemoveClipsInput {
  readonly sequenceId: SequenceId;
  readonly clipIds: readonly ClipId[];
}

export function removeClips(project: Project, input: RemoveClipsInput): EditResult {
  return updateSequence(project, input.sequenceId, (sequence) => {
    const ids = new Set(input.clipIds.filter((id) => sequence.clips[id]));
    if (ids.size === 0) return ok(sequence);
    for (const id of ids) {
      const track = findTrack(sequence, (sequence.clips[id]!).trackId);
      if (track?.locked) return fail('LOCKED', `Track ${track.name} is locked.`);
    }
    const clips = { ...sequence.clips };
    for (const id of ids) {
      const clip = clips[id];
      if (!clip?.linkId) continue;
      const partnerId = clip.linkId;
      if (ids.has(partnerId)) continue;
      const partner = clips[partnerId];
      if (!partner) continue;
      const removedTrack = findTrack(sequence, clip.trackId);
      const partnerTrack = findTrack(sequence, partner.trackId);
      let nextPartner: Clip = { ...partner, linkId: null };
      if (removedTrack?.kind === 'audio' && partnerTrack?.kind === 'video') {
        nextPartner = { ...nextPartner, audio: { ...partner.audio, muted: true } };
      }
      clips[partnerId] = nextPartner;
    }
    for (const id of ids) delete clips[id];
    const prune = <T extends Track>(track: T): T =>
      track.clipIds.some((id) => ids.has(id))
        ? { ...track, clipIds: track.clipIds.filter((id) => !ids.has(id)) }
        : track;
    return ok({
      ...sequence,
      clips,
      videoTracks: sequence.videoTracks.map(prune),
      audioTracks: sequence.audioTracks.map(prune),
    });
  });
}

export interface SplitClipInput {
  readonly sequenceId: SequenceId;
  readonly clipId: ClipId;
  /** Sequence frame at which to cut; must fall strictly inside the clip. */
  readonly frame: number;
  readonly newClipId?: ClipId;
}

function splitClipForOverwrite(
  sequence: Sequence,
  clipId: ClipId,
  frame: number,
): Result<SplitClipStep, TimelineError> {
  const original = sequence.clips[clipId];
  const first = splitClipInSequence(sequence, clipId, frame);
  if (!first.ok) return first;
  let seq = clearClipLink(first.value.sequence, first.value.leftId);
  seq = clearClipLink(seq, first.value.rightId);
  if (original?.linkId && seq.clips[original.linkId]) seq = clearClipLink(seq, original.linkId);
  return ok({ sequence: seq, leftId: first.value.leftId, rightId: first.value.rightId });
}

function splitClipInSequence(
  sequence: Sequence,
  clipId: ClipId,
  frame: number,
  newClipId?: ClipId,
): Result<SplitClipStep, TimelineError> {
  const clip = sequence.clips[clipId];
  if (!clip) return fail('NOT_FOUND', `Clip ${clipId} does not exist.`);
  const track = findTrack(sequence, clip.trackId);
  if (!track) return fail('NOT_FOUND', 'Track does not exist.');
  if (track.locked) return fail('LOCKED', `Track ${track.name} is locked.`);
  if (!Number.isInteger(frame) || frame <= clip.start || frame >= getClipEnd(clip)) {
    return fail('INVALID_ARGUMENT', 'The split point must be inside the clip.');
  }
  const cut = clip.sourceIn + (frame - clip.start);
  const left: Clip = {
    ...clip,
    sourceOut: cut,
    transitions: transitionsForSplitLeft(clip),
  };
  const right: Clip = {
    ...createClip({
      ...(newClipId ? { id: newClipId } : {}),
      assetId: clip.assetId,
      text: clip.text,
      trackId: clip.trackId,
      name: clip.name,
      start: frame,
      sourceIn: cut,
      sourceOut: clip.sourceOut,
      linkId: null,
    }),
    enabled: clip.enabled,
    transform: clip.transform,
    audio: clip.audio,
    transitions: transitionsForSplitRight(clip),
    effects: clip.effects,
  };
  if (sequence.clips[right.id]) return fail('CONFLICT', `Clip ${right.id} already exists.`);
  const clips = { ...sequence.clips, [left.id]: left, [right.id]: right };
  const next = replaceTrack({ ...sequence, clips }, { ...track, clipIds: sortClipIds([...track.clipIds, right.id], clips) });
  return ok({ sequence: next, leftId: left.id, rightId: right.id });
}

function relinkClips(sequence: Sequence, a: ClipId, b: ClipId): Sequence {
  return {
    ...sequence,
    clips: {
      ...sequence.clips,
      [a]: { ...sequence.clips[a]!, linkId: b },
      [b]: { ...sequence.clips[b]!, linkId: a },
    },
  };
}

function clearClipLink(sequence: Sequence, clipId: ClipId): Sequence {
  const clip = sequence.clips[clipId];
  if (!clip) return sequence;
  return { ...sequence, clips: { ...sequence.clips, [clipId]: { ...clip, linkId: null } } };
}

const MIN_CLIP_DURATION_FRAMES = 1;

export interface TrimClipInput {
  readonly sequenceId: SequenceId;
  readonly clipId: ClipId;
  readonly edge: 'start' | 'end';
  /** New in/out point on the sequence (inside the clip). */
  readonly frame: number;
}

function trimClipInSequence(
  sequence: Sequence,
  clipId: ClipId,
  edge: 'start' | 'end',
  frame: number,
  maxSourceOutFrames: number,
): Result<Sequence, TimelineError> {
  const clip = sequence.clips[clipId];
  if (!clip) return fail('NOT_FOUND', `Clip ${clipId} does not exist.`);
  const track = findTrack(sequence, clip.trackId);
  if (track?.locked) return fail('LOCKED', `Track ${track.name} is locked.`);
  const end = getClipEnd(clip);
  const trimFrame = Math.round(frame);
  if (!Number.isFinite(trimFrame)) return fail('INVALID_ARGUMENT', 'Trim frame must be an integer.');

  let next: Clip;
  if (edge === 'start') {
    const minStart = Math.max(0, clip.start - clip.sourceIn);
    if (trimFrame < minStart || trimFrame > end - MIN_CLIP_DURATION_FRAMES) {
      return fail('INVALID_ARGUMENT', 'Trim start must stay inside the clip and media bounds.');
    }
    const delta = trimFrame - clip.start;
    const sourceIn = clip.sourceIn + delta;
    if (sourceIn < 0 || sourceIn >= clip.sourceOut) {
      return fail('INVALID_ARGUMENT', 'Trim start exceeds the media duration.');
    }
    next = { ...clip, start: trimFrame, sourceIn };
  } else {
    const minEnd = clip.start + MIN_CLIP_DURATION_FRAMES;
    const maxEnd = clip.start + (maxSourceOutFrames - clip.sourceIn);
    if (trimFrame < minEnd || trimFrame > maxEnd) {
      return fail('INVALID_ARGUMENT', 'Trim end must stay inside the clip and media bounds.');
    }
    const sourceOut = clip.sourceIn + (trimFrame - clip.start);
    if (sourceOut <= clip.sourceIn || sourceOut > maxSourceOutFrames) {
      return fail('INVALID_ARGUMENT', 'Trim end exceeds the media duration.');
    }
    next = { ...clip, sourceOut };
  }

  const clips = { ...sequence.clips, [clipId]: next };
  return ok({ ...sequence, clips });
}

/** Trims a clip from the start or end. Linked partner is trimmed when aligned. */
export function trimClip(project: Project, input: TrimClipInput): EditResult {
  return updateSequence(project, input.sequenceId, (sequence) => {
    const clip = sequence.clips[input.clipId];
    if (!clip) return fail('NOT_FOUND', `Clip ${input.clipId} does not exist.`);

    const asset = clip.assetId ? project.mediaAssets[clip.assetId] : undefined;
    if (!clip.text && !asset) return fail('NOT_FOUND', 'Media for this clip is missing.');
    const maxSourceOut = clip.text ? TEXT_CLIP_MAX_SOURCE_FRAMES : getMaxClipSourceOutFrames(asset!, sequence);

    const first = trimClipInSequence(sequence, input.clipId, input.edge, input.frame, maxSourceOut);
    if (!first.ok) return first;

    let next = first.value;
    const partnerId = clip.linkId;
    if (partnerId) {
      const partner = next.clips[partnerId];
      if (partner && partner.start === clip.start && getClipEnd(partner) === getClipEnd(clip)) {
        const partnerAsset = partner.assetId ? project.mediaAssets[partner.assetId] : undefined;
        const partnerMaxSourceOut = partner.text
          ? TEXT_CLIP_MAX_SOURCE_FRAMES
          : partnerAsset
            ? getMaxClipSourceOutFrames(partnerAsset, sequence)
            : maxSourceOut;
        const second = trimClipInSequence(next, partnerId, input.edge, input.frame, partnerMaxSourceOut);
        if (!second.ok) return second;
        next = second.value;
      }
    }
    return ok(next);
  });
}

/** Cuts a clip in two at `frame`. Linked clips on the paired track are split too. */
export function splitClip(project: Project, input: SplitClipInput): EditResult {
  return updateSequence(project, input.sequenceId, (sequence) => {
    const original = sequence.clips[input.clipId];
    if (!original) return fail('NOT_FOUND', `Clip ${input.clipId} does not exist.`);

    const first = splitClipInSequence(sequence, input.clipId, input.frame, input.newClipId);
    if (!first.ok) return fail(first.error.code, first.error.message);

    let next = first.value.sequence;
    const { leftId, rightId } = first.value;
    const partnerId = original.linkId;

    if (partnerId) {
      const partner = next.clips[partnerId];
      if (partner && input.frame > partner.start && input.frame < getClipEnd(partner)) {
        const second = splitClipInSequence(next, partnerId, input.frame);
        if (!second.ok) return fail(second.error.code, second.error.message);
        next = second.value.sequence;
        next = relinkClips(next, leftId, second.value.leftId);
        next = relinkClips(next, rightId, second.value.rightId);
        return ok(next);
      }
      next = clearClipLink(next, partnerId);
    }

    next = clearClipLink(next, leftId);
    next = clearClipLink(next, rightId);
    return ok(next);
  });
}

function updateClip(
  project: Project,
  sequenceId: SequenceId,
  clipId: ClipId,
  update: (clip: Clip, sequence: Sequence) => Clip,
): EditResult {
  return updateSequence(project, sequenceId, (sequence) => {
    const clip = sequence.clips[clipId];
    if (!clip) return fail('NOT_FOUND', `Clip ${clipId} does not exist.`);
    const track = findTrack(sequence, clip.trackId);
    if (track?.locked) return fail('LOCKED', `Track ${track.name} is locked.`);
    const next = update(clip, sequence);
    if (next === clip) return ok(sequence);
    return ok({ ...sequence, clips: { ...sequence.clips, [clipId]: next } });
  });
}

function limit(value: number | undefined, current: number, range: { min: number; max: number }): number {
  return isFiniteNumber(value) ? clamp(value, range.min, range.max) : current;
}

function limitMin(value: number | undefined, current: number, min: number): number {
  return isFiniteNumber(value) ? Math.max(min, value) : current;
}

export interface UpdateClipTransformInput {
  readonly sequenceId: SequenceId;
  readonly clipId: ClipId;
  readonly transform: Partial<ClipTransform>;
}

function mergeClipTransform(current: ClipTransform, patch: Partial<ClipTransform>): ClipTransform {
  const uniformScale = typeof patch.uniformScale === 'boolean' ? patch.uniformScale : current.uniformScale;
  let scaleX = limit(patch.scaleX, current.scaleX, TRANSFORM_LIMITS.scale);
  let scaleY = limit(patch.scaleY, current.scaleY, TRANSFORM_LIMITS.scale);
  if (patch.scaleX !== undefined && uniformScale) scaleY = scaleX;
  if (patch.scaleY !== undefined && uniformScale) scaleX = scaleY;
  if (patch.uniformScale === true) scaleY = scaleX;
  return {
    positionX: limit(patch.positionX, current.positionX, TRANSFORM_LIMITS.position),
    positionY: limit(patch.positionY, current.positionY, TRANSFORM_LIMITS.position),
    scaleX,
    scaleY,
    uniformScale,
    rotation: limit(patch.rotation, current.rotation, TRANSFORM_LIMITS.rotation),
    opacity: limit(patch.opacity, current.opacity, TRANSFORM_LIMITS.opacity),
  };
}

/** Updates transform properties. Values are clamped to supported ranges. */
export function updateClipTransform(project: Project, input: UpdateClipTransformInput): EditResult {
  return updateClip(project, input.sequenceId, input.clipId, (clip) => {
    const next = mergeClipTransform(clip.transform, input.transform);
    const unchanged = (Object.keys(next) as (keyof ClipTransform)[]).every((k) => next[k] === clip.transform[k]);
    return unchanged ? clip : { ...clip, transform: next };
  });
}

export interface UpdateClipAudioInput {
  readonly sequenceId: SequenceId;
  readonly clipId: ClipId;
  readonly audio: Partial<ClipAudio>;
}

export function updateClipAudio(project: Project, input: UpdateClipAudioInput): EditResult {
  return updateClip(project, input.sequenceId, input.clipId, (clip) => {
    const a = input.audio;
    const next: ClipAudio = {
      volume: limitMin(a.volume, clip.audio.volume, AUDIO_LIMITS.volume.min),
      pan: limit(a.pan, clip.audio.pan, AUDIO_LIMITS.pan),
      muted: typeof a.muted === 'boolean' ? a.muted : clip.audio.muted,
    };
    const unchanged = next.volume === clip.audio.volume && next.pan === clip.audio.pan && next.muted === clip.audio.muted;
    return unchanged ? clip : { ...clip, audio: next };
  });
}

export interface SetClipEnabledInput {
  readonly sequenceId: SequenceId;
  readonly clipId: ClipId;
  readonly enabled: boolean;
}

export function setClipEnabled(project: Project, input: SetClipEnabledInput): EditResult {
  return updateClip(project, input.sequenceId, input.clipId, (clip) =>
    clip.enabled === input.enabled ? clip : { ...clip, enabled: input.enabled },
  );
}
