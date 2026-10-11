import { MAX_PIXELS_PER_FRAME, MIN_PIXELS_PER_FRAME } from '@timeline/core';
import { IconButton, Slider } from '@timeline/ui';
import { Hand, Magnet, Maximize2, MousePointer2, Scissors, SquareSplitHorizontal, Type, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { executeCommand, shortcutLabel } from '../../commands/commands';
import { useRuntime, useUiState } from '../../runtime/context';

const LOG_MIN = Math.log(MIN_PIXELS_PER_FRAME);
const LOG_MAX = Math.log(MAX_PIXELS_PER_FRAME);
const toSlider = (ppf: number) => ((Math.log(ppf) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 100;
const fromSlider = (value: number) => Math.exp(LOG_MIN + (value / 100) * (LOG_MAX - LOG_MIN));
const ZOOM_WHEEL_SENSITIVITY = 0.0015;

function SpeechToolIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 5h8" />
      <path d="M8 5v13" />
      <path d="M14 10h2.2l2.4-2v8l-2.4-2H14z" />
      <path d="M20 11.2c.6.5.6 1.6 0 2.1" />
    </svg>
  );
}

export function TimelineToolbar() {
  const runtime = useRuntime();
  const tool = useUiState((s) => s.tool);
  const pixelsPerFrame = useUiState((s) => s.pixelsPerFrame);
  const snapEnabled = useUiState((s) => s.snapEnabled);
  const zoomWheelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const region = zoomWheelRef.current;
    if (!region) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const { ui } = runtime.stores;
      const next = ui.getState().pixelsPerFrame * Math.exp(-event.deltaY * ZOOM_WHEEL_SENSITIVITY);
      ui.getState().setZoom(next);
    };
    region.addEventListener('wheel', onWheel, { passive: false });
    return () => region.removeEventListener('wheel', onWheel);
  }, [runtime]);

  return (
    <div className="flex items-center gap-0.5">
      <IconButton
        label="Selection tool"
        shortcut={shortcutLabel('tool.select')}
        icon={<MousePointer2 />}
        pressed={tool === 'select'}
        tone="accent"
        onClick={() => executeCommand('tool.select', runtime)}
      />
      <IconButton
        label="Razor tool"
        shortcut={shortcutLabel('tool.razor')}
        icon={<Scissors />}
        pressed={tool === 'razor'}
        tone="accent"
        onClick={() => executeCommand('tool.razor', runtime)}
      />
      <IconButton
        label="Text tool"
        shortcut={shortcutLabel('tool.text')}
        icon={<Type />}
        pressed={tool === 'text'}
        tone="accent"
        onClick={() => executeCommand('tool.text', runtime)}
      />
      <IconButton
        label="Text to speech"
        shortcut={shortcutLabel('tool.speech')}
        icon={<SpeechToolIcon />}
        pressed={tool === 'speech'}
        tone="accent"
        onClick={() => executeCommand('tool.speech', runtime)}
      />
      <IconButton
        label="Hand tool"
        shortcut={shortcutLabel('tool.hand')}
        icon={<Hand />}
        pressed={tool === 'hand'}
        tone="accent"
        onClick={() => executeCommand('tool.hand', runtime)}
      />
      <IconButton
        label="Split at playhead"
        shortcut={shortcutLabel('clip.split')}
        icon={<SquareSplitHorizontal />}
        onClick={() => executeCommand('clip.split', runtime)}
      />
      <IconButton
        label={snapEnabled ? 'Snapping on' : 'Snapping off'}
        icon={<Magnet />}
        pressed={snapEnabled}
        tone="accent"
        onClick={() => executeCommand('view.snap', runtime)}
        data-testid="timeline-snap-toggle"
      />
      <span className="mx-1.5 h-4 w-px bg-line-strong" />
      <div ref={zoomWheelRef} className="flex items-center gap-0.5" data-testid="timeline-zoom-wheel">
        <IconButton
          label="Zoom out"
          shortcut={shortcutLabel('view.zoomOut')}
          icon={<ZoomOut />}
          onClick={() => executeCommand('view.zoomOut', runtime)}
        />
        <Slider
          label="Timeline zoom"
          className="w-24"
          min={0}
          max={100}
          step={0.5}
          value={toSlider(pixelsPerFrame)}
          onValueChange={(value) => runtime.stores.ui.getState().setZoom(fromSlider(value))}
        />
        <IconButton
          label="Zoom in"
          shortcut={shortcutLabel('view.zoomIn')}
          icon={<ZoomIn />}
          onClick={() => executeCommand('view.zoomIn', runtime)}
        />
      </div>
      <IconButton
        label="Zoom to fit sequence"
        icon={<Maximize2 />}
        onClick={() => executeCommand('view.zoomFit', runtime)}
      />
    </div>
  );
}
