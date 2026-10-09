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
} from '@timeline/core';
import { IconButton, NumberField } from '@timeline/ui';
import { RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { useTimeDisplayFormat } from '../../hooks/use-format-display-time';
import { useRuntime } from '../../runtime/context';
import { useAsset } from '../../runtime/hooks';
import { InfoRow, InspectorSection } from './InspectorSection';

interface FieldSpec<K extends string> {
  key: K;
  label: string;
  min: number;
  max: number;
  step: number;
  precision: number;
  unit?: string;
}

const MOTION_FIELDS: readonly FieldSpec<keyof ClipTransform>[] = [
  { key: 'positionX', label: 'Position X', ...TRANSFORM_LIMITS.position, step: 1, precision: 1, unit: 'px' },
  { key: 'positionY', label: 'Position Y', ...TRANSFORM_LIMITS.position, step: 1, precision: 1, unit: 'px' },
  { key: 'scale', label: 'Scale', ...TRANSFORM_LIMITS.scale, step: 0.5, precision: 1, unit: '%' },
  { key: 'rotation', label: 'Rotation', ...TRANSFORM_LIMITS.rotation, step: 0.5, precision: 1, unit: '°' },
];

const LABELS: Record<keyof ClipTransform, string> = {
  positionX: 'Change Position',
  positionY: 'Change Position',
  scale: 'Change Scale',
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

  const transformField = (spec: FieldSpec<keyof ClipTransform>) => (
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
            <div className="flex justify-end pt-1">
              <IconButton
                label="Reset motion"
                icon={<RotateCcw />}
                disabled={locked}
                onClick={() =>
                  edit.setClipTransform(clip.id, { positionX: 0, positionY: 0, scale: 100, rotation: 0 }, 'Reset Motion')
                }
              />
            </div>
          </InspectorSection>
          <InspectorSection title="Opacity">
            {transformField({ key: 'opacity', label: 'Opacity', ...TRANSFORM_LIMITS.opacity, step: 0.5, precision: 1, unit: '%' })}
          </InspectorSection>
        </>
      ) : null}

      <InspectorSection title="Audio" note={isVideo ? 'Embedded audio' : 'Playback not supported yet'}>
        <div className="flex items-center gap-1">
          <NumberField
            className="flex-1"
            label="Volume"
            value={clip.audio.volume}
            {...AUDIO_LIMITS.volume}
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
        <NumberField label="Pan (not supported yet)" value={clip.audio.pan} {...AUDIO_LIMITS.pan} precision={0} disabled onChange={() => undefined} />
      </InspectorSection>

      <InspectorSection title="Effects">
        <p className="py-1 text-xs text-fg-subtle">Effects, keyframes and color correction are not available yet.</p>
      </InspectorSection>
    </div>
  );
}
