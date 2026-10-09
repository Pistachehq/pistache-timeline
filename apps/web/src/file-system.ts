/** Narrow wrappers around the File System Access API, which is not in every browser. */

export interface FilePickerAccept {
  readonly description: string;
  readonly accept: Record<string, readonly string[]>;
}

interface FilePickerHandle {
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
}

interface FilePickerWindow {
  showOpenFilePicker?(options: {
    multiple?: boolean;
    types?: FilePickerAccept[];
  }): Promise<FilePickerHandle[]>;
  showSaveFilePicker?(options: {
    suggestedName?: string;
    types?: FilePickerAccept[];
  }): Promise<FilePickerHandle>;
}

export function getFilePickerWindow(): FilePickerWindow {
  return window as Window & FilePickerWindow;
}

export async function readPickedFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    const finish = (file: File | null) => {
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => finish(null), { once: true });
    document.body.append(input);
    input.click();
  });
}

export function downloadTextFile(contents: string, fileName: string): void {
  const blob = new Blob([contents], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
