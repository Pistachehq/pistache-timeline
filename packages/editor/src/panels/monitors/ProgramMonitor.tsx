import { formatDisplayTime, getSequenceDuration, type Sequence } from '@timeline/core';
import { EmptyState, PanelFrame, Select } from '@timeline/ui';
import { Clapperboard, Link2Off, Loader2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { ProgramCompositeLayers } from './ProgramCompositeLayers';
import { shortcutLabel } from '../../commands/commands';
import { useElementSize } from '../../hooks/use-element-size';
import { SequencePlaybackController } from '../../playback/sequence-playback';
import { useTimeDisplayFormat } from '../../hooks/use-format-display-time';
import { playbackDecodeFactor, programVideoDecodeSize } from '../../playback/playback-decode';
import { usePlaybackState, useRuntime, useUiState } from '../../runtime/context';
import { useActiveSequence } from '../../runtime/hooks';
import { type MonitorScale } from '../../state/ui-store';
import { PlayheadTimecode } from './PlayheadTimecode';
import { TransportControls } from './TransportControls';

const SCALE_OPTIONS: readonly { value: MonitorScale; label: string }[] = [
  { value: 'fit', label: 'Fit' },
  { value: '25', label: '25%' },
  { value: '50', label: '50%' },
  { value: '100', label: '100%' },
];

const FRAME_PADDING = 16;

function frameSize(sequence: Sequence, scale: MonitorScale, area: { width: number; height: number }) {
  const { width, height } = sequence.resolution;
  if (scale !== 'fit') {
    const factor = Number(scale) / 100;
    return { width: width * factor, height: height * factor };
  }
  const factor = Math.max(
    0,
    Math.min((area.width - FRAME_PADDING) / width, (area.height - FRAME_PADDING) / height),
  );
  return { width: width * factor, height: height * factor };
}

function ProgramOverlay() {
  const status = usePlaybackState((s) => s.programStatus);
  if (status === 'empty') {
    return (
      <EmptyState
        className="absolute inset-0"
        icon={<Clapperboard />}
        title="The sequence is empty"
        description="Import media and add a clip to the timeline to preview it here."
      />
    );
  }
  if (status === 'offline') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-danger/10 text-xs text-danger">
        <Link2Off className="size-5" />
        Media offline
      </div>
    );
  }
  if (status === 'loading') {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <Loader2 className="size-5 animate-spin text-fg-muted" />
      </div>
    );
  }
  return null;
}

/** Preview of the active sequence at the playhead. */
export function ProgramMonitor() {
  const runtime = useRuntime();
  const sequence = useActiveSequence();
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioHostRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const area = useElementSize(areaRef);
  const scale = useUiState((s) => s.programScale);
  const decodeScale = useUiState((s) => s.playbackDecodeScale);
  const timeFormat = useTimeDisplayFormat();
  const playing = usePlaybackState((s) => s.playing);
  const frameRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    const audioHost = audioHostRef.current;
    if (!video || !audioHost) return;
    const controller = new SequencePlaybackController(
      runtime,
      runtime.platform.media.createPlayer(video),
      audioHost,
    );
    return () => controller.dispose();
  }, [runtime]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !sequence) return;
    const factor = playbackDecodeFactor(decodeScale);
    const { width, height } = programVideoDecodeSize(
      sequence.resolution.width,
      sequence.resolution.height,
      sequence.resolution.width,
      sequence.resolution.height,
      factor,
    );
    video.width = width;
    video.height = height;
  }, [sequence, decodeScale]);

  const size = sequence ? frameSize(sequence, scale, area) : { width: 0, height: 0 };
  const duration = sequence ? getSequenceDuration(sequence) : 0;
  const { playback } = runtime.actions;

  return (
    <PanelFrame title={sequence ? `Program: ${sequence.name}` : 'Program'}>
      <div
        ref={areaRef}
        className="relative flex min-h-0 flex-1 overflow-auto bg-surface-0"
        onDoubleClick={(event) => {
          if (event.target === event.currentTarget) runtime.stores.ui.getState().setProgramScale('fit');
        }}
      >
        <div
          ref={frameRef}
          className="relative m-auto shrink-0 overflow-hidden bg-black"
          style={{ width: size.width, height: size.height }}
          data-testid="program-frame"
          onDoubleClick={(event) => {
            if (event.target === event.currentTarget) runtime.stores.ui.getState().setProgramScale('fit');
          }}
        >
          <video
            ref={videoRef}
            className="pointer-events-none absolute inset-0 h-full w-full object-contain opacity-0"
            aria-hidden
            tabIndex={-1}
            data-testid="program-video"
          />
          {sequence ? <ProgramCompositeLayers sequence={sequence} /> : null}
          <div ref={audioHostRef} className="sr-only" aria-hidden />
        </div>
        <ProgramOverlay />
      </div>
      <div className="flex h-9 shrink-0 items-center gap-2 border-t border-line px-2">
        {sequence ? <PlayheadTimecode frameRate={sequence.frameRate} className="min-w-24 shrink-0" /> : null}
        <div className="flex flex-1 justify-center">
          <TransportControls
            playing={playing}
            disabled={duration === 0}
            onTogglePlay={playback.togglePlayback}
            onStep={playback.step}
            onGoToStart={playback.goToStart}
            onGoToEnd={playback.goToEnd}
            hints={{
              play: shortcutLabel('playback.toggle'),
              stepBack: shortcutLabel('playback.stepBack'),
              stepForward: shortcutLabel('playback.stepForward'),
            }}
          />
        </div>
        <span className="min-w-24 shrink-0 text-right font-mono text-xs text-fg-subtle tabular-nums">
          {sequence ? formatDisplayTime(duration, sequence.frameRate, timeFormat) : ''}
        </span>
        <Select
          label="Preview scale"
          value={scale}
          options={SCALE_OPTIONS}
          onValueChange={(value) => runtime.stores.ui.getState().setProgramScale(value)}
        />
      </div>
    </PanelFrame>
  );
}
