import { computeRulerLayout, formatDisplayTime, type FrameRate, pixelToFrame } from '@timeline/core';
import { type PointerEvent, type RefObject, useEffect, useRef } from 'react';
import { useRuntime } from '../../runtime/context';
import { RULER_HEIGHT, TRACK_HEADER_WIDTH } from './layout';

interface TimelineRulerProps {
  scrollerRef: RefObject<HTMLDivElement | null>;
  pixelsPerFrame: number;
  frameRate: FrameRate;
  width: number;
}

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/**
 * Canvas time ruler. Draws only the visible range and redraws on scroll,
 * zoom and playhead changes at most once per animation frame.
 */
export function TimelineRuler({ scrollerRef, pixelsPerFrame, frameRate, width }: TimelineRulerProps) {
  const runtime = useRuntime();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrubbing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const scroller = scrollerRef.current;
    if (!canvas || !scroller || width <= 0) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const colors = {
      background: cssVar('--color-surface-2', '#1f1f23'),
      tick: cssVar('--color-line-strong', '#3a3a42'),
      label: cssVar('--color-fg-subtle', '#6f6f7a'),
      playhead: cssVar('--color-playhead', '#4c9bff'),
      font: cssVar('--font-mono', 'monospace'),
    };

    let raf: number | null = null;
    const draw = () => {
      raf = null;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== RULER_HEIGHT * dpr) {
        canvas.width = Math.round(width * dpr);
        canvas.height = RULER_HEIGHT * dpr;
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.fillStyle = colors.background;
      context.fillRect(0, 0, width, RULER_HEIGHT);

      const scrollLeft = scroller.scrollLeft;
      const range = {
        start: Math.floor(scrollLeft / pixelsPerFrame),
        end: Math.ceil((scrollLeft + width) / pixelsPerFrame),
      };
      const layout = computeRulerLayout(pixelsPerFrame, frameRate, range);
      context.font = `10px ${colors.font}`;
      context.textBaseline = 'top';
      for (const tick of layout.ticks) {
        const x = Math.round(tick.frame * pixelsPerFrame - scrollLeft) + 0.5;
        context.strokeStyle = colors.tick;
        context.beginPath();
        context.moveTo(x, tick.major ? 10 : RULER_HEIGHT - 6);
        context.lineTo(x, RULER_HEIGHT);
        context.stroke();
        if (tick.major) {
          context.fillStyle = colors.label;
          context.fillText(
            formatDisplayTime(tick.frame, frameRate, runtime.stores.ui.getState().timeDisplayFormat),
            x + 4,
            4,
          );
        }
      }
      context.fillStyle = colors.tick;
      context.fillRect(0, RULER_HEIGHT - 1, width, 1);

      const playheadX = runtime.stores.playback.getState().playhead * pixelsPerFrame - scrollLeft;
      if (playheadX >= -8 && playheadX <= width + 8) {
        context.fillStyle = colors.playhead;
        context.beginPath();
        context.moveTo(playheadX - 6, RULER_HEIGHT - 12);
        context.lineTo(playheadX + 6, RULER_HEIGHT - 12);
        context.lineTo(playheadX + 6, RULER_HEIGHT - 6);
        context.lineTo(playheadX, RULER_HEIGHT);
        context.lineTo(playheadX - 6, RULER_HEIGHT - 6);
        context.closePath();
        context.fill();
      }
    };
    const schedule = () => {
      raf ??= requestAnimationFrame(draw);
    };

    draw();
    scroller.addEventListener('scroll', schedule, { passive: true });
    const unsubscribePlayback = runtime.stores.playback.subscribe((state, previous) => {
      if (state.playhead !== previous.playhead) schedule();
    });
    const unsubscribeUi = runtime.stores.ui.subscribe((state, previous) => {
      if (state.timeDisplayFormat !== previous.timeDisplayFormat) schedule();
    });
    return () => {
      scroller.removeEventListener('scroll', schedule);
      unsubscribePlayback();
      unsubscribeUi();
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [runtime, scrollerRef, pixelsPerFrame, frameRate, width]);

  const frameAt = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const scrollLeft = scrollerRef.current?.scrollLeft ?? 0;
    return pixelToFrame(event.clientX - rect.left + scrollLeft, pixelsPerFrame);
  };

  return (
    <canvas
      ref={canvasRef}
      className="sticky block shrink-0 cursor-text"
      style={{ left: TRACK_HEADER_WIDTH, width, height: RULER_HEIGHT }}
      aria-label="Timeline ruler. Click or drag to move the playhead."
      data-testid="timeline-ruler"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        scrubbing.current = true;
        runtime.actions.playback.pause();
        runtime.actions.playback.setPlayhead(frameAt(event));
      }}
      onPointerMove={(event) => {
        if (scrubbing.current) runtime.actions.playback.setPlayhead(frameAt(event));
      }}
      onPointerUp={(event) => {
        scrubbing.current = false;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        scrubbing.current = false;
      }}
    />
  );
}
