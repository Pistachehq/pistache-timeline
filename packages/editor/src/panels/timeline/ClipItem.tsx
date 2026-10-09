import { type Clip, type FrameRate, getAssetFrameCount, type Track } from '@timeline/core';
import { cn } from '@timeline/ui';
import { Link2Off } from 'lucide-react';
import { memo } from 'react';
import { useFormatDisplayTime } from '../../hooks/use-format-display-time';
import { useMediaState, useSelectionState, useUiState } from '../../runtime/context';
import { useActiveSequence, useAsset } from '../../runtime/hooks';
import { ClipWaveform, clipWaveformGainLinear } from './ClipWaveform';
import { AUDIO_TRACK_HEIGHT, MIN_LABEL_WIDTH } from './layout';
import { useClipDrag } from './use-clip-drag';
import { useClipEffectDrop } from './use-clip-effect-drop';
import { useClipTrim } from './use-clip-trim';
import { clipEffectCount } from './clip-transition-visual';

interface ClipItemProps {
  clip: Clip;
  track: Track;
  pixelsPerFrame: number;
  frameRate: FrameRate;
  /** Renders a cross-track drag preview on the destination lane (not the clip's home track). */
  dragGhost?: boolean;
}

export const ClipItem = memo(function ClipItem({
  clip,
  track,
  pixelsPerFrame,
  frameRate,
  dragGhost = false,
}: ClipItemProps) {
  const selected = useSelectionState((s) => s.clipIds.includes(clip.id));
  const drag = useUiState((s) => s.clipDrag?.previews.find((p) => p.clipId === clip.id) ?? null);
  const trimPreview = useUiState((s) => s.clipTrim?.previews.find((p) => p.clipId === clip.id) ?? null);
  const trimming = trimPreview !== null;
  const razor = useUiState((s) => s.tool === 'razor');
  const thumbnail = useMediaState((s) => s.entries[clip.assetId]?.thumbnail ?? null);
  const waveform = useMediaState((s) => s.entries[clip.assetId]?.waveform ?? null);
  const status = useMediaState((s) => s.entries[clip.assetId]?.status);
  const asset = useAsset(clip.assetId);
  const sequence = useActiveSequence();
  const tool = useUiState((s) => s.tool);
  const handlers = useClipDrag(clip, track, pixelsPerFrame);
  const effectDrop = useClipEffectDrop(clip, track);
  const trim = useClipTrim(clip, track, pixelsPerFrame);
  const formatTime = useFormatDisplayTime();

  const offline = status === 'offline' || status === 'error';
  const isVideo = track.kind === 'video';
  const sourceIn = trimPreview?.sourceIn ?? clip.sourceIn;
  const sourceOut = trimPreview?.sourceOut ?? clip.sourceOut;
  const duration = sourceOut - sourceIn;
  const start = drag?.start ?? trimPreview?.start ?? clip.start;
  const width = Math.max(2, duration * pixelsPerFrame);
  const assetFrameCount = asset && sequence ? getAssetFrameCount(asset, sequence) : 0;
  const showWaveform = !isVideo && waveform && assetFrameCount > 0;
  const trackVolume = track.kind === 'audio' ? track.volume : 100;
  const trackMuted = track.kind === 'audio' ? track.muted : false;
  const waveformGain = clipWaveformGainLinear(clip.audio.volume, clip.audio.muted, trackVolume, trackMuted);
  const activeTrim = useUiState((s) => s.clipTrim);
  const isTrimPrimary = activeTrim?.primaryClipId === clip.id;
  if (drag && !dragGhost && drag.trackId !== track.id) return null;

  const crossTrackGhost = dragGhost && drag !== null;
  const showDragOnLane = crossTrackGhost || (drag !== null && drag.trackId === track.id);
  const fxCount = clipEffectCount(clip);

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
        showDragOnLane || trimming
          ? 'z-30 opacity-90 shadow-popover'
          : razor
            ? 'cursor-inherit'
            : 'cursor-grab',
        showDragOnLane && !dragGhost && 'cursor-grabbing',
        track.locked && 'cursor-not-allowed',
        effectDrop.dropHint && 'ring-2 ring-accent/70',
      )}
      style={{
        left: start * pixelsPerFrame,
        width,
        transform: drag && !dragGhost && drag.trackId === track.id ? `translateY(${drag.offsetY}px)` : undefined,
      }}
      {...(activeTrim || dragGhost ? {} : handlers)}
      onDragOver={effectDrop.onDragOver}
      onDragLeave={effectDrop.onDragLeave}
      onDrop={effectDrop.onDrop}
    >
      {tool === 'select' && !track.locked && !drag && !razor && (!trimming || isTrimPrimary) ? (
        <>
          <button
            type="button"
            aria-label="Trim clip start"
            className="absolute top-0 bottom-0 left-0 z-20 w-2.5 cursor-w-resize border-0 bg-black/25 px-0 font-mono text-[10px] leading-none text-white/90 opacity-0 hover:opacity-100 focus:opacity-100"
            {...trim.start}
          >
            [
          </button>
          <button
            type="button"
            aria-label="Trim clip end"
            className="absolute top-0 bottom-0 right-0 z-20 w-2.5 cursor-e-resize border-0 bg-black/25 px-0 font-mono text-[10px] leading-none text-white/90 opacity-0 hover:opacity-100 focus:opacity-100"
            {...trim.end}
          >
            ]
          </button>
        </>
      ) : null}
      {showWaveform ? (
        <ClipWaveform
          peaks={waveform}
          sourceIn={sourceIn}
          sourceOut={sourceOut}
          assetFrameCount={assetFrameCount}
          width={width}
          height={AUDIO_TRACK_HEIGHT - 8}
          gainLinear={waveformGain}
        />
      ) : null}
      {isVideo && thumbnail && width > 48 ? (
        <img
          src={thumbnail}
          alt=""
          draggable={false}
          className="h-full w-auto shrink-0 object-cover opacity-80"
        />
      ) : null}
      {fxCount > 0 ? (
        <span
          className="absolute top-0.5 right-0.5 z-[15] rounded-xs bg-violet-950/90 px-1 py-px text-[9px] font-semibold leading-none text-violet-100 ring-1 ring-violet-300/30"
          title={`${fxCount} effect${fxCount === 1 ? '' : 's'}`}
        >
          fx
        </span>
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
