import {
  addClip,
  addTextClip,
  addTrack,
  applyMotionEdit,
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
  isRangeFree,
  pairedAudioTrack,
  pairedVideoTrack,
  updateSequence,
  type MediaAssetId,
  moveClip,
  moveKeyframe,
  moveKeyframes,
  setClipSpeed,
  newClipId,
  type Project,
  removeClips,
  removeTrack as removeTrackOp,
  renameProject,
  type Sequence,
  resetMotionChannel,
  setClipEnabled,
  setKeyframeInterpolation,
  setMotionChannelEnabled,
  splitClip,
  toggleKeyframeAtFrame,
  trimClip,
  type KeyframeInterpolation,
  type MotionChannelId,
  type TrackChanges,
  type TrackId,
  type TrackKind,
  mergeClipTransitions,
  updateClipAudio,
  updateClipEffects,
  updateClipText,
  updateClipTransitions,
  updateTrack,
  type ClipEffects,
  type ClipText,
  type ClipTransitions,
} from '@timeline/core';
import { ok, type Result, type TimelineError } from '@timeline/shared';
import { type EffectLibraryPayload } from '../panels/dnd';
import { applyEffectPayloadToClip } from '../panels/project/apply-effect-payload';
import { type AutoCreateTrackKind } from '../state/ui-store';
import { currentSequence, type EditorServices } from '../runtime/services';
import { type MediaActions } from './media-actions';
import { createVoiceOver } from './voice-over';

type ClipMovePreview = { readonly clipId: ClipId; readonly trackId: TrackId; readonly start: number };

function remappedPreviewsForNewTrack(
  sequence: Sequence,
  previews: readonly ClipMovePreview[],
  kind: AutoCreateTrackKind,
): ClipMovePreview[] {
  if (kind === 'video') {
    const newVideo = sequence.videoTracks.at(-1);
    if (!newVideo) return [...previews];
    return previews.map((preview) => {
      const clip = sequence.clips[preview.clipId];
      if (!clip) return preview;
      const home = findTrack(sequence, clip.trackId);
      if (home?.kind === 'video') return { ...preview, trackId: newVideo.id };
      const paired = pairedAudioTrack(sequence, newVideo.id);
      return paired ? { ...preview, trackId: paired.id } : preview;
    });
  }
  const newAudio = sequence.audioTracks.at(-1);
  if (!newAudio) return [...previews];
  return previews.map((preview) => {
    const clip = sequence.clips[preview.clipId];
    if (!clip) return preview;
    const home = findTrack(sequence, clip.trackId);
    if (home?.kind === 'audio') return { ...preview, trackId: newAudio.id };
    const paired = pairedVideoTrack(sequence, newAudio.id);
    return paired ? { ...preview, trackId: paired.id } : preview;
  });
}

function applyAutoCreateTrack(
  project: Project,
  sequence: Sequence,
  kind: AutoCreateTrackKind,
  previews: readonly ClipMovePreview[],
): Result<{ project: Project; previews: ClipMovePreview[] }, TimelineError> {
  let p = project;
  let seq = getActiveSequence(p) ?? sequence;
  let add = addTrack(p, { sequenceId: seq.id, kind });
  if (!add.ok) return add;
  p = add.value;
  seq = getActiveSequence(p)!;

  if (kind === 'video') {
    const needsAudio = previews.some((pr) => {
      const clip = seq.clips[pr.clipId];
      return clip?.linkId && findTrack(seq, clip.trackId)?.kind === 'video';
    });
    if (needsAudio && seq.audioTracks.length < seq.videoTracks.length) {
      add = addTrack(p, { sequenceId: seq.id, kind: 'audio' });
      if (!add.ok) return add;
      p = add.value;
      seq = getActiveSequence(p)!;
    }
  } else {
    const needsVideo = previews.some((pr) => {
      const clip = seq.clips[pr.clipId];
      return clip?.linkId && findTrack(seq, clip.trackId)?.kind === 'audio';
    });
    if (needsVideo && seq.videoTracks.length < seq.audioTracks.length) {
      add = addTrack(p, { sequenceId: seq.id, kind: 'video' });
      if (!add.ok) return add;
      p = add.value;
      seq = getActiveSequence(p)!;
    }
  }

  return ok({ project: p, previews: remappedPreviewsForNewTrack(seq, previews, kind) });
}

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
export function createEditActions(services: EditorServices, media: MediaActions) {
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

  const placeClipOnProject = (
    project: Project,
    sequence: Sequence,
    assetId: MediaAssetId,
    trackId: TrackId,
    start: number,
    clipId: ClipId,
  ): EditResult => {
    const track = findTrack(sequence, trackId);
    const asset = project.mediaAssets[assetId];
    let result = addClip(project, { sequenceId: sequence.id, trackId, assetId, start, clipId });
    if (!result.ok || !track || track.kind !== 'video' || !asset?.hasAudio) return result;

    const audioTrack = pairedAudioTrack(sequence, track.id);
    if (!audioTrack || audioTrack.locked) return result;

    const seq = getSequence(result.value, sequence.id);
    const videoClip = seq?.clips[clipId];
    if (!seq || !videoClip) return result;

    const audioClipId = newClipId();
    result = addClip(result.value, {
      sequenceId: sequence.id,
      trackId: audioTrack.id,
      assetId,
      start,
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
  };

  const placeClip = (assetId: MediaAssetId, trackId: TrackId, start: number, label: string): ClipId | null => {
    const clipId = newClipId();
    const placed = run(label, (project, sequence) =>
      placeClipOnProject(project, sequence, assetId, trackId, start, clipId),
    );
    if (!placed) return null;
    selection.getState().selectClips([clipId]);
    return clipId;
  };

  const voiceOver = createVoiceOver(services, {
    importRecording: async (file) => (await media.importLocalFiles([file], { quiet: true }))[0] ?? null,
    placeRecording: (assetId, trackId, start) => placeClip(assetId, trackId, start, 'Record Voice Over') !== null,
  });

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
      const onVideoTrack = asset.hasVideo || asset.kind === 'image';
      const tracks = onVideoTrack ? sequence.videoTracks : sequence.audioTracks;
      const unlocked = tracks.filter((track) => !track.locked);
      const frame = playback.getState().playhead;
      const track = unlocked[0];
      if (!track) {
        ui.getState().notify(`All ${onVideoTrack ? 'video' : 'audio'} tracks are locked.`, 'warning');
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

    /** Adds a new track (top video or bottom audio) and places the asset there. */
    placeAssetOnNewTrack(assetId: MediaAssetId, kind: AutoCreateTrackKind, frame: number): ClipId | null {
      const project = projectStore.getState().project;
      const sequence = currentSequence(services);
      const asset = project.mediaAssets[assetId];
      if (!sequence || !asset) return null;
      if (kind === 'video' && !asset.hasVideo && asset.kind !== 'image') return null;
      if (kind === 'audio' && !asset.hasAudio) return null;
      const duration = getAssetFrameCount(asset, sequence);
      if (duration <= 0) return null;
      const at = Math.max(0, Math.round(frame));
      const clipId = newClipId();
      const placed = run('Insert Clip', (project, sequence) => {
        let add = addTrack(project, { sequenceId: sequence.id, kind });
        if (!add.ok) return add;
        let p = add.value;
        let seq = getActiveSequence(p)!;
        if (kind === 'video' && asset.hasAudio && seq.audioTracks.length < seq.videoTracks.length) {
          add = addTrack(p, { sequenceId: seq.id, kind: 'audio' });
          if (!add.ok) return add;
          p = add.value;
          seq = getActiveSequence(p)!;
        }
        const track = (kind === 'video' ? seq.videoTracks.at(-1) : seq.audioTracks.at(-1))!;
        return placeClipOnProject(p, seq, assetId, track.id, at, clipId);
      });
      if (!placed) return null;
      selection.getState().selectClips([clipId]);
      return clipId;
    },

    /** Moves several clips in one undo step (multi-select and linked partners). */
    moveClipGroup(
      previews: readonly ClipMovePreview[],
      autoCreateTrack: AutoCreateTrackKind | null = null,
    ): boolean {
      if (previews.length === 0) return false;
      const label =
        autoCreateTrack !== null
          ? autoCreateTrack === 'video'
            ? 'Add Video Track'
            : 'Add Audio Track'
          : previews.length > 1
            ? 'Move Clips'
            : 'Move Clip';
      return run(label, (_project, sequence) => {
        let project = _project;
        let activePreviews: readonly ClipMovePreview[] = previews;
        if (autoCreateTrack) {
          const created = applyAutoCreateTrack(project, sequence, autoCreateTrack, previews);
          if (!created.ok) return created;
          project = created.value.project;
          activePreviews = created.value.previews;
        }
        const seq = getActiveSequence(project) ?? sequence;
        const ordered = [...activePreviews].sort((a, b) => {
          const ca = seq.clips[a.clipId];
          const cb = seq.clips[b.clipId];
          const trackA = ca ? findTrack(seq, ca.trackId) : undefined;
          const trackB = cb ? findTrack(seq, cb.trackId) : undefined;
          const kindOrder = (trackA?.kind === 'video' ? 0 : 1) - (trackB?.kind === 'video' ? 0 : 1);
          if (kindOrder !== 0) return kindOrder;
          return (ca?.start ?? 0) - (cb?.start ?? 0);
        });
        return chain(
          project,
          ordered.map(
            (preview) => (p: Project) =>
              moveClip(p, {
                sequenceId: seq.id,
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
      return run('Split Clip', (project, sequence) =>
        splitClip(project, { sequenceId: sequence.id, clipId, frame }),
      );
    },

    trimClipToEdge(clipId: ClipId, edge: 'start' | 'end', frame: number): boolean {
      const label = edge === 'start' ? 'Trim Clip Start' : 'Trim Clip End';
      return run(label, (project, sequence) =>
        trimClip(project, { sequenceId: sequence.id, clipId, edge, frame: Math.round(frame) }),
      );
    },

    setClipTransform(clipId: ClipId, transform: Partial<ClipTransform>, label = 'Change Transform'): boolean {
      return run(label, (project, sequence) => {
        const clip = sequence.clips[clipId];
        if (!clip) return ok(project);
        return applyMotionEdit(project, {
          sequenceId: sequence.id,
          clipId,
          transform,
          localFrame: playback.getState().playhead - clip.start,
        });
      });
    },

    setMotionAnimated(clipId: ClipId, channel: MotionChannelId, enabled: boolean): boolean {
      return run(enabled ? 'Enable Animation' : 'Disable Animation', (project, sequence) => {
        const clip = sequence.clips[clipId];
        if (!clip) return ok(project);
        return setMotionChannelEnabled(project, {
          sequenceId: sequence.id,
          clipId,
          channel,
          enabled,
          localFrame: playback.getState().playhead - clip.start,
        });
      });
    },

    toggleKeyframe(clipId: ClipId, channel: MotionChannelId, localFrame?: number): boolean {
      return run('Edit Keyframe', (project, sequence) => {
        const clip = sequence.clips[clipId];
        if (!clip) return ok(project);
        return toggleKeyframeAtFrame(project, {
          sequenceId: sequence.id,
          clipId,
          channel,
          localFrame: localFrame ?? playback.getState().playhead - clip.start,
        });
      });
    },

    moveMotionKeyframe(clipId: ClipId, channel: MotionChannelId, keyframeId: string, frame: number): boolean {
      return run('Move Keyframe', (project, sequence) =>
        moveKeyframe(project, { sequenceId: sequence.id, clipId, channel, keyframeId, frame }),
      );
    },

    moveMotionKeyframes(
      clipId: ClipId,
      moves: readonly { channel: MotionChannelId; keyframeId: string; frame: number }[],
    ): boolean {
      return run('Move Keyframes', (project, sequence) =>
        moveKeyframes(project, { sequenceId: sequence.id, clipId, moves }),
      );
    },

    setClipSpeed(clipId: ClipId, speed: number): boolean {
      return run('Change Speed', (project, sequence) => setClipSpeed(project, { sequenceId: sequence.id, clipId, speed }));
    },

    setMotionInterpolation(
      clipId: ClipId,
      channel: MotionChannelId,
      keyframeId: string,
      interpolation: KeyframeInterpolation,
    ): boolean {
      return run('Change Keyframe', (project, sequence) =>
        setKeyframeInterpolation(project, { sequenceId: sequence.id, clipId, channel, keyframeId, interpolation }),
      );
    },

    resetMotion(clipId: ClipId, channel: MotionChannelId): boolean {
      return run('Reset Property', (project, sequence) =>
        resetMotionChannel(project, { sequenceId: sequence.id, clipId, channel }),
      );
    },

    setClipAudio(clipId: ClipId, audio: Partial<ClipAudio>, label = 'Change Audio'): boolean {
      return run(label, (project, sequence) => updateClipAudio(project, { sequenceId: sequence.id, clipId, audio }));
    },

    setClipTransitions(clipId: ClipId, patch: Partial<ClipTransitions>, label = 'Change Transition'): boolean {
      return run(label, (project, sequence) => {
        const clip = sequence.clips[clipId];
        if (!clip) return ok(project);
        return updateClipTransitions(project, {
          sequenceId: sequence.id,
          clipId,
          transitions: mergeClipTransitions(clip.transitions, patch),
        });
      });
    },

    addTextClip(input: {
      trackId: TrackId;
      start: number;
      positionX?: number;
      positionY?: number;
    }): ClipId | null {
      const sequence = currentSequence(services);
      if (!sequence) {
        ui.getState().notify('There is no active sequence.', 'error');
        return null;
      }
      const clipId = newClipId();
      const result = projectStore.getState().apply('Add Text', (project) => {
        const current = getSequence(project, sequence.id);
        if (!current) return addTextClip(project, { sequenceId: sequence.id, trackId: input.trackId, start: input.start, clipId });
        const fps = current.frameRate.numerator / current.frameRate.denominator;
        const duration = Math.max(1, Math.round(fps * 5));
        const target = findTrack(current, input.trackId);
        const holdsPicture =
          target?.kind === 'video' &&
          target.clipIds.some((id) => {
            const clip = current.clips[id];
            return clip !== undefined && clip.text === null;
          });
        const occupied =
          target?.kind === 'video' &&
          !target.locked &&
          (holdsPicture || !isRangeFree(current, target, input.start, duration));
        let working = project;
        let trackId = input.trackId;
        if (occupied) {
          const added = addTrack(working, { sequenceId: current.id, kind: 'video' });
          if (!added.ok) return added;
          working = added.value;
          const created = getSequence(working, current.id)?.videoTracks.at(-1);
          if (created) trackId = created.id;
        }
        return addTextClip(working, {
          sequenceId: current.id,
          trackId,
          start: input.start,
          clipId,
          ...(input.positionX !== undefined ? { positionX: input.positionX } : {}),
          ...(input.positionY !== undefined ? { positionY: input.positionY } : {}),
        });
      });
      if (!result.ok) {
        ui.getState().notify(result.error.message, result.error.code === 'LOCKED' ? 'warning' : 'error');
        return null;
      }
      selection.getState().selectClips([clipId]);
      ui.getState().setTextEditingClipId(clipId);
      ui.getState().setTool('select');
      playback.getState().setPlayhead(input.start);
      return clipId;
    },

    setClipText(clipId: ClipId, text: Partial<ClipText>, label = 'Edit Text'): boolean {
      return run(label, (project, sequence) => updateClipText(project, { sequenceId: sequence.id, clipId, text }));
    },

    setClipEffects(clipId: ClipId, effects: ClipEffects, label = 'Change Effects'): boolean {
      return run(label, (project, sequence) =>
        updateClipEffects(project, { sequenceId: sequence.id, clipId, effects }),
      );
    },

    applyEffectLibraryPayload(clipId: ClipId, payload: EffectLibraryPayload, label = 'Apply Effect'): boolean {
      return run(label, (project, sequence) => {
        const next = applyEffectPayloadToClip(project, sequence.id, clipId, payload);
        return next ? ok(next) : ok(project);
      });
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

    removeTrack(trackId: TrackId): boolean {
      if (services.stores.ui.getState().voiceOverTrackId === trackId) voiceOver.cancel();
      return run('Delete Track', (project, sequence) => removeTrackOp(project, { sequenceId: sequence.id, trackId }));
    },

    toggleVoiceOver(trackId: TrackId): Promise<void> {
      return voiceOver.toggle(trackId);
    },

    cancelVoiceOver(): void {
      voiceOver.cancel();
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
