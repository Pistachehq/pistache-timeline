import { formatDisplayTime, formatFrameRate, getSequenceDuration } from '@timeline/core';
import { cn } from '@timeline/ui';
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from 'lucide-react';
import { useEffect } from 'react';
import { TimeDisplayFormatSelect } from '../components/TimeDisplayFormatSelect';
import { useTimeDisplayFormat } from '../hooks/use-format-display-time';
import { useProjectState, useRuntime, useUiState } from '../runtime/context';
import { useActiveSequence } from '../runtime/hooks';
import { selectIsDirty } from '../state/project-store';
import { type StatusTone } from '../state/ui-store';

const STATUS_TIMEOUT_MS = 8000;

const TONE_ICON: Record<StatusTone, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
};

const TONE_CLASS: Record<StatusTone, string> = {
  info: 'text-fg-muted',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-danger',
};

function StatusMessage() {
  const runtime = useRuntime();
  const status = useUiState((s) => s.status);

  useEffect(() => {
    if (!status || status.tone === 'error') return;
    const timer = setTimeout(() => runtime.stores.ui.getState().clearStatus(status.id), STATUS_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [runtime, status]);

  if (!status) return <span className="text-fg-subtle">Ready</span>;
  const Icon = TONE_ICON[status.tone];
  return (
    <span role="status" className={cn('flex min-w-0 items-center gap-1.5', TONE_CLASS[status.tone])} data-testid="status-message">
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{status.text}</span>
    </span>
  );
}

function Tasks() {
  const tasks = useUiState((s) => s.tasks);
  if (tasks.length === 0) return null;
  return (
    <span className="flex items-center gap-1.5 text-fg-muted" aria-live="polite">
      <Loader2 className="size-3.5 animate-spin" />
      {tasks[0]?.label}
      {tasks.length > 1 ? ` (+${tasks.length - 1})` : ''}
    </span>
  );
}

function SequenceInfo() {
  const sequence = useActiveSequence();
  const timeFormat = useTimeDisplayFormat();
  const clipCount = sequence ? Object.keys(sequence.clips).length : 0;
  if (!sequence) return null;
  return (
    <span className="flex items-center gap-3 text-fg-subtle">
      <span>{sequence.name}</span>
      <span>
        {sequence.resolution.width}×{sequence.resolution.height}
      </span>
      <span>{formatFrameRate(sequence.frameRate)}</span>
      <span className="font-mono tabular-nums">
        {formatDisplayTime(getSequenceDuration(sequence), sequence.frameRate, timeFormat)}
      </span>
      <span>
        {clipCount} clip{clipCount === 1 ? '' : 's'}
      </span>
    </span>
  );
}

export function StatusBar() {
  const runtime = useRuntime();
  const dirty = useProjectState(selectIsDirty);
  const location = useProjectState((s) => s.location);
  return (
    <footer className="flex h-6 shrink-0 items-center gap-4 border-t border-line bg-surface-2 px-3 text-xs">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <StatusMessage />
        <Tasks />
      </div>
      <SequenceInfo />
      <TimeDisplayFormatSelect />
      <span className={dirty ? 'text-warning' : 'text-fg-subtle'}>
        {dirty ? 'Unsaved changes' : location ? 'Saved' : 'Not saved yet'}
      </span>
      <span className="text-fg-subtle">{runtime.platform.label}</span>
    </footer>
  );
}
