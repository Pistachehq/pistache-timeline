import { type ClipEdgeTransition, type VideoTransitionKind } from './effects';

export type RenderableVideoTransitionKind = Exclude<VideoTransitionKind, 'none' | 'library'>;

/** Maps a catalog transition id onto the three built-in opacity families when a caller only needs a coarse kind. */
export function resolveLibraryTransitionRenderKind(libraryId: string): RenderableVideoTransitionKind {
  const lower = libraryId.toLowerCase();
  if (lower.includes('cross-dissolve') || lower.includes('morph-cut')) return 'cross-dissolve';
  if (lower.includes('dip-to-black') || lower.includes('dip-black')) return 'dip-black';
  if (lower.includes('dissolve') || lower.includes('fade')) return 'fade';
  return 'fade';
}

export function resolveTransitionRenderKind(edge: ClipEdgeTransition): RenderableVideoTransitionKind {
  if (edge.videoKind === 'library') {
    return edge.libraryId
      ? resolveLibraryTransitionRenderKind(edge.libraryId)
      : 'fade';
  }
  if (edge.videoKind === 'none') return 'fade';
  return edge.videoKind;
}

export function isCrossDissolveTransition(edge: ClipEdgeTransition | null | undefined): boolean {
  if (!edge) return false;
  if (edge.videoKind === 'cross-dissolve') return true;
  if (edge.videoKind === 'library' && edge.libraryId) {
    const id = edge.libraryId.toLowerCase();
    return id.includes('cross-dissolve') || id.includes('morph-cut');
  }
  return false;
}
