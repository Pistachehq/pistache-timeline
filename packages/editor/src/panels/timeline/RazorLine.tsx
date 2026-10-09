import { formatDisplayTime, pixelToFrame, type FrameRate } from '@timeline/core';
import { type RefObject, useEffect, useRef } from 'react';
import { useRuntime } from '../../runtime/context';
import { RULER_HEIGHT, TRACK_HEADER_WIDTH } from './layout';
import { snapTimelineFrame } from './timeline-snap';

/**
 * Vertical cut preview while the razor tool is active. Follows the pointer
 * across the timeline lanes (not the track headers).
 */
export function RazorLine({
  scrollerRef,
  pixelsPerFrame,
  frameRate,
}: {
  scrollerRef: RefObject<HTMLDivElement | null>;
  pixelsPerFrame: number;
  frameRate: FrameRate;
}) {
  const runtime = useRuntime();
  const lineRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const line = lineRef.current;
    const label = labelRef.current;
    if (!scroller || !line) return;

    let lastClientX: number | null = null;

    const hide = () => {
      line.style.opacity = '0';
      if (label) label.style.opacity = '0';
      runtime.stores.ui.getState().setSnapGuideFrames([]);
    };

    const frameAtPointer = (): number | null => {
      if (lastClientX === null) return null;
      const rect = scroller.getBoundingClientRect();
      const laneX = lastClientX - rect.left - TRACK_HEADER_WIDTH + scroller.scrollLeft;
      if (laneX < 0) return null;
      const raw = pixelToFrame(laneX, pixelsPerFrame);
      const { ui, project, playback } = runtime.stores;
      const snapped = snapTimelineFrame(
        project.getState().project,
        raw,
        playback.getState().playhead,
        pixelsPerFrame,
        ui.getState().snapEnabled,
      );
      ui.getState().setSnapGuideFrames(snapped.guides);
      return snapped.frame;
    };

    const update = () => {
      if (runtime.stores.ui.getState().tool !== 'razor' || lastClientX === null) {
        hide();
        return;
      }

      const frame = frameAtPointer();
      if (frame === null) {
        hide();
        return;
      }

      const x = frame * pixelsPerFrame;
      line.style.opacity = '1';
      line.style.transform = `translateX(${x}px)`;

      if (label) {
        label.textContent = formatDisplayTime(frame, frameRate, runtime.stores.ui.getState().timeDisplayFormat);
        label.style.opacity = '1';
        label.style.transform = `translateX(${x}px)`;
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      lastClientX = event.clientX;
      update();
    };

    const onPointerLeave = () => {
      lastClientX = null;
      hide();
    };

    const onScroll = () => update();

    scroller.addEventListener('pointermove', onPointerMove);
    scroller.addEventListener('pointerleave', onPointerLeave);
    scroller.addEventListener('scroll', onScroll, { passive: true });
    const unsubUi = runtime.stores.ui.subscribe((state, previous) => {
      if (
        state.tool !== previous.tool ||
        state.timeDisplayFormat !== previous.timeDisplayFormat ||
        state.snapEnabled !== previous.snapEnabled
      ) {
        update();
      }
    });
    const unsubProject = runtime.stores.project.subscribe(() => update());

    hide();
    return () => {
      unsubUi();
      unsubProject();
      scroller.removeEventListener('pointermove', onPointerMove);
      scroller.removeEventListener('pointerleave', onPointerLeave);
      scroller.removeEventListener('scroll', onScroll);
      runtime.stores.ui.getState().setSnapGuideFrames([]);
    };
  }, [runtime, scrollerRef, pixelsPerFrame, frameRate]);

  return (
    <>
      <div
        ref={lineRef}
        aria-hidden
        className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-warning opacity-0 will-change-transform"
        style={{ left: TRACK_HEADER_WIDTH, top: RULER_HEIGHT }}
        data-testid="razor-line"
      />
      <div
        ref={labelRef}
        aria-hidden
        className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-xs bg-surface-3 px-1 py-px font-mono text-2xs text-warning opacity-0 will-change-transform"
        style={{ left: TRACK_HEADER_WIDTH, top: RULER_HEIGHT + 2 }}
        data-testid="razor-line-label"
      />
    </>
  );
}
