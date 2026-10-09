import { getClipEnd, getSequenceDuration } from '@timeline/core';
import { currentSequence, type EditorServices } from '../runtime/services';

export function createPlaybackActions(services: EditorServices) {
  const { playback } = services.stores;

  const duration = () => {
    const sequence = currentSequence(services);
    return sequence ? getSequenceDuration(sequence) : 0;
  };

  const editPoints = (): number[] => {
    const sequence = currentSequence(services);
    if (!sequence) return [0];
    const points = new Set<number>([0]);
    for (const clip of Object.values(sequence.clips)) {
      points.add(clip.start);
      points.add(getClipEnd(clip));
    }
    return [...points].sort((a, b) => a - b);
  };

  const seek = (frame: number) => {
    playback.getState().setPlaying(false);
    playback.getState().setPlayhead(frame);
  };

  const play = () => {
    const end = duration();
    if (end === 0) return;
    if (playback.getState().playhead >= end) playback.getState().setPlayhead(0);
    playback.getState().setPlaying(true);
  };

  const pause = () => playback.getState().setPlaying(false);

  return {
    /** Moves the playhead without changing the play state (used while scrubbing). */
    setPlayhead: (frame: number) => playback.getState().setPlayhead(frame),
    play,
    pause,
    togglePlayback: () => (playback.getState().playing ? pause() : play()),

    step: (frames: number) => seek(playback.getState().playhead + frames),
    goToStart: () => seek(0),
    goToEnd: () => seek(duration()),

    goToPreviousEdit() {
      const current = playback.getState().playhead;
      const previous = editPoints().filter((point) => point < current).pop();
      seek(previous ?? 0);
    },

    goToNextEdit() {
      const current = playback.getState().playhead;
      const next = editPoints().find((point) => point > current);
      if (next !== undefined) seek(next);
    },
  };
}

export type PlaybackActions = ReturnType<typeof createPlaybackActions>;
