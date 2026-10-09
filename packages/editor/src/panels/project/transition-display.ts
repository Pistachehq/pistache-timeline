import { type ClipEdgeTransition, type VideoTransitionKind } from '@timeline/core';
import { type SelectOption } from '@timeline/ui';
import premierePaths from './premiere-paths.json';
import { premiereSlug, videoTransitionLibraryId } from './premiere-slug';

const BUILTIN_LABELS: Record<Exclude<VideoTransitionKind, 'none' | 'library'>, string> = {
  fade: 'Fade',
  'dip-black': 'Dip to black',
  'cross-dissolve': 'Cross dissolve',
};

const LIBRARY_TRANSITION_NAMES = new Map<string, string>(
  premierePaths.videoTransitions.map((relativePath) => {
    const slash = relativePath.lastIndexOf('/');
    const name = slash >= 0 ? relativePath.slice(slash + 1) : relativePath;
    return [videoTransitionLibraryId(relativePath), name];
  }),
);

export function transitionLabel(kind: VideoTransitionKind): string {
  switch (kind) {
    case 'fade':
      return 'Fade';
    case 'dip-black':
      return 'Dip to Black';
    case 'cross-dissolve':
      return 'Cross Dissolve';
    default:
      return 'Transition';
  }
}

const AUDIO_FADE_LABELS: Record<ClipEdgeTransition['audioCurve'], string> = {
  linear: 'Linear fade',
  'constant-power': 'Constant power',
  exponential: 'Exponential fade',
  logarithmic: 'Logarithmic fade',
};

export function transitionDisplayName(edge: ClipEdgeTransition): string {
  if (edge.affectsVideo === false) return AUDIO_FADE_LABELS[edge.audioCurve];
  if (edge.videoKind === 'library' && edge.libraryId) {
    return LIBRARY_TRANSITION_NAMES.get(edge.libraryId) ?? humanizeLibraryId(edge.libraryId);
  }
  if (edge.videoKind === 'none' || edge.videoKind === 'library') return 'Transition';
  return BUILTIN_LABELS[edge.videoKind];
}

function humanizeLibraryId(libraryId: string): string {
  const tail = libraryId.split('/').pop()?.replace(/-/g, ' ');
  return tail ? tail.replace(/\b\w/g, (c) => c.toUpperCase()) : libraryId;
}

export function listPremiereTransitionOptions(): readonly { readonly libraryId: string; readonly name: string }[] {
  return premierePaths.videoTransitions.map((relativePath) => ({
    libraryId: videoTransitionLibraryId(relativePath),
    name: LIBRARY_TRANSITION_NAMES.get(videoTransitionLibraryId(relativePath)) ?? relativePath,
  }));
}

const LIBRARY_EFFECT_NAMES = new Map<string, string>(
  premierePaths.videoEffects.map((relativePath) => {
    const slash = relativePath.lastIndexOf('/');
    const name = slash >= 0 ? relativePath.slice(slash + 1) : relativePath;
    return [`video-effects/${premiereSlug(relativePath)}`, name];
  }),
);

export function displayNameForLibraryEffect(libraryId: string): string {
  return LIBRARY_EFFECT_NAMES.get(libraryId) ?? libraryId.split('/').pop() ?? libraryId;
}

/** Select value encoding for the inspector transition dropdown. */
export function transitionSelectValue(edge: ClipEdgeTransition): string {
  if (edge.videoKind === 'library' && edge.libraryId) return `library:${edge.libraryId}`;
  return `builtin:${edge.videoKind}`;
}

export function clipEdgeFromSelectValue(value: string, base: ClipEdgeTransition): ClipEdgeTransition {
  if (value.startsWith('library:')) {
    return { ...base, videoKind: 'library', libraryId: value.slice('library:'.length) };
  }
  if (value.startsWith('builtin:')) {
    const kind = value.slice('builtin:'.length) as VideoTransitionKind;
    return { ...base, videoKind: kind, libraryId: null };
  }
  return base;
}

const premiereTransitionOptions: SelectOption<string>[] = (() => {
  const byId = new Map<string, SelectOption<string>>();
  for (const { libraryId, name } of listPremiereTransitionOptions()) {
    if (byId.has(libraryId)) continue;
    byId.set(libraryId, { value: `library:${libraryId}`, label: name });
  }
  return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
})();

/** Built-in transitions plus every Premiere-style video transition. */
export const INSPECTOR_VIDEO_TRANSITION_OPTIONS: readonly SelectOption<string>[] = [
  { value: 'builtin:fade', label: BUILTIN_LABELS.fade },
  { value: 'builtin:dip-black', label: BUILTIN_LABELS['dip-black'] },
  { value: 'builtin:cross-dissolve', label: BUILTIN_LABELS['cross-dissolve'] },
  ...premiereTransitionOptions,
];
