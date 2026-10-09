import {
  applyChange,
  beginTransaction,
  cancelTransaction,
  commitTransaction,
  createHistory,
  type EditHistory,
  type EditResult,
  type Project,
  redo,
  undo,
} from '@timeline/core';
import { type Result, type TimelineError } from '@timeline/shared';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { type ProjectLocation } from '../platform';

/**
 * Persistent document state: the project, its undo history and where it is
 * saved. Components never modify the project directly; they call editing
 * actions which go through `apply`, so every change is validated by a core
 * operation and recorded in history.
 */
export interface ProjectState {
  readonly history: EditHistory<Project>;
  /** Same as `history.present`, exposed for convenient selectors. */
  readonly project: Project;
  /** Project reference at the last save/open. Dirty when it differs from `project`. */
  readonly savedProject: Project | null;
  readonly location: ProjectLocation | null;

  apply(label: string, edit: (project: Project) => EditResult): Result<Project, TimelineError>;
  beginTransaction(label: string): void;
  commitTransaction(): void;
  cancelTransaction(): void;
  undo(): string | null;
  redo(): string | null;
  /** Replaces the document (new/open) and clears history. */
  load(project: Project, location: ProjectLocation | null, clean: boolean): void;
  markSaved(project: Project, location: ProjectLocation): void;
}

export type ProjectStore = StoreApi<ProjectState>;

export function createProjectStore(initial: Project, now: () => Date = () => new Date()): ProjectStore {
  return createStore<ProjectState>()((set, get) => {
    const setHistory = (history: EditHistory<Project>) => set({ history, project: history.present });

    return {
      history: createHistory(initial),
      project: initial,
      savedProject: null,
      location: null,

      apply(label, edit) {
        const { history } = get();
        const result = edit(history.present);
        if (!result.ok || result.value === history.present) return result;
        const stamped: Project = { ...result.value, modifiedAt: now().toISOString() };
        setHistory(applyChange(history, label, stamped));
        return { ok: true, value: stamped };
      },

      beginTransaction(label) {
        setHistory(beginTransaction(get().history, label));
      },

      commitTransaction() {
        setHistory(commitTransaction(get().history));
      },

      cancelTransaction() {
        setHistory(cancelTransaction(get().history));
      },

      undo() {
        const { history } = get();
        const label = history.past[history.past.length - 1]?.label ?? null;
        const next = undo(history);
        if (next === history) return null;
        setHistory(next);
        return label;
      },

      redo() {
        const { history } = get();
        const label = history.future[history.future.length - 1]?.label ?? null;
        const next = redo(history);
        if (next === history) return null;
        setHistory(next);
        return label;
      },

      load(project, location, clean) {
        set({
          history: createHistory(project),
          project,
          location,
          savedProject: clean ? project : null,
        });
      },

      markSaved(project, location) {
        set({ savedProject: project, location });
      },
    };
  });
}

export const selectIsDirty = (state: ProjectState): boolean => state.project !== state.savedProject;
