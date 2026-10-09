import { createContext, type ReactNode, useContext } from 'react';
import { useStore } from 'zustand';
import { type MediaState } from '../state/media-store';
import { type PlaybackState } from '../state/playback-store';
import { type ProjectState } from '../state/project-store';
import { type SelectionState } from '../state/selection-store';
import { type UiState } from '../state/ui-store';
import { type EditorRuntime } from './create-runtime';

const RuntimeContext = createContext<EditorRuntime | null>(null);

export function EditorRuntimeProvider({ runtime, children }: { runtime: EditorRuntime; children: ReactNode }) {
  return <RuntimeContext.Provider value={runtime}>{children}</RuntimeContext.Provider>;
}

export function useRuntime(): EditorRuntime {
  const runtime = useContext(RuntimeContext);
  if (!runtime) throw new Error('useRuntime must be used inside <EditorRuntimeProvider>.');
  return runtime;
}

/*
 * Selector hooks. Always select the narrowest slice needed; selectors must
 * return stable references (use `useShallow` for derived objects/arrays).
 */

export function useProjectState<T>(selector: (state: ProjectState) => T): T {
  return useStore(useRuntime().stores.project, selector);
}

export function useSelectionState<T>(selector: (state: SelectionState) => T): T {
  return useStore(useRuntime().stores.selection, selector);
}

export function useUiState<T>(selector: (state: UiState) => T): T {
  return useStore(useRuntime().stores.ui, selector);
}

export function usePlaybackState<T>(selector: (state: PlaybackState) => T): T {
  return useStore(useRuntime().stores.playback, selector);
}

export function useMediaState<T>(selector: (state: MediaState) => T): T {
  return useStore(useRuntime().stores.media, selector);
}
