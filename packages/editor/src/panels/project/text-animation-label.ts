import { type TextAnimationId } from '@timeline/core';

export const TEXT_ANIMATION_LABELS: Record<TextAnimationId, string> = {
  none: 'None',
  typewriter: 'Typewriter',
  'typewriter-typos': 'Typewriter with corrections',
  'word-fade': 'Fade in by word',
  'char-fade': 'Fade in by character',
  rise: 'Rise by word',
  pop: 'Pop',
  'blur-in': 'Blur in',
  decode: 'Decode',
  bounce: 'Bounce',
  tracking: 'Tracking',
};

export function textAnimationLabel(animation: TextAnimationId): string {
  return TEXT_ANIMATION_LABELS[animation];
}
