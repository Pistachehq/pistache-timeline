import { type RefObject, useEffect, useRef } from 'react';
import { useRuntime } from '../../runtime/context';
import { TRACK_HEADER_WIDTH } from './layout';

const FOLLOW_MARGIN_PX = 48;

/**
 * Vertical playhead line across all tracks. Positioned imperatively from a
 * store subscription so playback does not re-render React components.
 * While playing, the view pages forward to keep the playhead visible.
 */
export function PlayheadLine({
  scrollerRef,
  pixelsPerFrame,
}: {
  scrollerRef: RefObject<HTMLDivElement | null>;
  pixelsPerFrame: number;
}) {
  const runtime = useRuntime();
  const lineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const { playback } = runtime.stores;
    const update = () => {
      const line = lineRef.current;
      const scroller = scrollerRef.current;
      if (!line) return;
      const { playhead, playing } = playback.getState();
      const x = playhead * pixelsPerFrame;
      line.style.transform = `translateX(${x}px)`;
      if (playing && scroller) {
        const visibleWidth = scroller.clientWidth - TRACK_HEADER_WIDTH;
        if (x > scroller.scrollLeft + visibleWidth - FOLLOW_MARGIN_PX || x < scroller.scrollLeft) {
          scroller.scrollLeft = Math.max(0, x - FOLLOW_MARGIN_PX);
        }
      }
    };
    update();
    return playback.subscribe(update);
  }, [runtime, scrollerRef, pixelsPerFrame]);

  return (
    <div
      ref={lineRef}
      aria-hidden
      className="pointer-events-none absolute top-0 bottom-0 z-[15] w-px bg-playhead will-change-transform"
      style={{ left: TRACK_HEADER_WIDTH }}
      data-testid="playhead-line"
    />
  );
}
