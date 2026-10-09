import { type Clip, type ClipEffects, type EffectRegion, type VideoEffect } from '@timeline/core';
import { EMPTY_EFFECT_REGION, normalizeEffectRegion } from './effect-region';

export type BlurEffect = VideoEffect & { readonly kind: 'blur' };

export function getClipBlur(clip: Clip): BlurEffect | null {
  const found = clip.effects.video.find((e): e is BlurEffect => e.kind === 'blur');
  return found ?? null;
}

export function updateClipBlur(effects: ClipEffects, update: (blur: BlurEffect) => BlurEffect): ClipEffects {
  const without = effects.video.filter((e) => e.kind !== 'blur');
  const current = effects.video.find((e): e is BlurEffect => e.kind === 'blur');
  if (!current) return effects;
  const next = update(current);
  return { ...effects, video: [...without, next] };
}

export function upsertClipBlur(effects: ClipEffects, blur: BlurEffect): ClipEffects {
  const without = effects.video.filter((e) => e.kind !== 'blur');
  return { ...effects, video: [...without, { ...blur, region: blur.region ? normalizeEffectRegion(blur.region) : null }] };
}

export const DEFAULT_BLUR: BlurEffect = { kind: 'blur', amount: 30, region: null };

export function ensureBlurRegion(blur: BlurEffect): EffectRegion {
  return blur.region ?? { ...EMPTY_EFFECT_REGION };
}
