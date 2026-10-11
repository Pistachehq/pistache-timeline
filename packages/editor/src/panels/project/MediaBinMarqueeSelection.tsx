import { type MediaAssetId } from '@timeline/core';
import { type RefObject, useEffect, useRef } from 'react';
import { useRuntime, useUiState } from '../../runtime/context';
import { clampToBounds, clientMarqueeBox, elementBounds, rectsIntersect } from '../marquee-geometry';

const MARQUEE_THRESHOLD_PX = 4;

function assetIdsInClientRect(root: ParentNode, rect: DOMRect): MediaAssetId[] {
  const ids: MediaAssetId[] = [];
  for (const el of root.querySelectorAll<HTMLElement>('[data-media-asset-id]')) {
    if (rectsIntersect(el.getBoundingClientRect(), rect)) {
      ids.push(el.dataset.mediaAssetId as MediaAssetId);
    }
  }
  return ids;
}

/** Click-drag on empty grid space to select media assets. The rectangle stays inside the bin. */
export function MediaBinMarqueeSelection({ gridRef }: { gridRef: RefObject<HTMLUListElement | null> }) {
  const runtime = useRuntime();
  const marquee = useUiState((s) => s.marquee);
  const gesture = useRef<{ pointerId: number; additive: boolean } | null>(null);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement;
      if (target.closest('[data-media-asset-id]')) return;
      if (target.closest('[data-testid="media-folder-item"]')) return;
      if (target.closest('button')) return;
      if (!target.closest('[data-media-bin-grid]')) return;

      gesture.current = {
        pointerId: event.pointerId,
        additive: event.shiftKey || event.ctrlKey || event.metaKey,
      };
      runtime.stores.ui.getState().setMarquee({
        owner: 'media',
        startX: event.clientX,
        startY: event.clientY,
        currentX: event.clientX,
        currentY: event.clientY,
        additive: gesture.current.additive,
        bounds: elementBounds(grid),
      });
    };

    const finish = (event: PointerEvent) => {
      const g = gesture.current;
      if (!g || g.pointerId !== event.pointerId) return;
      gesture.current = null;

      const state = runtime.stores.ui.getState().marquee;
      runtime.stores.ui.getState().setMarquee(null);
      if (!state || state.owner !== 'media') return;

      const dx = Math.abs(state.currentX - state.startX);
      const dy = Math.abs(state.currentY - state.startY);
      if (dx < MARQUEE_THRESHOLD_PX && dy < MARQUEE_THRESHOLD_PX) {
        if (!state.additive) runtime.stores.selection.getState().clearAssets();
        return;
      }

      const box = clientMarqueeBox(state.startX, state.startY, state.currentX, state.currentY, state.bounds);
      if (!box) return;
      const ids = assetIdsInClientRect(grid, new DOMRect(box.left, box.top, box.width, box.height));
      runtime.stores.selection.getState().selectAssets(ids, state.additive ? 'add' : 'replace');
    };

    const onMove = (event: PointerEvent) => {
      const g = gesture.current;
      if (!g || g.pointerId !== event.pointerId) return;
      const m = runtime.stores.ui.getState().marquee;
      if (!m || m.owner !== 'media') return;
      const bounds = elementBounds(grid);
      const point = clampToBounds(event.clientX, event.clientY, bounds);
      runtime.stores.ui.getState().setMarquee({ ...m, bounds, currentX: point.x, currentY: point.y });
    };

    grid.addEventListener('pointerdown', onPointerDown, { capture: true });
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      grid.removeEventListener('pointerdown', onPointerDown, { capture: true });
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  }, [runtime, gridRef]);

  if (!marquee || marquee.owner !== 'media') return null;
  const box = clientMarqueeBox(marquee.startX, marquee.startY, marquee.currentX, marquee.currentY, marquee.bounds);
  if (!box) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-[30] border border-accent bg-accent/15"
      style={box}
      data-testid="media-marquee"
    />
  );
}
