import { type AudioFadeCurve, type VideoEffect } from '@timeline/core';
import { type EffectLibraryPayload } from '../dnd';
import { type EffectLibraryEntry } from './effects-catalog';
import premierePaths from './premiere-paths.json';
import { premiereSlug, videoTransitionLibraryId } from './premiere-slug';

const DEFAULT_TRANSITION_FRAMES = 15;
const DEFAULT_AUDIO_CURVE: AudioFadeCurve = 'constant-power';

function slug(value: string): string {
  return premiereSlug(value);
}

function libraryVideoEffect(libraryId: string): VideoEffect {
  return { kind: 'library', libraryId, amount: 100 };
}

function videoPayloadForPath(relativePath: string): EffectLibraryPayload {
  const slash = relativePath.lastIndexOf('/');
  const name = (slash >= 0 ? relativePath.slice(slash + 1) : relativePath).toLowerCase();
  const id = `video-effects/${slug(relativePath)}`;

  if (name.includes('unsharp')) {
    return { kind: 'video-effect', effect: { kind: 'sharpen', amount: 40 } };
  }
  if (name === 'sharpen' || name === 'vr sharpen') {
    return { kind: 'video-effect', effect: { kind: 'sharpen', amount: 28 } };
  }
  if (name.includes('black') && name.includes('white')) {
    return { kind: 'video-effect', effect: { kind: 'saturation', amount: -100 } };
  }
  if (name.includes('brightness') && name.includes('contrast')) {
    return { kind: 'video-effect', effect: { kind: 'brightness-contrast', brightness: 10, contrast: 15 } };
  }

  return { kind: 'video-effect', effect: libraryVideoEffect(id) };
}

function transitionPayload(relativePath: string, edge: 'in' | 'out'): EffectLibraryPayload {
  return {
    kind: edge === 'in' ? 'transition-in' : 'transition-out',
    videoKind: 'library',
    libraryId: videoTransitionLibraryId(relativePath),
    audioCurve: DEFAULT_AUDIO_CURVE,
    durationFrames: DEFAULT_TRANSITION_FRAMES,
  };
}

function entryFromVideoPath(relativePath: string): EffectLibraryEntry {
  const slash = relativePath.lastIndexOf('/');
  const folder = slash >= 0 ? relativePath.slice(0, slash) : '';
  const name = slash >= 0 ? relativePath.slice(slash + 1) : relativePath;
  const folderPath = folder ? `video-effects/${folder}` : 'video-effects';
  return {
    id: `premiere-vfx-${slug(relativePath)}`,
    name,
    categoryId: 'video-effects',
    folderPath,
    payload: videoPayloadForPath(relativePath),
  };
}

function entryFromTransitionPath(relativePath: string): EffectLibraryEntry {
  const slash = relativePath.lastIndexOf('/');
  const folder = slash >= 0 ? relativePath.slice(0, slash) : '';
  const name = slash >= 0 ? relativePath.slice(slash + 1) : relativePath;
  const folderPath = folder ? `video-transitions/${folder}` : 'video-transitions';
  return {
    id: `premiere-vtr-${slug(relativePath)}`,
    name,
    categoryId: 'video-transitions',
    folderPath,
    payload: transitionPayload(relativePath, 'in'),
  };
}

export const PREMIERE_EFFECT_LIBRARY: readonly EffectLibraryEntry[] = [
  ...premierePaths.videoEffects.map(entryFromVideoPath),
  ...premierePaths.videoTransitions.map(entryFromTransitionPath),
];

