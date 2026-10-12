/** Video transition at a clip edge (no timeline overlap; cross-dissolve renders both layers in the window). */
export const VIDEO_TRANSITION_KINDS = ['none', 'fade', 'dip-black', 'cross-dissolve', 'library'] as const;
export type VideoTransitionKind = (typeof VIDEO_TRANSITION_KINDS)[number];

/** Audio fade curve for clip in/out (and paired with video transitions on export). */
export const AUDIO_FADE_CURVES = ['linear', 'constant-power', 'exponential', 'logarithmic'] as const;
export type AudioFadeCurve = (typeof AUDIO_FADE_CURVES)[number];

export interface ClipEdgeTransition {
  readonly durationFrames: number;
  readonly videoKind: VideoTransitionKind;
  /** Premiere-style preset id when `videoKind` is `library`. */
  readonly libraryId: string | null;
  readonly audioCurve: AudioFadeCurve;
  /** When false, the edge is an audio fade only and does not fade the picture. */
  readonly affectsVideo?: boolean;
}

export interface ClipTransitions {
  readonly in: ClipEdgeTransition | null;
  readonly out: ClipEdgeTransition | null;
}

/** Percent inset region on the clip frame (same space as crop). */
export interface EffectRegion {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
  /** When true, the effect applies inside the region; otherwise outside. */
  readonly internal: boolean;
}

export const VIDEO_EFFECT_KINDS = [
  'blur',
  'brightness',
  'contrast',
  'saturation',
  'hue-rotate',
  'vignette',
  'sharpen',
  'crop',
  'round-corners',
  'brightness-contrast',
  'chroma-key',
  'luma-key',
  'screen-replace',
  'library',
] as const;
export type VideoEffectKind = (typeof VIDEO_EFFECT_KINDS)[number];

/** `final` is the keyed picture; `matte` shows the alpha as grayscale for fine tuning. */
export type KeyView = 'final' | 'matte';

/**
 * Shared keyer controls, all 0..100.
 * `tolerance` widens the range of shades treated as the key color, `softness`
 * feathers the matte edge, `spill` removes the key color reflected on the
 * subject, and `choke` shrinks the matte to trim fringes.
 */
export interface KeyControls {
  /** `#rrggbb` key color. */
  readonly color: string;
  readonly tolerance: number;
  readonly softness: number;
  readonly spill: number;
  readonly choke: number;
}

/**
 * How the replacement lands on the keyed area. `corners` follows the four
 * corners of the screen with perspective, `box` fills its bounds, and `frame`
 * fills the whole picture behind the key.
 */
export const SCREEN_REPLACE_FITS = ['corners', 'box', 'frame'] as const;
export type ScreenReplaceFit = (typeof SCREEN_REPLACE_FITS)[number];

export type VideoEffect =
  | { readonly kind: 'blur'; readonly amount: number; readonly region: EffectRegion | null }
  | { readonly kind: 'brightness'; readonly amount: number }
  | { readonly kind: 'contrast'; readonly amount: number }
  | { readonly kind: 'saturation'; readonly amount: number }
  | { readonly kind: 'hue-rotate'; readonly degrees: number }
  /** `amount` darkens the edges, `size` is the clear center, `feather` the falloff, all 0..100. */
  | { readonly kind: 'vignette'; readonly amount: number; readonly size: number; readonly feather: number }
  /** Unsharp mask. `radius` is in source pixels (0.5..5). */
  | { readonly kind: 'sharpen'; readonly amount: number; readonly radius: number }
  | { readonly kind: 'crop'; readonly top: number; readonly right: number; readonly bottom: number; readonly left: number }
  | { readonly kind: 'round-corners'; readonly radius: number }
  | { readonly kind: 'brightness-contrast'; readonly brightness: number; readonly contrast: number }
  | ({ readonly kind: 'chroma-key'; readonly view: KeyView } & KeyControls)
  /** Keys out dark pixels (or bright ones with `invert`). `threshold` and `softness` are 0..100. */
  | {
      readonly kind: 'luma-key';
      readonly threshold: number;
      readonly softness: number;
      readonly invert: boolean;
    }
  | ({
      readonly kind: 'screen-replace';
      /** Image or video shown where the key color is found. `null` leaves the area transparent. */
      readonly sourceAssetId: string | null;
      readonly fit: ScreenReplaceFit;
      /** Picked point in the clip (0..1). The keyed region under it is replaced; `null` takes the largest. */
      readonly seedX: number | null;
      readonly seedY: number | null;
    } & KeyControls)
  | { readonly kind: 'library'; readonly libraryId: string; readonly amount: number };

/** Standard chroma green and blue (Rec. 709 screen paint references). */
export const KEY_COLOR_PRESETS = {
  green: '#00b140',
  blue: '#0047bb',
} as const;

export const DEFAULT_KEY_CONTROLS: KeyControls = {
  color: KEY_COLOR_PRESETS.green,
  tolerance: 42,
  softness: 30,
  spill: 60,
  choke: 0,
};

export function defaultChromaKey(color: string = KEY_COLOR_PRESETS.green): VideoEffect {
  return { kind: 'chroma-key', view: 'final', ...DEFAULT_KEY_CONTROLS, color };
}

export function defaultScreenReplace(color: string = KEY_COLOR_PRESETS.green): VideoEffect {
  return {
    kind: 'screen-replace',
    sourceAssetId: null,
    fit: 'corners',
    seedX: null,
    seedY: null,
    ...DEFAULT_KEY_CONTROLS,
    color,
  };
}

/** Effects drawn per pixel by the keyer instead of a CSS filter. */
export function isPixelVideoEffect(effect: VideoEffect): boolean {
  return (
    effect.kind === 'chroma-key' ||
    effect.kind === 'luma-key' ||
    effect.kind === 'screen-replace' ||
    (effect.kind === 'sharpen' && effect.amount > 0) ||
    (effect.kind === 'vignette' && effect.amount !== 0)
  );
}

export function hasPixelVideoEffects(effects: readonly VideoEffect[]): boolean {
  return effects.some(isPixelVideoEffect);
}

export const AUDIO_EFFECT_KINDS = [
  'gain',
  'highpass',
  'lowpass',
  'eq',
  'compressor',
  'noise-gate',
  'limiter',
  'delay',
  'reverb',
  'pitch',
] as const;
export type AudioEffectKind = (typeof AUDIO_EFFECT_KINDS)[number];

export type AudioEffect =
  | { readonly kind: 'gain'; readonly gainDb: number }
  /** `q` is the filter resonance (0.1..18, 0.707 is flat). */
  | { readonly kind: 'highpass'; readonly frequencyHz: number; readonly q: number }
  | { readonly kind: 'lowpass'; readonly frequencyHz: number; readonly q: number }
  /** Three-band EQ: low shelf at `lowFrequencyHz`, peaking mid, high shelf at `highFrequencyHz`. */
  | {
      readonly kind: 'eq';
      readonly lowGainDb: number;
      readonly lowFrequencyHz: number;
      readonly midGainDb: number;
      readonly midFrequencyHz: number;
      readonly midQ: number;
      readonly highGainDb: number;
      readonly highFrequencyHz: number;
    }
  | {
      readonly kind: 'compressor';
      readonly thresholdDb: number;
      readonly ratio: number;
      readonly attackMs: number;
      readonly releaseMs: number;
      readonly kneeDb: number;
      readonly makeupDb: number;
    }
  /** Below `thresholdDb` the signal drops by `rangeDb` (−80 is silence). */
  | {
      readonly kind: 'noise-gate';
      readonly thresholdDb: number;
      readonly rangeDb: number;
      readonly attackMs: number;
      readonly releaseMs: number;
    }
  | { readonly kind: 'limiter'; readonly ceilingDb: number; readonly releaseMs: number }
  /** Echo. `feedback` and `mix` are 0..100 (feedback stops at 90 to stay stable). */
  | { readonly kind: 'delay'; readonly timeMs: number; readonly feedback: number; readonly mix: number }
  /** `size` sets the room length and `damping` darkens the tail, all 0..100. */
  | { readonly kind: 'reverb'; readonly size: number; readonly damping: number; readonly mix: number }
  /** −100 is one octave down, 0 is unchanged, 100 is one octave up. */
  | { readonly kind: 'pitch'; readonly amount: number };

/** Filters, dynamics, delay and reverb need a processing pass; gain and pitch are applied per sample. */
export function audioEffectsNeedRendering(effects: readonly AudioEffect[]): boolean {
  return effects.some((effect) => effect.kind !== 'gain' && effect.kind !== 'pitch');
}

export const AUDIO_EFFECT_DEFAULTS = {
  highpassQ: Math.SQRT1_2,
  compressorKneeDb: 6,
  gateRangeDb: -80,
  gateAttackMs: 2,
  gateReleaseMs: 120,
  limiterReleaseMs: 50,
} as const;

/** Playback-rate ratio for a pitch amount in the −100..100 range. */
export function pitchRatioFromAmount(amount: number): number {
  const clamped = Math.max(-100, Math.min(100, amount));
  if (clamped === 0) return 1;
  return 2 ** (clamped / 100);
}

/**
 * How much of the pitch shifter to hear. ±1 is only a few cents, and the
 * shifter colors the sound as soon as it leaves bypass, so those first steps
 * stay on the dry signal. The shift fades in by about half a semitone.
 */
export function pitchWetMix(amount: number): number {
  const distance = Math.abs(Math.max(-100, Math.min(100, amount)));
  if (distance <= 1) return 0;
  if (distance >= 6) return 1;
  const t = (distance - 1) / 5;
  return t * t * (3 - 2 * t);
}

/** Last pitch effect on the clip, or 0 when pitch is unchanged. */
export function clipPitchAmount(effects: readonly AudioEffect[]): number {
  let amount = 0;
  for (const effect of effects) {
    if (effect.kind === 'pitch') amount = effect.amount;
  }
  return Math.max(-100, Math.min(100, amount));
}

export interface ClipEffects {
  readonly video: readonly VideoEffect[];
  readonly audio: readonly AudioEffect[];
}

export const DEFAULT_CLIP_TRANSITIONS: ClipTransitions = { in: null, out: null };
export const DEFAULT_CLIP_EFFECTS: ClipEffects = { video: [], audio: [] };

export const TRANSITION_LIMITS = {
  durationFrames: { min: 0, max: 1_000_000 },
} as const;

/** Frames that stay outside a transition so the clip keeps a short tail. */
export const TRANSITION_TAIL_FRAMES = 1;

/** Longest a transition may run on a clip, leaving a short tail at the end. */
export function maxTransitionFramesForClip(clipDurationFrames: number): number {
  return Math.max(TRANSITION_LIMITS.durationFrames.min, clipDurationFrames - TRANSITION_TAIL_FRAMES);
}
