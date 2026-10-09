import { describe, expect, it } from 'vitest';
import { createClip } from './factory';
import { evaluateChannel, evaluateClipTransform, refitClipAnimation, upsertKeyframe } from './animation';
import { DEFAULT_CLIP_TRANSFORM } from './defaults';

const clip = {
  ...createClip({
    assetId: 'asset' as never,
    trackId: 'track' as never,
    name: 'Clip',
    start: 100,
    sourceIn: 0,
    sourceOut: 50,
  }),
  transform: { ...DEFAULT_CLIP_TRANSFORM, positionX: 0 },
};

describe('evaluateChannel', () => {
  const channel = {
    enabled: true,
    keyframes: [
      { id: 'a', frame: 0, value: 0, interpolation: 'linear' as const },
      { id: 'b', frame: 10, value: 100, interpolation: 'hold' as const },
      { id: 'c', frame: 20, value: 40, interpolation: 'linear' as const },
    ],
  };

  it('interpolates linearly and holds after a hold keyframe', () => {
    expect(evaluateChannel(channel, 5, 5)).toBe(50);
    expect(evaluateChannel(channel, 5, 15)).toBe(100);
    expect(evaluateChannel(channel, 5, 20)).toBe(40);
    expect(evaluateChannel(channel, 5, -4)).toBe(0);
  });

  it('ignores keyframes while animation is off', () => {
    expect(evaluateChannel({ ...channel, enabled: false }, 8, 5)).toBe(8);
  });
});

describe('evaluateClipTransform', () => {
  it('reads position from clip-local time when the playhead moves with the clip', () => {
    const animated = {
      ...clip,
      animation: {
        positionX: {
          enabled: true,
          keyframes: [
            { id: 'a', frame: 0, value: -200, interpolation: 'linear' as const },
            { id: 'b', frame: 20, value: 0, interpolation: 'linear' as const },
          ],
        },
      },
    };
    expect(evaluateClipTransform(animated, 100).positionX).toBe(-200);
    expect(evaluateClipTransform(animated, 110).positionX).toBe(-100);
    expect(evaluateClipTransform(animated, 120).positionX).toBe(0);
  });
});

describe('refitClipAnimation', () => {
  it('shifts keyframes when the clip head is trimmed', () => {
    const channel = upsertKeyframe({ enabled: true, keyframes: [] }, 0, 1);
    const withLater = upsertKeyframe(channel, 12, 2);
    const next = refitClipAnimation({ positionX: withLater }, 10, 40);
    expect(next.positionX?.keyframes.map((key) => key.frame)).toEqual([2]);
    expect(next.positionX?.keyframes[0]?.value).toBe(2);
  });
});
