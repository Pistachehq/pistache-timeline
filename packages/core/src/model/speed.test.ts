import { unwrap } from '@timeline/shared';
import { describe, expect, it } from 'vitest';
import { validateProjectInvariants } from './invariants';
import { clipPitchAmount, pitchRatioFromAmount, pitchWetMix } from './effects';
import { createClip } from './factory';
import { getClipDuration } from './queries';
import { clipSpeedPercent, sourceMediaFrame, timelineFrameCount } from './speed';
import { addClip, moveKeyframes, setClipSpeed, setMotionChannelEnabled, toggleKeyframeAtFrame } from '../operations/clips';
import { activeSequence, setupProject } from '../test/fixtures';

describe('sourceMediaFrame', () => {
  const clip = createClip({
    assetId: 'asset' as never,
    trackId: 'track' as never,
    name: 'Clip',
    start: 10,
    sourceIn: 0,
    sourceOut: 30,
  });

  it('plays the source one-to-one at 100%', () => {
    expect(timelineFrameCount(30, 100)).toBe(30);
    expect(sourceMediaFrame(clip, 10)).toBe(0);
    expect(sourceMediaFrame(clip, 20)).toBe(10);
  });

  it('plays the whole source in half the timeline length at 200%', () => {
    const fast = { ...clip, speed: 200 };
    expect(getClipDuration(fast)).toBe(15);
    expect(sourceMediaFrame(fast, 10)).toBe(0);
    expect(sourceMediaFrame(fast, 24)).toBe(28);
  });

  it('stretches the source when slowed down', () => {
    expect(sourceMediaFrame({ ...clip, speed: 50 }, 30)).toBe(10);
    expect(clipSpeedPercent(0)).toBe(10);
    expect(clipSpeedPercent(5000)).toBe(1000);
  });
});

describe('pitch', () => {
  it('maps the ends of the slider to one octave', () => {
    expect(pitchRatioFromAmount(0)).toBe(1);
    expect(pitchRatioFromAmount(100)).toBe(2);
    expect(pitchRatioFromAmount(-100)).toBe(0.5);
    expect(pitchWetMix(0)).toBe(0);
    expect(pitchWetMix(1)).toBe(0);
    expect(pitchWetMix(-1)).toBe(0);
    expect(pitchWetMix(100)).toBe(1);
    expect(clipPitchAmount([{ kind: 'pitch', amount: 40 }])).toBe(40);
  });
});

describe('setClipSpeed', () => {
  it('stores the speed used by playback', () => {
    const { project, sequence, video } = setupProject();
    const added = unwrap(
      addClip(project, { sequenceId: sequence.id, trackId: sequence.videoTracks[0]!.id, assetId: video.id, start: 0 }),
    );
    const clipId = activeSequence(added).videoTracks[0]!.clipIds[0]!;
    const next = unwrap(setClipSpeed(added, { sequenceId: sequence.id, clipId, speed: 200 }));
    const clip = activeSequence(next).clips[clipId]!;
    expect(clip.speed).toBe(200);
    expect(getClipDuration(clip)).toBe(150);
    expect(sourceMediaFrame(clip, 10)).toBe(20);
  });

  it('shrinks a faster clip and pushes later clips when slowed down', () => {
    const { project, sequence, video } = setupProject();
    const trackId = sequence.videoTracks[0]!.id;
    const withFirst = unwrap(addClip(project, { sequenceId: sequence.id, trackId, assetId: video.id, start: 0 }));
    const firstId = activeSequence(withFirst).videoTracks[0]!.clipIds[0]!;
    const withSecond = unwrap(addClip(withFirst, { sequenceId: sequence.id, trackId, assetId: video.id, start: 300 }));
    const secondId = activeSequence(withSecond).videoTracks[0]!.clipIds.find((id) => id !== firstId)!;

    const fast = unwrap(setClipSpeed(withSecond, { sequenceId: sequence.id, clipId: firstId, speed: 200 }));
    expect(getClipDuration(activeSequence(fast).clips[firstId]!)).toBe(150);
    expect(activeSequence(fast).clips[secondId]!.start).toBe(300);

    const slow = unwrap(setClipSpeed(withSecond, { sequenceId: sequence.id, clipId: firstId, speed: 50 }));
    const slowed = activeSequence(slow);
    expect(getClipDuration(slowed.clips[firstId]!)).toBe(600);
    expect(slowed.clips[secondId]!.start).toBe(600);
    expect(validateProjectInvariants(slow)).toEqual([]);
  });
});

describe('moveKeyframes', () => {
  it('shifts every selected key by the same amount', () => {
    const { project, sequence, video } = setupProject();
    const added = unwrap(
      addClip(project, { sequenceId: sequence.id, trackId: sequence.videoTracks[0]!.id, assetId: video.id, start: 0 }),
    );
    const clipId = activeSequence(added).videoTracks[0]!.clipIds[0]!;
    const enabled = unwrap(
      setMotionChannelEnabled(added, {
        sequenceId: sequence.id,
        clipId,
        channel: 'opacity',
        enabled: true,
        localFrame: 0,
      }),
    );
    const second = unwrap(
      toggleKeyframeAtFrame(enabled, { sequenceId: sequence.id, clipId, channel: 'opacity', localFrame: 10 }),
    );
    const keys = activeSequence(second).clips[clipId]!.animation.opacity!.keyframes;
    const moved = unwrap(
      moveKeyframes(second, {
        sequenceId: sequence.id,
        clipId,
        moves: keys.map((key) => ({ channel: 'opacity' as const, keyframeId: key.id, frame: key.frame + 4 })),
      }),
    );
    expect(activeSequence(moved).clips[clipId]!.animation.opacity!.keyframes.map((key) => key.frame).sort((a, b) => a - b)).toEqual([
      4, 14,
    ]);
  });
});
