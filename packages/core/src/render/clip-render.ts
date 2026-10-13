import { clamp } from '@timeline/shared';
import {
  type AudioFadeCurve,
  type ClipEdgeTransition,
  type ClipEffects,
  type EffectRegion,
  type VideoEffect,
} from '../model/effects';
import { evaluateClipTransform } from '../model/animation';
import { isCrossDissolveTransition } from '../model/transition-resolve';
import { applyLibraryAmount, libraryEffectLook, scaleLibraryClipPath } from './library-look';
import { transitionPaint, type TransitionPaint } from './transition-paint';
import { type Clip, type Sequence } from '../model/types';
import { findTrack, getClipAtFrame, getClipEnd } from '../model/queries';

export function fadeCurveProgress(t: number, curve: AudioFadeCurve): number {
  const x = clamp(t, 0, 1);
  switch (curve) {
    case 'linear':
      return x;
    case 'constant-power':
      return Math.sin((x * Math.PI) / 2);
    case 'exponential':
      return x <= 0 ? 0 : Math.pow(2, 10 * (x - 1));
    case 'logarithmic':
      return x <= 0 ? 0 : 1 - Math.pow(2, -10 * x);
    default:
      return x;
  }
}

function mergePaint(base: TransitionPaint, next: TransitionPaint): TransitionPaint {
  const transform = [base.transform, next.transform].filter(Boolean).join(' ');
  const filter = [base.filter, next.filter].filter(Boolean).join(' ');
  const clipPath = next.clipPath ?? base.clipPath;
  return {
    opacity: base.opacity * next.opacity,
    ...(clipPath ? { clipPath } : {}),
    ...(transform ? { transform } : {}),
    ...(filter ? { filter } : {}),
  };
}

/** Opacity, mask, and motion for the transition windows on this frame. */
export function clipTransitionPaint(clip: Clip, sequenceFrame: number): TransitionPaint {
  const transitions = clip.transitions;
  let paint: TransitionPaint = { opacity: 1 };
  const local = sequenceFrame - clip.start;
  const end = getClipEnd(clip);

  if (
    transitions.in &&
    transitions.in.affectsVideo !== false &&
    transitions.in.durationFrames > 0 &&
    local >= 0 &&
    local < transitions.in.durationFrames
  ) {
    const p = local / transitions.in.durationFrames;
    paint = mergePaint(paint, transitionPaint(transitions.in, p, 'in'));
  }

  if (transitions.out && transitions.out.affectsVideo !== false && transitions.out.durationFrames > 0) {
    const n = transitions.out.durationFrames;
    const outStart = end - n;
    if (sequenceFrame >= outStart && sequenceFrame < end) {
      const p = (sequenceFrame - outStart) / n;
      paint = mergePaint(paint, transitionPaint(transitions.out, p, 'out'));
    }
  }

  return paint;
}

/** Multiplier 0–1 for clip opacity from in/out transitions (video). */
export function clipTransitionVisualMultiplier(clip: Clip, sequenceFrame: number, sequence: Sequence): number {
  const transitions = clip.transitions;
  let mult = clipTransitionPaint(clip, sequenceFrame).opacity;

  // Incoming cross-dissolve: next clip fades in before its start frame
  const track = findTrack(sequence, clip.trackId);
  const trIn = transitions.in;
  if (track && trIn && isCrossDissolveTransition(trIn) && trIn.durationFrames > 0) {
    const n = trIn.durationFrames;
    const prevEnd = clip.start;
    if (sequenceFrame >= clip.start - n && sequenceFrame < clip.start) {
      const prev = getClipAtFrame(sequence, track, prevEnd - 1);
      if (prev && getClipEnd(prev) === clip.start && isCrossDissolveTransition(prev.transitions.out)) {
        const p = (sequenceFrame - (clip.start - n)) / n;
        mult *= fadeCurveProgress(p, 'constant-power');
      }
    }
  }

  return clamp(mult, 0, 1);
}

/** Multiplier 0–1 for audio gain from in/out transitions. */
export function clipTransitionAudioMultiplier(clip: Clip, sequenceFrame: number): number {
  let mult = 1;
  const local = sequenceFrame - clip.start;
  const end = getClipEnd(clip);

  if (clip.transitions.in && clip.transitions.in.durationFrames > 0 && local >= 0 && local < clip.transitions.in.durationFrames) {
    const p = local / clip.transitions.in.durationFrames;
    mult *= fadeCurveProgress(p, clip.transitions.in.audioCurve);
  }
  if (clip.transitions.out && clip.transitions.out.durationFrames > 0) {
    const n = clip.transitions.out.durationFrames;
    const outStart = end - n;
    if (sequenceFrame >= outStart && sequenceFrame < end) {
      const p = (sequenceFrame - outStart) / n;
      mult *= 1 - fadeCurveProgress(p, clip.transitions.out.audioCurve);
    }
  }
  return clamp(mult, 0, 1);
}

/** Sequence frame used to sample media (handles cross-dissolve pre-roll). */
export function sequenceFrameForClipMedia(clip: Clip, sequenceFrame: number): number {
  if (sequenceFrame < clip.start) return clip.start;
  const end = getClipEnd(clip);
  if (sequenceFrame >= end) return end - 1;
  return sequenceFrame;
}

export function effectiveClipOpacityPercent(clip: Clip, sequenceFrame: number, sequence: Sequence): number {
  const base = evaluateClipTransform(clip, sequenceFrame).opacity;
  return base * clipTransitionVisualMultiplier(clip, sequenceFrame, sequence);
}

/** Same filter chain as {@link cssFilterFromVideoEffects} for canvas 2D `ctx.filter`. */
export function canvasFilterFromVideoEffects(effects: readonly VideoEffect[], blurScale = 1): string | undefined {
  return cssFilterFromVideoEffects(effects, blurScale);
}

/**
 * Blur radii are defined for a picture this tall. Callers pass
 * `renderedHeight / BLUR_REFERENCE_HEIGHT` so the monitor and export match.
 */
export const BLUR_REFERENCE_HEIGHT = 540;

export function blurFilterPx(amount: number, scale = 1): number {
  return amount * 0.2 * scale;
}

export function cssBlurFilter(amount: number, scale = 1): string | undefined {
  if (amount <= 0) return undefined;
  return `blur(${Number(blurFilterPx(amount, scale).toFixed(3))}px)`;
}

export type BlurVideoEffect = VideoEffect & { readonly kind: 'blur' };

export function getBlurVideoEffect(effects: readonly VideoEffect[]): BlurVideoEffect | undefined {
  return effects.find((e): e is BlurVideoEffect => e.kind === 'blur');
}

export function isRegionalBlurEffect(blur: BlurVideoEffect): boolean {
  if (!blur.region) return false;
  return blur.region.top + blur.region.right + blur.region.bottom + blur.region.left > 0;
}

export function insetClipPathFromRegion(region: EffectRegion): string {
  const t = clamp(region.top, 0, 90);
  const r = clamp(region.right, 0, 90);
  const b = clamp(region.bottom, 0, 90);
  const l = clamp(region.left, 0, 90);
  return `inset(${t}% ${r}% ${b}% ${l}%)`;
}

/** Filters applied on the whole clip layer (regional blur is composited separately). */
export function cssFilterFromVideoEffects(effects: readonly VideoEffect[], blurScale = 1): string | undefined {
  const parts: string[] = [];
  for (const effect of effects) {
    switch (effect.kind) {
      case 'blur': {
        if (isRegionalBlurEffect(effect)) break;
        const blur = cssBlurFilter(effect.amount, blurScale);
        if (blur) parts.push(blur);
        break;
      }
      case 'brightness':
        parts.push(`brightness(${1 + effect.amount / 100})`);
        break;
      case 'contrast':
        parts.push(`contrast(${1 + effect.amount / 100})`);
        break;
      case 'saturation':
        parts.push(`saturate(${1 + effect.amount / 100})`);
        break;
      case 'hue-rotate':
        if (effect.degrees !== 0) parts.push(`hue-rotate(${effect.degrees}deg)`);
        break;
      case 'brightness-contrast':
        parts.push(`brightness(${1 + effect.brightness / 100})`);
        parts.push(`contrast(${1 + effect.contrast / 100})`);
        break;
      case 'library':
        parts.push(...applyLibraryAmount(libraryEffectLook(effect.libraryId).filters, effect.amount));
        break;
      default:
        break;
    }
  }
  return parts.length > 0 ? parts.join(' ') : undefined;
}

export function libraryEffectTransform(effects: readonly VideoEffect[]): string | undefined {
  const parts: string[] = [];
  for (const effect of effects) {
    if (effect.kind !== 'library') continue;
    const transform = libraryEffectLook(effect.libraryId).transform;
    if (transform) parts.push(transform);
  }
  return parts.length > 0 ? parts.join(' ') : undefined;
}

export function libraryEffectClipPath(effects: readonly VideoEffect[]): string | undefined {
  for (let i = effects.length - 1; i >= 0; i--) {
    const effect = effects[i];
    if (!effect || effect.kind !== 'library') continue;
    const clipPath = libraryEffectLook(effect.libraryId).clipPath;
    if (clipPath) return scaleLibraryClipPath(clipPath, effect.amount);
  }
  return undefined;
}

/**
 * Crop and rounded corners as one CSS `inset()`. The corner radius is in
 * sequence pixels; `pixelScale` converts it to the space the path is drawn in.
 */
export function clipPathFromVideoEffects(effects: readonly VideoEffect[], pixelScale = 1): string | undefined {
  let crop: VideoEffect & { kind: 'crop' } | undefined;
  let round: VideoEffect & { kind: 'round-corners' } | undefined;
  for (const effect of effects) {
    if (effect.kind === 'crop') crop = effect;
    if (effect.kind === 'round-corners') round = effect;
  }
  const t = crop ? clamp(crop.top, 0, 90) : 0;
  const r = crop ? clamp(crop.right, 0, 90) : 0;
  const b = crop ? clamp(crop.bottom, 0, 90) : 0;
  const l = crop ? clamp(crop.left, 0, 90) : 0;
  const radius = round ? Math.max(0, round.radius * pixelScale) : 0;
  const cropped = t + r + b + l > 0;
  if (!cropped && radius <= 0) return undefined;
  const box = cropped ? `${t}% ${r}% ${b}% ${l}%` : '0';
  return radius > 0 ? `inset(${box} round ${Number(radius.toFixed(2))}px)` : `inset(${box})`;
}

export function audioEffectGainDb(effects: ClipEffects): number {
  let db = 0;
  for (const effect of effects.audio) {
    if (effect.kind === 'gain') db += effect.gainDb;
  }
  return db;
}

export function defaultEdgeTransition(): ClipEdgeTransition {
  return { durationFrames: 15, videoKind: 'fade', libraryId: null, audioCurve: 'constant-power' };
}
