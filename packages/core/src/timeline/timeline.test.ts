import { unwrap } from '@timeline/shared';
import { describe, expect, it } from 'vitest';
import { getAudibleClipsAt, getClipsInRange, getSplittableClipsAt } from '../model/queries';
import { addClip } from '../operations/clips';
import { activeSequence, setupProject } from '../test/fixtures';
import { FrameRates, framesToSeconds, mediaTimeFromSeconds, mediaTimeToFrames, secondsToFrames } from '../time/rational';
import { formatDisplayTime, formatFrameNumber, formatTimecode, parseTimecode } from '../time/timecode';
import { collectSnapTargets, findNearestFreeStart, isRangeFree, snapClipStart, snapFrame } from './placement';
import { computeRulerLayout, getVisibleFrameRange, pixelToFrame, zoomAroundAnchor } from './viewport';

function sequenceWithClipsAt(...starts: number[]) {
  const { project, sequence, audio } = setupProject();
  const trackId = sequence.audioTracks[0]!.id;
  let next = project;
  for (const start of starts) {
    // Audio asset is 5 s = 150 frames.
    next = unwrap(addClip(next, { sequenceId: sequence.id, trackId, assetId: audio.id, start }));
  }
  const updated = activeSequence(next);
  return { sequence: updated, track: updated.audioTracks[0]! };
}

describe('splittable clips', () => {
  it('returns every clip whose range contains the cut frame', () => {
    const { project, sequence, video } = setupProject();
    const vTrack = sequence.videoTracks[0]!.id;
    const v2 = sequence.videoTracks[1]!.id;
    let next = unwrap(addClip(project, { sequenceId: sequence.id, trackId: vTrack, assetId: video.id, start: 0 }));
    next = unwrap(addClip(next, { sequenceId: sequence.id, trackId: v2, assetId: video.id, start: 60 }));
    const seq = activeSequence(next);
    expect(getSplittableClipsAt(seq, 100)).toHaveLength(2);
    expect(getSplittableClipsAt(seq, 30)).toHaveLength(1);
    expect(getSplittableClipsAt(seq, 0)).toHaveLength(0);
  });
});

describe('audible clips', () => {
  it('includes audio tracks and the topmost video clip', () => {
    const { project, sequence, video, audio } = setupProject();
    const vTrack = sequence.videoTracks[0]!.id;
    const aTrack = sequence.audioTracks[0]!.id;
    let next = unwrap(addClip(project, { sequenceId: sequence.id, trackId: vTrack, assetId: video.id, start: 0 }));
    next = unwrap(addClip(next, { sequenceId: sequence.id, trackId: aTrack, assetId: audio.id, start: 0 }));
    const seq = activeSequence(next);
    const ids = getAudibleClipsAt(seq, 10, next.mediaAssets).map((c) => c.assetId);
    expect(ids).toContain(video.id);
    expect(ids).toContain(audio.id);
  });

  it('does not mix embedded video audio when the clip is linked to A-track audio', () => {
    const { project, sequence, video } = setupProject();
    const vTrack = sequence.videoTracks[0]!.id;
    const aTrack = sequence.audioTracks[0]!.id;
    let next = unwrap(addClip(project, { sequenceId: sequence.id, trackId: vTrack, assetId: video.id, start: 0 }));
    next = unwrap(addClip(next, { sequenceId: sequence.id, trackId: aTrack, assetId: video.id, start: 0 }));
    let seq = activeSequence(next);
    const vId = seq.videoTracks[0]!.clipIds[0]!;
    const aId = seq.audioTracks[0]!.clipIds[0]!;
    seq = {
      ...seq,
      clips: {
        ...seq.clips,
        [vId]: { ...seq.clips[vId]!, linkId: aId },
        [aId]: { ...seq.clips[aId]!, linkId: vId },
      },
    };
    const withBoth = getAudibleClipsAt(seq, 10, next.mediaAssets).map((c) => c.id);
    expect(withBoth).toEqual([aId]);

    const withoutAudio = {
      ...seq,
      clips: { [vId]: { ...seq.clips[vId]!, linkId: null, audio: { ...seq.clips[vId]!.audio, muted: true } } },
      audioTracks: seq.audioTracks.map((track) => ({ ...track, clipIds: [] as typeof track.clipIds })),
    };
    expect(getAudibleClipsAt(withoutAudio, 10, next.mediaAssets)).toEqual([]);
  });
});

describe('time conversion', () => {
  it('converts between frames and seconds exactly for NTSC rates', () => {
    expect(framesToSeconds(30000, FrameRates.fps29_97)).toBeCloseTo(1001, 9);
    expect(secondsToFrames(1001, FrameRates.fps29_97)).toBe(30000);
    expect(mediaTimeToFrames({ value: 1001, timescale: 30000 }, FrameRates.fps29_97)).toBe(1);
  });

  it('absorbs floating point noise when flooring', () => {
    expect(secondsToFrames(0.1 + 0.2, FrameRates.fps30, 'floor')).toBe(9);
    expect(mediaTimeToFrames(mediaTimeFromSeconds(10), FrameRates.fps30)).toBe(300);
  });
});

describe('timecode', () => {
  it('formats and parses non-drop-frame timecode', () => {
    expect(formatTimecode(0, FrameRates.fps30)).toBe('00:00:00:00');
    expect(formatTimecode(30 * 3661 + 7, FrameRates.fps30)).toBe('01:01:01:07');
    expect(formatTimecode(24, FrameRates.fps23_976)).toBe('00:00:01:00');
    expect(parseTimecode('01:01:01:07', FrameRates.fps30)).toBe(30 * 3661 + 7);
    expect(parseTimecode('2:10', FrameRates.fps30)).toBe(70);
    expect(parseTimecode('45', FrameRates.fps30)).toBe(45);
    expect(parseTimecode('00:00:00:30', FrameRates.fps30)).toBeNull();
    expect(parseTimecode('abc', FrameRates.fps30)).toBeNull();
  });

  it('formats frame numbers and display modes', () => {
    expect(formatFrameNumber(1247.9)).toBe('1247');
    expect(formatDisplayTime(30 * 3661 + 7, FrameRates.fps30, 'timecode')).toBe('01:01:01:07');
    expect(formatDisplayTime(30 * 3661 + 7, FrameRates.fps30, 'frames')).toBe('109837');
  });
});

describe('snap', () => {
  it('snaps clip start and end to nearby edit points', () => {
    const { project, sequence, video } = setupProject();
    const vTrack = sequence.videoTracks[0]!.id;
    let next = unwrap(addClip(project, { sequenceId: sequence.id, trackId: vTrack, assetId: video.id, start: 0 }));
    next = unwrap(addClip(next, { sequenceId: sequence.id, trackId: vTrack, assetId: video.id, start: 300 }));
    const seq = activeSequence(next);
    const targets = collectSnapTargets(seq, { playhead: 150 });
    expect(targets).toContain(0);
    expect(targets).toContain(300);
    expect(targets).toContain(150);

    expect(snapClipStart(103, 50, targets, 8).frame).toBe(100);
    expect(snapClipStart(252, 50, targets, 8).frame).toBe(250);
  });

  it('snaps a single frame for cuts', () => {
    const targets = [0, 100, 200];
    expect(snapFrame(104, targets, 5).frame).toBe(100);
    expect(snapFrame(196, targets, 5).frame).toBe(200);
  });
});

describe('placement', () => {
  it('detects free ranges', () => {
    const { sequence, track } = sequenceWithClipsAt(0, 300);
    expect(isRangeFree(sequence, track, 150, 150)).toBe(true);
    expect(isRangeFree(sequence, track, 149, 150)).toBe(false);
  });

  it('finds the nearest gap that fits', () => {
    const { sequence, track } = sequenceWithClipsAt(0, 200);
    // Gap [150, 200) is too small for 150 frames; nearest fits are after 350.
    expect(findNearestFreeStart(sequence, track, 160, 150)).toBe(350);
    expect(findNearestFreeStart(sequence, track, 160, 50)).toBe(150);
    expect(findNearestFreeStart(sequence, track, 1000, 150)).toBe(1000);
  });

  it('can ignore the clip being moved', () => {
    const { sequence, track } = sequenceWithClipsAt(0);
    const clipId = track.clipIds[0]!;
    expect(findNearestFreeStart(sequence, track, 10, 150, clipId)).toBe(10);
  });

  it('queries clips within a frame range', () => {
    const { sequence, track } = sequenceWithClipsAt(0, 150, 600, 1000);
    expect(getClipsInRange(sequence, track, 160, 610).map((c) => c.start)).toEqual([150, 600]);
    expect(getClipsInRange(sequence, track, 300, 600)).toEqual([]);
  });
});

describe('viewport', () => {
  it('converts pixels to frames', () => {
    expect(pixelToFrame(105, 10)).toBe(11);
    expect(pixelToFrame(-50, 10)).toBe(0);
  });

  it('computes the visible frame range with overscan', () => {
    expect(getVisibleFrameRange(1000, 500, 2, 100)).toEqual({ start: 450, end: 800 });
  });

  it('keeps the anchor frame fixed while zooming', () => {
    const { pixelsPerFrame, scrollLeft } = zoomAroundAnchor(2, 400, 100, 2);
    expect(pixelsPerFrame).toBe(4);
    expect((scrollLeft + 100) / pixelsPerFrame).toBe((400 + 100) / 2);
  });

  it('chooses readable ruler spacing', () => {
    const layout = computeRulerLayout(1, FrameRates.fps30, { start: 0, end: 600 });
    // At 1 px/frame, 2 s (60 px) is too dense, so majors fall every 5 s.
    expect(layout.majorStep).toBe(150);
    expect(layout.minorStep).toBe(30);
    expect(layout.ticks.every((t) => t.frame % layout.minorStep === 0)).toBe(true);
  });
});
