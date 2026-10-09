import { type Track } from '@timeline/core';
import { cn, IconButton } from '@timeline/ui';
import { Eye, EyeOff, Lock, LockOpen, Volume2, VolumeX } from 'lucide-react';
import { memo } from 'react';
import { useRuntime } from '../../runtime/context';
import { TRACK_HEADER_WIDTH } from './layout';

export const TrackHeader = memo(function TrackHeader({ track, height }: { track: Track; height: number }) {
  const runtime = useRuntime();
  const { edit } = runtime.actions;
  const isVideo = track.kind === 'video';

  return (
    <div
      className="sticky left-0 z-[30] flex shrink-0 items-center gap-1 border-r border-b border-line bg-surface-2 pr-1"
      style={{ width: TRACK_HEADER_WIDTH, height }}
      data-testid={`track-header-${track.name}`}
    >
      <span className={cn('h-full w-1 shrink-0', isVideo ? 'bg-clip-video' : 'bg-clip-audio')} />
      <span className="w-8 pl-1 text-xs font-semibold text-fg-muted">{track.name}</span>
      <div className="flex-1" />
      {track.kind === 'video' ? (
        <IconButton
          size="xs"
          label={track.visible ? `Hide ${track.name}` : `Show ${track.name}`}
          icon={track.visible ? <Eye /> : <EyeOff />}
          pressed={!track.visible}
          onClick={() =>
            edit.updateTrack(track.id, { visible: !track.visible }, track.visible ? 'Hide Track' : 'Show Track')
          }
        />
      ) : (
        <IconButton
          size="xs"
          label={track.muted ? `Unmute ${track.name}` : `Mute ${track.name}`}
          icon={track.muted ? <VolumeX /> : <Volume2 />}
          pressed={track.muted}
          onClick={() => edit.updateTrack(track.id, { muted: !track.muted }, track.muted ? 'Unmute Track' : 'Mute Track')}
        />
      )}
      <IconButton
        size="xs"
        label={track.locked ? `Unlock ${track.name}` : `Lock ${track.name}`}
        icon={track.locked ? <Lock /> : <LockOpen />}
        pressed={track.locked}
        tone="accent"
        onClick={() =>
          edit.updateTrack(track.id, { locked: !track.locked }, track.locked ? 'Unlock Track' : 'Lock Track')
        }
      />
    </div>
  );
});
