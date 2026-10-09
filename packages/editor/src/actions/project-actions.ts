import { createProject, deserializeProject, type Project, serializeProject } from '@timeline/core';
import { APP_NAME, APP_VERSION, PROJECT_FILE_EXTENSION, toErrorMessage } from '@timeline/shared';
import { type ProjectLocation } from '../platform';
import { type EditorServices } from '../runtime/services';
import { selectIsDirty } from '../state/project-store';
import { type MediaActions } from './media-actions';

/** New / open / save flows. Persistence itself is delegated to the platform storage. */
export function createProjectActions(services: EditorServices, mediaActions: MediaActions) {
  const { platform } = services;
  const { project: projectStore, ui, selection, playback } = services.stores;

  const confirmDiscard = async (): Promise<boolean> => {
    if (!selectIsDirty(projectStore.getState())) return true;
    return ui.getState().confirm({
      title: 'Discard unsaved changes?',
      message: `“${projectStore.getState().project.name}” has unsaved changes that will be lost.`,
      confirmLabel: 'Discard Changes',
    });
  };

  const replaceDocument = (project: Project, location: ProjectLocation | null) => {
    playback.getState().setPlaying(false);
    playback.getState().setPlayhead(0);
    selection.getState().reset();
    mediaActions.releaseAll();
    projectStore.getState().load(project, location, true);
  };

  const save = async (saveAs: boolean): Promise<boolean> => {
    const state = projectStore.getState();
    const project = state.project;
    const contents = serializeProject(project, { generator: `${APP_NAME} ${APP_VERSION}` });
    try {
      const location = await platform.storage.save({
        contents,
        location: saveAs ? null : state.location,
        suggestedName: `${project.name}.${PROJECT_FILE_EXTENSION}`,
      });
      if (!location) return false;
      projectStore.getState().markSaved(project, location);
      ui.getState().notify(`Saved ${location.displayName}.`, 'success');
      return true;
    } catch (error) {
      ui.getState().notify(`Could not save the project: ${toErrorMessage(error)}`, 'error');
      return false;
    }
  };

  return {
    async newProject(): Promise<void> {
      if (!(await confirmDiscard())) return;
      replaceDocument(createProject(), null);
      ui.getState().notify('Created a new project.');
    },

    async openProject(): Promise<boolean> {
      if (!(await confirmDiscard())) return false;
      let opened;
      try {
        opened = await platform.storage.open();
      } catch (error) {
        ui.getState().notify(`Could not open the project: ${toErrorMessage(error)}`, 'error');
        return false;
      }
      if (!opened) return false;
      const result = deserializeProject(opened.contents);
      if (!result.ok) {
        ui.getState().notify(`Could not open ${opened.location.displayName}: ${result.error.message}`, 'error');
        return false;
      }
      replaceDocument(result.value, opened.location);
      ui.getState().notify(`Opened ${opened.location.displayName}.`, 'success');
      await mediaActions.resolveProjectMedia(result.value);
      return true;
    },

    saveProject: () => save(false),
    saveProjectAs: () => save(true),
  };
}

export type ProjectActions = ReturnType<typeof createProjectActions>;
