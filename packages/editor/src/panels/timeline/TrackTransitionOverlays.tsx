import { type Clip, type Sequence, type Track } from '@timeline/core';
import { cn } from '@timeline/ui';
import { memo, useMemo } from 'react';
import { useUiState } from '../../runtime/context';
import { applyClipTimelinePreview, dragGhostClipsForTransitions } from './clip-transition-preview';
import { collectTransitionMarkers } from './clip-transition-visual';

const STRIPE =
  'repeating-linear-gradient(135deg, rgba(255,255,255,0.12) 0 2px, transparent 2px 6px)';

function TransitionBlock({
  label,
  paired,
  widthPx,
}: {
  readonly label: string;
  readonly paired: boolean;
  readonly widthPx: number;
}) {
  const showLabel = widthPx >= 36;
  return (
    <div
      className={cn(
        'pointer-events-none flex h-full min-w-[4px] items-center justify-center overflow-hidden',
        'border border-amber-200/35 bg-amber-950/75 shadow-inner',
        paired && 'ring-1 ring-amber-100/20',
      )}
      style={{ backgroundImage: STRIPE }}
      title={label}
    >
      {showLabel ? (
        <span className="truncate px-0.5 text-[9px] font-medium leading-none text-amber-50/95">{label}</span>
      ) : null}
    </div>
  );
}

export const TrackTransitionOverlays = memo(function TrackTransitionOverlays({
  sequence,
  track,
  clips,
  pixelsPerFrame,
}: {
  readonly sequence: Sequence;
  readonly track: Track;
  readonly clips: readonly Clip[];
  readonly pixelsPerFrame: number;
}) {
  const clipTrim = useUiState((s) => s.clipTrim);
  const clipDrag = useUiState((s) => s.clipDrag);
  const markers = useMemo(() => {
    const effective = clips
      .map((clip) => applyClipTimelinePreview(clip, track, clipTrim, clipDrag))
      .filter((clip): clip is Clip => clip !== null);
    const ghosts = dragGhostClipsForTransitions(sequence, track, clips, clipDrag);
    return collectTransitionMarkers(sequence, track, [...effective, ...ghosts], pixelsPerFrame);
  }, [clipDrag, clipTrim, clips, pixelsPerFrame, sequence, track]);

  if (markers.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[12] overflow-hidden">
      {markers.map((marker) => (
        <div
          key={marker.key}
          className="absolute top-1 bottom-1 z-[16] flex"
          style={{ left: marker.leftPx, width: marker.widthPx }}
          data-testid="timeline-transition"
        >
          <TransitionBlock label={marker.label} paired={marker.paired} widthPx={marker.widthPx} />
        </div>
      ))}
    </div>
  );
});
