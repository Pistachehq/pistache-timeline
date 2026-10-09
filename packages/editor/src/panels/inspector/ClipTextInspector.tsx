import {
  getClipDuration,
  maxTransitionFramesForClip,
  TEXT_ANIMATION_IDS,
  TRANSFORM_LIMITS,
  type Clip,
  type ClipText,
} from '@timeline/core';
import { NumberField, Select } from '@timeline/ui';
import { useRef, type ReactNode } from 'react';
import { useRuntime } from '../../runtime/context';
import { useActiveSequence } from '../../runtime/hooks';
import { TEXT_ANIMATION_LABELS } from '../project/text-animation-label';
import { InspectorSection } from './InspectorSection';
import { TimelineDurationField } from './TimelineDurationField';
import { ensureCustomFont, TEXT_FONT_FAMILIES } from './text-fonts';

function IconToggle({
  label,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      className={`flex h-7 w-7 items-center justify-center rounded-sm border ${
        pressed ? 'border-accent bg-accent/20 text-fg' : 'border-line-strong text-fg-muted hover:text-fg'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function AlignLines({ mode }: { mode: 'left' | 'center' | 'right' | 'justify' }) {
  const widths = mode === 'justify' ? ['100%', '100%', '100%'] : mode === 'center' ? ['70%', '100%', '55%'] : ['78%', '100%', '62%'];
  const align = mode === 'right' ? 'flex-end' : mode === 'center' ? 'center' : 'flex-start';
  return (
    <span className="flex w-3.5 flex-col gap-0.5" style={{ alignItems: align }}>
      {widths.map((width, index) => (
        <span key={index} className="h-px bg-current" style={{ width }} />
      ))}
    </span>
  );
}

function FrameCenterIcon({ axis }: { axis: 'horizontal' | 'vertical' }) {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
      <rect x="2.5" y="3.5" width="11" height="9" fill="none" stroke="currentColor" strokeWidth="1.2" />
      {axis === 'horizontal' ? (
        <line x1="8" y1="1.5" x2="8" y2="14.5" stroke="currentColor" strokeWidth="1.2" />
      ) : (
        <line x1="1.5" y1="8" x2="14.5" y2="8" stroke="currentColor" strokeWidth="1.2" />
      )}
    </svg>
  );
}

function Toggle({
  label,
  pressed,
  disabled,
  onClick,
}: {
  label: string;
  pressed: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      className={`h-6 rounded-sm border px-2 text-xs ${pressed ? 'border-accent bg-accent/20 text-fg' : 'border-line-strong text-fg-muted'}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function ClipTextInspector({ clip, locked }: { readonly clip: Clip; readonly locked: boolean }) {
  const text = clip.text;
  const runtime = useRuntime();
  const sequence = useActiveSequence();
  const fileRef = useRef<HTMLInputElement>(null);
  if (!text) return null;

  const { edit } = runtime.actions;
  const patch = (partial: Partial<ClipText>, label: string) => edit.setClipText(clip.id, partial, label);

  const fontOptions = [
    ...(text.fontDataUrl && !TEXT_FONT_FAMILIES.includes(text.fontFamily as (typeof TEXT_FONT_FAMILIES)[number])
      ? [{ value: text.fontFamily, label: text.fontFamily }]
      : []),
    ...TEXT_FONT_FAMILIES.map((family) => ({ value: family, label: family })),
  ];

  const onUpload = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : null;
      if (!dataUrl) return;
      const family = file.name.replace(/\.[^.]+$/, '') || 'Custom';
      void ensureCustomFont(family, dataUrl).then(() => {
        patch({ fontFamily: family, fontDataUrl: dataUrl }, 'Upload Font');
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <InspectorSection title="Text">
      <label className="block space-y-1">
        <span className="text-xs text-fg-muted">Text</span>
        <textarea
          aria-label="Text"
          value={text.content}
          disabled={locked}
          rows={3}
          className="w-full resize-y rounded-sm border border-line-strong bg-surface-3 px-1.5 py-1 text-xs text-fg"
          onChange={(event) => patch({ content: event.target.value }, 'Edit Text')}
        />
      </label>
      <Select
        label="Font"
        disabled={locked}
        className="w-full"
        value={text.fontFamily}
        options={fontOptions}
        onValueChange={(fontFamily) => patch({ fontFamily, fontDataUrl: null }, 'Change Font')}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={locked}
          className="h-6 rounded-sm border border-line-strong px-2 text-xs text-fg-muted hover:text-fg"
          onClick={() => fileRef.current?.click()}
        >
          Upload font
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
          className="hidden"
          onChange={(event) => {
            onUpload(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </div>
      <NumberField
        label="Font size"
        value={text.fontSize}
        min={8}
        max={400}
        step={1}
        precision={0}
        unit="px"
        disabled={locked}
        onChange={(fontSize) => patch({ fontSize }, 'Change Font Size')}
      />
      <NumberField
        label="Scale"
        value={clip.transform.scaleX}
        {...TRANSFORM_LIMITS.scale}
        step={1}
        precision={0}
        unit="%"
        disabled={locked}
        onChange={(scale) =>
          edit.setClipTransform(clip.id, { scaleX: scale, scaleY: scale, uniformScale: true }, 'Change Scale')
        }
      />
      <label className="flex items-center justify-between gap-2 text-xs text-fg-muted">
        Color
        <input
          aria-label="Font color"
          type="color"
          disabled={locked}
          value={text.color}
          className="h-6 w-10 cursor-pointer border border-line-strong bg-transparent"
          onChange={(event) => patch({ color: event.target.value }, 'Change Text Color')}
        />
      </label>
      <div className="flex flex-wrap gap-1">
        <Toggle label="Bold" pressed={text.bold} disabled={locked} onClick={() => patch({ bold: !text.bold }, 'Change Text Style')} />
        <Toggle label="Italic" pressed={text.italic} disabled={locked} onClick={() => patch({ italic: !text.italic }, 'Change Text Style')} />
        <Toggle
          label="Underline"
          pressed={text.underline}
          disabled={locked}
          onClick={() => patch({ underline: !text.underline }, 'Change Text Style')}
        />
        <Toggle
          label="Strike"
          pressed={text.strike}
          disabled={locked}
          onClick={() => patch({ strike: !text.strike }, 'Change Text Style')}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <IconToggle
          label="Align left"
          pressed={text.align === 'left'}
          disabled={locked}
          onClick={() => patch({ align: 'left' }, 'Align Left')}
        >
          <AlignLines mode="left" />
        </IconToggle>
        <IconToggle
          label="Align center"
          pressed={text.align === 'center'}
          disabled={locked}
          onClick={() => patch({ align: 'center' }, 'Align Center')}
        >
          <AlignLines mode="center" />
        </IconToggle>
        <IconToggle
          label="Align right"
          pressed={text.align === 'right'}
          disabled={locked}
          onClick={() => patch({ align: 'right' }, 'Align Right')}
        >
          <AlignLines mode="right" />
        </IconToggle>
        <IconToggle
          label="Justify"
          pressed={text.align === 'justify'}
          disabled={locked}
          onClick={() => patch({ align: 'justify' }, 'Justify Text')}
        >
          <AlignLines mode="justify" />
        </IconToggle>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <IconToggle
          label="Center horizontally"
          disabled={locked}
          pressed={clip.transform.positionX === 0}
          onClick={() => edit.setClipTransform(clip.id, { positionX: 0 }, 'Center Horizontally')}
        >
          <FrameCenterIcon axis="horizontal" />
        </IconToggle>
        <IconToggle
          label="Center vertically"
          disabled={locked}
          pressed={clip.transform.positionY === 0}
          onClick={() => edit.setClipTransform(clip.id, { positionY: 0 }, 'Center Vertically')}
        >
          <FrameCenterIcon axis="vertical" />
        </IconToggle>
      </div>
      <NumberField
        label="Letter spacing"
        value={text.letterSpacing}
        min={-8}
        max={40}
        step={0.5}
        precision={1}
        unit="px"
        disabled={locked}
        onChange={(letterSpacing) => patch({ letterSpacing }, 'Change Letter Spacing')}
      />
      <label className="flex items-center gap-2 text-xs text-fg-muted">
        <input
          type="checkbox"
          disabled={locked}
          checked={text.shadow !== null}
          onChange={(event) =>
            patch(
              {
                shadow: event.target.checked
                  ? { color: '#000000cc', offsetX: 0, offsetY: 3, blur: 10 }
                  : null,
              },
              'Change Text Shadow',
            )
          }
        />
        Shadow
      </label>
      {text.shadow ? (
        <>
          <label className="flex items-center justify-between gap-2 text-xs text-fg-muted">
            Shadow color
            <input
              aria-label="Shadow color"
              type="color"
              disabled={locked}
              value={text.shadow.color.slice(0, 7)}
              className="h-6 w-10 cursor-pointer border border-line-strong bg-transparent"
              onChange={(event) =>
                patch({ shadow: { ...text.shadow!, color: event.target.value } }, 'Change Text Shadow')
              }
            />
          </label>
          <NumberField
            label="Shadow X"
            value={text.shadow.offsetX}
            min={-40}
            max={40}
            step={1}
            precision={0}
            disabled={locked}
            onChange={(offsetX) => patch({ shadow: { ...text.shadow!, offsetX } }, 'Change Text Shadow')}
          />
          <NumberField
            label="Shadow Y"
            value={text.shadow.offsetY}
            min={-40}
            max={40}
            step={1}
            precision={0}
            disabled={locked}
            onChange={(offsetY) => patch({ shadow: { ...text.shadow!, offsetY } }, 'Change Text Shadow')}
          />
          <NumberField
            label="Shadow blur"
            value={text.shadow.blur}
            min={0}
            max={40}
            step={1}
            precision={0}
            disabled={locked}
            onChange={(blur) => patch({ shadow: { ...text.shadow!, blur } }, 'Change Text Shadow')}
          />
        </>
      ) : null}
      <NumberField
        label="Outline"
        value={text.outlineWidth}
        min={0}
        max={16}
        step={0.5}
        precision={1}
        unit="px"
        disabled={locked}
        onChange={(outlineWidth) => patch({ outlineWidth }, 'Change Text Outline')}
      />
      {text.outlineWidth > 0 ? (
        <label className="flex items-center justify-between gap-2 text-xs text-fg-muted">
          Outline color
          <input
            aria-label="Outline color"
            type="color"
            disabled={locked}
            value={text.outlineColor}
            className="h-6 w-10 cursor-pointer border border-line-strong bg-transparent"
            onChange={(event) => patch({ outlineColor: event.target.value }, 'Change Text Outline')}
          />
        </label>
      ) : null}
      <Select
        label="Text transition"
        disabled={locked}
        className="w-full"
        value={text.animation}
        options={TEXT_ANIMATION_IDS.map((id) => ({ value: id, label: TEXT_ANIMATION_LABELS[id] }))}
        onValueChange={(animation) => patch({ animation }, 'Change Text Transition')}
      />
      {text.animation !== 'none' && sequence ? (
        <div className="grid grid-cols-[4.75rem_minmax(0,1fr)] items-center gap-x-2">
          <TimelineDurationField
            label="Duration"
            frames={text.animationFrames}
            frameRate={sequence.frameRate}
            maxFrames={Math.max(1, maxTransitionFramesForClip(getClipDuration(clip)))}
            disabled={locked}
            onChange={(animationFrames) => patch({ animationFrames }, 'Change Text Transition')}
          />
        </div>
      ) : null}
    </InspectorSection>
  );
}
