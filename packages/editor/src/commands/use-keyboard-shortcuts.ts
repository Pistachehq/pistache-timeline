import { useEffect } from 'react';
import { type EditorRuntime } from '../runtime/create-runtime';
import { createShortcutIndex, executeCommand, getCommand, type Keymap } from './commands';
import { eventToChord } from './keymap';

function isTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    return !['button', 'checkbox', 'radio', 'range', 'color'].includes(target.type);
  }
  return false;
}

/** Installs global editor shortcuts on the window for the lifetime of the component. */
export function useKeyboardShortcuts(runtime: EditorRuntime, keymap: Keymap): void {
  useEffect(() => {
    const index = createShortcutIndex(keymap);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTextInput(event.target)) return;
      if (runtime.stores.ui.getState().dialog) return;
      const id = index.get(eventToChord(event));
      if (!id) return;
      // Matched chords never fall through to browser defaults (e.g. Ctrl+S "Save page").
      event.preventDefault();
      if (event.repeat && !getCommand(id).repeatable) return;
      executeCommand(id, runtime);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [runtime, keymap]);
}
