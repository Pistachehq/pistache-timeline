import { type OpenedProjectFile, type ProjectLocation, type ProjectStorage } from '@timeline/editor';
import { MAX_PROJECT_FILE_BYTES, PROJECT_FILE_EXTENSION } from '@timeline/shared';
import { downloadTextFile, getFilePickerWindow, readPickedFile, type FilePickerAccept } from './file-system';

const PROJECT_TYPES: FilePickerAccept[] = [
  {
    description: 'Timeline project',
    accept: { 'application/json': [`.${PROJECT_FILE_EXTENSION}`] },
  },
];

const PROJECT_ACCEPT = `.${PROJECT_FILE_EXTENSION},application/json`;

function isFileHandle(value: unknown): value is {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'getFile' in value &&
    'createWritable' in value &&
    typeof (value as { getFile?: unknown }).getFile === 'function'
  );
}

async function readFileContents(file: File): Promise<string> {
  if (file.size > MAX_PROJECT_FILE_BYTES) {
    throw new Error(`Project files larger than ${MAX_PROJECT_FILE_BYTES} bytes are not supported.`);
  }
  return file.text();
}

/**
 * Project persistence for browsers.
 *
 * Chromium-based browsers use the File System Access API so Save can overwrite
 * the same file in the current session. Firefox and Safari fall back to a
 * file input (open) and a download (save). Browsers cannot reopen media from a
 * saved path, so assets become offline until the user relinks them.
 */
export function createWebProjectStorage(): ProjectStorage {
  return {
    async open(): Promise<OpenedProjectFile | null> {
      const picker = getFilePickerWindow();
      if (picker.showOpenFilePicker) {
        try {
          const [handle] = await picker.showOpenFilePicker({ multiple: false, types: PROJECT_TYPES });
          if (!handle) return null;
          const file = await handle.getFile();
          return {
            contents: await readFileContents(file),
            location: { displayName: handle.name, ref: handle },
          };
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return null;
          throw error;
        }
      }
      const file = await readPickedFile(PROJECT_ACCEPT);
      if (!file) return null;
      return {
        contents: await readFileContents(file),
        location: { displayName: file.name, ref: null },
      };
    },

    async save(request): Promise<ProjectLocation | null> {
      const existing = isFileHandle(request.location?.ref) ? request.location.ref : null;
      const picker = getFilePickerWindow();

      if (existing) {
        const writable = await existing.createWritable();
        await writable.write(request.contents);
        await writable.close();
        return { displayName: existing.name, ref: existing };
      }

      if (picker.showSaveFilePicker) {
        try {
          const handle = await picker.showSaveFilePicker({
            suggestedName: request.suggestedName,
            types: PROJECT_TYPES,
          });
          const writable = await handle.createWritable();
          await writable.write(request.contents);
          await writable.close();
          return { displayName: handle.name, ref: handle };
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return null;
          throw error;
        }
      }

      downloadTextFile(request.contents, request.suggestedName);
      return { displayName: request.suggestedName, ref: null };
    },
  };
}
