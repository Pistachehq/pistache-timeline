import { formatDisplayTime, formatFrameRate, getSequenceDuration } from '@timeline/core';
import { type ExportProgress } from '@timeline/media';
import { isAbortError, toErrorMessage } from '@timeline/shared';
import { Button, Dialog, Select } from '@timeline/ui';
import { Info, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTimeDisplayFormat } from '../../hooks/use-format-display-time';
import { useProjectState, useRuntime } from '../../runtime/context';
import { useActiveSequence } from '../../runtime/hooks';
import {
  buildExportOutput,
  FRAME_RATE_PRESET_OPTIONS,
  type ExportFrameRatePreset,
  type ExportResolutionPreset,
  RESOLUTION_PRESET_OPTIONS,
} from './export-presets';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-0.5">
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="text-fg">{value}</dd>
    </div>
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

const WEBM_FORMAT = {
  container: 'webm' as const,
  videoCodec: 'vp9',
  audioCodec: 'opus',
};

/** Export active sequence to WebM (VP9 + Opus) when WebCodecs is available. */
export function ExportDialog({ onClose }: { onClose: () => void }) {
  const runtime = useRuntime();
  const sequence = useActiveSequence();
  const project = useProjectState((s) => s.project);
  const timeFormat = useTimeDisplayFormat();
  const supported = runtime.platform.media.capabilities.export;

  const [resolutionPreset, setResolutionPreset] = useState<ExportResolutionPreset>('sequence');
  const [frameRatePreset, setFrameRatePreset] = useState<ExportFrameRatePreset>('sequence');
  const [customWidth, setCustomWidth] = useState(sequence?.resolution.width ?? 1920);
  const [customHeight, setCustomHeight] = useState(sequence?.resolution.height ?? 1080);

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
          format: WEBM_FORMAT,
          output,
        },
        {
          signal: controller.signal,
          onProgress: setProgress,
        },
      );
      runtime.stores.ui.getState().notify(`Saved ${result.displayName}`, 'success');
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
              'Export WebM'
            )}
          </Button>
        </>
      }
    >
      {sequence ? (
        <>
          <dl className="mb-3 text-xs">
            <Row label="Sequence" value={sequence.name} />
            <Row
              label="Duration"
              value={formatDisplayTime(getSequenceDuration(sequence), sequence.frameRate, timeFormat)}
            />
            <Row label="Format" value="WebM (VP9 + Opus)" />
          </dl>

          <div className="mb-3 grid gap-2 text-xs">
            <label className="flex flex-col gap-1">
              <span className="text-fg-subtle">Resolution</span>
              <Select
                label="Export resolution"
                value={resolutionPreset}
                options={RESOLUTION_PRESET_OPTIONS}
                onValueChange={(value) => {
                  setResolutionPreset(value);
                  if (value === 'custom' && sequence) {
                    setCustomWidth(sequence.resolution.width);
                    setCustomHeight(sequence.resolution.height);
                  }
                }}
                disabled={exporting}
              />
            </label>
            {resolutionPreset === 'custom' ? (
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-fg-subtle">Width (px)</span>
                  <input
                    type="number"
                    min={16}
                    step={2}
                    value={customWidth}
                    disabled={exporting}
                    onChange={(e) => setCustomWidth(Number(e.target.value))}
                    className="h-7 rounded-sm border border-line-strong bg-surface-3 px-2 text-fg"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-fg-subtle">Height (px)</span>
                  <input
                    type="number"
                    min={16}
                    step={2}
                    value={customHeight}
                    disabled={exporting}
                    onChange={(e) => setCustomHeight(Number(e.target.value))}
                    className="h-7 rounded-sm border border-line-strong bg-surface-3 px-2 text-fg"
                  />
                </label>
              </div>
            ) : null}
            <label className="flex flex-col gap-1">
              <span className="text-fg-subtle">Frame rate</span>
              <Select
                label="Export frame rate"
                value={frameRatePreset}
                options={FRAME_RATE_PRESET_OPTIONS}
                onValueChange={setFrameRatePreset}
                disabled={exporting}
              />
            </label>
            {output ? (
              <p className="text-fg-muted">
                Output: {output.width} × {output.height} at {formatFrameRate(output.frameRate)}
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      {exporting && progress ? (
        <div className="mb-3 space-y-1.5" aria-live="polite">
          <div className="flex justify-between text-xs text-fg-muted">
            <span>{phaseLabel(progress.phase)}</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full bg-accent transition-[width] duration-150"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      ) : null}

      <div className="flex gap-2 rounded-sm border border-line-strong bg-surface-1 p-2.5 text-xs">
        <Info className="mt-0.5 size-3.5 shrink-0 text-accent" />
        {supported ? (
          <p>
            Video follows the Program monitor (topmost visible clip); empty video areas are black. Audio mixes all
            unmuted audio tracks plus the program clip. Long exports can take several minutes — keep this tab open.
          </p>
        ) : (
          <p>
            Exporting requires WebCodecs with VP9 and Opus (recent Chrome or Edge).{' '}
            {runtime.platform.kind === 'desktop'
              ? 'The desktop app uses the same renderer in Chromium; FFmpeg export is planned later.'
              : 'Other browsers may gain support in a future release.'}
          </p>
        )}
      </div>
    </Dialog>
  );
}
