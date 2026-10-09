import { type Clip, type FrameRate, getAssetFrameCount, getClipDuration, type Track } from '@timeline/core';
import { cn } from '@timeline/ui';
import { Link2Off } from 'lucide-react';
import { memo } from 'react';
import { useFormatDisplayTime } from '../../hooks/use-format-display-time';
import { useMediaState, useSelectionState, useUiState } from '../../runtime/context';
import { useActiveSequence, useAsset } from '../../runtime/hooks';
import { ClipWaveform } from './ClipWaveform';
import { AUDIO_TRACK_HEIGHT, MIN_LABEL_WIDTH } from './layout';
import { useClipDrag } from './use-clip-drag';

interface ClipItemProps {
  clip: Clip;
  track: Track;
  pixelsPerFrame: number;
  frameRate: FrameRate;
}

export const ClipItem = memo(function ClipItem({ clip, track, pixelsPerFrame, frameRate }: ClipItemProps) {
  const selected = useSelectionState((s) => s.clipIds.includes(clip.id));
  const drag = useUiState((s) => s.clipDrag?.previews.find((p) => p.clipId === clip.id) ?? null);
  const razor = useUiState((s) => s.tool === 'razor');
  const thumbnail = useMediaState((s) => s.entries[clip.assetId]?.thumbnail ?? null);
  const waveform = useMediaState((s) => s.entries[clip.assetId]?.waveform ?? null);
  const status = useMediaState((s) => s.entries[clip.assetId]?.status);
  const asset = useAsset(clip.assetId);
  const sequence = useActiveSequence();
  const handlers = useClipDrag(clip, track, pixelsPerFrame);
  const formatTime = useFormatDisplayTime();

  const offline = status === 'offline' || status === 'error';
  const isVideo = track.kind === 'video';
  const duration = getClipDuration(clip);
  const start = drag?.start ?? clip.start;
  const width = Math.max(2, duration * pixelsPerFrame);
  const assetFrameCount = asset && sequence ? getAssetFrameCount(asset, sequence) : 0;
  const showWaveform = !isVideo && waveform && assetFrameCount > 0;

  return (
    <div
      role="button"
      tabIndex={-1}
      aria-pressed={selected}
      aria-label={`${clip.name}, starts at ${formatTime(clip.start, frameRate)}`}
      title={`${clip.name}\n${formatTime(clip.start, frameRate)} – ${formatTime(clip.start + duration, frameRate)}`}
      data-testid="timeline-clip"
      data-clip-id={clip.id}
      className={cn(
        'absolute top-1 bottom-1 flex overflow-hidden rounded-xs border text-left text-2xs',
        isVideo ? 'bg-clip-video' : 'bg-clip-audio',
        offline && 'bg-danger/40',
        selected ? 'border-white' : isVideo ? 'border-clip-video-strong/60' : 'border-clip-audio-strong/60',
        !clip.enabled && 'opacity-40',
        drag ? 'z-30 cursor-grabbing opacity-85 shadow-popover' : razor ? 'cursor-none' : 'cursor-grab',
        track.locked && 'cursor-not-allowed',
      )}
      style={{
        left: start * pixelsPerFrame,
        width,
        transform: drag ? `translateY(${drag.offsetY}px)` : undefined,
      }}
      {...handlers}
    >
      {showWaveform ? (
        <ClipWaveform
          peaks={waveform}
          sourceIn={clip.sourceIn}
          sourceOut={clip.sourceOut}
          assetFrameCount={assetFrameCount}
          width={width}
          height={AUDIO_TRACK_HEIGHT - 8}
        />
      ) : null}
      {isVideo && thumbnail && width > 48 ? (
        <img src={thumbnail} alt="" draggable={false} className="h-full w-auto shrink-0 object-cover opacity-80" />
      ) : null}
      {width >= MIN_LABEL_WIDTH ? (
        <span className="relative z-10 flex min-w-0 items-start gap-1 px-1.5 py-0.5">
          {offline ? <Link2Off className="mt-0.5 size-3 shrink-0" /> : null}
          <span className="truncate font-medium text-white/90">{clip.name}</span>
        </span>
      ) : null}
    </div>
  );
});
