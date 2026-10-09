import { Select } from '@timeline/ui';
import { useRuntime, useUiState } from '../runtime/context';
import { type PlaybackDecodeScale } from '../state/ui-store';

const OPTIONS: readonly { value: PlaybackDecodeScale; label: string }[] = [
  { value: '1', label: 'Playback 1:1' },
  { value: '0.5', label: 'Playback ½' },
  { value: '0.25', label: 'Playback ¼' },
  { value: '0.125', label: 'Playback ⅛' },
];

export function PlaybackDecodeScaleSelect({ className }: { className?: string }) {
  const runtime = useRuntime();
  const scale = useUiState((s) => s.playbackDecodeScale);
  return (
    <Select
      className={className}
      label="Playback decode scale"
      value={scale}
      options={OPTIONS}
      onValueChange={(value) => runtime.stores.ui.getState().setPlaybackDecodeScale(value)}
    />
  );
}
