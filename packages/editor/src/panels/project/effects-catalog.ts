import {
  AUDIO_EFFECT_DEFAULTS,
  defaultChromaKey,
  defaultScreenReplace,
  KEY_COLOR_PRESETS,
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
    description: 'Keying, screen replace, blur, color, sharpen, and vignette.',
  },
  {
    id: 'audio-transitions',
    name: 'Audio transitions',
    description: 'Fade curves at clip in or out.',
  },
  {
    id: 'audio-effects',
    name: 'Audio effects',
    description: 'Gain, EQ, dynamics, delay, reverb, and pitch.',
  },
  {
    id: 'text-transitions',
    name: 'Text transitions',
    description: 'Type-on and reveal effects for text clips.',
  },
];

const DEFAULT_TRANSITION_FRAMES = 15;

/**
 * One entry per transition. Where it lands (head or tail) follows the drop
 * position on the clip, so there is no separate "in" and "out" preset.
 */
function videoTransition(videoKind: VideoTransitionKind, name: string): EffectLibraryEntry {
  return {
    id: `vtr-${videoKind}`,
    name,
    categoryId: 'video-transitions',
    folderPath: 'video-transitions',
    payload: {
      kind: 'transition-in',
      videoKind,
      libraryId: null,
      audioCurve: 'constant-power',
      durationFrames: DEFAULT_TRANSITION_FRAMES,
    },
  };
}

function audioTransition(audioCurve: AudioFadeCurve, name: string): EffectLibraryEntry {
  return {
    id: `atr-${audioCurve}`,
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

function videoFx(id: string, effect: VideoEffect, name: string, folder?: string): EffectLibraryEntry {
  return {
    id: `vfx-${id}`,
    name,
    categoryId: 'video-effects',
    folderPath: folder ? `video-effects/${folder}` : 'video-effects',
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
  videoTransition('fade', 'Fade'),
  videoTransition('dip-black', 'Dip to black'),
  videoTransition('cross-dissolve', 'Cross dissolve'),

  videoFx('blur', { kind: 'blur', amount: 30, region: null }, 'Blur'),
  videoFx('brightness', { kind: 'brightness', amount: 15 }, 'Brightness'),
  videoFx('contrast', { kind: 'contrast', amount: 20 }, 'Contrast'),
  videoFx('saturation', { kind: 'saturation', amount: 25 }, 'Saturation'),
  videoFx('hue', { kind: 'hue-rotate', degrees: 25 }, 'Hue rotate'),
  videoFx('vignette', { kind: 'vignette', amount: 45, size: 50, feather: 60 }, 'Vignette'),
  videoFx('sharpen', { kind: 'sharpen', amount: 40, radius: 1 }, 'Sharpen'),
  videoFx('round', { kind: 'round-corners', radius: 48 }, 'Round corners'),
  videoFx('chroma-green', defaultChromaKey(KEY_COLOR_PRESETS.green), 'Chroma Key (green screen)', 'Keying'),
  videoFx('chroma-blue', defaultChromaKey(KEY_COLOR_PRESETS.blue), 'Chroma Key (blue screen)', 'Keying'),
  videoFx('screen-replace', defaultScreenReplace(KEY_COLOR_PRESETS.green), 'Screen Replace', 'Keying'),
  videoFx('luma-key', { kind: 'luma-key', threshold: 15, softness: 10, invert: false }, 'Luma Key', 'Keying'),

  audioTransition('constant-power', 'Constant power'),
  audioTransition('linear', 'Linear fade'),
  audioTransition('exponential', 'Exponential fade'),
  audioTransition('logarithmic', 'Logarithmic fade'),

  audioFx('gain', { kind: 'gain', gainDb: 0 }, 'Gain'),
  audioFx('highpass', { kind: 'highpass', frequencyHz: 100, q: AUDIO_EFFECT_DEFAULTS.highpassQ }, 'High-pass'),
  audioFx('lowpass', { kind: 'lowpass', frequencyHz: 8000, q: AUDIO_EFFECT_DEFAULTS.highpassQ }, 'Low-pass'),
  audioFx(
    'eq',
    {
      kind: 'eq',
      lowGainDb: 0,
      lowFrequencyHz: 120,
      midGainDb: 0,
      midFrequencyHz: 1000,
      midQ: 1,
      highGainDb: 0,
      highFrequencyHz: 8000,
    },
    'Parametric EQ',
  ),
  audioFx(
    'compressor',
    { kind: 'compressor', thresholdDb: -18, ratio: 3, attackMs: 10, releaseMs: 120, kneeDb: 6, makeupDb: 0 },
    'Compressor',
  ),
  audioFx(
    'gate',
    { kind: 'noise-gate', thresholdDb: -45, rangeDb: -80, attackMs: 2, releaseMs: 120 },
    'Noise gate',
  ),
  audioFx('limiter', { kind: 'limiter', ceilingDb: -1, releaseMs: 50 }, 'Limiter'),
  audioFx('delay', { kind: 'delay', timeMs: 250, feedback: 35, mix: 30 }, 'Delay'),
  audioFx('reverb', { kind: 'reverb', size: 50, damping: 40, mix: 25 }, 'Reverb'),
  audioFx('pitch', { kind: 'pitch', amount: 0 }, 'Pitch'),
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
