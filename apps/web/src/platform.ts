import { type DocumentState, type EditorPlatform } from '@timeline/editor';
import { createWebMediaEngine } from '@timeline/media';
import { APP_NAME } from '@timeline/shared';
import { createWebProjectStorage } from './storage';

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Browser host for the shared editor: WebCodecs-ready media engine and local file storage. */
export function createWebPlatform(): EditorPlatform {
  let dirty = false;
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (!dirty) return;
    event.preventDefault();
  };
  window.addEventListener('beforeunload', onBeforeUnload);

  return {
    kind: 'web',
    label: 'Web',
    media: createWebMediaEngine(),
    storage: createWebProjectStorage(),
    setDocumentState(state: DocumentState) {
      dirty = state.dirty;
      document.title = state.title || APP_NAME;
    },
    openExternal(url: string) {
      if (!isHttpsUrl(url)) return;
      window.open(url, '_blank', 'noopener,noreferrer');
    },
  };
}
