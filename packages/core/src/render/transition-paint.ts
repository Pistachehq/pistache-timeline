import { type ClipEdgeTransition } from '../model/effects';

export interface TransitionPaint {
  readonly opacity: number;
  readonly clipPath?: string;
  readonly transform?: string;
  readonly filter?: string;
}

const FULL: TransitionPaint = { opacity: 1 };

function revealAmount(progress: number, edge: 'in' | 'out'): number {
  const p = Math.min(1, Math.max(0, progress));
  return edge === 'in' ? p : 1 - p;
}

function inset(top: number, right: number, bottom: number, left: number): string {
  return `inset(${top}% ${right}% ${bottom}% ${left}%)`;
}

function paintForSlug(slug: string, reveal: number): TransitionPaint {
  const r = Math.min(1, Math.max(0, reveal));
  const hide = (1 - r) * 100;

  if (slug.includes('dip-to-black') || slug.includes('dip-black')) return { opacity: r };
  if (slug.includes('dip-to-white') || slug.includes('dip-white')) {
    return { opacity: r, filter: `brightness(${1 + (1 - r) * 2.2})` };
  }
  if (slug.includes('cross-dissolve') || slug.includes('morph-cut') || slug.includes('non-additive')) {
    return { opacity: r };
  }
  if (slug.includes('additive')) return { opacity: r, filter: 'brightness(1.35) saturate(1.2)' };
  if (slug.includes('film-dissolve')) return { opacity: r, filter: 'sepia(0.45) contrast(1.15)' };
  if (slug.includes('color-dissolve') || slug.includes('dissolve-in') || slug.includes('fade-in')) {
    return { opacity: r, filter: 'sepia(0.55) hue-rotate(18deg)' };
  }
  if (slug.includes('dissolve-out') || slug.includes('fade-out')) return { opacity: r };
  if (slug.includes('block-dissolve') || slug.includes('random-dissolve')) {
    const step = Math.round(r * 6) / 6;
    return { opacity: step, clipPath: inset(hide * 0.15, hide * 0.15, hide * 0.15, hide * 0.15) };
  }
  if (slug.includes('venetian') || slug.includes('blind')) {
    const band = hide / 2;
    return { opacity: 1, clipPath: inset(band, 0, band, 0) };
  }
  if (slug.includes('barn') || slug.includes('door') || slug.includes('curtain') || slug.includes('split')) {
    const side = hide / 2;
    return { opacity: 1, clipPath: inset(0, side, 0, side) };
  }
  if (slug.includes('clock') || slug.includes('radial') || slug.includes('wedge')) {
    return { opacity: 1, clipPath: `circle(${r * 72}% at 50% 50%)` };
  }
  if (slug.includes('checker') || slug.includes('grid') || slug.includes('spiral') || slug.includes('random-wipe')) {
    const m = hide * 0.35;
    return { opacity: 1, clipPath: inset(m, m, m, m) };
  }
  if (slug.includes('zigzag') || slug.includes('diagonal')) {
    return { opacity: 1, clipPath: `polygon(0 0, ${r * 100}% 0, ${Math.max(0, r * 100 - 18)}% 100%, 0 100%)` };
  }
  if (slug.includes('paint') || slug.includes('splatter')) {
    return { opacity: Math.max(0.35, r), clipPath: `circle(${r * 68}% at 50% 50%)` };
  }
  if (slug.includes('circle') || slug.includes('round')) {
    return { opacity: 1, clipPath: `circle(${r * 70}% at 50% 50%)` };
  }
  if (slug.includes('band') || slug.includes('insert') || slug.includes('linear') || slug.includes('gradient-wipe') || slug.includes('wipe')) {
    return { opacity: 1, clipPath: inset(0, hide, 0, 0) };
  }
  if (slug.includes('diamond')) {
    const d = 50 * r;
    return { opacity: 1, clipPath: `polygon(50% ${50 - d}%, ${50 + d}% 50%, 50% ${50 + d}%, ${50 - d}% 50%)` };
  }
  if (slug.includes('star') || slug.includes('cross-iris') || slug.includes('dots') || slug.includes('point')) {
    return { opacity: 1, clipPath: `circle(${r * 62}% at 50% 50%)` };
  }
  if (slug.includes('box-iris') || slug.includes('rectangular') || slug.includes('iris')) {
    const m = hide / 2;
    return { opacity: 1, clipPath: inset(m, m, m, m) };
  }
  if (slug.includes('slide-in') || slug.includes('slide-out') || slug.includes('sliding') || slug.includes('slide') || slug.includes('push') || slug.includes('swap')) {
    const from = slug.includes('slide-out') ? -hide : hide;
    return { opacity: 1, transform: `translateX(${from}%)` };
  }
  if (slug.includes('page-peel') || slug.includes('page-turn') || slug.includes('flip') || slug.includes('fold') || slug.includes('swing') || slug.includes('tumble') || slug.includes('cube') || slug.includes('spin')) {
    const angle = (1 - r) * (slug.includes('fold') || slug.includes('swing') ? 70 : 88);
    const axis = slug.includes('fold') || slug.includes('tumble') ? 'X' : 'Y';
    return { opacity: Math.max(0.15, r), transform: `perspective(700px) rotate${axis}(${angle}deg)` };
  }
  if (slug.includes('zoom-out')) return { opacity: r, transform: `scale(${1 + (1 - r) * 0.65})` };
  if (slug.includes('zoom-in') || slug.includes('box-zoom') || slug.includes('center-zoom') || slug.includes('cross-zoom') || slug.includes('zoom') || slug.includes('mobius')) {
    return { opacity: Math.max(r, 0.2), transform: `scale(${0.25 + r * 0.75})` };
  }
  if (slug.includes('spherical-blur') || slug.includes('light-ray') || slug.includes('light-leak')) {
    return { opacity: r, filter: `blur(${(1 - r) * 10}px) brightness(${1 + (1 - r)})` };
  }
  if (slug.includes('chromatic')) return { opacity: r, filter: 'hue-rotate(40deg) saturate(1.4)' };
  if (slug.includes('vr-')) return { opacity: r, filter: `blur(${(1 - r) * 4}px)` };

  return { opacity: r };
}

function slugOf(edge: ClipEdgeTransition): string {
  if (edge.videoKind === 'library' && edge.libraryId) return edge.libraryId.toLowerCase();
  return edge.videoKind;
}

/** Visual for one edge. `progress` is 0 at the start of the window and 1 at the end. */
export function transitionPaint(edge: ClipEdgeTransition, progress: number, side: 'in' | 'out'): TransitionPaint {
  if (edge.videoKind === 'none' || edge.durationFrames <= 0) return FULL;
  const eased = progress <= 0 ? 0 : progress >= 1 ? 1 : Math.sin((progress * Math.PI) / 2);
  if (edge.videoKind === 'fade' || edge.videoKind === 'dip-black' || edge.videoKind === 'cross-dissolve') {
    const opacity = side === 'in' ? eased : 1 - eased;
    return { opacity };
  }
  return paintForSlug(slugOf(edge), revealAmount(eased, side));
}
