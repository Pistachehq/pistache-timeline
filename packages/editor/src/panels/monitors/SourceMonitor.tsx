import {

  type FrameRate,

  formatDisplayTime,

  framesToSeconds,

  mediaTimeToSeconds,

  secondsToFrames,

} from '@timeline/core';

import { type MediaPlayer } from '@timeline/media';

import { Button, EmptyState, PanelFrame, Scrubber } from '@timeline/ui';

import { AudioLines, ListPlus, MonitorPlay } from 'lucide-react';

import { useEffect, useRef, useState } from 'react';

import { displayTimePlaceholder, useTimeDisplayFormat } from '../../hooks/use-format-display-time';
import { useMediaState, useRuntime, useSelectionState } from '../../runtime/context';

import { useActiveSequence, useAsset, useSingleSelectedClip } from '../../runtime/hooks';

import { TransportControls } from './TransportControls';



/**

 * Inspects a single asset with native media playback. Independent from the

 * sequence playhead; starting program playback pauses it and vice versa.

 */

export function SourceMonitor() {

  const runtime = useRuntime();

  const assetId = useSelectionState((s) => s.assetId);

  const asset = useAsset(assetId);

  const selectedClip = useSingleSelectedClip();

  const entry = useMediaState((s) => (assetId ? s.entries[assetId] : undefined));

  const sequence = useActiveSequence();

  const videoRef = useRef<HTMLVideoElement>(null);

  const audioRef = useRef<HTMLAudioElement>(null);

  const videoPlayerRef = useRef<MediaPlayer | null>(null);

  const audioPlayerRef = useRef<MediaPlayer | null>(null);

  const lastPreviewClipId = useRef<string | null>(null);

  const [time, setTime] = useState(0);

  const [playing, setPlaying] = useState(false);

  const timeFormat = useTimeDisplayFormat();

  const handle = entry?.status === 'online' ? entry.handle : null;

  const rate: FrameRate | undefined = asset?.frameRate ?? sequence?.frameRate;

  const durationSeconds = asset ? mediaTimeToSeconds(asset.duration) : 0;

  const usesVideo = asset?.hasVideo ?? false;

  const usesAudio = asset?.hasAudio ?? false;



  useEffect(() => {

    const video = videoRef.current;

    const audio = audioRef.current;

    if (!video || !audio) return;



    const videoPlayer = runtime.platform.media.createPlayer(video);

    const audioPlayer = runtime.platform.media.createPlayer(audio);

    videoPlayerRef.current = videoPlayer;

    audioPlayerRef.current = audioPlayer;

    videoPlayer.setMuted(false);
    videoPlayer.setVolume(1);
    audioPlayer.setMuted(false);
    audioPlayer.setVolume(1);

    const syncPlaying = () => setPlaying(!video.paused || (!usesVideo && !audio.paused));

    const onPause = () => syncPlaying();

    const onPlay = () => {

      syncPlaying();

      runtime.actions.playback.pause();

    };

    const onTime = () => {

      const active = usesVideo ? video : audio;

      setTime(active.currentTime);

    };



    for (const el of [video, audio]) {

      el.addEventListener('play', onPlay);

      el.addEventListener('pause', onPause);

      el.addEventListener('seeked', onTime);

      el.addEventListener('timeupdate', onTime);

    }



    const unsubscribe = runtime.stores.playback.subscribe((state, previous) => {

      if (state.playing && !previous.playing) {

        videoPlayer.pause();

        audioPlayer.pause();

      }

    });



    return () => {

      unsubscribe();

      for (const el of [video, audio]) {

        el.removeEventListener('play', onPlay);

        el.removeEventListener('pause', onPause);

        el.removeEventListener('seeked', onTime);

        el.removeEventListener('timeupdate', onTime);

      }

      videoPlayer.dispose();

      audioPlayer.dispose();

      videoPlayerRef.current = null;

      audioPlayerRef.current = null;

    };

  }, [runtime, usesVideo]);



  useEffect(() => {

    videoPlayerRef.current?.load(usesVideo ? handle : null);

    audioPlayerRef.current?.load(usesAudio && !usesVideo ? handle : null);

    setTime(0);

    lastPreviewClipId.current = null;

  }, [handle, usesVideo, usesAudio]);



  useEffect(() => {

    if (!selectedClip || selectedClip.assetId !== assetId || !rate) return;

    if (lastPreviewClipId.current === selectedClip.id) return;

    lastPreviewClipId.current = selectedClip.id;

    const seconds = framesToSeconds(selectedClip.sourceIn, rate);

    videoPlayerRef.current?.seek(seconds);

    audioPlayerRef.current?.seek(seconds);

    setTime(seconds);

  }, [selectedClip, assetId, rate]);



  useEffect(() => {

    if (!playing) return;

    let raf = requestAnimationFrame(function tick() {

      const video = videoRef.current;

      const audio = audioRef.current;

      if (video || audio) {

        const active = usesVideo ? video : audio;

        if (active) setTime(active.currentTime);

      }

      raf = requestAnimationFrame(tick);

    });

    return () => cancelAnimationFrame(raf);

  }, [playing, usesVideo]);



  const activePlayer = (): MediaPlayer | null => (usesVideo ? videoPlayerRef.current : audioPlayerRef.current);



  const seekSeconds = (seconds: number) => {

    const t = Math.max(0, Math.min(durationSeconds, seconds));

    videoPlayerRef.current?.seek(t);

    audioPlayerRef.current?.seek(t);

    setTime(t);

  };



  const stepFrames = (frames: number) => {

    if (!rate) return;

    videoPlayerRef.current?.pause();

    audioPlayerRef.current?.pause();

    const current = secondsToFrames(time, rate, 'floor');

    seekSeconds(framesToSeconds(current + frames + 0.5, rate));

  };



  const togglePlay = () => {

    const player = activePlayer();

    if (!player) return;

    if (playing) {

      videoPlayerRef.current?.pause();

      audioPlayerRef.current?.pause();

    } else {

      void player.play().catch(() => undefined);

    }

  };



  return (

    <PanelFrame title={asset ? `Source: ${asset.name}` : 'Source'}>

      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black">

        <video

          ref={videoRef}

          className={usesVideo ? 'h-full w-full object-contain' : 'hidden'}

          aria-label="Source monitor video"

          data-testid="source-video"

        />

        <audio ref={audioRef} className="hidden" aria-hidden tabIndex={-1} />

        {!asset ? (

          <EmptyState

            className="absolute inset-0"

            icon={<MonitorPlay />}

            title="No source selected"

            description="Select media in the Project panel or a clip on the timeline to preview it here."

          />

        ) : !usesVideo ? (

          <AudioLines className="size-10 text-clip-audio-strong" aria-hidden />

        ) : null}

        {entry?.thumbnail && !usesVideo ? (

          <img

            src={entry.thumbnail}

            alt=""

            draggable={false}

            className="pointer-events-none absolute bottom-3 left-3 h-14 w-[6.5rem] rounded-xs border border-line-strong object-cover shadow-sm"

          />

        ) : null}

        {asset && entry && entry.status !== 'online' ? (

          <div className="absolute inset-x-0 bottom-2 text-center text-xs text-danger">

            {entry.status === 'resolving' ? 'Loading media…' : 'Media offline — relink it from the Project panel.'}

          </div>

        ) : null}

      </div>

      <Scrubber

        label="Source position"

        min={0}

        max={durationSeconds || 1}

        step={rate ? framesToSeconds(1, rate) : 0.01}

        value={Math.min(time, durationSeconds)}

        disabled={!handle}

        onValueChange={seekSeconds}

      />

      <div className="flex h-9 shrink-0 items-center gap-2 border-t border-line px-2">

        <span className="min-w-24 shrink-0 font-mono text-sm text-accent tabular-nums">

          {rate
            ? formatDisplayTime(secondsToFrames(time, rate, 'floor'), rate, timeFormat)
            : displayTimePlaceholder(timeFormat)}

        </span>

        <div className="flex flex-1 justify-center">

          <TransportControls

            playing={playing}

            disabled={!handle}

            onTogglePlay={togglePlay}

            onStep={stepFrames}

            onGoToStart={() => seekSeconds(0)}

            onGoToEnd={() => seekSeconds(durationSeconds)}

          />

        </div>

        <Button

          size="sm"

          icon={<ListPlus className="size-3.5" />}

          disabled={!asset || !handle}

          title="Insert the full clip into the timeline at the playhead"

          onClick={() => assetId && runtime.actions.edit.insertAssetAtPlayhead(assetId)}

        >

          Insert

        </Button>

      </div>

    </PanelFrame>

  );

}


