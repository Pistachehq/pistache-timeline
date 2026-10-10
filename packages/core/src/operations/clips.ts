import { clamp, isFiniteNumber, isNonNegativeInteger, ok, type Result, type TimelineError } from '@timeline/shared';
import { AUDIO_LIMITS, DEFAULT_CLIP_TRANSFORM, TRANSFORM_LIMITS } from '../model/defaults';
import {
  channelAt,
  clampLocalFrame,
  evaluateClipTransform,
  keyframeAtFrame,
  MOTION_CHANNELS,
  refitClipAnimation,
  scaleClipAnimation,
  upsertKeyframe,
  type KeyframeInterpolation,
  type MotionChannelId,
} from '../model/animation';
import { createClip } from '../model/factory';
import { maxTransitionFramesForClip } from '../model/effects';
import { clipSpeedPercent, sourceFramesForTimeline, timelineFrameCount } from '../model/speed';
import { DEFAULT_CLIP_TEXT, TEXT_CLIP_MAX_SOURCE_FRAMES, textClipName, type ClipText } from '../model/text';
import {
  findTrack,
  clipStartFloor,
  clipStartTrim,
  clipStartTrimBounds,
  getAssetFrameCount,
  getClipDuration,
  getClipEnd,
  getMaxClipSourceOutFrames,
  isStillImageAsset,
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
    for (const clip of Object.values(sequence.clips)) {
      if (clip.captionSourceId && ids.has(clip.captionSourceId)) ids.add(clip.id);
    }
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
  const cutLocal = frame - clip.start;
  const cut = Math.min(clip.sourceOut - 1, Math.max(clip.sourceIn + 1, clip.sourceIn + sourceFramesForTimeline(cutLocal, clip.speed)));
  const left: Clip = {
    ...clip,
    sourceOut: cut,
    transitions: transitionsForSplitLeft(clip),
    animation: refitClipAnimation(clip.animation ?? {}, 0, cutLocal),
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
      ...(clip.captionSourceId ? { captionSourceId: clip.captionSourceId } : {}),
    }),
    enabled: clip.enabled,
    transform: clip.transform,
    audio: clip.audio,
    transitions: transitionsForSplitRight(clip),
    effects: clip.effects,
    speed: clip.speed,
    animation: refitClipAnimation(clip.animation ?? {}, cutLocal, getClipDuration(clip) - cutLocal),
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
  extendStart: boolean,
): Result<Sequence, TimelineError> {
  const clip = sequence.clips[clipId];
  if (!clip) return fail('NOT_FOUND', `Clip ${clipId} does not exist.`);
  const track = findTrack(sequence, clip.trackId);
  if (track?.locked) return fail('LOCKED', `Track ${track.name} is locked.`);
  const trimFrame = Math.round(frame);
  if (!Number.isFinite(trimFrame)) return fail('INVALID_ARGUMENT', 'Trim frame must be an integer.');

  let next: Clip;
  if (edge === 'start') {
    const bounds = clipStartTrimBounds(clip, maxSourceOutFrames, extendStart);
    const minStart = Math.min(bounds.max, Math.max(bounds.min, clipStartFloor(sequence, clip)));
    if (trimFrame < minStart || trimFrame > bounds.max) {
      return fail('INVALID_ARGUMENT', 'Trim start must stay inside the clip and media bounds.');
    }
    const points = clipStartTrim(clip, trimFrame, maxSourceOutFrames, extendStart);
    if (!points) return fail('INVALID_ARGUMENT', 'Trim start exceeds the media duration.');
    const delta = points.start - clip.start;
    next = {
      ...clip,
      start: points.start,
      sourceIn: points.sourceIn,
      sourceOut: points.sourceOut,
      animation: refitClipAnimation(
        clip.animation ?? {},
        delta,
        timelineFrameCount(points.sourceOut - points.sourceIn, clip.speed),
      ),
    };
  } else {
    const minEnd = clip.start + MIN_CLIP_DURATION_FRAMES;
    const maxEnd = clip.start + timelineFrameCount(Math.max(0, maxSourceOutFrames - clip.sourceIn), clip.speed);
    if (trimFrame < minEnd || trimFrame > maxEnd) {
      return fail('INVALID_ARGUMENT', 'Trim end must stay inside the clip and media bounds.');
    }
    const sourceOut = Math.min(
      maxSourceOutFrames,
      clip.sourceIn + Math.max(1, sourceFramesForTimeline(trimFrame - clip.start, clip.speed)),
    );
    if (sourceOut <= clip.sourceIn) {
      return fail('INVALID_ARGUMENT', 'Trim end exceeds the media duration.');
    }
    next = {
      ...clip,
      sourceOut,
      animation: refitClipAnimation(clip.animation ?? {}, 0, trimFrame - clip.start),
    };
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
    const extendStart = asset ? isStillImageAsset(asset) : false;

    const first = trimClipInSequence(sequence, input.clipId, input.edge, input.frame, maxSourceOut, extendStart);
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
        const partnerExtends = partnerAsset ? isStillImageAsset(partnerAsset) : false;
        const second = trimClipInSequence(
          next,
          partnerId,
          input.edge,
          input.frame,
          partnerMaxSourceOut,
          partnerExtends,
        );
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
    anchorX: limit(patch.anchorX, current.anchorX, TRANSFORM_LIMITS.position),
    anchorY: limit(patch.anchorY, current.anchorY, TRANSFORM_LIMITS.position),
    blendMode: patch.blendMode ?? current.blendMode,
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

export interface MotionEditInput {
  readonly sequenceId: SequenceId;
  readonly clipId: ClipId;
  readonly transform: Partial<ClipTransform>;
  /** Clip-local frame where animated channels receive a keyframe. */
  readonly localFrame: number;
}

/** Writes static transform values, or a keyframe when that channel is animated. */
export function applyMotionEdit(project: Project, input: MotionEditInput): EditResult {
  return updateClip(project, input.sequenceId, input.clipId, (clip) => {
    const frame = clampLocalFrame(clip, input.localFrame);
    let animation = clip.animation ?? {};
    const staticPatch: Partial<ClipTransform> = { ...input.transform };
    for (const id of MOTION_CHANNELS) {
      const value = input.transform[id];
      if (value === undefined) continue;
      const channel = animation[id];
      if (!channel?.enabled) continue;
      animation = { ...animation, [id]: upsertKeyframe(channel, frame, value) };
      delete staticPatch[id];
    }
    const transform = mergeClipTransform(clip.transform, staticPatch);
    const sameAnimation = animation === (clip.animation ?? {});
    const sameTransform = (Object.keys(transform) as (keyof ClipTransform)[]).every((key) => transform[key] === clip.transform[key]);
    return sameAnimation && sameTransform ? clip : { ...clip, transform, animation };
  });
}

export interface SetMotionChannelInput {
  readonly sequenceId: SequenceId;
  readonly clipId: ClipId;
  readonly channel: MotionChannelId;
  readonly enabled: boolean;
  readonly localFrame: number;
}

/** Turns keyframing on (seeding one key) or off (baking the current value). */
export function setMotionChannelEnabled(project: Project, input: SetMotionChannelInput): EditResult {
  return updateClip(project, input.sequenceId, input.clipId, (clip) => {
    const frame = clampLocalFrame(clip, input.localFrame);
    const current = channelAt(clip.animation ?? {}, input.channel);
    if (current.enabled === input.enabled && (!input.enabled || current.keyframes.length > 0)) return clip;
    const value = evaluateClipTransform(clip, clip.start + frame)[input.channel];
    if (input.enabled) {
      const seeded = upsertKeyframe({ enabled: true, keyframes: current.keyframes }, frame, value);
      return { ...clip, animation: { ...clip.animation, [input.channel]: { ...seeded, enabled: true } } };
    }
    const transform = mergeClipTransform(clip.transform, { [input.channel]: value });
    return {
      ...clip,
      transform,
      animation: { ...clip.animation, [input.channel]: { enabled: false, keyframes: [] } },
    };
  });
}

export interface ToggleKeyframeInput {
  readonly sequenceId: SequenceId;
  readonly clipId: ClipId;
  readonly channel: MotionChannelId;
  readonly localFrame: number;
}

/** Adds a keyframe at the frame, or removes the one already there. */
export function toggleKeyframeAtFrame(project: Project, input: ToggleKeyframeInput): EditResult {
  return updateClip(project, input.sequenceId, input.clipId, (clip) => {
    const frame = clampLocalFrame(clip, input.localFrame);
    const current = channelAt(clip.animation ?? {}, input.channel);
    if (!current.enabled) return clip;
    const existing = keyframeAtFrame(current, frame);
    const keyframes = existing
      ? current.keyframes.filter((key) => key.id !== existing.id)
      : upsertKeyframe(current, frame, evaluateClipTransform(clip, clip.start + frame)[input.channel]).keyframes;
    return { ...clip, animation: { ...clip.animation, [input.channel]: { enabled: true, keyframes } } };
  });
}

export interface MoveKeyframeInput {
  readonly sequenceId: SequenceId;
  readonly clipId: ClipId;
  readonly channel: MotionChannelId;
  readonly keyframeId: string;
  readonly frame: number;
}

export interface KeyframeMove {
  readonly channel: MotionChannelId;
  readonly keyframeId: string;
  readonly frame: number;
}

export interface MoveKeyframesInput {
  readonly sequenceId: SequenceId;
  readonly clipId: ClipId;
  readonly moves: readonly KeyframeMove[];
}

/** Moves many keyframes in one edit. A channel is left untouched when two keys would share a frame. */
export function moveKeyframes(project: Project, input: MoveKeyframesInput): EditResult {
  return updateClip(project, input.sequenceId, input.clipId, (clip) => {
    const grouped = new Map<MotionChannelId, Map<string, number>>();
    for (const move of input.moves) {
      const targets = grouped.get(move.channel) ?? new Map<string, number>();
      targets.set(move.keyframeId, clampLocalFrame(clip, move.frame));
      grouped.set(move.channel, targets);
    }
    let animation = clip.animation;
    let changed = false;
    for (const [channelId, targets] of grouped) {
      const channel = channelAt(animation, channelId);
      const keyframes = channel.keyframes.map((key) => {
        const frame = targets.get(key.id);
        if (frame === undefined || frame === key.frame) return key;
        return { ...key, frame };
      });
      const frames = keyframes.map((key) => key.frame);
      if (new Set(frames).size !== frames.length) continue;
      if (keyframes.every((key, index) => key === channel.keyframes[index])) continue;
      animation = { ...animation, [channelId]: { ...channel, keyframes } };
      changed = true;
    }
    return changed ? { ...clip, animation } : clip;
  });
}

function fitTransitions(clip: Clip, duration: number): Clip['transitions'] {
  const max = maxTransitionFramesForClip(duration);
  const fit = (edge: Clip['transitions']['in']) =>
    edge && edge.durationFrames > max ? { ...edge, durationFrames: max } : edge;
  const inEdge = fit(clip.transitions.in);
  const outEdge = fit(clip.transitions.out);
  if (inEdge === clip.transitions.in && outEdge === clip.transitions.out) return clip.transitions;
  return { in: inEdge, out: outEdge };
}

/** Pushes later clips on one track so a longer clip does not overlap them. */
function shiftTail(sequence: Sequence, trackId: TrackId, fromFrame: number, delta: number): Sequence {
  if (delta <= 0) return sequence;
  const track = findTrack(sequence, trackId);
  if (!track || track.locked) return sequence;
  let clips = sequence.clips;
  let changed = false;
  for (const id of track.clipIds) {
    const current = clips[id];
    if (!current || current.start < fromFrame) continue;
    clips = { ...clips, [id]: { ...current, start: current.start + delta } };
    changed = true;
  }
  return changed ? { ...sequence, clips } : sequence;
}

export function setClipSpeed(
  project: Project,
  input: { readonly sequenceId: SequenceId; readonly clipId: ClipId; readonly speed: number },
): EditResult {
  const speed = clipSpeedPercent(input.speed);
  return updateSequence(project, input.sequenceId, (sequence) => {
    const clip = sequence.clips[input.clipId];
    if (!clip) return fail('NOT_FOUND', `Clip ${input.clipId} does not exist.`);
    const track = findTrack(sequence, clip.trackId);
    if (track?.locked) return fail('LOCKED', `Track ${track.name} is locked.`);

    const targets = [clip];
    if (clip.linkId && sequence.clips[clip.linkId]) {
      const partner = sequence.clips[clip.linkId]!;
      const partnerTrack = findTrack(sequence, partner.trackId);
      if (!partnerTrack?.locked) targets.push(partner);
    }

    let clips = sequence.clips;
    const ripples: { trackId: TrackId; fromFrame: number; delta: number }[] = [];
    for (const current of targets) {
      if (current.speed === speed) continue;
      const oldDuration = getClipDuration(current);
      const newDuration = timelineFrameCount(current.sourceOut - current.sourceIn, speed);
      clips = {
        ...clips,
        [current.id]: {
          ...current,
          speed,
          animation: scaleClipAnimation(current.animation ?? {}, oldDuration, newDuration),
          transitions: fitTransitions(current, newDuration),
        },
      };
      if (newDuration > oldDuration) {
        ripples.push({ trackId: current.trackId, fromFrame: getClipEnd(current), delta: newDuration - oldDuration });
      }
    }
    let next: Sequence = { ...sequence, clips };
    for (const ripple of ripples) next = shiftTail(next, ripple.trackId, ripple.fromFrame, ripple.delta);
    return ok(next);
  });
}

export function moveKeyframe(project: Project, input: MoveKeyframeInput): EditResult {
  return updateClip(project, input.sequenceId, input.clipId, (clip) => {
    const channel = channelAt(clip.animation ?? {}, input.channel);
    const key = channel.keyframes.find((item) => item.id === input.keyframeId);
    if (!key) return clip;
    const frame = clampLocalFrame(clip, input.frame);
    if (channel.keyframes.some((item) => item.id !== key.id && item.frame === frame)) return clip;
    const keyframes = channel.keyframes.map((item) => (item.id === key.id ? { ...item, frame } : item));
    return { ...clip, animation: { ...clip.animation, [input.channel]: { ...channel, keyframes } } };
  });
}

export interface SetKeyframeInterpolationInput {
  readonly sequenceId: SequenceId;
  readonly clipId: ClipId;
  readonly channel: MotionChannelId;
  readonly keyframeId: string;
  readonly interpolation: KeyframeInterpolation;
}

export function setKeyframeInterpolation(project: Project, input: SetKeyframeInterpolationInput): EditResult {
  return updateClip(project, input.sequenceId, input.clipId, (clip) => {
    const channel = channelAt(clip.animation ?? {}, input.channel);
    if (!channel.keyframes.some((key) => key.id === input.keyframeId)) return clip;
    const keyframes = channel.keyframes.map((key) =>
      key.id === input.keyframeId ? { ...key, interpolation: input.interpolation } : key,
    );
    return { ...clip, animation: { ...clip.animation, [input.channel]: { ...channel, keyframes } } };
  });
}

export function resetMotionChannel(project: Project, input: Omit<SetMotionChannelInput, 'enabled' | 'localFrame'>): EditResult {
  return updateClip(project, input.sequenceId, input.clipId, (clip) => {
    const transform = mergeClipTransform(clip.transform, {
      [input.channel]: DEFAULT_CLIP_TRANSFORM[input.channel],
    });
    return {
      ...clip,
      transform,
      animation: { ...clip.animation, [input.channel]: { enabled: false, keyframes: [] } },
    };
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
