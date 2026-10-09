import {
  AUDIO_LIMITS,
  type Clip,
  type ClipAudio,
  type ClipTransform,
  findTrack,
  formatDisplayTime,
  getClipDuration,
  type Sequence,
  TRANSFORM_LIMITS,
  volumeDbToPercent,
  volumePercentToDb,
} from '@timeline/core';
import { IconButton, NumberField } from '@timeline/ui';
import { Link2, RotateCcw, Unlink2, Volume2, VolumeX } from 'lucide-react';
import { useTimeDisplayFormat } from '../../hooks/use-format-display-time';
import { useRuntime } from '../../runtime/context';
import { useAsset } from '../../runtime/hooks';
import { InfoRow, InspectorSection } from './InspectorSection';

type NumericTransformKey = 'positionX' | 'positionY' | 'rotation' | 'opacity';

interface FieldSpec<K extends NumericTransformKey> {
  key: K;
  label: string;
  min: number;
  max: number;
  step: number;
  precision: number;
  unit?: string;
}

const MOTION_FIELDS: readonly FieldSpec<Exclude<NumericTransformKey, 'opacity'>>[] = [
  { key: 'positionX', label: 'Position X', ...TRANSFORM_LIMITS.position, step: 1, precision: 1, unit: 'px' },
  { key: 'positionY', label: 'Position Y', ...TRANSFORM_LIMITS.position, step: 1, precision: 1, unit: 'px' },
  { key: 'rotation', label: 'Rotation', ...TRANSFORM_LIMITS.rotation, step: 0.5, precision: 1, unit: '°' },
];

const LABELS: Record<keyof ClipTransform, string> = {
  positionX: 'Change Position',
  positionY: 'Change Position',
  scaleX: 'Change Scale',
  scaleY: 'Change Scale',
  uniformScale: 'Change Scale',
  rotation: 'Change Rotation',
  opacity: 'Change Opacity',
};

export function ClipInspector({ clip, sequence }: { clip: Clip; sequence: Sequence }) {
  const runtime = useRuntime();
  const { edit } = runtime.actions;
  const asset = useAsset(clip.assetId);
  const track = findTrack(sequence, clip.trackId);
  const locked = track?.locked ?? false;
  const rate = sequence.frameRate;
  const timeFormat = useTimeDisplayFormat();
  const t = (frame: number) => formatDisplayTime(frame, rate, timeFormat);
  const isVideo = track?.kind === 'video';
  const isAudioTrack = track?.kind === 'audio';
  const clipDb = volumePercentToDb(clip.audio.volume);

  const transformField = (spec: FieldSpec<NumericTransformKey>) => (
    <NumberField
      key={spec.key}
      label={spec.label}
      value={clip.transform[spec.key]}
      min={spec.min}
      max={spec.max}
      step={spec.step}
      precision={spec.precision}
      {...(spec.unit ? { unit: spec.unit } : {})}
      disabled={locked}
      onScrubStart={() => edit.beginTransaction(LABELS[spec.key])}
      onScrubEnd={() => edit.commitTransaction()}
      onChange={(value) => edit.setClipTransform(clip.id, { [spec.key]: value }, LABELS[spec.key])}
    />
  );

  const setAudio = (audio: Partial<ClipAudio>, label: string) => edit.setClipAudio(clip.id, audio, label);

  const setTrackVolume = (volume: number) => {
    if (!track || track.kind !== 'audio') return;
    edit.updateTrack(track.id, { volume }, 'Change Track Volume');
  };

  return (
    <div data-testid="clip-inspector">
      <InspectorSection title="Clip" {...(locked ? { note: 'Track locked' } : {})}>
        <InfoRow label="Name" value={clip.name} testId="inspector-clip-name" />
        <InfoRow label="Source" value={asset?.source.fileName ?? 'Missing'} />
        <InfoRow label="Track" value={track?.name ?? '—'} />
        <InfoRow label="Start" value={<span className="font-mono">{t(clip.start)}</span>} testId="inspector-clip-start" />
        <InfoRow label="Duration" value={<span className="font-mono">{t(getClipDuration(clip))}</span>} />
        <InfoRow
          label="Source In / Out"
          value={
            <span className="font-mono">
              {t(clip.sourceIn)} / {t(clip.sourceOut)}
            </span>
          }
        />
      </InspectorSection>

      {isVideo ? (
        <>
          <InspectorSection title="Motion">
            {MOTION_FIELDS.map(transformField)}
            <div className="flex items-end gap-1">
              {clip.transform.uniformScale ? (
                <NumberField
                  className="flex-1"
                  label="Scale"
                  value={clip.transform.scaleX}
                  {...TRANSFORM_LIMITS.scale}
                  step={0.5}
                  precision={1}
                  unit="%"
                  disabled={locked}
                  onScrubStart={() => edit.beginTransaction('Change Scale')}
                  onScrubEnd={() => edit.commitTransaction()}
                  onChange={(value) => edit.setClipTransform(clip.id, { scaleX: value, scaleY: value }, 'Change Scale')}
                />
              ) : (
                <>
                  <NumberField
                    className="flex-1"
                    label="Scale X"
                    value={clip.transform.scaleX}
                    {...TRANSFORM_LIMITS.scale}
                    step={0.5}
                    precision={1}
                    unit="%"
                    disabled={locked}
                    onScrubStart={() => edit.beginTransaction('Change Scale')}
                    onScrubEnd={() => edit.commitTransaction()}
                    onChange={(value) => edit.setClipTransform(clip.id, { scaleX: value }, 'Change Scale')}
                  />
                  <NumberField
                    className="flex-1"
                    label="Scale Y"
                    value={clip.transform.scaleY}
                    {...TRANSFORM_LIMITS.scale}
                    step={0.5}
                    precision={1}
                    unit="%"
                    disabled={locked}
                    onScrubStart={() => edit.beginTransaction('Change Scale')}
                    onScrubEnd={() => edit.commitTransaction()}
                    onChange={(value) => edit.setClipTransform(clip.id, { scaleY: value }, 'Change Scale')}
                  />
                </>
              )}
              <IconButton
                label={clip.transform.uniformScale ? 'Unlock uniform scale' : 'Lock uniform scale'}
                icon={clip.transform.uniformScale ? <Link2 /> : <Unlink2 />}
                pressed={clip.transform.uniformScale}
                disabled={locked}
                onClick={() =>
                  edit.setClipTransform(
                    clip.id,
                    {
                      uniformScale: !clip.transform.uniformScale,
                      ...(clip.transform.uniformScale
                        ? {}
                        : { scaleX: clip.transform.scaleX, scaleY: clip.transform.scaleY }),
                    },
                    'Change Scale',
                  )
                }
              />
            </div>
            <div className="flex justify-end pt-1">
              <IconButton
                label="Reset motion"
                icon={<RotateCcw />}
                disabled={locked}
                onClick={() =>
                  edit.setClipTransform(
                    clip.id,
                    {
                      positionX: 0,
                      positionY: 0,
                      scaleX: 100,
                      scaleY: 100,
                      uniformScale: true,
                      rotation: 0,
                    },
                    'Reset Motion',
                  )
                }
              />
            </div>
          </InspectorSection>
          <InspectorSection title="Opacity">
            {transformField({ key: 'opacity', label: 'Opacity', ...TRANSFORM_LIMITS.opacity, step: 0.5, precision: 1, unit: '%' })}
          </InspectorSection>
        </>
      ) : null}

      {isAudioTrack ? (
        <InspectorSection title="Audio">
          <div className="flex items-center gap-1">
            <NumberField
              className="flex-1"
              label="Volume"
              value={clip.audio.volume}
              min={AUDIO_LIMITS.volume.min}
              step={0.5}
              precision={0}
              unit="%"
              disabled={locked}
              onScrubStart={() => edit.beginTransaction('Change Volume')}
              onScrubEnd={() => edit.commitTransaction()}
              onChange={(volume) => setAudio({ volume }, 'Change Volume')}
            />
            <IconButton
              label={clip.audio.muted ? 'Unmute clip' : 'Mute clip'}
              icon={clip.audio.muted ? <VolumeX /> : <Volume2 />}
              pressed={clip.audio.muted}
              disabled={locked}
              onClick={() => setAudio({ muted: !clip.audio.muted }, clip.audio.muted ? 'Unmute Clip' : 'Mute Clip')}
            />
          </div>
          <NumberField
            label="Level"
            value={clipDb}
            min={AUDIO_LIMITS.gainDb.min}
            step={0.1}
            precision={1}
            unit="dB"
            disabled={locked}
            onScrubStart={() => edit.beginTransaction('Change Volume')}
            onScrubEnd={() => edit.commitTransaction()}
            onChange={(db) => setAudio({ volume: volumeDbToPercent(db) }, 'Change Volume')}
          />
          <NumberField
            label="Pan"
            value={clip.audio.pan}
            {...AUDIO_LIMITS.pan}
            step={1}
            precision={0}
            disabled={locked}
            onScrubStart={() => edit.beginTransaction('Change Pan')}
            onScrubEnd={() => edit.commitTransaction()}
            onChange={(pan) => setAudio({ pan }, 'Change Pan')}
          />
        </InspectorSection>
      ) : null}

      {isAudioTrack ? (
        <InspectorSection title={`Track ${track.name}`}>
          <NumberField
            label="Track volume"
            value={track.volume}
            min={AUDIO_LIMITS.volume.min}
            step={0.5}
            precision={0}
            unit="%"
            disabled={locked}
            onScrubStart={() => edit.beginTransaction('Change Track Volume')}
            onScrubEnd={() => edit.commitTransaction()}
            onChange={setTrackVolume}
          />
          <NumberField
            label="Track level"
            value={volumePercentToDb(track.volume)}
            min={AUDIO_LIMITS.gainDb.min}
            step={0.1}
            precision={1}
            unit="dB"
            disabled={locked}
            onScrubStart={() => edit.beginTransaction('Change Track Volume')}
            onScrubEnd={() => edit.commitTransaction()}
            onChange={(db) => setTrackVolume(volumeDbToPercent(db))}
          />
        </InspectorSection>
      ) : null}

      <InspectorSection title="Effects">
        <p className="py-1 text-xs text-fg-subtle">Effects, keyframes and color correction are not available yet.</p>
      </InspectorSection>
    </div>
  );
}
