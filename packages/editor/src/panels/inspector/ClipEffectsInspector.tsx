import {
  AUDIO_FADE_CURVES,
  type AudioEffect,
  type FrameRate,
  type AudioFadeCurve,
  type Clip,
  type ClipEdgeTransition,
  type ClipEffects,
  type Sequence,
  type VideoEffect,
  type VideoTransitionKind,
} from '@timeline/core';
import { IconButton, NumberField, Select, type SelectOption } from '@timeline/ui';
import { Trash2 } from 'lucide-react';
import { useRuntime } from '../../runtime/context';
import { InspectorSection } from './InspectorSection';
import { TimelineDurationField } from './TimelineDurationField';

const VIDEO_TRANSITION_LABELS: Record<VideoTransitionKind, string> = {
  none: 'None',
  fade: 'Fade',
  'dip-black': 'Dip to black',
  'cross-dissolve': 'Cross dissolve',
};

const AUDIO_CURVE_OPTIONS: SelectOption<AudioFadeCurve>[] = AUDIO_FADE_CURVES.map((curve) => ({
  value: curve,
  label:
    curve === 'constant-power'
      ? 'Constant power'
      : curve === 'exponential'
        ? 'Exponential'
        : curve === 'logarithmic'
          ? 'Logarithmic'
          : 'Linear',
}));

const VIDEO_TRANSITION_OPTIONS: SelectOption<VideoTransitionKind>[] = (
  ['fade', 'dip-black', 'cross-dissolve'] as const
).map((value) => ({ value, label: VIDEO_TRANSITION_LABELS[value] }));

function effectTitle(effect: VideoEffect | AudioEffect): string {
  switch (effect.kind) {
    case 'blur':
      return 'Blur';
    case 'brightness':
      return 'Brightness';
    case 'contrast':
      return 'Contrast';
    case 'saturation':
      return 'Saturation';
    case 'hue-rotate':
      return 'Hue rotate';
    case 'vignette':
      return 'Vignette';
    case 'sharpen':
      return 'Sharpen';
    case 'round-corners':
      return 'Round corners';
    case 'gain':
      return 'Gain';
    case 'highpass':
      return 'High-pass';
    case 'lowpass':
      return 'Low-pass';
    case 'compressor':
      return 'Compressor';
    case 'noise-gate':
      return 'Noise gate';
    case 'limiter':
      return 'Limiter';
    case 'crop':
      return 'Crop';
    default: {
      const _exhaustive: never = effect;
      return _exhaustive;
    }
  }
}

function ActiveTransitionEditor({
  label,
  disabled,
  frameRate,
  value,
  onChange,
  onRemove,
}: {
  readonly label: string;
  readonly disabled: boolean;
  readonly frameRate: FrameRate;
  readonly value: ClipEdgeTransition;
  readonly onChange: (next: ClipEdgeTransition) => void;
  readonly onRemove: () => void;
}) {
  return (
    <div className="space-y-2 rounded-md border border-border-subtle p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-fg">{label}</span>
        <IconButton label="Remove transition" icon={<Trash2 />} size="xs" disabled={disabled} onClick={onRemove} />
      </div>
      <Select
        label="Video"
        disabled={disabled}
        value={value.videoKind}
        options={VIDEO_TRANSITION_OPTIONS}
        onValueChange={(videoKind) => onChange({ ...value, videoKind })}
      />
      <TimelineDurationField
        label="Duration"
        frames={value.durationFrames}
        frameRate={frameRate}
        disabled={disabled}
        onChange={(durationFrames) => onChange({ ...value, durationFrames })}
      />
      <Select
        label="Audio"
        disabled={disabled}
        value={value.audioCurve}
        options={AUDIO_CURVE_OPTIONS}
        onValueChange={(audioCurve) => onChange({ ...value, audioCurve })}
      />
    </div>
  );
}

function VideoEffectRow({
  effect,
  disabled,
  onChange,
  onRemove,
}: {
  effect: VideoEffect;
  disabled: boolean;
  onChange: (effect: VideoEffect) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-1.5 rounded-md border border-border-subtle p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-fg">{effectTitle(effect)}</span>
        <IconButton label="Remove effect" icon={<Trash2 />} size="xs" disabled={disabled} onClick={onRemove} />
      </div>
      {'amount' in effect ? (
        <NumberField
          label="Amount"
          value={effect.amount}
          min={effect.kind === 'blur' ? 0 : -100}
          max={100}
          step={1}
          precision={0}
          disabled={disabled}
          onChange={(amount) => onChange({ ...effect, amount } as VideoEffect)}
        />
      ) : null}
      {effect.kind === 'hue-rotate' ? (
        <NumberField
          label="Degrees"
          value={effect.degrees}
          min={-180}
          max={180}
          step={1}
          precision={0}
          disabled={disabled}
          onChange={(degrees) => onChange({ ...effect, degrees })}
        />
      ) : null}
      {effect.kind === 'round-corners' ? (
        <NumberField
          label="Radius (px)"
          value={effect.radius}
          min={0}
          max={400}
          step={1}
          precision={0}
          disabled={disabled}
          onChange={(radius) => onChange({ ...effect, radius })}
        />
      ) : null}
    </div>
  );
}

function AudioEffectRow({
  effect,
  disabled,
  onChange,
  onRemove,
}: {
  effect: AudioEffect;
  disabled: boolean;
  onChange: (effect: AudioEffect) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-1.5 rounded-md border border-border-subtle p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-fg">{effectTitle(effect)}</span>
        <IconButton label="Remove effect" icon={<Trash2 />} size="xs" disabled={disabled} onClick={onRemove} />
      </div>
      {effect.kind === 'gain' ? (
        <NumberField
          label="Gain (dB)"
          value={effect.gainDb}
          min={-24}
          max={24}
          step={0.5}
          precision={1}
          disabled={disabled}
          onChange={(gainDb) => onChange({ ...effect, gainDb })}
        />
      ) : null}
      {effect.kind === 'highpass' || effect.kind === 'lowpass' ? (
        <NumberField
          label="Frequency (Hz)"
          value={effect.frequencyHz}
          min={20}
          max={20_000}
          step={10}
          precision={0}
          disabled={disabled}
          onChange={(frequencyHz) => onChange({ ...effect, frequencyHz })}
        />
      ) : null}
      {effect.kind === 'compressor' ? (
        <>
          <NumberField
            label="Threshold (dB)"
            value={effect.thresholdDb}
            min={-60}
            max={0}
            step={1}
            precision={0}
            disabled={disabled}
            onChange={(thresholdDb) => onChange({ ...effect, thresholdDb })}
          />
          <NumberField
            label="Ratio"
            value={effect.ratio}
            min={1}
            max={20}
            step={0.5}
            precision={1}
            disabled={disabled}
            onChange={(ratio) => onChange({ ...effect, ratio })}
          />
        </>
      ) : null}
      {effect.kind === 'noise-gate' ? (
        <NumberField
          label="Threshold (dB)"
          value={effect.thresholdDb}
          min={-80}
          max={0}
          step={1}
          precision={0}
          disabled={disabled}
          onChange={(thresholdDb) => onChange({ ...effect, thresholdDb })}
        />
      ) : null}
      {effect.kind === 'limiter' ? (
        <NumberField
          label="Ceiling (dB)"
          value={effect.ceilingDb}
          min={-12}
          max={0}
          step={0.5}
          precision={1}
          disabled={disabled}
          onChange={(ceilingDb) => onChange({ ...effect, ceilingDb })}
        />
      ) : null}
    </div>
  );
}

export function ClipEffectsInspector({
  clip,
  sequence,
  locked,
  isVideo,
  isAudioTrack,
}: {
  clip: Clip;
  sequence: Sequence;
  locked: boolean;
  isVideo: boolean;
  isAudioTrack: boolean;
}) {
  const frameRate = sequence.frameRate;
  const { edit } = useRuntime().actions;
  const effects = clip.effects;
  const videoEffects = effects.video.filter((e) => e.kind !== 'crop');
  const hasTransitions = clip.transitions.in !== null || clip.transitions.out !== null;
  const hasVideoFx = isVideo && videoEffects.length > 0;
  const hasAudioFx = (isAudioTrack || isVideo) && effects.audio.length > 0;

  if (!hasTransitions && !hasVideoFx && !hasAudioFx) return null;

  const commitEffects = (next: ClipEffects, label: string) => {
    edit.setClipEffects(clip.id, next, label);
  };

  const setTransitions = (patch: { in?: ClipEdgeTransition | null; out?: ClipEdgeTransition | null }) => {
    edit.setClipTransitions(clip.id, patch, 'Change Transition');
  };

  return (
    <>
      {hasTransitions ? (
        <InspectorSection title="Transitions">
          {clip.transitions.in ? (
            <ActiveTransitionEditor
              label="In"
              frameRate={frameRate}
              disabled={locked}
              value={clip.transitions.in}
              onChange={(inEdge) => setTransitions({ in: inEdge })}
              onRemove={() => setTransitions({ in: null })}
            />
          ) : null}
          {clip.transitions.out ? (
            <ActiveTransitionEditor
              label="Out"
              frameRate={frameRate}
              disabled={locked}
              value={clip.transitions.out}
              onChange={(out) => setTransitions({ out })}
              onRemove={() => setTransitions({ out: null })}
            />
          ) : null}
        </InspectorSection>
      ) : null}

      {hasVideoFx ? (
        <InspectorSection title="Video effects">
          {videoEffects.map((effect) => {
            const realIndex = effects.video.indexOf(effect);
            return (
              <VideoEffectRow
                key={`${effect.kind}-${realIndex}`}
                effect={effect}
                disabled={locked}
                onChange={(next) => {
                  const video = effects.video.map((e, i) => (i === realIndex ? next : e));
                  commitEffects({ ...effects, video }, 'Change Video Effect');
                }}
                onRemove={() => {
                  const video = effects.video.filter((_, i) => i !== realIndex);
                  commitEffects({ ...effects, video }, 'Remove Video Effect');
                }}
              />
            );
          })}
        </InspectorSection>
      ) : null}

      {hasAudioFx ? (
        <InspectorSection title="Audio effects">
          {effects.audio.map((effect, index) => (
            <AudioEffectRow
              key={`${effect.kind}-${index}`}
              effect={effect}
              disabled={locked}
              onChange={(next) => {
                const audio = effects.audio.map((e, i) => (i === index ? next : e));
                commitEffects({ ...effects, audio }, 'Change Audio Effect');
              }}
              onRemove={() => {
                const audio = effects.audio.filter((_, i) => i !== index);
                commitEffects({ ...effects, audio }, 'Remove Audio Effect');
              }}
            />
          ))}
        </InspectorSection>
      ) : null}
    </>
  );
}
