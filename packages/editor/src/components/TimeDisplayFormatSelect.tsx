import { Select } from '@timeline/ui';
import { useRuntime, useUiState } from '../runtime/context';
import { type TimeDisplayFormat } from '../state/ui-store';

const OPTIONS: readonly { value: TimeDisplayFormat; label: string }[] = [
  { value: 'timecode', label: 'Timecode' },
  { value: 'frames', label: 'Frames' },
];

/** Workspace control for SMPTE timecode vs raw frame numbers. */
export function TimeDisplayFormatSelect({ className }: { className?: string }) {
  const runtime = useRuntime();
  const format = useUiState((s) => s.timeDisplayFormat);
  return (
    <Select
      className={className}
      label="Time display"
      value={format}
      options={OPTIONS}
      data-testid="time-display-format"
      onValueChange={(value) => runtime.stores.ui.getState().setTimeDisplayFormat(value)}
    />
  );
}
