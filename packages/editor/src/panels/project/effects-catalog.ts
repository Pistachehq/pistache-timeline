import {
  type AudioFadeCurve,
  type AudioEffect,
  TEXT_ANIMATION_IDS,
  type TextAnimationId,
  type VideoEffect,
  type VideoTransitionKind,
} from '@timeline/core';
import { type EffectLibraryPayload } from '../dnd';
import { PREMIERE_EFFECT_LIBRARY } from './premiere-library';
import { TEXT_ANIMATION_LABELS } from './text-animation-label';

export type EffectCategoryId =
  | 'video-transitions'
  | 'video-effects'
  | 'audio-transitions'
  | 'audio-effects'
  | 'text-transitions';

export interface EffectCategory {
  readonly id: EffectCategoryId;
  readonly name: string;
  readonly description: string;
}

export interface EffectLibraryEntry {
  readonly id: string;
  readonly name: string;
  readonly categoryId: EffectCategoryId;
  /** Parent folder for nested bins (`video-effects/Adjust`, etc.). */
  readonly folderPath: string;
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
  {
    id: 'text-transitions',
    name: 'Text transitions',
    description: 'Type-on and reveal effects for text clips.',
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
    folderPath: 'video-transitions',
    payload: {
      kind: 'transition-in',
      videoKind,
      libraryId: null,
      audioCurve,
      durationFrames: DEFAULT_TRANSITION_FRAMES,
    },
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
    folderPath: 'video-transitions',
    payload: {
      kind: 'transition-out',
      videoKind,
      libraryId: null,
      audioCurve,
      durationFrames: DEFAULT_TRANSITION_FRAMES,
    },
  };
}

function audioTransitionIn(audioCurve: AudioFadeCurve, name: string): EffectLibraryEntry {
  return {
    id: `ain-${audioCurve}`,
    name,
    categoryId: 'audio-transitions',
    folderPath: 'audio-transitions',
    payload: {
      kind: 'transition-in',
      videoKind: 'fade',
      libraryId: `audio-transitions/${audioCurve}`,
      audioCurve,
      durationFrames: DEFAULT_TRANSITION_FRAMES,
      affectsVideo: false,
    },
  };
}

function audioTransitionOut(audioCurve: AudioFadeCurve, name: string): EffectLibraryEntry {
  return {
    id: `aout-${audioCurve}`,
    name,
    categoryId: 'audio-transitions',
    folderPath: 'audio-transitions',
    payload: {
      kind: 'transition-out',
      videoKind: 'fade',
      libraryId: `audio-transitions/${audioCurve}`,
      audioCurve,
      durationFrames: DEFAULT_TRANSITION_FRAMES,
      affectsVideo: false,
    },
  };
}

function videoFx(id: string, effect: VideoEffect, name: string): EffectLibraryEntry {
  return {
    id: `vfx-${id}`,
    name,
    categoryId: 'video-effects',
    folderPath: 'video-effects',
    payload: { kind: 'video-effect', effect },
  };
}

function audioFx(id: string, effect: AudioEffect, name: string): EffectLibraryEntry {
  return {
    id: `afx-${id}`,
    name,
    categoryId: 'audio-effects',
    folderPath: 'audio-effects',
    payload: { kind: 'audio-effect', effect },
  };
}

const TEXT_TRANSITION_LIBRARY: readonly EffectLibraryEntry[] = TEXT_ANIMATION_IDS.filter(
  (id): id is Exclude<TextAnimationId, 'none'> => id !== 'none',
).map((animation) => ({
  id: `text-${animation}`,
  name: TEXT_ANIMATION_LABELS[animation],
  categoryId: 'text-transitions' as const,
  folderPath: 'text-transitions',
  payload: { kind: 'text-animation' as const, animation },
}));

const CORE_EFFECT_LIBRARY: readonly EffectLibraryEntry[] = [
  transitionIn('fade', 'constant-power', 'Fade in'),
  transitionOut('fade', 'constant-power', 'Fade out'),
  transitionIn('dip-black', 'constant-power', 'Dip to black in'),
  transitionOut('dip-black', 'constant-power', 'Dip to black out'),
  transitionIn('cross-dissolve', 'constant-power', 'Cross dissolve in'),
  transitionOut('cross-dissolve', 'constant-power', 'Cross dissolve out'),

  videoFx('blur', { kind: 'blur', amount: 30, region: null }, 'Blur'),
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

/** Core presets plus Premiere-style catalog entries. */
export const EFFECT_LIBRARY: readonly EffectLibraryEntry[] = [
  ...CORE_EFFECT_LIBRARY,
  ...TEXT_TRANSITION_LIBRARY,
  ...PREMIERE_EFFECT_LIBRARY,
];

export function getEffectCategory(id: EffectCategoryId): EffectCategory | undefined {
  return EFFECT_CATEGORIES.find((c) => c.id === id);
}

export function listEffectsInCategory(categoryId: EffectCategoryId): readonly EffectLibraryEntry[] {
  return EFFECT_LIBRARY.filter((e) => e.categoryId === categoryId);
}

export interface EffectsBinFolder {
  readonly id: string;
  readonly name: string;
}

export interface EffectsBinContents {
  readonly folders: readonly EffectsBinFolder[];
  readonly presets: readonly EffectLibraryEntry[];
}

/** Lists subfolders and presets for the effects bin at `folderPath` (`null` = top-level categories). */
export function listEffectsBinContents(
  categoryId: EffectCategoryId | null,
  folderPath: string | null,
): EffectsBinContents {
  if (!categoryId) {
    return {
      folders: EFFECT_CATEGORIES.map((c) => ({ id: c.id, name: c.name })),
      presets: [],
    };
  }

  const basePath = folderPath ?? categoryId;
  const entries = EFFECT_LIBRARY.filter((e) => e.categoryId === categoryId && e.folderPath === basePath);
  const nested = new Map<string, EffectsBinFolder>();
  for (const entry of EFFECT_LIBRARY) {
    if (entry.categoryId !== categoryId) continue;
    if (!entry.folderPath.startsWith(`${basePath}/`)) continue;
    const rest = entry.folderPath.slice(basePath.length + 1);
    const segment = rest.split('/')[0];
    if (!segment) continue;
    const childPath = `${basePath}/${segment}`;
    nested.set(childPath, { id: childPath, name: segment });
  }

  const folders = [...nested.values()].sort((a, b) => a.name.localeCompare(b.name));
  const presets = [...entries].sort((a, b) => a.name.localeCompare(b.name));
  return { folders, presets };
}

export function effectsBinBreadcrumb(categoryId: EffectCategoryId, folderPath: string | null): readonly string[] {
  if (!folderPath || folderPath === categoryId) return [];
  const tail = folderPath.startsWith(`${categoryId}/`) ? folderPath.slice(categoryId.length + 1) : folderPath;
  return tail.split('/');
}
