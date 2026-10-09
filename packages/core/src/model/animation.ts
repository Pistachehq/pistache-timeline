import { createId } from '@timeline/shared';
import { getClipDuration } from './queries';
import { type Clip, type ClipTransform } from './types';

/** Motion channels that can vary over the clip. */
export const MOTION_CHANNELS = [
  'positionX',
  'positionY',
  'scaleX',
  'scaleY',
  'rotation',
  'opacity',
  'anchorX',
  'anchorY',
] as const;

export type MotionChannelId = (typeof MOTION_CHANNELS)[number];

export type KeyframeInterpolation = 'linear' | 'hold';

export interface ScalarKeyframe {
  readonly id: string;
  /** Frame offset from the clip's sequence start. */
  readonly frame: number;
  readonly value: number;
  /** How this keyframe blends toward the next one. */
  readonly interpolation: KeyframeInterpolation;
}

export interface AnimatedChannel {
  readonly enabled: boolean;
  readonly keyframes: readonly ScalarKeyframe[];
}

export type ClipAnimation = Partial<Record<MotionChannelId, AnimatedChannel>>;

export const EMPTY_CLIP_ANIMATION: ClipAnimation = {};

export function newKeyframeId(): string {
  return createId('kf');
}

/** Sequence frame minus the clip start. Keyframes live in this clock. */
export function clipLocalFrame(clip: { readonly start: number }, sequenceFrame: number): number {
  return sequenceFrame - clip.start;
}

function sortedKeys(channel: AnimatedChannel): ScalarKeyframe[] {
  return [...channel.keyframes].sort((a, b) => a.frame - b.frame || a.id.localeCompare(b.id));
}

/** Value of one channel at a clip-local frame. Disabled channels stay at the static value. */
export function evaluateChannel(channel: AnimatedChannel | undefined, staticValue: number, localFrame: number): number {
  if (!channel?.enabled || channel.keyframes.length === 0) return staticValue;
  const keys = sortedKeys(channel);
  const first = keys[0]!;
  if (localFrame <= first.frame) return first.value;
  const last = keys[keys.length - 1]!;
  if (localFrame >= last.frame) return last.value;
  let previous = first;
  for (let index = 1; index < keys.length; index++) {
    const next = keys[index]!;
    if (localFrame <= next.frame) {
      if (previous.interpolation === 'hold' || next.frame === previous.frame) return previous.value;
      const span = next.frame - previous.frame;
      const t = span === 0 ? 1 : (localFrame - previous.frame) / span;
      return previous.value + (next.value - previous.value) * t;
    }
    previous = next;
  }
  return last.value;
}

/** Transform used for preview and export at a sequence frame. */
export function evaluateClipTransform(clip: Clip, sequenceFrame: number): ClipTransform {
  const local = clipLocalFrame(clip, sequenceFrame);
  const base = clip.transform;
  const animation = clip.animation ?? EMPTY_CLIP_ANIMATION;
  const scaleX = evaluateChannel(animation.scaleX, base.scaleX, local);
  return {
    positionX: evaluateChannel(animation.positionX, base.positionX, local),
    positionY: evaluateChannel(animation.positionY, base.positionY, local),
    scaleX,
    scaleY: base.uniformScale ? scaleX : evaluateChannel(animation.scaleY, base.scaleY, local),
    uniformScale: base.uniformScale,
    rotation: evaluateChannel(animation.rotation, base.rotation, local),
    opacity: evaluateChannel(animation.opacity, base.opacity, local),
    anchorX: evaluateChannel(animation.anchorX, base.anchorX, local),
    anchorY: evaluateChannel(animation.anchorY, base.anchorY, local),
    blendMode: base.blendMode,
  };
}

export function channelAt(animation: ClipAnimation, id: MotionChannelId): AnimatedChannel {
  return animation[id] ?? { enabled: false, keyframes: [] };
}

export function upsertKeyframe(channel: AnimatedChannel, frame: number, value: number): AnimatedChannel {
  const at = Math.round(frame);
  const existing = channel.keyframes.find((key) => key.frame === at);
  if (existing) {
    return {
      enabled: channel.enabled,
      keyframes: channel.keyframes.map((key) => (key.frame === at ? { ...key, value } : key)),
    };
  }
  return {
    enabled: channel.enabled,
    keyframes: [
      ...channel.keyframes,
      { id: newKeyframeId(), frame: at, value, interpolation: 'linear' },
    ],
  };
}

/** Drops keys that fall outside the clip after a trim, shifting when the head moves. */
export function refitClipAnimation(animation: ClipAnimation, headDelta: number, duration: number): ClipAnimation {
  const next: ClipAnimation = {};
  for (const id of MOTION_CHANNELS) {
    const channel = animation[id];
    if (!channel) continue;
    const keyframes = sortedKeys({
      enabled: channel.enabled,
      keyframes: channel.keyframes
        .map((key) => ({ ...key, frame: key.frame - headDelta }))
        .filter((key) => key.frame >= 0 && key.frame < Math.max(1, duration)),
    });
    next[id] = { enabled: channel.enabled, keyframes };
  }
  return next;
}

/** Keeps keyframes spread across a clip after its timeline length changes. */
export function scaleClipAnimation(animation: ClipAnimation, oldDuration: number, newDuration: number): ClipAnimation {
  if (oldDuration === newDuration || oldDuration <= 0 || newDuration <= 0) return animation;
  const scale = newDuration / oldDuration;
  const next: ClipAnimation = {};
  for (const id of MOTION_CHANNELS) {
    const channel = animation[id];
    if (!channel) continue;
    const used = new Set<number>();
    const keyframes: ScalarKeyframe[] = [];
    for (const key of sortedKeys(channel)) {
      const frame = Math.min(newDuration - 1, Math.max(0, Math.round(key.frame * scale)));
      if (used.has(frame)) continue;
      used.add(frame);
      keyframes.push(frame === key.frame ? key : { ...key, frame });
    }
    next[id] = keyframes === channel.keyframes ? channel : { ...channel, keyframes };
  }
  return next;
}

export function keyframeAtFrame(channel: AnimatedChannel, frame: number): ScalarKeyframe | undefined {
  const at = Math.round(frame);
  return channel.keyframes.find((key) => key.frame === at);
}

export function clampLocalFrame(clip: Clip, localFrame: number): number {
  const duration = Math.max(1, getClipDuration(clip));
  return Math.min(duration - 1, Math.max(0, Math.round(localFrame)));
}
