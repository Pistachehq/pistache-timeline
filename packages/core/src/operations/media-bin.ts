import { ok } from '@timeline/shared';
import { newMediaBinFolderId } from '../model/factory';
import {
  type MediaAssetId,
  type MediaBinFolder,
  type MediaBinFolderId,
  type Project,
} from '../model/types';
import { type EditResult, fail } from './common';

function folderExists(project: Project, folderId: MediaBinFolderId | null): boolean {
  return folderId === null || project.mediaBinFolders[folderId] !== undefined;
}

function collectDescendantFolderIds(project: Project, folderId: MediaBinFolderId): Set<MediaBinFolderId> {
  const ids = new Set<MediaBinFolderId>([folderId]);
  let added = true;
  while (added) {
    added = false;
    for (const folder of Object.values(project.mediaBinFolders)) {
      if (folder.parentId !== null && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        added = true;
      }
    }
  }
  return ids;
}

export interface CreateMediaBinFolderInput {
  readonly name: string;
  readonly parentId?: MediaBinFolderId | null;
  readonly id?: MediaBinFolderId;
}

export function createMediaBinFolder(project: Project, input: CreateMediaBinFolderInput): EditResult {
  const name = input.name.trim();
  if (!name) return fail('INVALID_ARGUMENT', 'Folder name cannot be empty.');
  const parentId = input.parentId ?? null;
  if (!folderExists(project, parentId)) {
    return fail('NOT_FOUND', 'Parent folder does not exist.');
  }
  const id = input.id ?? newMediaBinFolderId();
  if (project.mediaBinFolders[id]) return fail('CONFLICT', `Folder ${id} already exists.`);
  const folder: MediaBinFolder = { id, name, parentId };
  return ok({
    ...project,
    mediaBinFolders: { ...project.mediaBinFolders, [id]: folder },
  });
}

export function renameMediaBinFolder(
  project: Project,
  folderId: MediaBinFolderId,
  name: string,
): EditResult {
  const folder = project.mediaBinFolders[folderId];
  if (!folder) return fail('NOT_FOUND', 'Folder does not exist.');
  const trimmed = name.trim();
  if (!trimmed) return fail('INVALID_ARGUMENT', 'Folder name cannot be empty.');
  if (trimmed === folder.name) return ok(project);
  return ok({
    ...project,
    mediaBinFolders: { ...project.mediaBinFolders, [folderId]: { ...folder, name: trimmed } },
  });
}

export function moveMediaAssetToFolder(
  project: Project,
  assetId: MediaAssetId,
  folderId: MediaBinFolderId | null,
): EditResult {
  const asset = project.mediaAssets[assetId];
  if (!asset) return fail('NOT_FOUND', 'Media asset does not exist.');
  if (!folderExists(project, folderId)) return fail('NOT_FOUND', 'Folder does not exist.');
  if (asset.folderId === folderId) return ok(project);
  return ok({
    ...project,
    mediaAssets: {
      ...project.mediaAssets,
      [assetId]: { ...asset, folderId },
    },
  });
}

/** Removes a folder and its subfolders; assets move to the deleted folder's parent. */
export function removeMediaBinFolder(project: Project, folderId: MediaBinFolderId): EditResult {
  const folder = project.mediaBinFolders[folderId];
  if (!folder) return fail('NOT_FOUND', 'Folder does not exist.');
  const removeIds = collectDescendantFolderIds(project, folderId);
  const destination = folder.parentId;

  let mediaAssets = { ...project.mediaAssets };
  for (const asset of Object.values(mediaAssets)) {
    if (asset.folderId !== null && removeIds.has(asset.folderId)) {
      mediaAssets = {
        ...mediaAssets,
        [asset.id]: { ...asset, folderId: destination },
      };
    }
  }

  const mediaBinFolders = { ...project.mediaBinFolders };
  for (const id of removeIds) delete mediaBinFolders[id];

  return ok({ ...project, mediaAssets, mediaBinFolders });
}

export function ensureMediaBinFolderPath(
  project: Project,
  segments: readonly string[],
  parentId: MediaBinFolderId | null = null,
): { project: Project; folderId: MediaBinFolderId | null } {
  if (segments.length === 0) return { project, folderId: parentId };
  const head = segments[0];
  const tail = segments.slice(1);
  if (!head) return { project, folderId: parentId };
  const existing = Object.values(project.mediaBinFolders).find(
    (folder) => folder.parentId === parentId && folder.name === head,
  );
  if (existing) {
    return ensureMediaBinFolderPath(project, tail, existing.id);
  }
  const created = createMediaBinFolder(project, { name: head, parentId });
  if (!created.ok) return { project, folderId: parentId };
  const folderId = Object.values(created.value.mediaBinFolders).find(
    (f) => f.parentId === parentId && f.name === head,
  )!.id;
  return ensureMediaBinFolderPath(created.value, tail, folderId);
}

export interface ImportedAssetBinAssignment {
  readonly assetId: MediaAssetId;
  readonly binPath: readonly string[];
}

export function assignImportedAssetsToBins(
  project: Project,
  assignments: readonly ImportedAssetBinAssignment[],
): EditResult {
  let next = project;
  for (const { assetId, binPath } of assignments) {
    if (binPath.length === 0) continue;
    const ensured = ensureMediaBinFolderPath(next, binPath);
    next = ensured.project;
    const moved = moveMediaAssetToFolder(next, assetId, ensured.folderId);
    if (!moved.ok) return moved;
    next = moved.value;
  }
  return ok(next);
}
