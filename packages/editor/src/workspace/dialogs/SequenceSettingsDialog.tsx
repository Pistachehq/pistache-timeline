import {
  frameSizeForMedia,
  snapFrameDimension,
  type ClipId,
  type MediaAssetId,
  type Project,
  type Resolution,
  type Sequence,
} from '@timeline/core';
import { Button, Dialog, Select } from '@timeline/ui';
import { Link2, Unlink2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useProjectState, useRuntime, useSelectionState } from '../../runtime/context';
import { useActiveSequence } from '../../runtime/hooks';
import { linkedExportDimension, previewLinkedDimension } from './export-presets';

const PRESETS = [
  { value: '1920x1080', label: '1920 × 1080 (Landscape)', width: 1920, height: 1080 },
  { value: '1080x1920', label: '1080 × 1920 (Vertical)', width: 1080, height: 1920 },
  { value: '1280x720', label: '1280 × 720 (720p)', width: 1280, height: 720 },
  { value: '720x1280', label: '720 × 1280 (Vertical)', width: 720, height: 1280 },
  { value: '1080x1350', label: '1080 × 1350 (Portrait)', width: 1080, height: 1350 },
  { value: '1080x1080', label: '1080 × 1080 (Square)', width: 1080, height: 1080 },
  { value: '3840x2160', label: '3840 × 2160 (4K)', width: 3840, height: 2160 },
  { value: '2160x3840', label: '2160 × 3840 (4K Vertical)', width: 2160, height: 3840 },
  { value: 'custom', label: 'Custom…', width: 0, height: 0 },
] as const;

type FramePreset = (typeof PRESETS)[number]['value'];

const selectClass = 'h-7! w-full min-w-0 max-w-full px-2 text-fg';
const numberClass =
  'h-7 w-full min-w-0 rounded-sm border border-line-strong bg-surface-3 px-2 font-mono text-fg outline-none [appearance:textfield] focus:border-accent [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

function presetFor(width: number, height: number): FramePreset {
  return PRESETS.find((preset) => preset.width === width && preset.height === height)?.value ?? 'custom';
}

function mediaResolution(
  project: Project,
  sequence: Sequence,
  clipIds: readonly ClipId[],
  assetId: MediaAssetId | null,
): Resolution | null {
  const fromAsset = assetId ? project.mediaAssets[assetId]?.resolution : null;
  if (fromAsset) return fromAsset;
  for (const id of clipIds) {
    const clip = sequence.clips[id];
    const resolution = clip?.assetId ? project.mediaAssets[clip.assetId]?.resolution : null;
    if (resolution) return resolution;
  }
  for (const track of sequence.videoTracks) {
    for (const id of track.clipIds) {
      const clip = sequence.clips[id];
      const resolution = clip?.assetId ? project.mediaAssets[clip.assetId]?.resolution : null;
      if (resolution) return resolution;
    }
  }
  return null;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-2xs text-fg-subtle">{label}</span>
      {children}
    </label>
  );
}

/** Chooses the sequence frame. Media that does not match this frame is fitted inside it. */
export function SequenceSettingsDialog({ onClose }: { onClose: () => void }) {
  const runtime = useRuntime();
  const sequence = useActiveSequence();
  const project = useProjectState((state) => state.project);
  const clipIds = useSelectionState((state) => state.clipIds);
  const assetId = useSelectionState((state) => state.assetId);
  const initialWidth = sequence?.resolution.width ?? 1920;
  const initialHeight = sequence?.resolution.height ?? 1080;
  const source = sequence ? mediaResolution(project, sequence, clipIds, assetId) : null;

  const [preset, setPreset] = useState<FramePreset>(() => presetFor(initialWidth, initialHeight));
  const [width, setWidth] = useState(initialWidth);
  const [height, setHeight] = useState(initialHeight);
  const [lockAspect, setLockAspect] = useState(true);
  const [aspect, setAspect] = useState(initialHeight > 0 ? initialWidth / initialHeight : 16 / 9);

  const applySize = (nextWidth: number, nextHeight: number) => {
    setWidth(nextWidth);
    setHeight(nextHeight);
    setPreset(presetFor(nextWidth, nextHeight));
    if (nextHeight > 0) setAspect(nextWidth / nextHeight);
  };

  const apply = () => {
    const nextWidth = snapFrameDimension(width);
    const nextHeight = snapFrameDimension(height);
    const saved = runtime.actions.edit.setSequenceFrame(nextWidth, nextHeight);
    if (saved) onClose();
  };

  return (
    <Dialog
      open
      title="Sequence Settings"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" disabled={!sequence} onClick={apply}>
            Apply
          </Button>
        </>
      }
    >
      {sequence ? (
        <div className="flex min-w-0 flex-col gap-3">
          <Field label="Frame">
            <Select
              label="Sequence frame"
              className={selectClass}
              value={preset}
              options={PRESETS.map((item) => ({ value: item.value, label: item.label }))}
              onValueChange={(value) => {
                setPreset(value);
                const chosen = PRESETS.find((item) => item.value === value);
                if (!chosen || chosen.value === 'custom') return;
                applySize(chosen.width, chosen.height);
              }}
            />
          </Field>
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-x-2 gap-y-1">
            <span className="text-2xs text-fg-subtle">Width</span>
            <span />
            <span className="text-2xs text-fg-subtle">Height</span>
            <input
              type="number"
              aria-label="Width in pixels"
              min={16}
              step={2}
              value={width}
              onChange={(event) => {
                const next = Number(event.target.value);
                setPreset('custom');
                setWidth(next);
                if (lockAspect) setHeight(previewLinkedDimension(next, aspect, 'width'));
              }}
              onBlur={(event) => {
                const next = snapFrameDimension(Number(event.currentTarget.value));
                setWidth(next);
                if (lockAspect) setHeight(linkedExportDimension(next, aspect, 'width'));
              }}
              className={numberClass}
            />
            <button
              type="button"
              aria-label={lockAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
              aria-pressed={lockAspect}
              title={lockAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
              onClick={() => {
                if (!lockAspect && height > 0 && Number.isFinite(width)) setAspect(width / height);
                setLockAspect((locked) => !locked);
              }}
              className={`flex size-7 items-center justify-center rounded-sm border ${
                lockAspect
                  ? 'border-accent/40 bg-accent-muted text-accent'
                  : 'border-line-strong bg-surface-3 text-fg-subtle hover:text-fg'
              }`}
            >
              {lockAspect ? <Link2 className="size-3.5" /> : <Unlink2 className="size-3.5" />}
            </button>
            <input
              type="number"
              aria-label="Height in pixels"
              min={16}
              step={2}
              value={height}
              onChange={(event) => {
                const next = Number(event.target.value);
                setPreset('custom');
                setHeight(next);
                if (lockAspect) setWidth(previewLinkedDimension(next, aspect, 'height'));
              }}
              onBlur={(event) => {
                const next = snapFrameDimension(Number(event.currentTarget.value));
                setHeight(next);
                if (lockAspect) setWidth(linkedExportDimension(next, aspect, 'height'));
              }}
              className={numberClass}
            />
          </div>
          <Button
            disabled={!source}
            onClick={() => {
              if (!source) return;
              const fitted = frameSizeForMedia(source.width, source.height);
              if (fitted) applySize(fitted.width, fitted.height);
            }}
          >
            Match selected media
          </Button>
          <p className="text-2xs leading-relaxed text-fg-subtle">
            {source
              ? `Selected media is ${source.width}×${source.height}. An empty 16:9 sequence also adopts the first clip when its shape is different.`
              : 'An empty 16:9 sequence adopts the first clip when its shape is different, so a vertical video is not pillarboxed.'}
          </p>
        </div>
      ) : null}
    </Dialog>
  );
}
