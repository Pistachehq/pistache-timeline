import {
  AUDIO_LIMITS,
  findTrack,
  formatVolumeDb,
  getClipDuration,
  volumeDbToPercent,
  volumePercentToDb,
  type Clip,
  type Sequence,
} from '@timeline/core';
import { IconButton, NumberField } from '@timeline/ui';
import { Volume2, VolumeX } from 'lucide-react';
import { useRuntime, useUiState, usePlaybackState } from '../../runtime/context';

const FADER_MAX_DB = 12;

function panLabel(pan: number): string {
  if (Math.abs(pan) < 1) return 'C';
  if (pan < 0) return `L ${Math.round(Math.abs(pan))}`;
  return `R ${Math.round(pan)}`;
}

/** Premiere-style channel strip for the selected audio clip. */
export function AudioClipMixer({ clip, sequence }: { readonly clip: Clip; readonly sequence: Sequence }) {
  const runtime = useRuntime();
  const { edit } = runtime.actions;
  const track = findTrack(sequence, clip.trackId);
  const locked = track?.locked ?? false;
  const audioTrack = track?.kind === 'audio' ? track : null;
  const db = volumePercentToDb(clip.audio.volume);
  const playhead = usePlaybackState((state) => state.playhead);
  const playing = usePlaybackState((state) => state.playing);
  const peak = useUiState((state) => state.playbackMeterPeak);
  const duration = Math.max(1, getClipDuration(clip));
  const underPlayhead = playhead >= clip.start && playhead < clip.start + duration;
  const meter = playing && underPlayhead && !clip.audio.muted ? peak : 0;

  const setVolumeDb = (next: number) => {
    edit.setClipAudio(clip.id, { volume: volumeDbToPercent(next) }, 'Change Volume');
  };

  return (
    <div className="flex h-full min-h-0" data-testid="audio-clip-mixer">
      <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-auto p-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-fg">{clip.name}</p>
          <p className="truncate text-2xs text-fg-subtle">{audioTrack ? `Track ${audioTrack.name}` : 'Audio clip'}</p>
        </div>

        <div className="flex items-center gap-2">
          <IconButton
            label={clip.audio.muted ? 'Unmute clip' : 'Mute clip'}
            icon={clip.audio.muted ? <VolumeX /> : <Volume2 />}
            pressed={clip.audio.muted}
            disabled={locked}
            onClick={() => edit.setClipAudio(clip.id, { muted: !clip.audio.muted }, clip.audio.muted ? 'Unmute Clip' : 'Mute Clip')}
          />
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center justify-between text-2xs text-fg-muted">
              <span>Pan</span>
              <span className="font-mono text-fg">{panLabel(clip.audio.pan)}</span>
            </div>
            <input
              aria-label="Pan"
              type="range"
              min={AUDIO_LIMITS.pan.min}
              max={AUDIO_LIMITS.pan.max}
              step={1}
              value={clip.audio.pan}
              disabled={locked}
              className="w-full accent-accent"
              onPointerDown={() => edit.beginTransaction('Change Pan')}
              onPointerUp={() => edit.commitTransaction()}
              onPointerCancel={() => edit.commitTransaction()}
              onChange={(event) => edit.setClipAudio(clip.id, { pan: Number(event.target.value) }, 'Change Pan')}
            />
            <div className="flex justify-between text-[9px] text-fg-subtle">
              <span>L</span>
              <span>C</span>
              <span>R</span>
            </div>
          </div>
        </div>

        <NumberField
          label="Level"
          value={db}
          min={AUDIO_LIMITS.gainDb.min}
          max={FADER_MAX_DB}
          step={0.1}
          precision={1}
          unit="dB"
          disabled={locked}
          onScrubStart={() => edit.beginTransaction('Change Volume')}
          onScrubEnd={() => edit.commitTransaction()}
          onChange={setVolumeDb}
        />

        {audioTrack ? (
          <div className="border-t border-line pt-3">
            <p className="mb-2 text-2xs font-medium text-fg-muted">Track {audioTrack.name}</p>
            <div className="flex items-center gap-2">
              <IconButton
                label={audioTrack.muted ? 'Unmute track' : 'Mute track'}
                icon={audioTrack.muted ? <VolumeX /> : <Volume2 />}
                pressed={audioTrack.muted}
                disabled={locked}
                onClick={() => edit.updateTrack(audioTrack.id, { muted: !audioTrack.muted }, audioTrack.muted ? 'Unmute Track' : 'Mute Track')}
              />
              <NumberField
                className="flex-1"
                label="Track level"
                value={volumePercentToDb(audioTrack.volume)}
                min={AUDIO_LIMITS.gainDb.min}
                max={FADER_MAX_DB}
                step={0.1}
                precision={1}
                unit="dB"
                disabled={locked}
                onScrubStart={() => edit.beginTransaction('Change Track Volume')}
                onScrubEnd={() => edit.commitTransaction()}
                onChange={(next) => edit.updateTrack(audioTrack.id, { volume: volumeDbToPercent(next) }, 'Change Track Volume')}
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex w-16 shrink-0 flex-col items-center gap-2 border-l border-line py-3">
        <div className="text-[9px] text-fg-subtle">dB</div>
        <div className="flex min-h-0 w-full flex-1 items-stretch justify-center gap-1.5 px-1">
          <div className="relative w-2 overflow-hidden rounded-sm bg-surface-3" aria-hidden>
            <div
              className="absolute inset-x-0 bottom-0 bg-[linear-gradient(to_top,var(--color-success),var(--color-warning)_72%,var(--color-danger))]"
              style={{ height: `${Math.round(meter * 100)}%` }}
            />
          </div>
          <input
            aria-label="Volume fader"
            type="range"
            min={AUDIO_LIMITS.gainDb.min}
            max={FADER_MAX_DB}
            step={0.1}
            value={Math.min(FADER_MAX_DB, Math.max(AUDIO_LIMITS.gainDb.min, db))}
            disabled={locked}
            className="h-full w-3 cursor-ns-resize accent-clip-audio [direction:rtl] [writing-mode:vertical-lr]"
            onPointerDown={() => edit.beginTransaction('Change Volume')}
            onPointerUp={() => edit.commitTransaction()}
            onPointerCancel={() => edit.commitTransaction()}
            onChange={(event) => setVolumeDb(Number(event.target.value))}
          />
        </div>
        <span className="px-1 text-center font-mono text-[9px] text-fg-muted">{formatVolumeDb(db)}</span>
      </div>
    </div>
  );
}
