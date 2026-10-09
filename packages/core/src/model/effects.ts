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
  'library',
] as const;
export type VideoEffectKind = (typeof VIDEO_EFFECT_KINDS)[number];

export type VideoEffect =
  | { readonly kind: 'blur'; readonly amount: number; readonly region: EffectRegion | null }
  | { readonly kind: 'brightness'; readonly amount: number }
  | { readonly kind: 'contrast'; readonly amount: number }
  | { readonly kind: 'saturation'; readonly amount: number }
  | { readonly kind: 'hue-rotate'; readonly degrees: number }
  | { readonly kind: 'vignette'; readonly amount: number }
  | { readonly kind: 'sharpen'; readonly amount: number }
  | { readonly kind: 'crop'; readonly top: number; readonly right: number; readonly bottom: number; readonly left: number }
  | { readonly kind: 'round-corners'; readonly radius: number }
  | { readonly kind: 'brightness-contrast'; readonly brightness: number; readonly contrast: number }
  | { readonly kind: 'library'; readonly libraryId: string; readonly amount: number };

export const AUDIO_EFFECT_KINDS = [
  'gain',
  'highpass',
  'lowpass',
  'compressor',
  'noise-gate',
  'limiter',
  'pitch',
] as const;
export type AudioEffectKind = (typeof AUDIO_EFFECT_KINDS)[number];

export type AudioEffect =
  | { readonly kind: 'gain'; readonly gainDb: number }
  | { readonly kind: 'highpass'; readonly frequencyHz: number }
  | { readonly kind: 'lowpass'; readonly frequencyHz: number }
  | {
      readonly kind: 'compressor';
      readonly thresholdDb: number;
      readonly ratio: number;
      readonly attackMs: number;
      readonly releaseMs: number;
    }
  | { readonly kind: 'noise-gate'; readonly thresholdDb: number }
  | { readonly kind: 'limiter'; readonly ceilingDb: number }
  /** −100 is one octave down, 0 is unchanged, 100 is one octave up. */
  | { readonly kind: 'pitch'; readonly amount: number };

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
