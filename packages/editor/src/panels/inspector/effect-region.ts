import { type EffectRegion } from '@timeline/core';

export const EMPTY_EFFECT_REGION: EffectRegion = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  internal: true,
};

const roundSide = (value: number): number => Math.round(value * 10) / 10;

export function normalizeEffectRegion(region: EffectRegion): EffectRegion {
  return {
    top: roundSide(region.top),
    right: roundSide(region.right),
    bottom: roundSide(region.bottom),
    left: roundSide(region.left),
    internal: region.internal,
  };
}

export function isEffectRegionActive(region: EffectRegion | null | undefined): boolean {
  if (!region) return false;
  return region.top + region.right + region.bottom + region.left > 0;
}

export function regionClipPathCss(region: EffectRegion): string {
  const t = region.top;
  const r = region.right;
  const b = region.bottom;
  const l = region.left;
  return `inset(${t}% ${r}% ${b}% ${l}%)`;
}
