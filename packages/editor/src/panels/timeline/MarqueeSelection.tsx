import { type ClipId } from '@timeline/core';
import { type RefObject, useEffect, useRef } from 'react';
import { useRuntime, useUiState } from '../../runtime/context';
import { clampToBounds, clientMarqueeBox, elementBounds, rectsIntersect } from '../marquee-geometry';

const MARQUEE_THRESHOLD_PX = 4;

function clipIdsInClientRect(root: ParentNode, rect: DOMRect): ClipId[] {
  const ids: ClipId[] = [];
  for (const el of root.querySelectorAll<HTMLElement>('[data-clip-id]')) {
    if (rectsIntersect(el.getBoundingClientRect(), rect)) {
      ids.push(el.dataset.clipId as ClipId);
    }
  }
  return ids;
}

/**
 * Click-drag on empty track space to select clips (marquee). Shift/Ctrl adds to selection.
 * The rectangle stays inside the timeline scroller.
 */
export function MarqueeSelection({ scrollerRef }: { scrollerRef: RefObject<HTMLDivElement | null> }) {
  const runtime = useRuntime();
  const tool = useUiState((s) => s.tool);
  const marquee = useUiState((s) => s.marquee);
  const gesture = useRef<{ pointerId: number; additive: boolean } | null>(null);

  useEffect(() => {
    if (tool === 'select') return;
    const current = runtime.stores.ui.getState().marquee;
    if (current?.owner === 'timeline') runtime.stores.ui.getState().setMarquee(null);
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
        owner: 'timeline',
        startX: event.clientX,
        startY: event.clientY,
        currentX: event.clientX,
        currentY: event.clientY,
        additive: gesture.current.additive,
        bounds: elementBounds(scroller),
      });
    };

    const finish = (event: PointerEvent) => {
      const g = gesture.current;
      if (!g || g.pointerId !== event.pointerId) return;
      gesture.current = null;

      const state = runtime.stores.ui.getState().marquee;
      runtime.stores.ui.getState().setMarquee(null);
      if (!state || state.owner !== 'timeline') return;

      const dx = Math.abs(state.currentX - state.startX);
      const dy = Math.abs(state.currentY - state.startY);
      if (dx < MARQUEE_THRESHOLD_PX && dy < MARQUEE_THRESHOLD_PX) {
        if (!state.additive) runtime.stores.selection.getState().clearClips();
        return;
      }

      const box = clientMarqueeBox(state.startX, state.startY, state.currentX, state.currentY, state.bounds);
      if (!box) return;
      const ids = clipIdsInClientRect(scroller, new DOMRect(box.left, box.top, box.width, box.height));
      runtime.stores.selection.getState().selectClips(ids, state.additive ? 'add' : 'replace');
    };

    const onMove = (event: PointerEvent) => {
      const g = gesture.current;
      if (!g || g.pointerId !== event.pointerId) return;
      const m = runtime.stores.ui.getState().marquee;
      if (!m || m.owner !== 'timeline') return;
      const bounds = elementBounds(scroller);
      const point = clampToBounds(event.clientX, event.clientY, bounds);
      runtime.stores.ui.getState().setMarquee({ ...m, bounds, currentX: point.x, currentY: point.y });
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

  if (!marquee || marquee.owner !== 'timeline') return null;
  const box = clientMarqueeBox(marquee.startX, marquee.startY, marquee.currentX, marquee.currentY, marquee.bounds);
  if (!box) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-[30] border border-accent bg-accent/15"
      style={box}
      data-testid="timeline-marquee"
    />
  );
}
