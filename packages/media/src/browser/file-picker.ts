/**
 * Opens the native file chooser through a temporary `<input type="file">`.
 * Resolves with an empty list when the user cancels.
 */
export function pickFiles(options: { accept: string; multiple: boolean }): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = options.accept;
    input.multiple = options.multiple;
    input.style.display = 'none';
    input.dataset.timelineFilePicker = 'true';

    const finish = (files: File[]) => {
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => finish(Array.from(input.files ?? [])), { once: true });
    input.addEventListener('cancel', () => finish([]), { once: true });

    document.body.append(input);
    input.click();
  });
}

/** Opens a folder chooser; resolves with every file in the tree (browser filters later). */
export function pickFolderFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.style.display = 'none';
    input.dataset.timelineFilePicker = 'folder';
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('directory', '');

    const finish = (files: File[]) => {
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => finish(Array.from(input.files ?? [])), { once: true });
    input.addEventListener('cancel', () => finish([]), { once: true });

    document.body.append(input);
    input.click();
  });
}
