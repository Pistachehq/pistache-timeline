import { createProject, type Project } from '@timeline/core';
import { APP_NAME } from '@timeline/shared';
import { createEditActions } from '../actions/edit-actions';
import { createMediaActions } from '../actions/media-actions';
import { createPlaybackActions } from '../actions/playback-actions';
import { createProjectActions } from '../actions/project-actions';
import { type EditorPlatform } from '../platform';
import { createMediaStore } from '../state/media-store';
import { createPlaybackStore } from '../state/playback-store';
import { createProjectStore, selectIsDirty } from '../state/project-store';
import { createSelectionStore } from '../state/selection-store';
import { createUiStore } from '../state/ui-store';
import { type EditorServices, type EditorStores } from './services';

export interface EditorRuntime extends EditorServices {
  readonly stores: EditorStores;
  readonly actions: {
    readonly project: ReturnType<typeof createProjectActions>;
    readonly media: ReturnType<typeof createMediaActions>;
    readonly edit: ReturnType<typeof createEditActions>;
    readonly playback: ReturnType<typeof createPlaybackActions>;
  };
  dispose(): void;
}

export interface CreateEditorRuntimeOptions {
  readonly initialProject?: Project;
}

/**
 * Creates an isolated editor instance: its stores, actions and the
 * subscriptions that keep them consistent. Framework-agnostic, so it can be
 * driven from tests without rendering React.
 */
export function createEditorRuntime(
  platform: EditorPlatform,
  options: CreateEditorRuntimeOptions = {},
): EditorRuntime {
  const initial = options.initialProject ?? createProject();
  const project = createProjectStore(initial);
  project.getState().load(initial, null, true);

  const stores: EditorStores = {
    project,
    selection: createSelectionStore(),
    ui: createUiStore(),
    playback: createPlaybackStore(),
    media: createMediaStore(),
  };
  const services: EditorServices = { platform, stores };
  const media = createMediaActions(services);
  const actions = {
    project: createProjectActions(services, media),
    media,
    edit: createEditActions(services),
    playback: createPlaybackActions(services),
  };

  const publishDocumentState = () => {
    const state = stores.project.getState();
    const dirty = selectIsDirty(state);
    const name = state.location?.displayName ?? state.project.name;
    platform.setDocumentState({ title: `${dirty ? '● ' : ''}${name} — ${APP_NAME}`, dirty });
  };

  const unsubscribers = [
    stores.project.subscribe((state, previous) => {
      if (state.project === previous.project && state.savedProject === previous.savedProject) return;
      publishDocumentState();
      const sequence = state.project.sequences[state.project.activeSequenceId];
      stores.selection.getState().retainClips((id) => !!sequence?.clips[id]);
      const assetId = stores.selection.getState().assetId;
      if (assetId && !state.project.mediaAssets[assetId]) stores.selection.getState().selectAsset(null);
    }),
  ];
  publishDocumentState();

  return {
    platform,
    stores,
    actions,
    dispose() {
      for (const unsubscribe of unsubscribers) unsubscribe();
      media.releaseAll();
      platform.media.dispose();
    },
  };
}
