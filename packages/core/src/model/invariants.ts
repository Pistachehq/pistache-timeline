import { isNonNegativeInteger, isPositiveInteger } from '@timeline/shared';
import { isValidFrameRate } from '../time/rational';
import { getClipEnd } from './queries';
import { type ClipId, type Project, type Sequence, type Track } from './types';

function checkTrack(sequence: Sequence, track: Track, owners: Map<ClipId, string>, issues: string[]) {
  const where = `sequence ${sequence.id} track ${track.id}`;
  let previousEnd = 0;
  for (const clipId of track.clipIds) {
    const clip = sequence.clips[clipId];
    if (!clip) {
      issues.push(`${where} references missing clip ${clipId}`);
      continue;
    }
    const owner = owners.get(clipId);
    if (owner) issues.push(`clip ${clipId} is listed on both ${owner} and ${track.id}`);
    owners.set(clipId, track.id);
    if (clip.trackId !== track.id) {
      issues.push(`clip ${clipId} has trackId ${clip.trackId} but is listed on ${track.id}`);
    }
    if (clip.start < previousEnd) {
      issues.push(`clip ${clipId} on ${where} overlaps or is out of order`);
    }
    previousEnd = getClipEnd(clip);
  }
}

/**
 * Checks every structural invariant of the project model and returns a list
 * of human readable violations. An empty list means the project is valid.
 */
export function validateProjectInvariants(project: Project): string[] {
  const issues: string[] = [];
  if (!project.sequences[project.activeSequenceId]) {
    issues.push(`active sequence ${project.activeSequenceId} does not exist`);
  }
  for (const [assetId, asset] of Object.entries(project.mediaAssets)) {
    if (asset.id !== assetId) issues.push(`media asset key ${assetId} does not match id ${asset.id}`);
    if (!isNonNegativeInteger(asset.duration.value) || !isPositiveInteger(asset.duration.timescale)) {
      issues.push(`media asset ${assetId} has an invalid duration`);
    }
  }

  for (const [sequenceId, sequence] of Object.entries(project.sequences)) {
    if (sequence.id !== sequenceId) issues.push(`sequence key ${sequenceId} does not match id`);
    if (!isValidFrameRate(sequence.frameRate)) issues.push(`sequence ${sequenceId} has an invalid frame rate`);
    if (!isPositiveInteger(sequence.resolution.width) || !isPositiveInteger(sequence.resolution.height)) {
      issues.push(`sequence ${sequenceId} has an invalid resolution`);
    }

    const trackIds = new Set<string>();
    for (const track of [...sequence.videoTracks, ...sequence.audioTracks]) {
      if (trackIds.has(track.id)) issues.push(`duplicate track id ${track.id}`);
      trackIds.add(track.id);
    }
    for (const track of sequence.videoTracks as readonly Track[]) {
      if (track.kind !== 'video') issues.push(`track ${track.id} is listed as video but is not`);
    }
    for (const track of sequence.audioTracks as readonly Track[]) {
      if (track.kind !== 'audio') issues.push(`track ${track.id} is listed as audio but is not`);
    }

    const owners = new Map<ClipId, string>();
    for (const track of [...sequence.videoTracks, ...sequence.audioTracks]) {
      checkTrack(sequence, track, owners, issues);
    }

    for (const [clipId, clip] of Object.entries(sequence.clips)) {
      if (clip.id !== clipId) issues.push(`clip key ${clipId} does not match id ${clip.id}`);
      if (!owners.has(clip.id)) issues.push(`clip ${clipId} is not listed on any track`);
      if (!project.mediaAssets[clip.assetId]) {
        issues.push(`clip ${clipId} references missing media asset ${clip.assetId}`);
      }
      if (!isNonNegativeInteger(clip.start)) issues.push(`clip ${clipId} has an invalid start`);
      if (!isNonNegativeInteger(clip.sourceIn) || !isNonNegativeInteger(clip.sourceOut)) {
        issues.push(`clip ${clipId} has invalid source points`);
      } else if (clip.sourceOut <= clip.sourceIn) {
        issues.push(`clip ${clipId} has a non-positive duration`);
      }
    }
  }
  return issues;
}
