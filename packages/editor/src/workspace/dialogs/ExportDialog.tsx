import { formatDisplayTime, formatFrameRate, getSequenceDuration } from '@timeline/core';
import { type ExportProgress } from '@timeline/media';
import { isAbortError, toErrorMessage } from '@timeline/shared';
import { Button, Dialog, Select } from '@timeline/ui';
import { Info, Link2, Loader2, Unlink2 } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTimeDisplayFormat } from '../../hooks/use-format-display-time';
import { useProjectState, useRuntime } from '../../runtime/context';
import { useActiveSequence } from '../../runtime/hooks';
import {
  buildExportOutput,
  FRAME_RATE_PRESET_OPTIONS,
  type ExportFrameRatePreset,
  type ExportResolutionPreset,
  linkedExportDimension,
  previewLinkedDimension,
  RESOLUTION_PRESET_OPTIONS,
  resolutionForPreset,
  snapExportDimension,
} from './export-presets';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-2xs text-fg-subtle">{label}</span>
      {children}
    </label>
  );
}

function phaseLabel(phase: ExportProgress['phase']): string {
  switch (phase) {
    case 'preparing':
      return 'Preparing…';
    case 'audio':
      return 'Mixing audio…';
    case 'rendering':
      return 'Rendering video…';
    case 'finalizing':
      return 'Finalizing…';
  }
}

const FAST_FORMAT = {
  container: 'mp4' as const,
  videoCodec: 'avc',
  audioCodec: 'aac',
};

const WEBM_FORMAT = {
  container: 'webm' as const,
  videoCodec: 'vp9',
  audioCodec: 'opus',
};

type ExportContainer = 'mp4' | 'webm';

const FORMAT_OPTIONS: readonly { value: ExportContainer; label: string }[] = [
  { value: 'mp4', label: 'MP4 — H.264 + AAC' },
  { value: 'webm', label: 'WebM — VP9 + Opus' },
];

const selectClass = 'h-7! w-full min-w-0 max-w-full px-2 text-fg';

/** Export the active sequence. Fast mode encodes H.264, using the GPU when the device can. */
export function ExportDialog({ onClose }: { onClose: () => void }) {
  const runtime = useRuntime();
  const sequence = useActiveSequence();
  const project = useProjectState((s) => s.project);
  const timeFormat = useTimeDisplayFormat();
  const supported = runtime.platform.media.capabilities.export;

  const [format, setFormat] = useState<ExportContainer>('mp4');
  const [resolutionPreset, setResolutionPreset] = useState<ExportResolutionPreset>('sequence');
  const [frameRatePreset, setFrameRatePreset] = useState<ExportFrameRatePreset>('sequence');
  const [customWidth, setCustomWidth] = useState(sequence?.resolution.width ?? 1920);
  const [customHeight, setCustomHeight] = useState(sequence?.resolution.height ?? 1080);
  const [lockAspect, setLockAspect] = useState(true);
  const [aspect, setAspect] = useState(() => {
    const width = sequence?.resolution.width ?? 1920;
    const height = sequence?.resolution.height ?? 1080;
    return height > 0 ? width / height : 16 / 9;
  });

  const output = useMemo(() => {
    if (!sequence) return null;
    return buildExportOutput(sequence, resolutionPreset, customWidth, customHeight, frameRatePreset);
  }, [sequence, resolutionPreset, customWidth, customHeight, frameRatePreset]);

  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cancelExport = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  useEffect(() => () => cancelExport(), [cancelExport]);

  const handleClose = () => {
    if (exporting) cancelExport();
    onClose();
  };

  const runExport = async () => {
    if (!sequence || !output || !supported || exporting) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setExporting(true);
    setProgress({ phase: 'preparing', progress: 0 });
    const taskId = runtime.stores.ui.getState().startTask('Exporting sequence');

    try {
      const result = await runtime.platform.media.exportSequence(
        {
          project,
          sequenceId: sequence.id,
          format: format === 'mp4' ? FAST_FORMAT : WEBM_FORMAT,
          output,
        },
        {
          signal: controller.signal,
          onProgress: setProgress,
        },
      );
      const how = result.hardwareAccelerated ? ' using the GPU' : '';
      runtime.stores.ui.getState().notify(`Saved ${result.displayName}${how}`, 'success');
      onClose();
    } catch (error) {
      if (!isAbortError(error)) {
        runtime.stores.ui.getState().notify(toErrorMessage(error), 'error');
      }
    } finally {
      runtime.stores.ui.getState().endTask(taskId);
      abortRef.current = null;
      setExporting(false);
      setProgress(null);
    }
  };

  const progressPercent = progress === null ? 0 : Math.min(100, Math.round(progress.progress * 100));

  return (
    <Dialog
      open
      title="Export Sequence"
      onClose={handleClose}
      footer={
        <>
          {exporting ? (
            <Button onClick={cancelExport}>Cancel export</Button>
          ) : (
            <Button onClick={handleClose}>Close</Button>
          )}
          <Button
            variant="primary"
            disabled={!supported || !sequence || !output || exporting}
            onClick={() => void runExport()}
          >
            {exporting ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Exporting…
              </>
            ) : (
              'Export'
            )}
          </Button>
        </>
      }
    >
      {sequence ? (
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 truncate text-sm font-medium text-fg">{sequence.name}</p>
            <p className="shrink-0 font-mono text-xs text-fg-muted">
              {formatDisplayTime(getSequenceDuration(sequence), sequence.frameRate, timeFormat)}
            </p>
          </div>

          <div className="grid min-w-0 gap-2.5">
            <Field label="Format">
              <Select
                label="Export format"
                className={selectClass}
                value={format}
                options={FORMAT_OPTIONS}
                onValueChange={setFormat}
                disabled={exporting}
              />
            </Field>
            <Field label="Resolution">
              <Select
                label="Export resolution"
                className={selectClass}
                value={resolutionPreset}
                options={RESOLUTION_PRESET_OPTIONS}
                onValueChange={(value) => {
                  setResolutionPreset(value);
                  if (value === 'custom' || !sequence) return;
                  const size = resolutionForPreset(sequence, value);
                  setCustomWidth(size.width);
                  setCustomHeight(size.height);
                  if (size.height > 0) setAspect(size.width / size.height);
                }}
                disabled={exporting}
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
                value={customWidth}
                disabled={exporting}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setResolutionPreset('custom');
                  setCustomWidth(next);
                  if (lockAspect) setCustomHeight(previewLinkedDimension(next, aspect, 'width'));
                }}
                onBlur={(event) => {
                  const next = snapExportDimension(Number(event.currentTarget.value));
                  setCustomWidth(next);
                  if (lockAspect) setCustomHeight(linkedExportDimension(next, aspect, 'width'));
                }}
                className="h-7 w-full min-w-0 rounded-sm border border-line-strong bg-surface-3 px-2 font-mono text-fg outline-none [appearance:textfield] focus:border-accent disabled:opacity-45 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <button
                type="button"
                aria-label={lockAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
                aria-pressed={lockAspect}
                title={lockAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
                disabled={exporting}
                onClick={() => {
                  if (!lockAspect && customHeight > 0 && Number.isFinite(customWidth)) {
                    setAspect(customWidth / customHeight);
                  }
                  setLockAspect((locked) => !locked);
                }}
                className={`flex size-7 items-center justify-center rounded-sm border disabled:opacity-45 ${
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
                value={customHeight}
                disabled={exporting}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setResolutionPreset('custom');
                  setCustomHeight(next);
                  if (lockAspect) setCustomWidth(previewLinkedDimension(next, aspect, 'height'));
                }}
                onBlur={(event) => {
                  const next = snapExportDimension(Number(event.currentTarget.value));
                  setCustomHeight(next);
                  if (lockAspect) setCustomWidth(linkedExportDimension(next, aspect, 'height'));
                }}
                className="h-7 w-full min-w-0 rounded-sm border border-line-strong bg-surface-3 px-2 font-mono text-fg outline-none [appearance:textfield] focus:border-accent disabled:opacity-45 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </div>
            <Field label="Frame rate">
              <Select
                label="Export frame rate"
                className={selectClass}
                value={frameRatePreset}
                options={FRAME_RATE_PRESET_OPTIONS}
                onValueChange={setFrameRatePreset}
                disabled={exporting}
              />
            </Field>
          </div>

          {output ? (
            <p className="flex items-center justify-between rounded-sm bg-surface-1 px-2.5 py-2 text-xs">
              <span className="text-fg-subtle">Output</span>
              <span className="font-mono text-fg">
                {output.width} × {output.height}
                <span className="text-fg-subtle"> · </span>
                {formatFrameRate(output.frameRate)}
              </span>
            </p>
          ) : null}
        </div>
      ) : null}

      {exporting && progress ? (
        <div className="mt-3 space-y-1.5" aria-live="polite">
          <div className="flex justify-between text-xs text-fg-muted">
            <span>{phaseLabel(progress.phase)}</span>
            <span className="font-mono">{progressPercent}%</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-surface-0">
            <div className="h-full bg-accent transition-[width] duration-150" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      ) : null}

      <p className="mt-3 flex gap-2 text-2xs leading-relaxed text-fg-subtle">
        <Info className="mt-0.5 size-3 shrink-0 text-fg-muted" />
        {supported ? (
          <span>H.264 uses the GPU when this device can. Keep this tab open until the file is saved.</span>
        ) : (
          <span>
            Exporting requires WebCodecs (recent Chrome or Edge).{' '}
            {runtime.platform.kind === 'desktop'
              ? 'The desktop app uses the same renderer in Chromium.'
              : 'Other browsers may gain support in a future release.'}
          </span>
        )}
      </p>
    </Dialog>
  );
}
