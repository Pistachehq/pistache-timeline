import { type ClipId } from '@timeline/core';
import { type RefObject, useEffect, useRef } from 'react';
import { useRuntime, useUiState } from '../../runtime/context';

const MARQUEE_THRESHOLD_PX = 4;

function rectsIntersect(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function clipIdsInClientRect(rect: DOMRect): ClipId[] {
  const ids: ClipId[] = [];
  for (const el of document.querySelectorAll<HTMLElement>('[data-clip-id]')) {
    if (rectsIntersect(el.getBoundingClientRect(), rect)) {
      ids.push(el.dataset.clipId as ClipId);
    }
  }
  return ids;
}

/**
 * Click-drag on empty track space to select clips (marquee). Shift/Ctrl adds to selection.
 */
export function MarqueeSelection({ scrollerRef }: { scrollerRef: RefObject<HTMLDivElement | null> }) {
  const runtime = useRuntime();
  const tool = useUiState((s) => s.tool);
  const marquee = useUiState((s) => s.marquee);
  const gesture = useRef<{ pointerId: number; additive: boolean } | null>(null);

  useEffect(() => {
    if (tool !== 'select') runtime.stores.ui.getState().setMarquee(null);
  }, [runtime, tool]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const onPointerDown = (event: PointerEvent) => {
      if (runtime.stores.ui.getState().tool !== 'select' || event.button !== 0) return;
      const target = event.target as HTMLElement;
      if (target.closest('[data-testid="timeline-clip"]')) return;
      if (!target.closest('[data-track-lane]')) return;

      gesture.current = {
        pointerId: event.pointerId,
        additive: event.shiftKey || event.ctrlKey || event.metaKey,
      };
      runtime.stores.ui.getState().setMarquee({
        startX: event.clientX,
        startY: event.clientY,
        currentX: event.clientX,
        currentY: event.clientY,
        additive: gesture.current.additive,
      });
    };

    const finish = (event: PointerEvent) => {
      const g = gesture.current;
      if (!g || g.pointerId !== event.pointerId) return;
      gesture.current = null;

      const state = runtime.stores.ui.getState().marquee;
      runtime.stores.ui.getState().setMarquee(null);
      if (!state) return;

      const dx = Math.abs(state.currentX - state.startX);
      const dy = Math.abs(state.currentY - state.startY);
      if (dx < MARQUEE_THRESHOLD_PX && dy < MARQUEE_THRESHOLD_PX) {
        if (!state.additive) runtime.stores.selection.getState().clearClips();
        return;
      }

      const left = Math.min(state.startX, state.currentX);
      const top = Math.min(state.startY, state.currentY);
      const width = Math.abs(state.currentX - state.startX);
      const height = Math.abs(state.currentY - state.startY);
      const ids = clipIdsInClientRect(new DOMRect(left, top, width, height));
      runtime.stores.selection.getState().selectClips(ids, state.additive ? 'add' : 'replace');
    };

    const onMove = (event: PointerEvent) => {
      const g = gesture.current;
      if (!g || g.pointerId !== event.pointerId) return;
      const m = runtime.stores.ui.getState().marquee;
      if (!m) return;
      runtime.stores.ui.getState().setMarquee({ ...m, currentX: event.clientX, currentY: event.clientY });
    };

    scroller.addEventListener('pointerdown', onPointerDown, { capture: true });
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      scroller.removeEventListener('pointerdown', onPointerDown, { capture: true });
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  }, [runtime, scrollerRef]);

  if (!marquee) return null;

  const left = Math.min(marquee.startX, marquee.currentX);
  const top = Math.min(marquee.startY, marquee.currentY);
  const width = Math.abs(marquee.currentX - marquee.startX);
  const height = Math.abs(marquee.currentY - marquee.startY);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-[100] border border-accent bg-accent/15"
      style={{ left, top, width, height }}
      data-testid="timeline-marquee"
    />
  );
}
