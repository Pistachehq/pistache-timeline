import { getActiveSequence, type Sequence } from '@timeline/core';
import { type EditorPlatform } from '../platform';
import { type MediaStore } from '../state/media-store';
import { type PlaybackStore } from '../state/playback-store';
import { type ProjectStore } from '../state/project-store';
import { type SelectionStore } from '../state/selection-store';
import { type UiStore } from '../state/ui-store';

export interface EditorStores {
  readonly project: ProjectStore;
  readonly selection: SelectionStore;
  readonly ui: UiStore;
  readonly playback: PlaybackStore;
  readonly media: MediaStore;
}

/** Dependencies shared by all editor actions. */
export interface EditorServices {
  readonly platform: EditorPlatform;
  readonly stores: EditorStores;
}

export function currentSequence(services: EditorServices): Sequence | undefined {
  return getActiveSequence(services.stores.project.getState().project);
}
