import { type DragEvent } from 'react';

/** Whether the drag payload includes files from the OS (Explorer, Finder, etc.). */
export function isOsFileDrag(dataTransfer: DataTransfer): boolean {
  return dataTransfer.types.includes('Files');
}

export function filesFromDataTransfer(dataTransfer: DataTransfer): File[] {
  return Array.from(dataTransfer.files);
}

export function allowOsFileDrop(event: DragEvent): boolean {
  if (!isOsFileDrag(event.dataTransfer)) return false;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
  return true;
}
