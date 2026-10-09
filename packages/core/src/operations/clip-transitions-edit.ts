import { DEFAULT_CLIP_TRANSITIONS, type ClipTransitions } from '../model/effects';
import { type Clip } from '../model/types';

/** Left segment after a razor split: keeps all transitions (resize-style trim is unchanged). */
export function transitionsForSplitLeft(clip: Clip): ClipTransitions {
  return clip.transitions;
}

/** New segment after a razor split: no edge transitions on the cut piece. */
export function transitionsForSplitRight(_clip: Clip): ClipTransitions {
  return DEFAULT_CLIP_TRANSITIONS;
}
