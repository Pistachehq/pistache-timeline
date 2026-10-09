import { type Clip, type ClipEffects, type VideoEffect } from '@timeline/core';

export type ClipCrop = VideoEffect & { readonly kind: 'crop' };

export const EMPTY_CLIP_CROP: ClipCrop = { kind: 'crop', top: 0, right: 0, bottom: 0, left: 0 };

const roundCropSide = (value: number): number => Math.round(value * 10) / 10;

/** Rounds crop insets for storage and display (drag uses raw floats until commit). */
export function normalizeClipCrop(crop: ClipCrop): ClipCrop {
  return {
    kind: 'crop',
    top: roundCropSide(crop.top),
    right: roundCropSide(crop.right),
    bottom: roundCropSide(crop.bottom),
    left: roundCropSide(crop.left),
  };
}

export function getClipCrop(clip: Clip): ClipCrop | null {
  const found = clip.effects.video.find((e): e is ClipCrop => e.kind === 'crop');
  return found ?? null;
}

export function isCropActive(crop: ClipCrop | null): boolean {
  if (!crop) return false;
  return crop.top + crop.right + crop.bottom + crop.left > 0;
}

export function upsertClipCrop(
  effects: ClipEffects,
  crop: ClipCrop,
  options?: { readonly keepEmpty?: boolean; readonly raw?: boolean },
): ClipEffects {
  const normalized = options?.raw ? crop : normalizeClipCrop(crop);
  const without = effects.video.filter((e) => e.kind !== 'crop');
  if (!options?.keepEmpty && !isCropActive(normalized)) {
    return { ...effects, video: without };
  }
  return { ...effects, video: [...without, normalized] };
}

export function clearClipCrop(effects: ClipEffects): ClipEffects {
  return { ...effects, video: effects.video.filter((e) => e.kind !== 'crop') };
}

export function ensureClipCrop(effects: ClipEffects): { effects: ClipEffects; crop: ClipCrop } {
  const existing = effects.video.find((e): e is ClipCrop => e.kind === 'crop');
  if (existing) return { effects, crop: existing };
  const crop = EMPTY_CLIP_CROP;
  return { effects: upsertClipCrop(effects, crop, { keepEmpty: true }), crop };
}
