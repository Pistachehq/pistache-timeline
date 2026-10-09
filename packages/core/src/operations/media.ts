import { ok } from '@timeline/shared';
import {
  type ClipId,
  type MediaAsset,
  type MediaAssetId,
  type MediaSourceRef,
  type Project,
  type Sequence,
  type Track,
} from '../model/types';
import { type EditResult, fail } from './common';

export function addMediaAssets(project: Project, assets: readonly MediaAsset[]): EditResult {
  if (assets.length === 0) return ok(project);
  const mediaAssets = { ...project.mediaAssets };
  for (const asset of assets) {
    if (mediaAssets[asset.id]) return fail('CONFLICT', `Media asset ${asset.id} already exists.`);
    mediaAssets[asset.id] = asset;
  }
  return ok({ ...project, mediaAssets });
}

function removeAssetClips(sequence: Sequence, assetId: MediaAssetId): Sequence {
  const removed = new Set<ClipId>(
    Object.values(sequence.clips)
      .filter((clip) => clip.assetId === assetId)
      .map((clip) => clip.id),
  );
  if (removed.size === 0) return sequence;
  const clips = { ...sequence.clips };
  for (const id of removed) delete clips[id];
  const prune = <T extends Track>(track: T): T => ({
    ...track,
    clipIds: track.clipIds.filter((id) => !removed.has(id)),
  });
  return {
    ...sequence,
    clips,
    videoTracks: sequence.videoTracks.map(prune),
    audioTracks: sequence.audioTracks.map(prune),
  };
}

/** Removes an asset and every clip that references it, in all sequences. */
export function removeMediaAsset(project: Project, assetId: MediaAssetId): EditResult {
  if (!project.mediaAssets[assetId]) return fail('NOT_FOUND', `Media asset ${assetId} does not exist.`);
  const mediaAssets = { ...project.mediaAssets };
  delete mediaAssets[assetId];
  const sequences = Object.fromEntries(
    Object.entries(project.sequences).map(([id, sequence]) => [id, removeAssetClips(sequence, assetId)]),
  ) as Project['sequences'];
  return ok({ ...project, mediaAssets, sequences });
}

/** Points an existing asset at a new source file (e.g. after relinking offline media). */
export function relinkMediaAsset(project: Project, assetId: MediaAssetId, source: MediaSourceRef): EditResult {
  const asset = project.mediaAssets[assetId];
  if (!asset) return fail('NOT_FOUND', `Media asset ${assetId} does not exist.`);
  return ok({ ...project, mediaAssets: { ...project.mediaAssets, [assetId]: { ...asset, source } } });
}

export function renameProject(project: Project, name: string): EditResult {
  const trimmed = name.trim();
  if (!trimmed) return fail('INVALID_ARGUMENT', 'Project name cannot be empty.');
  if (trimmed === project.name) return ok(project);
  return ok({ ...project, name: trimmed });
}
