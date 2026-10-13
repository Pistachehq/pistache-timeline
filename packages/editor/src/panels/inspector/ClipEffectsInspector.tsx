import {
  AUDIO_FADE_CURVES,
  type AudioEffect,
  type FrameRate,
  type AudioFadeCurve,
  type Clip,
  type ClipEdgeTransition,
  type ClipEffects,
  type ClipId,
  getClipDuration,
  KEY_COLOR_PRESETS,
  type KeyControls,
  type KeyView,
  maxTransitionFramesForClip,
  parseHexColor,
  type ScreenReplaceFit,
  type Sequence,
  type VideoEffect,
} from '@timeline/core';
import { IconButton, NumberField, Select, type SelectOption } from '@timeline/ui';
import { ChevronDown, ChevronUp, Pipette, Trash2, Wand2 } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { useProjectState, useRuntime, useUiState } from '../../runtime/context';
import { detectClipKeyColor } from '../monitors/key-sampling';
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
    case 'pitch':
      return 'Pitch';
    case 'crop':
      return 'Crop';
    case 'chroma-key':
      return 'Chroma Key';
    case 'luma-key':
      return 'Luma Key';
    case 'screen-replace':
      return 'Screen Replace';
    case 'eq':
      return 'Parametric EQ';
    case 'delay':
      return 'Delay';
    case 'reverb':
      return 'Reverb';
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

interface FieldSpec<T> {
  readonly key: keyof T & string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly precision: number;
  readonly unit?: string;
}

type NumericKeys<T> = { [K in keyof T]: T[K] extends number ? K : never }[keyof T] & string;

function field<T>(
  key: NumericKeys<T>,
  label: string,
  min: number,
  max: number,
  step = 1,
  precision = 0,
  unit?: string,
): FieldSpec<T> {
  return unit ? { key, label, min, max, step, precision, unit } : { key, label, min, max, step, precision };
}

type Of<K extends VideoEffect['kind']> = VideoEffect & { kind: K };
type AudioOf<K extends AudioEffect['kind']> = AudioEffect & { kind: K };

const KEY_FIELDS: readonly FieldSpec<KeyControls>[] = [
  field<KeyControls>('tolerance', 'Tolerance', 0, 100),
  field<KeyControls>('softness', 'Edge softness', 0, 100),
  field<KeyControls>('spill', 'Spill suppression', 0, 100),
  field<KeyControls>('choke', 'Choke', 0, 100),
];

function videoFields(effect: VideoEffect): readonly FieldSpec<VideoEffect>[] {
  const cast = <K extends VideoEffect['kind']>(specs: FieldSpec<Of<K>>[]) => specs as unknown as FieldSpec<VideoEffect>[];
  switch (effect.kind) {
    case 'brightness':
    case 'contrast':
    case 'saturation':
      return cast<'brightness'>([field('amount', 'Amount', -100, 100)]);
    case 'hue-rotate':
      return cast<'hue-rotate'>([field('degrees', 'Angle', -180, 180, 1, 0, '°')]);
    case 'vignette':
      return cast<'vignette'>([
        field('amount', 'Amount', -100, 100),
        field('size', 'Size', 0, 100),
        field('feather', 'Feather', 0, 100),
      ]);
    case 'sharpen':
      return cast<'sharpen'>([field('amount', 'Amount', 0, 200), field('radius', 'Radius', 0.5, 5, 0.1, 1, 'px')]);
    case 'round-corners':
      return cast<'round-corners'>([field('radius', 'Radius', 0, 1000, 1, 0, 'px')]);
    case 'brightness-contrast':
      return cast<'brightness-contrast'>([
        field('brightness', 'Brightness', -100, 100),
        field('contrast', 'Contrast', -100, 100),
      ]);
    case 'luma-key':
      return cast<'luma-key'>([field('threshold', 'Threshold', 0, 100), field('softness', 'Softness', 0, 100)]);
    case 'library':
      return cast<'library'>([field('amount', 'Amount', 0, 200)]);
    default:
      return [];
  }
}

function audioFields(effect: AudioEffect): readonly FieldSpec<AudioEffect>[] {
  const cast = <K extends AudioEffect['kind']>(specs: FieldSpec<AudioOf<K>>[]) => specs as unknown as FieldSpec<AudioEffect>[];
  switch (effect.kind) {
    case 'gain':
      return cast<'gain'>([field('gainDb', 'Gain', -24, 24, 0.5, 1, 'dB')]);
    case 'highpass':
    case 'lowpass':
      return cast<'highpass'>([
        field('frequencyHz', 'Frequency', 20, 20_000, 10, 0, 'Hz'),
        field('q', 'Resonance (Q)', 0.1, 18, 0.05, 2),
      ]);
    case 'eq':
      return cast<'eq'>([
        field('lowGainDb', 'Low gain', -24, 24, 0.5, 1, 'dB'),
        field('lowFrequencyHz', 'Low frequency', 20, 1000, 5, 0, 'Hz'),
        field('midGainDb', 'Mid gain', -24, 24, 0.5, 1, 'dB'),
        field('midFrequencyHz', 'Mid frequency', 100, 10_000, 10, 0, 'Hz'),
        field('midQ', 'Mid width (Q)', 0.1, 18, 0.05, 2),
        field('highGainDb', 'High gain', -24, 24, 0.5, 1, 'dB'),
        field('highFrequencyHz', 'High frequency', 1000, 20_000, 50, 0, 'Hz'),
      ]);
    case 'compressor':
      return cast<'compressor'>([
        field('thresholdDb', 'Threshold', -60, 0, 1, 0, 'dB'),
        field('ratio', 'Ratio', 1, 20, 0.5, 1, ':1'),
        field('kneeDb', 'Knee', 0, 40, 1, 0, 'dB'),
        field('attackMs', 'Attack', 0, 500, 1, 0, 'ms'),
        field('releaseMs', 'Release', 0, 1000, 5, 0, 'ms'),
        field('makeupDb', 'Makeup gain', 0, 24, 0.5, 1, 'dB'),
      ]);
    case 'noise-gate':
      return cast<'noise-gate'>([
        field('thresholdDb', 'Threshold', -80, 0, 1, 0, 'dB'),
        field('rangeDb', 'Range', -80, 0, 1, 0, 'dB'),
        field('attackMs', 'Attack', 0, 200, 0.5, 1, 'ms'),
        field('releaseMs', 'Release', 5, 2000, 5, 0, 'ms'),
      ]);
    case 'limiter':
      return cast<'limiter'>([
        field('ceilingDb', 'Ceiling', -12, 0, 0.5, 1, 'dB'),
        field('releaseMs', 'Release', 1, 1000, 1, 0, 'ms'),
      ]);
    case 'delay':
      return cast<'delay'>([
        field('timeMs', 'Time', 1, 2000, 5, 0, 'ms'),
        field('feedback', 'Feedback', 0, 90, 1, 0, '%'),
        field('mix', 'Mix', 0, 100, 1, 0, '%'),
      ]);
    case 'reverb':
      return cast<'reverb'>([
        field('size', 'Room size', 0, 100),
        field('damping', 'Damping', 0, 100),
        field('mix', 'Mix', 0, 100, 1, 0, '%'),
      ]);
    case 'pitch':
      return cast<'pitch'>([field('amount', 'Pitch', -100, 100)]);
    default:
      return [];
  }
}

interface RowProps<T> {
  readonly effect: T;
  readonly disabled: boolean;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
  readonly onChange: (effect: T) => void;
  readonly onRemove: () => void;
  readonly onMove: (delta: -1 | 1) => void;
  readonly onScrubStart: () => void;
  readonly onScrubEnd: () => void;
}

function EffectCard<T>({
  title,
  props,
  children,
}: {
  readonly title: string;
  readonly props: RowProps<T>;
  readonly children: ReactNode;
}) {
  return (
    <div className="space-y-1.5 rounded-md border border-border-subtle p-2">
      <div className="flex items-center justify-between gap-1">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-fg">{title}</span>
        <IconButton
          label="Move effect up"
          icon={<ChevronUp />}
          size="xs"
          disabled={props.disabled || !props.canMoveUp}
          onClick={() => props.onMove(-1)}
        />
        <IconButton
          label="Move effect down"
          icon={<ChevronDown />}
          size="xs"
          disabled={props.disabled || !props.canMoveDown}
          onClick={() => props.onMove(1)}
        />
        <IconButton label="Remove effect" icon={<Trash2 />} size="xs" disabled={props.disabled} onClick={props.onRemove} />
      </div>
      {children}
    </div>
  );
}

function Fields<T>({ specs, props }: { readonly specs: readonly FieldSpec<T>[]; readonly props: RowProps<T> }) {
  return (
    <>
      {specs.map((spec) => (
        <NumberField
          key={spec.key}
          label={spec.label}
          value={props.effect[spec.key] as number}
          min={spec.min}
          max={spec.max}
          step={spec.step}
          precision={spec.precision}
          {...(spec.unit ? { unit: spec.unit } : {})}
          disabled={props.disabled}
          onScrubStart={props.onScrubStart}
          onScrubEnd={props.onScrubEnd}
          onChange={(value) => props.onChange({ ...props.effect, [spec.key]: value })}
        />
      ))}
    </>
  );
}

const FIT_OPTIONS: SelectOption<ScreenReplaceFit>[] = [
  { value: 'corners', label: 'Track screen corners' },
  { value: 'box', label: 'Fill screen bounds' },
  { value: 'frame', label: 'Fill whole frame' },
];

const VIEW_OPTIONS: SelectOption<KeyView>[] = [
  { value: 'final', label: 'Composite' },
  { value: 'matte', label: 'Alpha matte' },
];

function KeyColorControls<T extends KeyControls>({
  clipId,
  effectIndex,
  props,
}: {
  readonly clipId: ClipId;
  readonly effectIndex: number;
  readonly props: RowProps<T>;
}) {
  const runtime = useRuntime();
  const picking = useUiState((s) => s.keyColorPick?.clipId === clipId && s.keyColorPick.effectIndex === effectIndex);
  const { effect, disabled, onChange } = props;

  useEffect(() => {
    if (!picking) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') runtime.stores.ui.getState().setKeyColorPick(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picking, runtime]);

  const detect = () => {
    const [r, g, b] = parseHexColor(effect.color);
    const color = detectClipKeyColor(clipId, b > g && b > r ? 'blue' : 'green') ?? detectClipKeyColor(clipId, 'any');
    if (color) onChange({ ...effect, color });
    else runtime.stores.ui.getState().notify('No green or blue screen found at the playhead. Use the eyedropper.', 'warning');
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">Key color</span>
        <input
          aria-label="Key color"
          type="color"
          disabled={disabled}
          value={effect.color}
          className="h-6 w-9 cursor-pointer rounded-xs border border-line-strong bg-transparent"
          onChange={(event) => onChange({ ...effect, color: event.target.value.toLowerCase() })}
        />
        <IconButton
          label={picking ? 'Cancel color pick' : 'Pick the key color in the Program monitor'}
          icon={<Pipette />}
          size="xs"
          pressed={picking}
          disabled={disabled}
          onClick={() =>
            runtime.stores.ui.getState().setKeyColorPick(picking ? null : { clipId, effectIndex })
          }
        />
        <IconButton label="Detect the screen color" icon={<Wand2 />} size="xs" disabled={disabled} onClick={detect} />
      </div>
      {picking ? (
        <p className="text-2xs text-accent">Click the screen color on the clip in the Program monitor. Esc cancels.</p>
      ) : null}
      <div className="flex gap-1">
        <button
          type="button"
          disabled={disabled}
          className="flex-1 rounded-sm border border-line px-1.5 py-0.5 text-2xs text-fg-muted hover:bg-surface-3 disabled:opacity-40"
          onClick={() => onChange({ ...effect, color: KEY_COLOR_PRESETS.green })}
        >
          Green screen
        </button>
        <button
          type="button"
          disabled={disabled}
          className="flex-1 rounded-sm border border-line px-1.5 py-0.5 text-2xs text-fg-muted hover:bg-surface-3 disabled:opacity-40"
          onClick={() => onChange({ ...effect, color: KEY_COLOR_PRESETS.blue })}
        >
          Blue screen
        </button>
      </div>
      <Fields specs={KEY_FIELDS as unknown as readonly FieldSpec<T>[]} props={props} />
    </div>
  );
}

function VideoEffectRow({
  clip,
  effectIndex,
  props,
}: {
  readonly clip: Clip;
  readonly effectIndex: number;
  readonly props: RowProps<VideoEffect>;
}) {
  const assets = useProjectState((s) => s.project.mediaAssets);
  const { effect, disabled, onChange } = props;

  if (effect.kind === 'chroma-key') {
    const keyProps = props as unknown as RowProps<Of<'chroma-key'>>;
    return (
      <EffectCard title="Chroma Key" props={props}>
        <KeyColorControls clipId={clip.id} effectIndex={effectIndex} props={keyProps} />
        <div className="grid grid-cols-[4.75rem_minmax(0,1fr)] items-center gap-x-2">
          <span className="truncate text-xs text-fg-muted">View</span>
          <Select
            label="Key view"
            disabled={disabled}
            className="w-full min-w-0"
            value={effect.view}
            options={VIEW_OPTIONS}
            onValueChange={(view) => onChange({ ...effect, view })}
          />
        </div>
      </EffectCard>
    );
  }

  if (effect.kind === 'screen-replace') {
    const keyProps = props as unknown as RowProps<Of<'screen-replace'>>;
    const sources: SelectOption<string>[] = [
      { value: '', label: 'None (transparent)' },
      ...Object.values(assets)
        .filter((asset) => asset.kind !== 'audio' && asset.id !== clip.assetId)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((asset) => ({ value: asset.id, label: asset.name })),
    ];
    return (
      <EffectCard title="Screen Replace" props={props}>
        <div className="grid grid-cols-[4.75rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5">
          <span className="truncate text-xs text-fg-muted">Source</span>
          <Select
            label="Replacement source"
            disabled={disabled}
            className="w-full min-w-0"
            value={effect.sourceAssetId ?? ''}
            options={sources}
            onValueChange={(value) => onChange({ ...effect, sourceAssetId: value || null })}
          />
          <span className="truncate text-xs text-fg-muted">Fit</span>
          <Select
            label="Replacement fit"
            disabled={disabled}
            className="w-full min-w-0"
            value={effect.fit}
            options={FIT_OPTIONS}
            onValueChange={(fit) => onChange({ ...effect, fit })}
          />
        </div>
        <KeyColorControls clipId={clip.id} effectIndex={effectIndex} props={keyProps} />
        {effect.seedX !== null ? (
          <div className="flex items-center justify-between gap-2 text-2xs text-fg-subtle">
            <span>Replacing the screen you picked.</span>
            <button
              type="button"
              disabled={disabled}
              className="rounded-sm px-1.5 py-0.5 hover:bg-surface-3 hover:text-fg"
              onClick={() => onChange({ ...effect, seedX: null, seedY: null })}
            >
              Use largest
            </button>
          </div>
        ) : (
          <p className="text-2xs text-fg-subtle">Replacing the largest area of the key color.</p>
        )}
      </EffectCard>
    );
  }

  return (
    <EffectCard title={effectTitle(effect)} props={props}>
      <Fields specs={videoFields(effect)} props={props} />
      {effect.kind === 'luma-key' ? (
        <label className="flex items-center gap-2 text-xs text-fg-muted">
          <input
            type="checkbox"
            className="size-3 accent-accent"
            disabled={disabled}
            checked={effect.invert}
            onChange={(event) => onChange({ ...effect, invert: event.target.checked })}
          />
          Key out bright areas instead
        </label>
      ) : null}
      {effect.kind === 'vignette' ? (
        <p className="text-2xs text-fg-subtle">Negative amounts lighten the edges instead.</p>
      ) : null}
    </EffectCard>
  );
}

function AudioEffectRow({ props }: { readonly props: RowProps<AudioEffect> }) {
  const { effect } = props;
  return (
    <EffectCard title={effectTitle(effect)} props={props}>
      <Fields specs={audioFields(effect)} props={props} />
      {effect.kind === 'pitch' ? (
        <p className="text-2xs text-fg-subtle">0 is the original pitch. 100 raises it an octave, −100 lowers it an octave.</p>
      ) : null}
      {effect.kind === 'noise-gate' ? (
        <p className="text-2xs text-fg-subtle">The gate always runs first in the chain.</p>
      ) : null}
    </EffectCard>
  );
}

function moveItem<T>(items: readonly T[], index: number, delta: -1 | 1): T[] {
  const next = [...items];
  const target = index + delta;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
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
          {videoEffects.map((effect, listIndex) => {
            const realIndex = effects.video.indexOf(effect);
            const neighbor = (delta: -1 | 1) => videoEffects[listIndex + delta];
            return (
              <VideoEffectRow
                key={`${effect.kind}-${realIndex}`}
                clip={clip}
                effectIndex={realIndex}
                props={{
                  effect,
                  disabled: locked,
                  canMoveUp: listIndex > 0,
                  canMoveDown: listIndex < videoEffects.length - 1,
                  onScrubStart: () => edit.beginTransaction('Change Video Effect'),
                  onScrubEnd: () => edit.commitTransaction(),
                  onChange: (next) => {
                    const video = effects.video.map((e, i) => (i === realIndex ? next : e));
                    commitEffects({ ...effects, video }, 'Change Video Effect');
                  },
                  onRemove: () => {
                    const video = effects.video.filter((_, i) => i !== realIndex);
                    commitEffects({ ...effects, video }, 'Remove Video Effect');
                  },
                  onMove: (delta) => {
                    const other = neighbor(delta);
                    if (!other) return;
                    const otherIndex = effects.video.indexOf(other);
                    const video = [...effects.video];
                    video[realIndex] = other;
                    video[otherIndex] = effect;
                    commitEffects({ ...effects, video }, 'Reorder Video Effects');
                  },
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
              props={{
                effect,
                disabled: locked,
                canMoveUp: index > 0,
                canMoveDown: index < effects.audio.length - 1,
                onScrubStart: () => edit.beginTransaction('Change Audio Effect'),
                onScrubEnd: () => edit.commitTransaction(),
                onChange: (next) => {
                  const audio = effects.audio.map((e, i) => (i === index ? next : e));
                  commitEffects({ ...effects, audio }, 'Change Audio Effect');
                },
                onRemove: () => {
                  const audio = effects.audio.filter((_, i) => i !== index);
                  commitEffects({ ...effects, audio }, 'Remove Audio Effect');
                },
                onMove: (delta) => commitEffects({ ...effects, audio: moveItem(effects.audio, index, delta) }, 'Reorder Audio Effects'),
              }}
            />
          ))}
        </InspectorSection>
      ) : null}
    </>
  );
}
