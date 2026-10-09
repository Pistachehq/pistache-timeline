import { MAX_PIXELS_PER_FRAME, MIN_PIXELS_PER_FRAME } from '@timeline/core';
import { IconButton, Slider } from '@timeline/ui';
import { Magnet, Maximize2, MousePointer2, Scissors, SquareSplitHorizontal, ZoomIn, ZoomOut } from 'lucide-react';
import { executeCommand, shortcutLabel } from '../../commands/commands';
import { useRuntime, useUiState } from '../../runtime/context';

const LOG_MIN = Math.log(MIN_PIXELS_PER_FRAME);
const LOG_MAX = Math.log(MAX_PIXELS_PER_FRAME);
const toSlider = (ppf: number) => ((Math.log(ppf) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 100;
const fromSlider = (value: number) => Math.exp(LOG_MIN + (value / 100) * (LOG_MAX - LOG_MIN));

export function TimelineToolbar({ onZoomToFit }: { onZoomToFit: () => void }) {
  const runtime = useRuntime();
  const tool = useUiState((s) => s.tool);
  const pixelsPerFrame = useUiState((s) => s.pixelsPerFrame);
  const snapEnabled = useUiState((s) => s.snapEnabled);

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
        onClick={() => runtime.stores.ui.getState().setSnapEnabled(!snapEnabled)}
        data-testid="timeline-snap-toggle"
      />
      <span className="mx-1.5 h-4 w-px bg-line-strong" />
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
      <IconButton label="Zoom to fit sequence" icon={<Maximize2 />} onClick={onZoomToFit} />
    </div>
  );
}
