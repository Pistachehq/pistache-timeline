import {
  type AudioFadeCurve,
  type AudioEffect,
  type VideoEffect,
  type VideoTransitionKind,
} from '@timeline/core';
import { type EffectLibraryPayload } from '../dnd';

export type EffectCategoryId =
  | 'video-transitions'
  | 'video-effects'
  | 'audio-transitions'
  | 'audio-effects';

export interface EffectCategory {
  readonly id: EffectCategoryId;
  readonly name: string;
  readonly description: string;
}

export interface EffectLibraryEntry {
  readonly id: string;
  readonly name: string;
  readonly categoryId: EffectCategoryId;
  readonly payload: EffectLibraryPayload;
}

export const EFFECT_CATEGORIES: readonly EffectCategory[] = [
  {
    id: 'video-transitions',
    name: 'Video transitions',
    description: 'Fade, dissolve, and dip to black at clip edges.',
  },
  {
    id: 'video-effects',
    name: 'Video effects',
    description: 'Blur, color, sharpen, and rounded corners.',
  },
  {
    id: 'audio-transitions',
    name: 'Audio transitions',
    description: 'Fade curves at clip in or out.',
  },
  {
    id: 'audio-effects',
    name: 'Audio effects',
    description: 'Gain, EQ, compression, gate, and limiter.',
  },
];

const DEFAULT_TRANSITION_FRAMES = 15;

function transitionIn(
  videoKind: VideoTransitionKind,
  audioCurve: AudioFadeCurve,
  name: string,
): EffectLibraryEntry {
  return {
    id: `vin-${videoKind}-${audioCurve}`,
    name,
    categoryId: 'video-transitions',
    payload: { kind: 'transition-in', videoKind, audioCurve, durationFrames: DEFAULT_TRANSITION_FRAMES },
  };
}

function transitionOut(
  videoKind: VideoTransitionKind,
  audioCurve: AudioFadeCurve,
  name: string,
): EffectLibraryEntry {
  return {
    id: `vout-${videoKind}-${audioCurve}`,
    name,
    categoryId: 'video-transitions',
    payload: { kind: 'transition-out', videoKind, audioCurve, durationFrames: DEFAULT_TRANSITION_FRAMES },
  };
}

function audioTransitionIn(audioCurve: AudioFadeCurve, name: string): EffectLibraryEntry {
  return {
    id: `ain-${audioCurve}`,
    name,
    categoryId: 'audio-transitions',
    payload: {
      kind: 'transition-in',
      videoKind: 'fade',
      audioCurve,
      durationFrames: DEFAULT_TRANSITION_FRAMES,
    },
  };
}

function audioTransitionOut(audioCurve: AudioFadeCurve, name: string): EffectLibraryEntry {
  return {
    id: `aout-${audioCurve}`,
    name,
    categoryId: 'audio-transitions',
    payload: {
      kind: 'transition-out',
      videoKind: 'fade',
      audioCurve,
      durationFrames: DEFAULT_TRANSITION_FRAMES,
    },
  };
}

function videoFx(id: string, effect: VideoEffect, name: string): EffectLibraryEntry {
  return {
    id: `vfx-${id}`,
    name,
    categoryId: 'video-effects',
    payload: { kind: 'video-effect', effect },
  };
}

function audioFx(id: string, effect: AudioEffect, name: string): EffectLibraryEntry {
  return {
    id: `afx-${id}`,
    name,
    categoryId: 'audio-effects',
    payload: { kind: 'audio-effect', effect },
  };
}

export const EFFECT_LIBRARY: readonly EffectLibraryEntry[] = [
  transitionIn('fade', 'constant-power', 'Fade in'),
  transitionOut('fade', 'constant-power', 'Fade out'),
  transitionIn('dip-black', 'constant-power', 'Dip to black in'),
  transitionOut('dip-black', 'constant-power', 'Dip to black out'),
  transitionIn('cross-dissolve', 'constant-power', 'Cross dissolve in'),
  transitionOut('cross-dissolve', 'constant-power', 'Cross dissolve out'),

  videoFx('blur', { kind: 'blur', amount: 30 }, 'Blur'),
  videoFx('brightness', { kind: 'brightness', amount: 0 }, 'Brightness'),
  videoFx('contrast', { kind: 'contrast', amount: 20 }, 'Contrast'),
  videoFx('saturation', { kind: 'saturation', amount: 25 }, 'Saturation'),
  videoFx('hue', { kind: 'hue-rotate', degrees: 25 }, 'Hue rotate'),
  videoFx('vignette', { kind: 'vignette', amount: 40 }, 'Vignette'),
  videoFx('sharpen', { kind: 'sharpen', amount: 30 }, 'Sharpen'),
  videoFx('round', { kind: 'round-corners', radius: 24 }, 'Round corners'),

  audioTransitionIn('linear', 'Fade in (linear)'),
  audioTransitionIn('constant-power', 'Fade in (constant power)'),
  audioTransitionIn('exponential', 'Fade in (exponential)'),
  audioTransitionIn('logarithmic', 'Fade in (logarithmic)'),
  audioTransitionOut('linear', 'Fade out (linear)'),
  audioTransitionOut('constant-power', 'Fade out (constant power)'),
  audioTransitionOut('exponential', 'Fade out (exponential)'),
  audioTransitionOut('logarithmic', 'Fade out (logarithmic)'),

  audioFx('gain', { kind: 'gain', gainDb: 0 }, 'Gain'),
  audioFx('highpass', { kind: 'highpass', frequencyHz: 100 }, 'High-pass'),
  audioFx('lowpass', { kind: 'lowpass', frequencyHz: 8000 }, 'Low-pass'),
  audioFx(
    'compressor',
    { kind: 'compressor', thresholdDb: -18, ratio: 3, attackMs: 10, releaseMs: 120 },
    'Compressor',
  ),
  audioFx('gate', { kind: 'noise-gate', thresholdDb: -45 }, 'Noise gate'),
  audioFx('limiter', { kind: 'limiter', ceilingDb: -1 }, 'Limiter'),
];

export function getEffectCategory(id: EffectCategoryId): EffectCategory | undefined {
  return EFFECT_CATEGORIES.find((c) => c.id === id);
}

export function listEffectsInCategory(categoryId: EffectCategoryId): readonly EffectLibraryEntry[] {
  return EFFECT_LIBRARY.filter((e) => e.categoryId === categoryId);
}
