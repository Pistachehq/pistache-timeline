import {
  DEFAULT_SMART_BACKGROUND,
  type Clip,
  type SmartBackgroundQuality,
  type SmartBackgroundView,
  type VideoEffect,
} from '@timeline/core';
import { createId } from '@timeline/shared';
import { Button, IconButton, NumberField, Select, type SelectOption } from '@timeline/ui';
import { BoxSelect, Eraser, MousePointer2, Paintbrush, Sparkles } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useMediaState, usePlaybackState, useProjectState, useRuntime, useUiState } from '../../runtime/context';
import { analyzeClipSource, clipSourceFrame } from '../../segmentation/analyze-clip';
import { detectSubjects } from '../../segmentation/segment-client';
import { bitmapFromElement, maxEdgeForQuality } from '../../segmentation/capture-frame';
import { clearMaskCache, hydrateMaskCache } from '../../segmentation/mask-cache';
import { type SmartPickMode } from '../../state/ui-store';
import { sampleClipPixels } from '../monitors/key-sampling';

const VIEW_OPTIONS: SelectOption<SmartBackgroundView>[] = [
  { value: 'result', label: 'Result' },
  { value: 'original', label: 'Original' },
  { value: 'confidence', label: 'Semantic confidence' },
  { value: 'binary', label: 'Binary keep mask' },
  { value: 'matte', label: 'Final alpha' },
  { value: 'overlay', label: 'Mask overlay' },
  { value: 'split', label: 'Split comparison' },
];

const QUALITY_OPTIONS: SelectOption<SmartBackgroundQuality>[] = [
  { value: 'preview', label: 'Preview (faster)' },
  { value: 'final', label: 'Final (sharper)' },
];

const PICK_MODES: readonly { readonly id: SmartPickMode; readonly label: string; readonly icon: typeof MousePointer2 }[] = [
  { id: 'include', label: 'Keep point', icon: MousePointer2 },
  { id: 'exclude', label: 'Remove point', icon: Eraser },
  { id: 'box-include', label: 'Keep box', icon: BoxSelect },
  { id: 'box-exclude', label: 'Remove box', icon: BoxSelect },
  { id: 'brush-add', label: 'Keep brush', icon: Paintbrush },
  { id: 'brush-subtract', label: 'Remove brush', icon: Paintbrush },
];

export function SmartBackgroundControls({
  clip,
  effectIndex,
  effect,
  disabled,
  onChange,
  onScrubStart,
  onScrubEnd,
}: {
  readonly clip: Clip;
  readonly effectIndex: number;
  readonly effect: VideoEffect & { kind: 'smart-background' };
  readonly disabled: boolean;
  readonly onChange: (effect: VideoEffect) => void;
  readonly onScrubStart: () => void;
  readonly onScrubEnd: () => void;
}) {
  const runtime = useRuntime();
  const playhead = usePlaybackState((s) => s.playhead);
  const picking = useUiState(
    (s) => (s.smartBackgroundPick?.clipId === clip.id && s.smartBackgroundPick.effectIndex === effectIndex ? s.smartBackgroundPick.mode : null),
  );
  const url = useMediaState((s) => {
    const id = clip.assetId;
    const entry = id ? s.entries[id] : undefined;
    return entry?.status === 'online' && entry.handle ? entry.handle.url : null;
  });
  const isImage = useProjectState((s) => {
    const id = clip.assetId;
    return id ? s.project.mediaAssets[id]?.kind === 'image' : false;
  });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void hydrateMaskCache(effect.cacheId);
  }, [effect.cacheId]);

  useEffect(() => {
    if (!picking) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') runtime.stores.ui.getState().setSmartBackgroundPick(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picking, runtime]);

  const runTask = async (label: string, work: (signal: AbortSignal, onStatus: (text: string) => void) => Promise<void>) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const ui = runtime.stores.ui.getState();
    const taskId = ui.startTask(label);
    try {
      await work(controller.signal, (text) => ui.updateTask(taskId, text));
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        ui.notify(error instanceof Error ? error.message : 'Segmentation failed.', 'error');
      }
    } finally {
      ui.endTask(taskId);
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const sequence = runtime.stores.project.getState().project.sequences[runtime.stores.project.getState().project.activeSequenceId];
  const analyze = (from: number, to: number, label: string) => {
    if (!url || !sequence) {
      runtime.stores.ui.getState().notify('The clip must be online to analyse.', 'warning');
      return;
    }
    void runTask(label, (signal, onStatus) =>
      analyzeClipSource({
        clip,
        effect,
        frameRate: sequence.frameRate,
        url,
        isImage,
        fromSourceFrame: from,
        toSourceFrame: to,
        signal,
        onStatus,
      }),
    );
  };

  const sourceNow = clipSourceFrame(clip, playhead);

  const togglePick = (mode: SmartPickMode) => {
    const ui = runtime.stores.ui.getState();
    ui.setSmartBackgroundPick(picking === mode ? null : { clipId: clip.id, effectIndex, mode });
  };

  return (
    <div className="space-y-1.5">
      <p className="text-2xs text-fg-subtle">
        CLIPSeg only proposes regions. SAM cuts objects from clicks, boxes, and those proposals. Confidence is never
        used as opacity: interiors are opaque, removed areas are transparent, and feather applies only at the edge.
        SAM 2 video tracking is not in this build.
      </p>
      <label className="block text-xs text-fg-muted">
        Keep
        <textarea
          rows={2}
          disabled={disabled}
          value={effect.keepPrompt}
          placeholder="robotic rover, wheels, floor, shadows under the rover"
          className="mt-0.5 w-full resize-none rounded-sm border border-line bg-surface-1 px-1.5 py-1 text-xs text-fg"
          onChange={(event) => onChange({ ...effect, keepPrompt: event.target.value })}
        />
      </label>
      <label className="block text-xs text-fg-muted">
        Remove
        <textarea
          rows={2}
          disabled={disabled}
          value={effect.removePrompt}
          placeholder="white curtain, walls, background objects"
          className="mt-0.5 w-full resize-none rounded-sm border border-line bg-surface-1 px-1.5 py-1 text-xs text-fg"
          onChange={(event) => onChange({ ...effect, removePrompt: event.target.value })}
        />
      </label>
      <div className="flex flex-wrap gap-1">
        {PICK_MODES.map((mode) => (
          <IconButton
            key={mode.id}
            label={mode.label}
            icon={<mode.icon />}
            size="xs"
            pressed={picking === mode.id}
            disabled={disabled}
            onClick={() => togglePick(mode.id)}
          />
        ))}
      </div>
      {picking ? (
        <p className="text-2xs text-accent">
          {picking.startsWith('brush')
            ? 'Paint on the clip in the Program monitor. Esc cancels.'
            : picking.startsWith('box')
              ? 'Drag a box on the clip in the Program monitor. Esc cancels.'
              : 'Click the object or surface to keep or remove. Esc cancels.'}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1">
        <Button
          size="sm"
          disabled={disabled}
          icon={<Sparkles />}
          onClick={() => {
            const pixels = sampleClipPixels(clip.id);
            if (!pixels) {
              runtime.stores.ui.getState().notify('Move the playhead over the clip to detect subjects.', 'warning');
              return;
            }
            void runTask('Detecting subjects…', async (signal, onStatus) => {
              const canvas = document.createElement('canvas');
              canvas.width = pixels.width;
              canvas.height = pixels.height;
              const ctx = canvas.getContext('2d');
              if (!ctx) throw new Error('Could not read this frame.');
              ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height), 0, 0);
              const bitmap = await bitmapFromElement(canvas, pixels.width, pixels.height, maxEdgeForQuality(effect.quality));
              const boxes = await detectSubjects(bitmap, signal, onStatus);
              if (boxes.length === 0) {
                runtime.stores.ui.getState().notify('No clear subjects at this frame. Add a keep prompt or click the object.', 'warning');
                return;
              }
              onChange({
                ...effect,
                boxes: [
                  ...effect.boxes,
                  ...boxes.map((box) => ({
                    id: createId('bx'),
                    u: box.u,
                    v: box.v,
                    w: box.w,
                    h: box.h,
                    include: true,
                    sourceFrame: sourceNow,
                  })),
                ],
              });
            });
          }}
        >
          Detect subjects
        </Button>
      </div>
      <div className="grid grid-cols-[4.75rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5">
        <span className="truncate text-xs text-fg-muted">View</span>
        <Select
          label="Preview view"
          disabled={disabled}
          className="w-full min-w-0"
          value={effect.view}
          options={VIEW_OPTIONS}
          onValueChange={(view) => onChange({ ...effect, view })}
        />
        <span className="truncate text-xs text-fg-muted">Quality</span>
        <Select
          label="Processing quality"
          disabled={disabled}
          className="w-full min-w-0"
          value={effect.quality}
          options={QUALITY_OPTIONS}
          onValueChange={(quality) => onChange({ ...effect, quality })}
        />
      </div>
      <NumberField
        label="Confidence cutoff"
        value={effect.threshold}
        min={0}
        max={100}
        step={1}
        precision={0}
        disabled={disabled}
        onScrubStart={onScrubStart}
        onScrubEnd={onScrubEnd}
        onChange={(threshold) => onChange({ ...effect, threshold })}
      />
      <NumberField
        label="Edge feather"
        value={effect.feather}
        min={0}
        max={100}
        step={1}
        precision={0}
        disabled={disabled}
        onScrubStart={onScrubStart}
        onScrubEnd={onScrubEnd}
        onChange={(feather) => onChange({ ...effect, feather })}
      />
      <NumberField
        label="Mask expansion"
        value={effect.expansion}
        min={-100}
        max={100}
        step={1}
        precision={0}
        disabled={disabled}
        onScrubStart={onScrubStart}
        onScrubEnd={onScrubEnd}
        onChange={(expansion) => onChange({ ...effect, expansion })}
      />
      <NumberField
        label="Mask smoothing"
        value={effect.smoothing}
        min={0}
        max={100}
        step={1}
        precision={0}
        disabled={disabled}
        onScrubStart={onScrubStart}
        onScrubEnd={onScrubEnd}
        onChange={(smoothing) => onChange({ ...effect, smoothing })}
      />
      <NumberField
        label="Temporal stability"
        value={effect.temporalStability}
        min={0}
        max={100}
        step={1}
        precision={0}
        disabled={disabled}
        onScrubStart={onScrubStart}
        onScrubEnd={onScrubEnd}
        onChange={(temporalStability) => onChange({ ...effect, temporalStability })}
      />
      {effect.view === 'split' ? (
        <NumberField
          label="Split"
          value={effect.split}
          min={0}
          max={100}
          step={1}
          precision={0}
          unit="%"
          disabled={disabled}
          onScrubStart={onScrubStart}
          onScrubEnd={onScrubEnd}
          onChange={(split) => onChange({ ...effect, split })}
        />
      ) : null}
      <label className="flex items-center gap-2 text-xs text-fg-muted">
        <input
          type="checkbox"
          className="size-3 accent-accent"
          disabled={disabled}
          checked={effect.preserveShadows}
          onChange={(event) => onChange({ ...effect, preserveShadows: event.target.checked })}
        />
        Preserve contact shadows
      </label>
      <label className="flex items-center gap-2 text-xs text-fg-muted">
        <input
          type="checkbox"
          className="size-3 accent-accent"
          disabled={disabled}
          checked={effect.invert}
          onChange={(event) => onChange({ ...effect, invert: event.target.checked })}
        />
        Invert mask
      </label>
      <div className="flex flex-wrap gap-1">
        <Button size="sm" disabled={disabled} onClick={() => analyze(sourceNow, clip.sourceOut - 1, 'Tracking forward…')}>
          Track forward
        </Button>
        <Button size="sm" disabled={disabled} onClick={() => analyze(sourceNow, clip.sourceIn, 'Tracking backward…')}>
          Track backward
        </Button>
        <Button size="sm" disabled={disabled} onClick={() => analyze(clip.sourceIn, clip.sourceOut - 1, 'Analysing clip…')}>
          Analyse entire clip
        </Button>
      </div>
      <div className="flex flex-wrap gap-1">
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => {
            clearMaskCache(effect.cacheId);
            onChange({
              ...effect,
              cacheId: createId('sbg'),
              points: [],
              boxes: [],
              strokes: [],
            });
          }}
        >
          Clear segmentation
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() =>
            onChange({
              ...effect,
              ...DEFAULT_SMART_BACKGROUND,
              cacheId: effect.cacheId,
            })
          }
        >
          Reset
        </Button>
      </div>
      <p className="text-2xs text-fg-subtle">
        {effect.points.length} points · {effect.boxes.length} boxes · {effect.strokes.length} strokes at the current
        source frame {sourceNow}. Models download on first use and run locally in WebAssembly. Nothing is uploaded.
      </p>
    </div>
  );
}
