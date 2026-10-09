import { useUiState } from '../../runtime/context';
import { RULER_HEIGHT, TRACK_HEADER_WIDTH } from './layout';

/** Vertical lines at active snap targets while dragging or using the razor tool. */
export function SnapGuides({ pixelsPerFrame }: { pixelsPerFrame: number }) {
  const guides = useUiState((s) => s.snapGuideFrames);
  if (guides.length === 0) return null;

  return (
    <>
      {guides.map((frame) => (
        <div
          key={frame}
          aria-hidden
          className="pointer-events-none absolute bottom-0 z-[14] w-px bg-warning/90 will-change-transform"
          style={{
            left: TRACK_HEADER_WIDTH,
            top: RULER_HEIGHT,
            transform: `translateX(${frame * pixelsPerFrame}px)`,
          }}
          data-testid="snap-guide"
          data-snap-frame={frame}
        />
      ))}
    </>
  );
}
