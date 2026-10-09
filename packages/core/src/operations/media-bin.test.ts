import { unwrap } from '@timeline/shared';
import { describe, expect, it } from 'vitest';
import { createMediaAsset, createProject, newMediaAssetId } from '../model/factory';
import { mediaTimeFromSeconds } from '../time/rational';
import { addMediaAssets } from './media';
import { listMediaBinFolderContents } from '../model/queries';
import { assignImportedAssetsToBins, createMediaBinFolder } from './media-bin';

describe('media bin', () => {
  it('creates folder paths on import and assigns assets', () => {
    const asset = createMediaAsset({
      id: newMediaAssetId(),
      name: 'Clip',
      kind: 'video',
      source: {
        kind: 'local-file',
        fileName: 'a.mp4',
        size: 1,
        lastModified: 1,
        mimeType: 'video/mp4',
        path: null,
      },
      duration: mediaTimeFromSeconds(10),
      hasVideo: true,
      hasAudio: true,
    });
    let project = unwrap(addMediaAssets(createProject(), [asset]));
    project = unwrap(
      assignImportedAssetsToBins(project, [
        { assetId: asset.id, binPath: ['Evidencia', 'Set A'] },
      ]),
    );
    const root = listMediaBinFolderContents(project, null);
    expect(root.folders).toHaveLength(1);
    expect(root.folders[0]!.name).toBe('Evidencia');
    const evidencia = listMediaBinFolderContents(project, root.folders[0]!.id);
    expect(evidencia.folders[0]!.name).toBe('Set A');
    const inSetA = listMediaBinFolderContents(project, evidencia.folders[0]!.id);
    expect(inSetA.assets[0]!.id).toBe(asset.id);
  });

  it('creates a folder at the bin root', () => {
    const project = unwrap(createMediaBinFolder(createProject(), { name: 'B-Roll' }));
    expect(listMediaBinFolderContents(project, null).folders[0]!.name).toBe('B-Roll');
  });
});
