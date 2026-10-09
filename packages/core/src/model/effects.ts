/** Video transition at a clip edge (no timeline overlap; cross-dissolve renders both layers in the window). */
export const VIDEO_TRANSITION_KINDS = ['none', 'fade', 'dip-black', 'cross-dissolve'] as const;
export type VideoTransitionKind = (typeof VIDEO_TRANSITION_KINDS)[number];

/** Audio fade curve for clip in/out (and paired with video transitions on export). */
export const AUDIO_FADE_CURVES = ['linear', 'constant-power', 'exponential', 'logarithmic'] as const;
export type AudioFadeCurve = (typeof AUDIO_FADE_CURVES)[number];

export interface ClipEdgeTransition {
  readonly durationFrames: number;
  readonly videoKind: VideoTransitionKind;
  readonly audioCurve: AudioFadeCurve;
}

export interface ClipTransitions {
  readonly in: ClipEdgeTransition | null;
  readonly out: ClipEdgeTransition | null;
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
] as const;
export type VideoEffectKind = (typeof VIDEO_EFFECT_KINDS)[number];

export type VideoEffect =
  | { readonly kind: 'blur'; readonly amount: number }
  | { readonly kind: 'brightness'; readonly amount: number }
  | { readonly kind: 'contrast'; readonly amount: number }
  | { readonly kind: 'saturation'; readonly amount: number }
  | { readonly kind: 'hue-rotate'; readonly degrees: number }
  | { readonly kind: 'vignette'; readonly amount: number }
  | { readonly kind: 'sharpen'; readonly amount: number }
  | { readonly kind: 'crop'; readonly top: number; readonly right: number; readonly bottom: number; readonly left: number }
  | { readonly kind: 'round-corners'; readonly radius: number };

export const AUDIO_EFFECT_KINDS = [
  'gain',
  'highpass',
  'lowpass',
  'compressor',
  'noise-gate',
  'limiter',
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
  | { readonly kind: 'limiter'; readonly ceilingDb: number };

export interface ClipEffects {
  readonly video: readonly VideoEffect[];
  readonly audio: readonly AudioEffect[];
}

export const DEFAULT_CLIP_TRANSITIONS: ClipTransitions = { in: null, out: null };
export const DEFAULT_CLIP_EFFECTS: ClipEffects = { video: [], audio: [] };

export const TRANSITION_LIMITS = {
  durationFrames: { min: 0, max: 900 },
} as const;
