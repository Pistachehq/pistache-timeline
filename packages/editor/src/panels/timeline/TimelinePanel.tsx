import {
  fitZoom,
  getActiveSequence,
  getSequenceDuration,
  type Sequence,
  type Track,
  zoomAroundAnchor,
  type FrameRange,
} from '@timeline/core';
import { PanelFrame } from '@timeline/ui';
import { cn } from '@timeline/ui';
import { type RefObject, useEffect, useLayoutEffect, useRef } from 'react';
import { useElementSize } from '../../hooks/use-element-size';
import { useRuntime, useUiState } from '../../runtime/context';
import { useActiveSequence } from '../../runtime/hooks';
import { PlayheadTimecode } from '../monitors/PlayheadTimecode';
import {
  AUDIO_TRACK_HEIGHT,
  RULER_HEIGHT,
  SECTION_DIVIDER_HEIGHT,
  TRACK_HEADER_WIDTH,
  TRAILING_SPACE_PX,
  VIDEO_TRACK_HEIGHT,
} from './layout';
import { MarqueeSelection } from './MarqueeSelection';
import { PlayheadLine } from './PlayheadLine';
import { RazorLine } from './RazorLine';
import { SnapGuides } from './SnapGuides';
import { TimelineRuler } from './TimelineRuler';
import { TimelineToolbar } from './TimelineToolbar';
import { TrackHeader } from './TrackHeader';
import { TrackLane } from './TrackLane';
import { playheadStepFromWheel } from './timeline-wheel-playhead';
import { useVisibleRange } from './use-visible-range';

const WHEEL_ZOOM_SENSITIVITY = 0.0015;

interface RowsProps {
  sequence: Sequence;
  tracks: readonly Track[];
  height: number;
  width: number;
  pixelsPerFrame: number;
  visibleRange: FrameRange;
}

function TrackRows({ sequence, tracks, height, width, pixelsPerFrame, visibleRange }: RowsProps) {
  return tracks.map((track) => (
    <div
      key={track.id}
      className="relative flex bg-surface-0"
      data-track-row
      data-track-id={track.id}
      data-track-kind={track.kind}
      data-track-locked={track.locked}
    >
      <TrackHeader track={track} height={height} />
      <TrackLane
        sequence={sequence}
        track={track}
        height={height}
        width={width}
        pixelsPerFrame={pixelsPerFrame}
        frameRate={sequence.frameRate}
        visibleRange={visibleRange}
      />
    </div>
  ));
}

/**
 * Keeps a meaningful frame fixed when the zoom changes: the pointer position
 * for wheel zoom, otherwise the playhead (if visible) or the left edge.
 */
function useZoomAnchoring(scrollerRef: RefObject<HTMLDivElement | null>, pixelsPerFrame: number) {
  const runtime = useRuntime();
  const previous = useRef(pixelsPerFrame);
  const pendingAnchorRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const before = previous.current;
    previous.current = pixelsPerFrame;
    if (!scroller || before === pixelsPerFrame) return;
    const visibleWidth = scroller.clientWidth - TRACK_HEADER_WIDTH;
    let anchorX = pendingAnchorRef.current;
    pendingAnchorRef.current = null;
    if (anchorX === null) {
      const playheadX = runtime.stores.playback.getState().playhead * before - scroller.scrollLeft;
      anchorX = playheadX >= 0 && playheadX <= visibleWidth ? playheadX : 0;
    }
    const { scrollLeft } = zoomAroundAnchor(before, scroller.scrollLeft, anchorX, pixelsPerFrame / before);
    scroller.scrollLeft = scrollLeft;
  }, [runtime, scrollerRef, pixelsPerFrame]);

  return pendingAnchorRef;
}

export function TimelinePanel() {
  const runtime = useRuntime();
  const sequence = useActiveSequence();
  const pixelsPerFrame = useUiState((s) => s.pixelsPerFrame);
  const tool = useUiState((s) => s.tool);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const viewport = useElementSize(scrollerRef);
  const laneViewportWidth = Math.max(0, viewport.width - TRACK_HEADER_WIDTH);
  const visibleRange = useVisibleRange(scrollerRef, pixelsPerFrame, laneViewportWidth);
  const pendingAnchorRef = useZoomAnchoring(scrollerRef, pixelsPerFrame);

  // Wheel: scrub playhead. Ctrl/⌘ + wheel zooms around the pointer. Non-passive listener.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const onWheel = (event: WheelEvent) => {
      const { ui, project, playback } = runtime.stores;
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const rect = scroller.getBoundingClientRect();
        pendingAnchorRef.current = Math.max(0, event.clientX - rect.left - TRACK_HEADER_WIDTH);
        ui.getState().setZoom(ui.getState().pixelsPerFrame * Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY));
        return;
      }

      const sequence = getActiveSequence(project.getState().project);
      if (!sequence) return;

      const delta = playheadStepFromWheel(
        event.deltaY,
        event.deltaMode,
        ui.getState().timeDisplayFormat,
        sequence.frameRate,
        event.altKey,
      );
      if (delta === 0) return;

      event.preventDefault();
      const end = getSequenceDuration(sequence);
      const next = Math.max(0, Math.min(end, playback.getState().playhead + delta));
      playback.getState().setPlaying(false);
      playback.getState().setPlayhead(next);
    };
    scroller.addEventListener('wheel', onWheel, { passive: false });
    return () => scroller.removeEventListener('wheel', onWheel);
  }, [runtime, pendingAnchorRef]);

  if (!sequence) {
    return <PanelFrame title="Timeline">{null}</PanelFrame>;
  }

  const duration = getSequenceDuration(sequence);
  const contentWidth = Math.max(duration * pixelsPerFrame + TRAILING_SPACE_PX, laneViewportWidth);
  const videoTracks = [...sequence.videoTracks].reverse();
  const zoomToFit = () => {
    pendingAnchorRef.current = 0;
    runtime.stores.ui.getState().setZoom(fitZoom(duration, laneViewportWidth));
    if (scrollerRef.current) scrollerRef.current.scrollLeft = 0;
  };

  return (
    <PanelFrame
      title={`Timeline: ${sequence.name}`}
      actions={<TimelineToolbar onZoomToFit={zoomToFit} />}
      data-testid="timeline-panel"
    >
      <div
        ref={scrollerRef}
        className={cn('relative min-h-0 flex-1 overflow-auto bg-surface-0', tool === 'razor' && 'cursor-razor')}
        data-testid="timeline-scroller"
      >
        <MarqueeSelection scrollerRef={scrollerRef} />
        <div className="relative isolate min-h-full bg-surface-0" style={{ width: TRACK_HEADER_WIDTH + contentWidth }}>
          <div className="sticky top-0 z-30 flex" style={{ height: RULER_HEIGHT }}>
            <div
              className="sticky left-0 z-[25] flex shrink-0 items-center border-r border-b border-line bg-surface-2 px-2"
              style={{ width: TRACK_HEADER_WIDTH }}
            >
              <PlayheadTimecode frameRate={sequence.frameRate} />
            </div>
            <TimelineRuler
              scrollerRef={scrollerRef}
              pixelsPerFrame={pixelsPerFrame}
              frameRate={sequence.frameRate}
              width={laneViewportWidth}
            />
          </div>
          <TrackRows
            sequence={sequence}
            tracks={videoTracks}
            height={VIDEO_TRACK_HEIGHT}
            width={contentWidth}
            pixelsPerFrame={pixelsPerFrame}
            visibleRange={visibleRange}
          />
          <div
            className="sticky left-0 z-[25] bg-surface-0"
            style={{ height: SECTION_DIVIDER_HEIGHT, width: '100%' }}
          />
          <TrackRows
            sequence={sequence}
            tracks={sequence.audioTracks}
            height={AUDIO_TRACK_HEIGHT}
            width={contentWidth}
            pixelsPerFrame={pixelsPerFrame}
            visibleRange={visibleRange}
          />
          <SnapGuides pixelsPerFrame={pixelsPerFrame} />
          <PlayheadLine scrollerRef={scrollerRef} pixelsPerFrame={pixelsPerFrame} />
          <RazorLine scrollerRef={scrollerRef} pixelsPerFrame={pixelsPerFrame} frameRate={sequence.frameRate} />
        </div>
      </div>
    </PanelFrame>
  );
}
