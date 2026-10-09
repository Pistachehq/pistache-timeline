import { getActiveSequence, type ClipId, type Sequence } from '@timeline/core';
import { type RefObject } from 'react';
import { useProjectState, useRuntime, useUiState } from '../../runtime/context';
import { ensureBlurRegion, getClipBlur } from '../inspector/clip-blur';
import { ProgramRegionOverlay } from './ProgramRegionOverlay';

export function ProgramBlurOverlay({
  sequence,
  frameRef,
  playhead,
  clipId,
  zIndex,
}: {
  readonly sequence: Sequence;
  readonly frameRef: RefObject<HTMLDivElement | null>;
  readonly playhead: number;
  readonly clipId: ClipId;
  readonly zIndex: number;
}) {
  const runtime = useRuntime();
  const { edit } = runtime.actions;
  const blurEditId = useUiState((s) => s.clipBlurEditId);
  const clip = useProjectState((s) => {
    const seq = getActiveSequence(s.project);
    return seq?.clips[clipId];
  });
  const blur = clip ? getClipBlur(clip) : null;
  const region = blur ? ensureBlurRegion(blur) : null;

  if (!blur || !region || blurEditId !== clipId) return null;

  return (
    <ProgramRegionOverlay
      sequence={sequence}
      frameRef={frameRef}
      playhead={playhead}
      clipId={clipId}
      zIndex={zIndex}
      region={region}
      accentClass="border-violet-400"
      active
      onRegionChange={(next) => {
        if (!clip) return;
        const nextBlur = { ...blur, region: next };
        edit.setClipEffects(
          clip.id,
          {
            ...clip.effects,
            video: clip.effects.video.map((e) => (e.kind === 'blur' ? nextBlur : e)),
          },
          'Adjust Blur Region',
        );
      }}
      onCommit={() => edit.commitTransaction()}
    />
  );
}
