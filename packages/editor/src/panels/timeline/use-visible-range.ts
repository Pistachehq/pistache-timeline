import { type FrameRange, getVisibleFrameRange } from '@timeline/core';
import { type RefObject, useEffect, useState } from 'react';

function sameRange(a: FrameRange, b: FrameRange) {
  return a.start === b.start && a.end === b.end;
}

/**
 * Visible frame range of the timeline scroller, quantised to chunks of one
 * viewport width. Clip lanes only re-render when the range crosses a chunk
 * boundary, which keeps scrolling cheap on long sequences.
 */
export function useVisibleRange(
  scrollerRef: RefObject<HTMLElement | null>,
  pixelsPerFrame: number,
  viewportWidth: number,
): FrameRange {
  const [range, setRange] = useState<FrameRange>({ start: 0, end: 0 });

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const chunk = Math.max(200, viewportWidth);
    let raf: number | null = null;
    const compute = () => {
      raf = null;
      const left = Math.floor(scroller.scrollLeft / chunk) * chunk;
      const next = getVisibleFrameRange(left, chunk * 2, pixelsPerFrame, chunk);
      setRange((prev) => (sameRange(prev, next) ? prev : next));
    };
    const onScroll = () => {
      raf ??= requestAnimationFrame(compute);
    };
    compute();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [scrollerRef, pixelsPerFrame, viewportWidth]);

  return range;
}
