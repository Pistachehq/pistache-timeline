import {
  addClip,
  addTrack,
  type Clip,
  type ClipAudio,
  type ClipId,
  type ClipTransform,
  type EditResult,
  findTrack,
  getActiveSequence,
  getAssetFrameCount,
  getSequence,
  getSplittableClipsAt,
  pairedAudioTrack,
  updateSequence,
  type MediaAssetId,
  moveClip,
  newClipId,
  type Project,
  removeClips,
  renameProject,
  type Sequence,
  setClipEnabled,
  splitClip,
  type TrackChanges,
  type TrackId,
  type TrackKind,
  updateClipAudio,
  updateClipTransform,
  updateTrack,
} from '@timeline/core';
import { ok } from '@timeline/shared';
import { currentSequence, type EditorServices } from '../runtime/services';

function chain(project: Project, steps: readonly ((p: Project) => EditResult)[]): EditResult {
  let result: EditResult = ok(project);
  for (const step of steps) {
    if (!result.ok) return result;
    result = step(result.value);
  }
  return result;
}

/**
 * Editing entry points used by the UI, menus and shortcuts. Each action maps
 * user intent onto one or more core operations and records a single,
 * labelled undo step.
 */
export function createEditActions(services: EditorServices) {
  const { project: projectStore, selection, ui, playback } = services.stores;

  /** Runs an edit against the active sequence and reports failures in the status bar. */
  const run = (label: string, edit: (project: Project, sequence: Sequence) => EditResult): boolean => {
    const sequence = currentSequence(services);
    if (!sequence) {
      ui.getState().notify('There is no active sequence.', 'error');
      return false;
    }
    const result = projectStore.getState().apply(label, (project) => edit(project, sequence));
    if (!result.ok) {
      ui.getState().notify(result.error.message, result.error.code === 'LOCKED' ? 'warning' : 'error');
      return false;
    }
    return true;
  };

  const getSelectedClips = (sequence: Sequence): Clip[] =>
    selection
      .getState()
      .clipIds.map((id) => sequence.clips[id])
      .filter((clip): clip is Clip => clip !== undefined);

  /** One split per link group so linked pairs are not cut twice. */
  const splitTargets = (candidates: readonly Clip[]): Clip[] => {
    const skip = new Set<ClipId>();
    const targets: Clip[] = [];
    for (const clip of candidates) {
      if (skip.has(clip.id)) continue;
      targets.push(clip);
      if (clip.linkId) skip.add(clip.linkId);
    }
    return targets;
  };

  const splitClips = (candidates: readonly Clip[], frame: number, emptyMessage: string): boolean => {
    const targets = splitTargets(candidates);
    if (targets.length === 0) {
      ui.getState().notify(emptyMessage, 'info');
      return false;
    }
    return run(targets.length > 1 ? 'Split Clips' : 'Split Clip', (project, sequence) =>
      chain(
        project,
        targets.map((clip) => (p: Project) => {
          const active = getActiveSequence(p);
          if (!active?.clips[clip.id]) return ok(p);
          return splitClip(p, { sequenceId: sequence.id, clipId: clip.id, frame });
        }),
      ),
    );
  };

  const placeClip = (assetId: MediaAssetId, trackId: TrackId, start: number, label: string): ClipId | null => {
    const clipId = newClipId();
    const placed = run(label, (project, sequence) => {
      const track = findTrack(sequence, trackId);
      const asset = project.mediaAssets[assetId];
      let result = addClip(project, { sequenceId: sequence.id, trackId, assetId, start, clipId });
      if (!result.ok || !track || track.kind !== 'video' || !asset?.hasAudio) return result;

      const audioTrack = pairedAudioTrack(sequence, track.id);
      if (!audioTrack || audioTrack.locked) return result;

      const seq = getSequence(result.value, sequence.id);
      const videoClip = seq?.clips[clipId];
      if (!seq || !videoClip) return result;

      const audioStart = start;
      const audioClipId = newClipId();
      result = addClip(result.value, {
        sequenceId: sequence.id,
        trackId: audioTrack.id,
        assetId,
        start: audioStart,
        sourceIn: videoClip.sourceIn,
        sourceOut: videoClip.sourceOut,
        clipId: audioClipId,
      });
      if (!result.ok) return result;

      return updateSequence(result.value, sequence.id, (next) =>
        ok({
          ...next,
          clips: {
            ...next.clips,
            [clipId]: { ...next.clips[clipId]!, linkId: audioClipId },
            [audioClipId]: { ...next.clips[audioClipId]!, linkId: clipId },
          },
        }),
      );
    });
    if (!placed) return null;
    selection.getState().selectClips([clipId]);
    return clipId;
  };

  return {
    /** Inserts the full asset at the playhead on the first suitable unlocked track. */
    insertAssetAtPlayhead(assetId: MediaAssetId): ClipId | null {
      const project = projectStore.getState().project;
      const sequence = currentSequence(services);
      const asset = project.mediaAssets[assetId];
      if (!sequence || !asset) return null;
      const duration = getAssetFrameCount(asset, sequence);
      if (duration <= 0) {
        ui.getState().notify(`${asset.name} is shorter than one frame.`, 'warning');
        return null;
      }
      const tracks = asset.hasVideo ? sequence.videoTracks : sequence.audioTracks;
      const unlocked = tracks.filter((track) => !track.locked);
      const frame = playback.getState().playhead;
      const track = unlocked[0];
      if (!track) {
        ui.getState().notify(`All ${asset.hasVideo ? 'video' : 'audio'} tracks are locked.`, 'warning');
        return null;
      }
      return placeClip(assetId, track.id, Math.max(0, frame), 'Insert Clip');
    },

    /** Places an asset on a specific track (drag and drop), snapping to the nearest free gap. */
    placeAssetOnTrack(assetId: MediaAssetId, trackId: TrackId, frame: number): ClipId | null {
      const project = projectStore.getState().project;
      const sequence = currentSequence(services);
      const asset = project.mediaAssets[assetId];
      const track = sequence ? findTrack(sequence, trackId) : undefined;
      if (!sequence || !asset || !track) return null;
      const duration = getAssetFrameCount(asset, sequence);
      if (duration <= 0) return null;
      return placeClip(assetId, trackId, Math.max(0, Math.round(frame)), 'Insert Clip');
    },

    /** Moves several clips in one undo step (multi-select and linked partners). */
    moveClipGroup(
      previews: readonly { clipId: ClipId; trackId: TrackId; start: number; offsetY?: number }[],
    ): boolean {
      if (previews.length === 0) return false;
      const label = previews.length > 1 ? 'Move Clips' : 'Move Clip';
      return run(label, (project, sequence) => {
        const ordered = [...previews].sort((a, b) => {
          const ca = sequence.clips[a.clipId];
          const cb = sequence.clips[b.clipId];
          return (ca?.start ?? 0) - (cb?.start ?? 0);
        });
        return chain(
          project,
          ordered.map(
            (preview) => (p: Project) =>
              moveClip(p, {
                sequenceId: sequence.id,
                clipId: preview.clipId,
                trackId: preview.trackId,
                start: Math.max(0, Math.round(preview.start)),
              }),
          ),
        );
      });
    },

    /** Moves a clip; overlaps on the same track overwrite (trim/split) existing clips. */
    moveClip(clipId: ClipId, trackId: TrackId, start: number): boolean {
      const at = Math.max(0, Math.round(start));
      return run('Move Clip', (project, sequence) =>
        moveClip(project, { sequenceId: sequence.id, clipId, trackId, start: at }),
      );
    },

    /** Shifts the selected clips by `delta` frames as one undo step. */
    nudgeSelection(delta: number): boolean {
      const sequence = currentSequence(services);
      if (!sequence) return false;
      const clips = getSelectedClips(sequence).sort((a, b) => (delta > 0 ? b.start - a.start : a.start - b.start));
      if (clips.length === 0) return false;
      return run('Nudge Clips', (project) =>
        chain(
          project,
          clips.map((clip) => (p: Project) =>
            moveClip(p, { sequenceId: sequence.id, clipId: clip.id, start: Math.max(0, clip.start + delta) }),
          ),
        ),
      );
    },

    deleteSelection(): boolean {
      const ids = selection.getState().clipIds;
      if (ids.length === 0) return false;
      const removed = run(ids.length > 1 ? 'Delete Clips' : 'Delete Clip', (project, sequence) =>
        removeClips(project, { sequenceId: sequence.id, clipIds: ids }),
      );
      if (removed) selection.getState().clearClips();
      return removed;
    },

    selectAllClips(): void {
      const sequence = currentSequence(services);
      if (sequence) selection.getState().selectClips(Object.keys(sequence.clips) as ClipId[]);
    },

    /**
     * Splits clips under the playhead: the selected ones if any are under it,
     * otherwise every clip on an unlocked track.
     */
    splitAtPlayhead(): boolean {
      const sequence = currentSequence(services);
      if (!sequence) return false;
      const frame = playback.getState().playhead;
      const splittable = getSplittableClipsAt(sequence, frame);
      const selected = getSelectedClips(sequence).filter((clip) => splittable.some((c) => c.id === clip.id));
      const candidates =
        selected.length > 0
          ? selected
          : splittable.filter((clip) => !findTrack(sequence, clip.trackId)?.locked);
      return splitClips(candidates, frame, 'There is no clip under the playhead to split.');
    },

    /** Razor / timeline cut: splits every unlocked clip that covers `frame`. */
    splitAtFrame(frame: number): boolean {
      const sequence = currentSequence(services);
      if (!sequence) return false;
      const candidates = getSplittableClipsAt(sequence, frame).filter(
        (clip) => !findTrack(sequence, clip.trackId)?.locked,
      );
      return splitClips(candidates, frame, 'There is no clip to split at this position.');
    },

    splitClipAt(clipId: ClipId, frame: number): boolean {
      return run('Split Clip', (project, sequence) => splitClip(project, { sequenceId: sequence.id, clipId, frame }));
    },

    setClipTransform(clipId: ClipId, transform: Partial<ClipTransform>, label = 'Change Transform'): boolean {
      return run(label, (project, sequence) =>
        updateClipTransform(project, { sequenceId: sequence.id, clipId, transform }),
      );
    },

    setClipAudio(clipId: ClipId, audio: Partial<ClipAudio>, label = 'Change Audio'): boolean {
      return run(label, (project, sequence) => updateClipAudio(project, { sequenceId: sequence.id, clipId, audio }));
    },

    toggleSelectedClipsEnabled(): boolean {
      const sequence = currentSequence(services);
      if (!sequence) return false;
      const clips = getSelectedClips(sequence);
      if (clips.length === 0) return false;
      const enable = clips.some((clip) => !clip.enabled);
      return run(enable ? 'Enable Clips' : 'Disable Clips', (project) =>
        chain(
          project,
          clips.map((clip) => (p: Project) =>
            setClipEnabled(p, { sequenceId: sequence.id, clipId: clip.id, enabled: enable }),
          ),
        ),
      );
    },

    updateTrack(trackId: TrackId, changes: TrackChanges, label: string): boolean {
      return run(label, (project, sequence) => updateTrack(project, { sequenceId: sequence.id, trackId, changes }));
    },

    addTrack(kind: TrackKind): boolean {
      return run(kind === 'video' ? 'Add Video Track' : 'Add Audio Track', (project, sequence) =>
        addTrack(project, { sequenceId: sequence.id, kind }),
      );
    },

    renameProject(name: string): boolean {
      const result = projectStore.getState().apply('Rename Project', (project) => renameProject(project, name));
      if (!result.ok) ui.getState().notify(result.error.message, 'error');
      return result.ok;
    },

    beginTransaction: (label: string) => projectStore.getState().beginTransaction(label),
    commitTransaction: () => projectStore.getState().commitTransaction(),

    undo(): void {
      const label = projectStore.getState().undo();
      if (label) ui.getState().notify(`Undo ${label}`);
    },

    redo(): void {
      const label = projectStore.getState().redo();
      if (label) ui.getState().notify(`Redo ${label}`);
    },
  };
}

export type EditActions = ReturnType<typeof createEditActions>;
