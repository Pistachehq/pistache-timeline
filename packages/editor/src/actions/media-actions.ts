import {
  addMediaAssets,
  assignImportedAssetsToBins,
  countAssetUsage,
  createMediaAsset,
  createMediaBinFolder,
  moveMediaAssetToFolder,
  removeMediaBinFolder,
  renameMediaBinFolder,
  getActiveSequence,
  getAssetFrameCount,
  type MediaAsset,
  type MediaAssetId,
  type MediaBinFolderId,
  mediaTimeFromSeconds,
  type Project,
  relinkMediaAsset,
  removeMediaAsset,
} from '@timeline/core';
import { buildWaveformFromHandle, type MediaHandle, type MediaMetadata, type PickedMedia } from '@timeline/media';
import { isAbortError, ok, stripExtension, toErrorMessage } from '@timeline/shared';
import { type EditorServices } from '../runtime/services';

const THUMBNAIL_WIDTH = 192;
const THUMBNAIL_TIME_SECONDS = 1;

function assetFromProbe(picked: PickedMedia, metadata: MediaMetadata): MediaAsset {
  const kind = picked.kind;
  return createMediaAsset({
    name: stripExtension(picked.source.fileName),
    kind,
    source: picked.source,
    duration: mediaTimeFromSeconds(metadata.durationSeconds),
    hasVideo: kind === 'video' && metadata.hasVideo,
    hasAudio: kind === 'audio' || (kind === 'video' && metadata.hasAudio),
    resolution: metadata.width && metadata.height ? { width: metadata.width, height: metadata.height } : null,
    frameRate: metadata.frameRate,
    metadata: {
      videoCodec: metadata.videoCodec,
      audioCodec: metadata.audioCodec,
      probedBy: metadata.probedBy,
    },
  });
}

/** Import, resolution, relinking and cleanup of media used by the project. */
export function createMediaActions(services: EditorServices) {
  const { platform } = services;
  const engine = platform.media;
  const { project: projectStore, media, ui, selection } = services.stores;

  const generateThumbnail = async (assetId: MediaAssetId, handle: MediaHandle, kind: MediaAsset['kind']) => {
    try {
      const thumbnail = await engine.createThumbnail(
        handle,
        {
          timeSeconds: THUMBNAIL_TIME_SECONDS,
          maxWidth: THUMBNAIL_WIDTH,
        },
        kind,
      );
      if (thumbnail) media.getState().setEntry(assetId, { thumbnail: thumbnail.url });
    } catch (error) {
      if (!isAbortError(error)) console.warn(`Thumbnail failed for ${assetId}:`, error);
    }
  };

  const generateWaveform = async (assetId: MediaAssetId, handle: MediaHandle) => {
    try {
      const waveform = await buildWaveformFromHandle(handle);
      media.getState().setEntry(assetId, { waveform });
    } catch (error) {
      if (!isAbortError(error)) console.warn(`Waveform failed for ${assetId}:`, error);
    }
  };

  const markOnline = (asset: MediaAsset, handle: MediaHandle) => {
    media.getState().setEntry(asset.id, { status: 'online', handle, error: null });
    if (asset.hasVideo || asset.kind === 'image') void generateThumbnail(asset.id, handle, asset.kind);
    if (asset.hasAudio) void generateWaveform(asset.id, handle);
  };

  /** Probes a picked file; releases it and returns an error message on failure. */
  const probe = async (picked: PickedMedia): Promise<MediaMetadata | string> => {
    try {
      const metadata = await engine.probe(picked.handle, picked.kind);
      if (!(metadata.durationSeconds > 0)) throw new Error('The file has no playable duration.');
      return metadata;
    } catch (error) {
      engine.release(picked.handle);
      return toErrorMessage(error);
    }
  };

  const importPickedFiles = async (
    pickedFiles: readonly PickedMedia[],
    initialFailures: readonly string[],
    undoLabel: string,
    quiet = false,
  ): Promise<MediaAsset[]> => {
    const failures = [...initialFailures];
    if (pickedFiles.length === 0 && failures.length === 0) return [];

    const task = ui.getState().startTask(`Importing ${pickedFiles.length} file(s)…`);
    const imported: { asset: MediaAsset; handle: MediaHandle; binPath: readonly string[] }[] = [];
    try {
      for (const picked of pickedFiles) {
        const metadata = await probe(picked);
        if (typeof metadata === 'string') failures.push(`${picked.source.fileName}: ${metadata}`);
        else
          imported.push({
            asset: assetFromProbe(picked, metadata),
            handle: picked.handle,
            binPath: picked.binPath,
          });
      }
    } finally {
      ui.getState().endTask(task);
    }

    const assets = imported.map((entry) => entry.asset);
    const result = projectStore.getState().apply(undoLabel, (project) => {
      const added = addMediaAssets(project, assets);
      if (!added.ok) return added;
      return assignImportedAssetsToBins(
        added.value,
        imported.map((entry) => ({ assetId: entry.asset.id, binPath: entry.binPath })),
      );
    });
    if (!result.ok) {
      ui.getState().notify(result.error.message, 'error');
      return [];
    }
    for (const { asset, handle } of imported) markOnline(asset, handle);
    const first = assets[0];
    if (first) selection.getState().selectAsset(first.id);
    if (assets.length > 0) ui.getState().flashMediaBinPopIn(assets.map((a) => a.id));

    if (failures.length > 0) {
      const importedCount = assets.length > 0 ? `Imported ${assets.length}; ` : '';
      ui.getState().notify(`${importedCount}could not import ${failures.join('; ')}`, 'warning');
    } else if (assets.length > 0 && !quiet) {
      ui.getState().notify(`Imported ${assets.length} file${assets.length === 1 ? '' : 's'}.`, 'success');
    }
    return assets;
  };

  return {
    /** Opens the platform picker, probes the chosen files and adds them to the project. */
    async importMedia(): Promise<MediaAsset[]> {
      try {
        const result = await engine.pickMedia({ multiple: true });
        const label = result.files.length > 1 ? 'Import Media' : 'Import File';
        return importPickedFiles(
          result.files,
          result.rejected.map((r) => `${r.fileName}: ${r.reason}`),
          label,
        );
      } catch (error) {
        ui.getState().notify(`Could not open the file picker: ${toErrorMessage(error)}`, 'error');
        return [];
      }
    },

    async importMediaFolder(): Promise<MediaAsset[]> {
      try {
        const result = await engine.pickMediaFolder();
        if (result.files.length === 0 && result.rejected.length === 0) return [];
        const label = result.files.length > 1 ? 'Import Folder' : 'Import File';
        return importPickedFiles(
          result.files,
          result.rejected.map((r) => `${r.fileName}: ${r.reason}`),
          label,
        );
      } catch (error) {
        ui.getState().notify(`Could not open the folder picker: ${toErrorMessage(error)}`, 'error');
        return [];
      }
    },

    /** Imports files from drag-and-drop (Explorer/Finder → project or timeline). */
    async importLocalFiles(files: readonly File[], options?: { readonly quiet?: boolean }): Promise<MediaAsset[]> {
      if (files.length === 0) return [];
      try {
        const result = await engine.importLocalFiles(files);
        const label = options?.quiet ? 'Import Voice Over' : result.files.length > 1 ? 'Import Media' : 'Import File';
        return importPickedFiles(
          result.files,
          result.rejected.map((r) => `${r.fileName}: ${r.reason}`),
          label,
          options?.quiet === true,
        );
      } catch (error) {
        ui.getState().notify(`Could not import files: ${toErrorMessage(error)}`, 'error');
        return [];
      }
    },

    /** Re-opens every asset of a freshly loaded project; inaccessible ones become offline. */
    async resolveProjectMedia(project: Project): Promise<void> {
      const assets = Object.values(project.mediaAssets);
      for (const asset of assets) media.getState().setEntry(asset.id, { status: 'resolving' });
      let offline = 0;
      await Promise.all(
        assets.map(async (asset) => {
          try {
            const handle = await engine.resolve(asset.source);
            if (handle) markOnline(asset, handle);
            else {
              offline++;
              media.getState().setEntry(asset.id, { status: 'offline', handle: null });
            }
          } catch (error) {
            offline++;
            media.getState().setEntry(asset.id, { status: 'error', handle: null, error: toErrorMessage(error) });
          }
        }),
      );
      if (offline > 0) {
        ui.getState().notify(
          `${offline} media file${offline === 1 ? ' is' : 's are'} offline. Use “Relink” in the Project panel to locate ${offline === 1 ? 'it' : 'them'}.`,
          'warning',
        );
      }
    },

    /** Lets the user locate a replacement file for an asset. */
    async relinkAsset(assetId: MediaAssetId): Promise<boolean> {
      const asset = projectStore.getState().project.mediaAssets[assetId];
      if (!asset) return false;
      const { files } = await engine.pickMedia({ multiple: false });
      const picked = files[0];
      if (!picked) return false;
      const metadata = await probe(picked);
      if (typeof metadata === 'string') {
        ui.getState().notify(`Could not relink ${asset.name}: ${metadata}`, 'error');
        return false;
      }
      if (asset.kind === 'image' && picked.kind !== 'image') {
        engine.release(picked.handle);
        ui.getState().notify(`${picked.source.fileName} is not an image and cannot replace ${asset.name}.`, 'error');
        return false;
      }
      if (asset.hasVideo && !metadata.hasVideo) {
        engine.release(picked.handle);
        ui.getState().notify(`${picked.source.fileName} has no video and cannot replace ${asset.name}.`, 'error');
        return false;
      }
      const sequence = getActiveSequence(projectStore.getState().project);
      const replacement = { ...asset, duration: mediaTimeFromSeconds(metadata.durationSeconds) };
      const neededFrames = sequence
        ? Math.max(0, ...Object.values(sequence.clips).filter((c) => c.assetId === assetId).map((c) => c.sourceOut))
        : 0;
      if (sequence && getAssetFrameCount(replacement, sequence) < neededFrames) {
        engine.release(picked.handle);
        ui.getState().notify(`${picked.source.fileName} is shorter than the clips that use ${asset.name}.`, 'error');
        return false;
      }
      const result = projectStore
        .getState()
        .apply('Relink Media', (project) => relinkMediaAsset(project, assetId, picked.source));
      if (!result.ok) {
        ui.getState().notify(result.error.message, 'error');
        return false;
      }
      markOnline(asset, picked.handle);
      ui.getState().notify(`Relinked ${asset.name}.`, 'success');
      return true;
    },

    createBinFolder(parentId: MediaBinFolderId | null = null): MediaBinFolderId | null {
      const project = projectStore.getState().project;
      const base = 'New Folder';
      let name = base;
      let n = 2;
      const taken = new Set(
        Object.values(project.mediaBinFolders)
          .filter((f) => f.parentId === parentId)
          .map((f) => f.name),
      );
      while (taken.has(name)) {
        name = `${base} ${n}`;
        n++;
      }
      const result = projectStore.getState().apply('Create Folder', (p) =>
        createMediaBinFolder(p, { name, parentId }),
      );
      if (!result.ok) {
        ui.getState().notify(result.error.message, 'error');
        return null;
      }
      const created = Object.values(result.value.mediaBinFolders).find(
        (f) => f.parentId === parentId && f.name === name,
      );
      if (created) ui.getState().flashMediaBinPopIn([created.id]);
      return created?.id ?? null;
    },

    renameBinFolder(folderId: MediaBinFolderId, name: string): boolean {
      const result = projectStore.getState().apply('Rename Folder', (p) => renameMediaBinFolder(p, folderId, name));
      if (!result.ok) ui.getState().notify(result.error.message, 'error');
      return result.ok;
    },

    async removeBinFolder(folderId: MediaBinFolderId): Promise<boolean> {
      const folder = projectStore.getState().project.mediaBinFolders[folderId];
      if (!folder) return false;
      const confirmed = await ui.getState().confirm({
        title: 'Delete folder?',
        message: `“${folder.name}” will be removed. Clips inside move to the parent bin.`,
        confirmLabel: 'Delete',
      });
      if (!confirmed) return false;
      const result = projectStore.getState().apply('Remove Folder', (p) => removeMediaBinFolder(p, folderId));
      if (!result.ok) ui.getState().notify(result.error.message, 'error');
      else if (ui.getState().mediaBinOpenFolderId === folderId) {
        ui.getState().setMediaBinOpenFolderId(folder.parentId);
      }
      return result.ok;
    },

    async promptRenameBinFolder(folderId: MediaBinFolderId): Promise<boolean> {
      const folder = projectStore.getState().project.mediaBinFolders[folderId];
      if (!folder) return false;
      const name = await ui.getState().prompt({
        title: 'Rename folder',
        defaultValue: folder.name,
        confirmLabel: 'Rename',
      });
      if (name === null) return false;
      const result = projectStore.getState().apply('Rename Folder', (p) => renameMediaBinFolder(p, folderId, name));
      if (!result.ok) ui.getState().notify(result.error.message, 'error');
      return result.ok;
    },

    moveAssetToBin(assetId: MediaAssetId, folderId: MediaBinFolderId | null): boolean {
      return this.moveAssetsToBin([assetId], folderId);
    },

    moveAssetsToBin(assetIds: readonly MediaAssetId[], folderId: MediaBinFolderId | null): boolean {
      const unique = [...new Set(assetIds)];
      if (unique.length === 0) return false;
      const result = projectStore.getState().apply('Move Media', (p) => {
        let next = p;
        for (const assetId of unique) {
          const step = moveMediaAssetToFolder(next, assetId, folderId);
          if (!step.ok) return step;
          next = step.value;
        }
        return ok(next);
      });
      if (!result.ok) ui.getState().notify(result.error.message, 'error');
      return result.ok;
    },

    /** Removes an asset (and its clips) after confirmation when it is in use. */
    async removeAsset(assetId: MediaAssetId): Promise<void> {
      const project = projectStore.getState().project;
      const asset = project.mediaAssets[assetId];
      if (!asset) return;
      const usage = Object.values(project.sequences).reduce((n, seq) => n + countAssetUsage(seq, assetId), 0);
      if (usage > 0) {
        const confirmed = await ui.getState().confirm({
          title: 'Remove media?',
          message: `${asset.name} is used by ${usage} clip${usage === 1 ? '' : 's'}. Removing it also removes those clips.`,
          confirmLabel: 'Remove',
        });
        if (!confirmed) return;
      }
      const result = projectStore.getState().apply('Remove Media', (p) => removeMediaAsset(p, assetId));
      if (!result.ok) ui.getState().notify(result.error.message, 'error');
      else selection.getState().retainAssets((id) => id !== assetId);
    },

    /** Frees every media handle held for the current project. */
    releaseAll(): void {
      for (const entry of Object.values(media.getState().entries)) {
        if (entry.handle) engine.release(entry.handle);
      }
      media.getState().clear();
    },
  };
}

export type MediaActions = ReturnType<typeof createMediaActions>;
