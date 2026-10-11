import { type RefObject, useEffect, useState } from 'react';
import { useRuntime, useUiState } from '../../runtime/context';

const PASSTHROUGH = 'button, input, select, textarea, [data-testid="timeline-ruler"]';

/**
 * Hand tool: press and drag anywhere on the timeline to scroll it, as if
 * grabbing the tracks. Buttons and the ruler keep working.
 */
export function useHandPan(scrollerRef: RefObject<HTMLDivElement | null>): boolean {
  const runtime = useRuntime();
  const active = useUiState((s) => s.tool === 'hand');
  const [panning, setPanning] = useState(false);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !active) return;
    let gesture: { pointerId: number; x: number; y: number; left: number; top: number } | null = null;

    const stop = (event: PointerEvent) => {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      gesture = null;
      setPanning(false);
    };

    const onMove = (event: PointerEvent) => {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      scroller.scrollLeft = gesture.left - (event.clientX - gesture.x);
      scroller.scrollTop = gesture.top - (event.clientY - gesture.y);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || runtime.stores.ui.getState().tool !== 'hand') return;
      if ((event.target as HTMLElement).closest(PASSTHROUGH)) return;
      event.preventDefault();
      event.stopPropagation();
      gesture = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: scroller.scrollLeft,
        top: scroller.scrollTop,
      };
      setPanning(true);
    };

    scroller.addEventListener('pointerdown', onPointerDown, { capture: true });
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      scroller.removeEventListener('pointerdown', onPointerDown, { capture: true });
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      setPanning(false);
    };
  }, [runtime, scrollerRef, active]);

  return panning;
}
