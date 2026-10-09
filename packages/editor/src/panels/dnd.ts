/** Drag-and-drop MIME type for media assets dragged from the Project panel. */
export const ASSET_DRAG_TYPE = 'application/x-timeline-asset';

/** Preset transitions/effects dragged from the Effects bin. */
export const EFFECT_DRAG_TYPE = 'application/x-timeline-effect';

export type EffectLibraryPayload =
  | {
      readonly kind: 'transition-in';
      readonly videoKind: import('@timeline/core').VideoTransitionKind;
      readonly libraryId?: string | null;
      readonly audioCurve: import('@timeline/core').AudioFadeCurve;
      readonly durationFrames?: number;
      readonly affectsVideo?: boolean;
    }
  | {
      readonly kind: 'transition-out';
      readonly videoKind: import('@timeline/core').VideoTransitionKind;
      readonly libraryId?: string | null;
      readonly audioCurve: import('@timeline/core').AudioFadeCurve;
      readonly durationFrames?: number;
      readonly affectsVideo?: boolean;
    }
  | { readonly kind: 'video-effect'; readonly effect: import('@timeline/core').VideoEffect }
  | { readonly kind: 'audio-effect'; readonly effect: import('@timeline/core').AudioEffect };

export function writeEffectDragData(dataTransfer: DataTransfer, payload: EffectLibraryPayload): void {
  dataTransfer.setData(EFFECT_DRAG_TYPE, JSON.stringify(payload));
  dataTransfer.effectAllowed = 'copy';
}

export function readEffectDragData(dataTransfer: DataTransfer): EffectLibraryPayload | null {
  const raw = dataTransfer.getData(EFFECT_DRAG_TYPE);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as EffectLibraryPayload;
  } catch {
    return null;
  }
}

export function isEffectDrag(dataTransfer: DataTransfer): boolean {
  return dataTransfer.types.includes(EFFECT_DRAG_TYPE);
}
