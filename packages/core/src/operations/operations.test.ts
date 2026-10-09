import { unwrap } from '@timeline/shared';
import { describe, expect, it } from 'vitest';
import { validateProjectInvariants } from '../model/invariants';
import { getClipEnd, getSeamlessClipSuccessor, getSequenceDuration, getTopmostVideoClipAt } from '../model/queries';
import { type ClipId, type MediaAssetId, type Project, type TrackId } from '../model/types';
import { createProject } from '../model/factory';
import { activeSequence, imageAsset, setupProject } from '../test/fixtures';
import {
  addClip,
  moveClip,
  removeClips,
  setClipEnabled,
  splitClip,
  trimClip,
  updateClipAudio,
  updateClipTransform,
} from './clips';
import { updateClipTransitions } from './clip-effects';
import { addMediaAssets, removeMediaAsset } from './media';
import { addTrack, updateTrack } from './tracks';

const CLIP_A = 'clip_a' as ClipId;
const CLIP_B = 'clip_b' as ClipId;

const VIDEO_ASSET = 'asset_video' as MediaAssetId;

function withClip(): { project: Project; v1: TrackId; v2: TrackId; a1: TrackId } {
  const { project, sequence, video } = setupProject();
  const v1 = sequence.videoTracks[0]!.id;
  const next = unwrap(
    addClip(project, { sequenceId: sequence.id, trackId: v1, assetId: video.id, start: 0, clipId: CLIP_A }),
  );
  return { project: next, v1, v2: sequence.videoTracks[1]!.id, a1: sequence.audioTracks[0]!.id };
}

describe('addClip', () => {
  it('adds a clip spanning the full asset by default', () => {
    const { project } = withClip();
    const sequence = activeSequence(project);
    const clip = sequence.clips[CLIP_A]!;
    expect(clip.sourceIn).toBe(0);
    expect(clip.sourceOut).toBe(300); // 10 s at 30 fps
    expect(getSequenceDuration(sequence)).toBe(300);
    expect(sequence.videoTracks[0]!.clipIds).toEqual([CLIP_A]);
    expect(validateProjectInvariants(project)).toEqual([]);
  });

  it('overwrites existing clips when placing on an occupied range', () => {
    const { project, v1 } = withClip();
    const sequence = activeSequence(project);
    const next = activeSequence(
      unwrap(addClip(project, { sequenceId: sequence.id, trackId: v1, assetId: VIDEO_ASSET, start: 100, clipId: CLIP_B })),
    );
    expect(getClipEnd(next.clips[CLIP_A]!)).toBe(100);
    expect(next.clips[CLIP_B]!.start).toBe(100);
  });

  it('rejects incompatible track kinds and out-of-range sources', () => {
    const { project, sequence, audio, video } = setupProject();
    const onVideo = addClip(project, { sequenceId: sequence.id, trackId: sequence.videoTracks[0]!.id, assetId: audio.id, start: 0 });
    expect(onVideo.ok).toBe(false);
    const tooLong = addClip(project, { sequenceId: sequence.id, trackId: sequence.videoTracks[0]!.id, assetId: video.id, start: 0, sourceOut: 301 });
    expect(tooLong.ok).toBe(false);
  });

  it('keeps clips ordered by start', () => {
    const { project, v1 } = withClip();
    const sequence = activeSequence(project);
    const moved = unwrap(moveClip(project, { sequenceId: sequence.id, clipId: CLIP_A, start: 400 }));
    const added = unwrap(
      addClip(moved, { sequenceId: sequence.id, trackId: v1, assetId: VIDEO_ASSET, start: 0, clipId: CLIP_B }),
    );
    expect(activeSequence(added).videoTracks[0]!.clipIds).toEqual([CLIP_B, CLIP_A]);
    expect(validateProjectInvariants(added)).toEqual([]);
  });
});

describe('moveClip', () => {
  it('moves a clip in time without mutating the original project', () => {
    const { project } = withClip();
    const sequence = activeSequence(project);
    const next = unwrap(moveClip(project, { sequenceId: sequence.id, clipId: CLIP_A, start: 45 }));
    expect(activeSequence(next).clips[CLIP_A]!.start).toBe(45);
    expect(sequence.clips[CLIP_A]!.start).toBe(0);
  });

  it('moves a clip between tracks of the same kind', () => {
    const { project, v1, v2 } = withClip();
    const sequence = activeSequence(project);
    const next = activeSequence(unwrap(moveClip(project, { sequenceId: sequence.id, clipId: CLIP_A, start: 10, trackId: v2 })));
    expect(next.clips[CLIP_A]!.trackId).toBe(v2);
    expect(next.videoTracks.find((t) => t.id === v1)!.clipIds).toEqual([]);
    expect(next.videoTracks.find((t) => t.id === v2)!.clipIds).toEqual([CLIP_A]);
  });

  it('refuses audio tracks, locked tracks and negative starts', () => {
    const { project, a1, v1 } = withClip();
    const sequence = activeSequence(project);
    expect(moveClip(project, { sequenceId: sequence.id, clipId: CLIP_A, start: 0, trackId: a1 }).ok).toBe(false);
    expect(moveClip(project, { sequenceId: sequence.id, clipId: CLIP_A, start: -5 }).ok).toBe(false);
    const locked = unwrap(updateTrack(project, { sequenceId: sequence.id, trackId: v1, changes: { locked: true } }));
    const result = moveClip(locked, { sequenceId: sequence.id, clipId: CLIP_A, start: 20 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('LOCKED');
  });

  it('returns the same project for a no-op move', () => {
    const { project } = withClip();
    const sequence = activeSequence(project);
    expect(unwrap(moveClip(project, { sequenceId: sequence.id, clipId: CLIP_A, start: 0 }))).toBe(project);
  });

  it('overwrites overlapping clips on the same track when moving', () => {
    const { project, v1 } = withClip();
    const sequence = activeSequence(project);
    let next = unwrap(
      addClip(project, { sequenceId: sequence.id, trackId: v1, assetId: VIDEO_ASSET, start: 300, clipId: CLIP_B }),
    );
    next = unwrap(moveClip(next, { sequenceId: sequence.id, clipId: CLIP_B, start: 100 }));
    const seq = activeSequence(next);
    expect(seq.clips[CLIP_A]!.start).toBe(0);
    expect(getClipEnd(seq.clips[CLIP_A]!)).toBe(100);
    expect(seq.clips[CLIP_B]!.start).toBe(100);
  });
});

describe('splitClip and removeClips', () => {
  it('splits a clip into two contiguous clips', () => {
    const { project } = withClip();
    const sequence = activeSequence(project);
    const next = activeSequence(unwrap(splitClip(project, { sequenceId: sequence.id, clipId: CLIP_A, frame: 120, newClipId: CLIP_B })));
    const left = next.clips[CLIP_A]!;
    const right = next.clips[CLIP_B]!;
    expect([left.start, left.sourceIn, left.sourceOut]).toEqual([0, 0, 120]);
    expect([right.start, right.sourceIn, right.sourceOut]).toEqual([120, 120, 300]);
    expect(getClipEnd(left)).toBe(right.start);
    expect(next.videoTracks[0]!.clipIds).toEqual([CLIP_A, CLIP_B]);
    expect(getSeamlessClipSuccessor(next, left)?.id).toBe(CLIP_B);
  });

  it('trims clip start and end', () => {
    const { project } = withClip();
    const sequence = activeSequence(project);
    const trimmedStart = activeSequence(
      unwrap(trimClip(project, { sequenceId: sequence.id, clipId: CLIP_A, edge: 'start', frame: 30 })),
    );
    expect(trimmedStart.clips[CLIP_A]!.start).toBe(30);
    expect(trimmedStart.clips[CLIP_A]!.sourceIn).toBe(30);
    const projectAfterStart = unwrap(trimClip(project, { sequenceId: sequence.id, clipId: CLIP_A, edge: 'start', frame: 30 }));
    const trimmedEnd = activeSequence(
      unwrap(trimClip(projectAfterStart, { sequenceId: sequence.id, clipId: CLIP_A, edge: 'end', frame: 270 })),
    );
    expect(trimmedEnd.clips[CLIP_A]!.sourceOut).toBe(270);
  });

  it('extends still image clips beyond the default import duration', () => {
    const image = imageAsset();
    const project = unwrap(
      addMediaAssets(createProject({ now: new Date('2026-01-01T00:00:00Z') }), [image]),
    );
    const sequence = activeSequence(project);
    const v1 = sequence.videoTracks[0]!.id;
    const withClip = unwrap(
      addClip(project, { sequenceId: sequence.id, trackId: v1, assetId: image.id, start: 0, clipId: CLIP_A }),
    );
    const placed = activeSequence(withClip).clips[CLIP_A]!;
    expect(placed.sourceOut).toBe(150); // 5 s at 30 fps

    const extended = activeSequence(
      unwrap(
        trimClip(withClip, {
          sequenceId: sequence.id,
          clipId: CLIP_A,
          edge: 'end',
          frame: 600,
        }),
      ),
    );
    expect(extended.clips[CLIP_A]!.sourceOut).toBe(600);
    expect(getClipEnd(extended.clips[CLIP_A]!)).toBe(600);
  });

  it('extends a still image to the left without moving its end', () => {
    const image = imageAsset();
    const project = unwrap(addMediaAssets(createProject({ now: new Date('2026-01-01T00:00:00Z') }), [image]));
    const sequence = activeSequence(project);
    const v1 = sequence.videoTracks[0]!.id;
    const withClip = unwrap(
      addClip(project, { sequenceId: sequence.id, trackId: v1, assetId: image.id, start: 90, clipId: CLIP_A }),
    );
    const before = activeSequence(withClip).clips[CLIP_A]!;
    const end = getClipEnd(before);

    const extended = activeSequence(
      unwrap(trimClip(withClip, { sequenceId: sequence.id, clipId: CLIP_A, edge: 'start', frame: 30 })),
    );
    const clip = extended.clips[CLIP_A]!;
    expect(clip.start).toBe(30);
    expect(clip.sourceIn).toBe(0);
    expect(clip.sourceOut).toBe(before.sourceOut + 60);
    expect(getClipEnd(clip)).toBe(end);

    const blocked = trimClip(withClip, { sequenceId: sequence.id, clipId: CLIP_A, edge: 'start', frame: -5 });
    expect(blocked.ok).toBe(false);
  });

  it('does not extend a video start past the beginning of the file', () => {
    const { project, v1 } = withClip();
    const sequence = activeSequence(project);
    const moved = unwrap(moveClip(project, { sequenceId: sequence.id, clipId: CLIP_A, trackId: v1, start: 50 }));
    const before = activeSequence(moved).clips[CLIP_A]!;
    expect(before.sourceIn).toBe(0);
    const trimmed = trimClip(moved, { sequenceId: sequence.id, clipId: CLIP_A, edge: 'start', frame: 10 });
    expect(trimmed.ok).toBe(false);
  });

  it('drops transitions on new cut edges when splitting', () => {
    const { project } = withClip();
    const sequence = activeSequence(project);
    const withTransitions = unwrap(
      updateClipTransitions(project, {
        sequenceId: sequence.id,
        clipId: CLIP_A,
        transitions: {
          in: { durationFrames: 30, videoKind: 'fade', libraryId: null, audioCurve: 'constant-power' },
          out: { durationFrames: 20, videoKind: 'fade', libraryId: null, audioCurve: 'constant-power' },
        },
      }),
    );
    const next = activeSequence(
      unwrap(
        splitClip(withTransitions, {
          sequenceId: sequence.id,
          clipId: CLIP_A,
          frame: 120,
          newClipId: CLIP_B,
        }),
      ),
    );
    expect(next.clips[CLIP_A]!.transitions.in?.durationFrames).toBe(30);
    expect(next.clips[CLIP_A]!.transitions.out?.durationFrames).toBe(20);
    expect(next.clips[CLIP_B]!.transitions.in).toBeNull();
    expect(next.clips[CLIP_B]!.transitions.out).toBeNull();
  });

  it('keeps transition durations when trimming with [ ]', () => {
    const { project } = withClip();
    const sequence = activeSequence(project);
    const withTransitions = unwrap(
      updateClipTransitions(project, {
        sequenceId: sequence.id,
        clipId: CLIP_A,
        transitions: {
          in: { durationFrames: 30, videoKind: 'fade', libraryId: null, audioCurve: 'constant-power' },
          out: { durationFrames: 40, videoKind: 'fade', libraryId: null, audioCurve: 'constant-power' },
        },
      }),
    );
    const afterStart = unwrap(
      trimClip(withTransitions, { sequenceId: sequence.id, clipId: CLIP_A, edge: 'start', frame: 10 }),
    );
    expect(activeSequence(afterStart).clips[CLIP_A]!.transitions.in?.durationFrames).toBe(30);

    const afterEnd = unwrap(
      trimClip(afterStart, { sequenceId: sequence.id, clipId: CLIP_A, edge: 'end', frame: 280 }),
    );
    expect(activeSequence(afterEnd).clips[CLIP_A]!.transitions.out?.durationFrames).toBe(40);
  });

  it('rejects split points on clip boundaries', () => {
    const { project } = withClip();
    const sequence = activeSequence(project);
    expect(splitClip(project, { sequenceId: sequence.id, clipId: CLIP_A, frame: 0 }).ok).toBe(false);
    expect(splitClip(project, { sequenceId: sequence.id, clipId: CLIP_A, frame: 300 }).ok).toBe(false);
  });

  it('removes clips and their track references', () => {
    const { project } = withClip();
    const sequence = activeSequence(project);
    const next = activeSequence(unwrap(removeClips(project, { sequenceId: sequence.id, clipIds: [CLIP_A] })));
    expect(next.clips[CLIP_A]).toBeUndefined();
    expect(next.videoTracks[0]!.clipIds).toEqual([]);
  });

  it('clears the partner link when only one side of a linked pair is removed', () => {
    const { project } = withClip();
    const sequence = activeSequence(project);
    const videoId = sequence.videoTracks[0]!.clipIds[0]!;
    const audioId = CLIP_B;
    const linked = {
      ...sequence,
      clips: {
        ...sequence.clips,
        [videoId]: { ...sequence.clips[videoId]!, linkId: audioId },
        [audioId]: {
          ...sequence.clips[videoId]!,
          id: audioId,
          trackId: sequence.audioTracks[0]!.id,
          linkId: videoId,
        },
      },
      audioTracks: [
        { ...sequence.audioTracks[0]!, clipIds: [audioId] },
        ...sequence.audioTracks.slice(1),
      ],
    };
    const projectLinked = { ...project, sequences: { ...project.sequences, [sequence.id]: linked } };
    const next = activeSequence(
      unwrap(removeClips(projectLinked, { sequenceId: sequence.id, clipIds: [audioId] })),
    );
    expect(next.clips[audioId]).toBeUndefined();
    expect(next.clips[videoId]?.linkId).toBeNull();
    expect(next.clips[videoId]?.audio.muted).toBe(true);
  });

  it('removing an asset removes its clips', () => {
    const { project } = withClip();
    const next = unwrap(removeMediaAsset(project, VIDEO_ASSET));
    expect(activeSequence(next).clips[CLIP_A]).toBeUndefined();
    expect(validateProjectInvariants(next)).toEqual([]);
  });
});

describe('clip properties', () => {
  it('updates and clamps transform values', () => {
    const { project } = withClip();
    const sequence = activeSequence(project);
    const next = unwrap(
      updateClipTransform(project, { sequenceId: sequence.id, clipId: CLIP_A, transform: { positionX: 120, opacity: 150, scaleX: Number.NaN } }),
    );
    const t = activeSequence(next).clips[CLIP_A]!.transform;
    expect(t.positionX).toBe(120);
    expect(t.opacity).toBe(100);
    expect(t.scaleX).toBe(100);
    expect(t.scaleY).toBe(100);
  });

  it('updates audio properties and enabled state', () => {
    const { project } = withClip();
    const sequence = activeSequence(project);
    const next = unwrap(updateClipAudio(project, { sequenceId: sequence.id, clipId: CLIP_A, audio: { volume: 40, muted: true } }));
    expect(activeSequence(next).clips[CLIP_A]!.audio).toEqual({ volume: 40, muted: true, pan: 0 });
    const disabled = unwrap(setClipEnabled(next, { sequenceId: sequence.id, clipId: CLIP_A, enabled: false }));
    expect(getTopmostVideoClipAt(activeSequence(disabled), 10)).toBeNull();
  });
});

describe('tracks', () => {
  it('adds tracks with sequential names', () => {
    const { project, sequence } = setupProject();
    const next = activeSequence(unwrap(addTrack(project, { sequenceId: sequence.id, kind: 'video' })));
    expect(next.videoTracks.map((t) => t.name)).toEqual(['V1', 'V2', 'V3', 'V4']);
  });

  it('hidden tracks are skipped when resolving the program clip', () => {
    const { project, v1 } = withClip();
    const sequence = activeSequence(project);
    expect(getTopmostVideoClipAt(sequence, 0)?.clip.id).toBe(CLIP_A);
    const hidden = unwrap(updateTrack(project, { sequenceId: sequence.id, trackId: v1, changes: { visible: false } }));
    expect(getTopmostVideoClipAt(activeSequence(hidden), 0)).toBeNull();
  });
});
