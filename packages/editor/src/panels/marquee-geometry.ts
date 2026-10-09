export interface MarqueeBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface MarqueeBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export function elementBounds(element: HTMLElement): MarqueeBounds {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}

export function clampToBounds(x: number, y: number, bounds: MarqueeBounds): { x: number; y: number } {
  return {
    x: Math.min(bounds.right, Math.max(bounds.left, x)),
    y: Math.min(bounds.bottom, Math.max(bounds.top, y)),
  };
}

/** Client-space rectangle clipped so it cannot paint outside `bounds`. */
export function clientMarqueeBox(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
  bounds: MarqueeBounds,
): MarqueeBox | null {
  const left = Math.max(bounds.left, Math.min(startX, currentX));
  const top = Math.max(bounds.top, Math.min(startY, currentY));
  const right = Math.min(bounds.right, Math.max(startX, currentX));
  const bottom = Math.min(bounds.bottom, Math.max(startY, currentY));
  const width = right - left;
  const height = bottom - top;
  if (width < 1 || height < 1) return null;
  return { left, top, width, height };
}

export function rectsIntersect(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}
