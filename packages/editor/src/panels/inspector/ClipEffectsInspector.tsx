import {
  AUDIO_FADE_CURVES,
  type AudioEffect,
  type FrameRate,
  type AudioFadeCurve,
  type Clip,
  type ClipEdgeTransition,
  type ClipEffects,
  getClipDuration,
  maxTransitionFramesForClip,
  type Sequence,
  type VideoEffect,
} from '@timeline/core';
import { IconButton, NumberField, Select, type SelectOption } from '@timeline/ui';
import { Trash2 } from 'lucide-react';
import { useRuntime } from '../../runtime/context';
import {
  clipEdgeFromSelectValue,
  displayNameForLibraryEffect,
  INSPECTOR_VIDEO_TRANSITION_OPTIONS,
  transitionSelectValue,
} from '../project/transition-display';
import { ClipBlurInspector } from './ClipBlurInspector';
import { InspectorSection } from './InspectorSection';
import { TimelineDurationField } from './TimelineDurationField';

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
    case 'brightness-contrast':
      return 'Brightness & Contrast';
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
    case 'library':
      return displayNameForLibraryEffect(effect.libraryId);
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
  maxFrames,
  value,
  onChange,
  onRemove,
}: {
  readonly label: string;
  readonly disabled: boolean;
  readonly frameRate: FrameRate;
  readonly maxFrames: number;
  readonly value: ClipEdgeTransition;
  readonly onChange: (next: ClipEdgeTransition) => void;
  readonly onRemove: () => void;
}) {
  const audioOnly = value.affectsVideo === false;
  return (
    <div className="space-y-2 rounded-md border border-border-subtle p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-fg">{audioOnly ? `Audio ${label.toLowerCase()}` : label}</span>
        <IconButton label="Remove transition" icon={<Trash2 />} size="xs" disabled={disabled} onClick={onRemove} />
      </div>
      <div className="grid grid-cols-[4.75rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5">
        {audioOnly ? null : (
          <>
            <span className="truncate text-xs text-fg-muted">Video</span>
            <Select
              label="Video"
              disabled={disabled}
              className="w-full min-w-0"
              value={transitionSelectValue(value)}
              options={[...INSPECTOR_VIDEO_TRANSITION_OPTIONS]}
              onValueChange={(selected) => onChange(clipEdgeFromSelectValue(selected, value))}
            />
          </>
        )}
        <TimelineDurationField
          label="Duration"
          frames={value.durationFrames}
          frameRate={frameRate}
          maxFrames={maxFrames}
          disabled={disabled}
          onChange={(durationFrames) => onChange({ ...value, durationFrames })}
        />
        <span className="truncate text-xs text-fg-muted">{audioOnly ? 'Curve' : 'Audio'}</span>
        <Select
          label="Audio curve"
          disabled={disabled}
          className="w-full min-w-0"
          value={value.audioCurve}
          options={AUDIO_CURVE_OPTIONS}
          onValueChange={(audioCurve) => onChange({ ...value, audioCurve })}
        />
      </div>
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
      {'amount' in effect && effect.kind !== 'blur' && effect.kind !== 'library' ? (
        <NumberField
          label="Amount"
          value={effect.amount}
          min={-100}
          max={100}
          step={1}
          precision={0}
          disabled={disabled}
          onChange={(amount) => onChange({ ...effect, amount } as VideoEffect)}
        />
      ) : null}
      {effect.kind === 'library' ? (
        <NumberField
          label="Amount"
          value={effect.amount}
          min={0}
          max={200}
          step={1}
          precision={0}
          disabled={disabled}
          onChange={(amount) => onChange({ ...effect, amount })}
        />
      ) : null}
      {effect.kind === 'brightness-contrast' ? (
        <>
          <NumberField
            label="Brightness"
            value={effect.brightness}
            min={-100}
            max={100}
            step={1}
            precision={0}
            disabled={disabled}
            onChange={(brightness) => onChange({ ...effect, brightness })}
          />
          <NumberField
            label="Contrast"
            value={effect.contrast}
            min={-100}
            max={100}
            step={1}
            precision={0}
            disabled={disabled}
            onChange={(contrast) => onChange({ ...effect, contrast })}
          />
        </>
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
          <NumberField
            label="Attack (ms)"
            value={effect.attackMs}
            min={0}
            max={500}
            step={1}
            precision={0}
            disabled={disabled}
            onChange={(attackMs) => onChange({ ...effect, attackMs })}
          />
          <NumberField
            label="Release (ms)"
            value={effect.releaseMs}
            min={0}
            max={1000}
            step={1}
            precision={0}
            disabled={disabled}
            onChange={(releaseMs) => onChange({ ...effect, releaseMs })}
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
  const videoEffects = effects.video.filter((e) => e.kind !== 'crop' && e.kind !== 'blur');
  const hasBlur = isVideo && effects.video.some((e) => e.kind === 'blur');
  const hasTransitions = clip.transitions.in !== null || clip.transitions.out !== null;
  const hasVideoFx = isVideo && videoEffects.length > 0;
  const hasAudioFx = (isAudioTrack || isVideo) && effects.audio.length > 0;

  if (!hasTransitions && !hasVideoFx && !hasAudioFx && !hasBlur) return null;

  const commitEffects = (next: ClipEffects, label: string) => {
    edit.setClipEffects(clip.id, next, label);
  };

  const setTransitions = (patch: { in?: ClipEdgeTransition | null; out?: ClipEdgeTransition | null }) => {
    edit.setClipTransitions(clip.id, patch, 'Change Transition');
  };
  const transitionMax = maxTransitionFramesForClip(getClipDuration(clip));

  return (
    <>
      {hasTransitions ? (
        <InspectorSection title="Transitions">
          {clip.transitions.in ? (
            <ActiveTransitionEditor
              label="In"
              frameRate={frameRate}
              maxFrames={transitionMax}
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
              maxFrames={transitionMax}
              disabled={locked}
              value={clip.transitions.out}
              onChange={(out) => setTransitions({ out })}
              onRemove={() => setTransitions({ out: null })}
            />
          ) : null}
        </InspectorSection>
      ) : null}

      {hasBlur ? <ClipBlurInspector clip={clip} locked={locked} /> : null}

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
