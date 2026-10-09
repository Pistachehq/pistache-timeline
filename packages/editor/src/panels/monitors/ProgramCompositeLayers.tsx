import { getStackedVideoClipsAt, type Clip, type Sequence } from '@timeline/core';
import { type CSSProperties, useEffect, useMemo, useRef } from 'react';
import { sourceTimeForFrame } from '../../playback/frame-math';
import { useMediaState, usePlaybackState, useProjectState } from '../../runtime/context';

function clipLayerStyle(clip: Clip, sequence: Sequence): CSSProperties {
  const t = clip.transform;
  const x = (t.positionX / sequence.resolution.width) * 100;
  const y = (t.positionY / sequence.resolution.height) * 100;
  return {
    transform: `translate(${x}%, ${y}%) rotate(${t.rotation}deg) scale(${t.scale / 100})`,
    opacity: t.opacity / 100,
  };
}

interface LayerProps {
  readonly clip: Clip;
  readonly sequence: Sequence;
  readonly zIndex: number;
  readonly playhead: number;
  readonly playing: boolean;
}

function CompositeLayer({ clip, sequence, zIndex, playhead, playing }: LayerProps) {
  const asset = useProjectState((s) => s.project.mediaAssets[clip.assetId]);
  const entry = useMediaState((s) => s.entries[clip.assetId]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const url = entry?.status === 'online' && entry.handle ? entry.handle.url : null;
  const isImage = asset?.kind === 'image';

  const sourceSeconds = useMemo(() => {
    if (isImage) return 0;
    return sourceTimeForFrame(clip, playhead, sequence.frameRate);
  }, [clip, isImage, playhead, sequence.frameRate]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || isImage || !url) return;
    if (el.src !== url) {
      el.src = url;
      el.load();
    }
  }, [isImage, url]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || isImage || !url) return;
    if (Math.abs(el.currentTime - sourceSeconds) < 0.03) return;
    el.currentTime = sourceSeconds;
  }, [isImage, sourceSeconds, url]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || isImage || !url) return;
    if (playing) void el.play().catch(() => undefined);
    else el.pause();
  }, [isImage, playing, url]);

  if (!asset || !url) return null;

  const style = { ...clipLayerStyle(clip, sequence), zIndex };

  if (isImage) {
    return (
      <img
        src={url}
        alt=""
        draggable={false}
        className="pointer-events-none absolute inset-0 h-full w-full object-contain"
        style={style}
      />
    );
  }

  return (
    <video
      ref={videoRef}
      muted
      playsInline
      className="pointer-events-none absolute inset-0 h-full w-full object-contain"
      style={style}
    />
  );
}

/** Bottom-to-top video/image layers for picture-in-picture compositing. */
export function ProgramCompositeLayers({ sequence }: { readonly sequence: Sequence }) {
  const playhead = usePlaybackState((s) => s.playhead);
  const playing = usePlaybackState((s) => s.playing);
  const stack = useMemo(() => getStackedVideoClipsAt(sequence, playhead), [sequence, playhead]);

  if (stack.length === 0) return null;

  return (
    <>
      {stack.map(({ clip }, index) => (
        <CompositeLayer
          key={clip.id}
          clip={clip}
          sequence={sequence}
          zIndex={index + 1}
          playhead={playhead}
          playing={playing}
        />
      ))}
    </>
  );
}
