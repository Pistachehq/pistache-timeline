import {
  CAPTION_DESIGNS,
  CAPTION_POSITIONS,
  CAPTION_SIZES,
  captionClipsFor,
  captionDesignById,
  captionPositionY,
  formatDisplayTime,
  getActiveSequence,
  matchingCaptionDesign,
  matchingCaptionPosition,
  type CaptionPositionId,
  type Clip,
  type Sequence,
} from '@timeline/core';
import { NumberField } from '@timeline/ui';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { analyzeClipAudio } from '../../actions/caption-audio';
import { type CaptionLanguage } from '../../actions/transcribe-messages';
import { useTimeDisplayFormat } from '../../hooks/use-format-display-time';
import { useMediaState, useProjectState, useRuntime } from '../../runtime/context';
import { InspectorSection } from './InspectorSection';

const CAPTION_LANGUAGES: readonly { readonly id: CaptionLanguage; readonly label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Spanish' },
];

function previewStyle(designId: string): CSSProperties {
  const design = captionDesignById(designId).text;
  return {
    color: design.color,
    fontWeight: design.bold ? 700 : 400,
    ...(design.outlineWidth > 0 ? { WebkitTextStroke: '0.4px #000' } : {}),
    paintOrder: 'stroke fill',
    textShadow: design.shadow
      ? `${design.shadow.offsetX}px ${design.shadow.offsetY}px ${design.shadow.blur}px ${design.shadow.color}`
      : 'none',
    fontFamily: `"${design.fontFamily}", sans-serif`,
    ...(design.backgroundColor ? { background: design.backgroundColor, borderRadius: '0.2em' } : {}),
  };
}

function CaptionLine({
  clip,
  sequence,
  locked,
}: {
  readonly clip: Clip;
  readonly sequence: Sequence;
  readonly locked: boolean;
}) {
  const runtime = useRuntime();
  const timeFormat = useTimeDisplayFormat();
  const content = clip.text?.content ?? '';
  const [value, setValue] = useState(content);
  useEffect(() => setValue(content), [content]);

  const time = formatDisplayTime(clip.start, sequence.frameRate, timeFormat);
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="font-mono text-[10px] leading-none whitespace-nowrap text-fg-subtle tabular-nums">{time}</span>
      <textarea
        aria-label={`Caption at ${time}`}
        data-testid="caption-line"
        value={value}
        disabled={locked}
        rows={2}
        placeholder="Type caption"
        className="w-full min-w-0 resize-none rounded-sm border border-line-strong bg-surface-3 px-2 py-1 text-xs leading-snug text-fg"
        onChange={(event) => setValue(event.target.value.replace(/\n/g, ' '))}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        onBlur={() => {
          if (value !== content) runtime.actions.edit.setClipText(clip.id, { content: value }, 'Edit Caption');
        }}
      />
    </label>
  );
}

/** Captions for the audio clip open in the inspector. */
export function ClipCaptionsInspector({
  clip,
  sequence,
  locked,
}: {
  readonly clip: Clip;
  readonly sequence: Sequence;
  readonly locked: boolean;
}) {
  const runtime = useRuntime();
  const entry = useMediaState((state) => (clip.assetId ? state.entries[clip.assetId] : undefined));
  const project = useProjectState((state) => state.project);
  const captions = useMemo(() => {
    const current = getActiveSequence(project);
    return current ? captionClipsFor(current, clip.id) : [];
  }, [project, clip.id]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Analyzing speech…');
  const [language, setLanguage] = useState<CaptionLanguage>('auto');
  const abortRef = useRef<AbortController | null>(null);
  const first = captions[0];
  const designId = first?.text ? matchingCaptionDesign(first.text) : 'classic';
  const positionId = matchingCaptionPosition(first?.transform.positionY ?? 0, sequence.resolution.height);
  const fontSize = first?.text?.fontSize ?? 52;
  const on = captions.length > 0;
  const emptyLines = on && captions.every((item) => !item.text?.content.trim());

  useEffect(() => () => abortRef.current?.abort(), []);

  const enable = async (spoken: CaptionLanguage) => {
    const handle = entry?.status === 'online' ? entry.handle : null;
    if (!handle) {
      runtime.stores.ui.getState().notify('This media is offline.', 'warning');
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setStatus('Reading audio…');
    try {
      const analysis = await analyzeClipAudio(clip, handle.url, sequence.frameRate, controller.signal, setStatus, spoken);
      if (!analysis || controller.signal.aborted) return;
      if (analysis.cues.length === 0) {
        runtime.stores.ui.getState().notify('No speech found in this clip.', 'warning');
        return;
      }
      const added = runtime.actions.edit.addCaptions(clip.id, analysis.cues);
      if (added && !analysis.heard) {
        runtime.stores.ui.getState().notify('Caption timing follows the speech. Type each line.');
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        const message = error instanceof Error ? error.message : 'Could not analyze this audio.';
        runtime.stores.ui.getState().notify(message, 'error');
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setBusy(false);
      }
    }
  };

  const setPosition = (id: CaptionPositionId) => {
    runtime.actions.edit.setCaptionLook(
      clip.id,
      { positionY: captionPositionY(id, sequence.resolution.height) },
      'Move Captions',
    );
  };

  return (
    <InspectorSection title="Captions">
      <label className="flex h-7 items-center gap-2 text-xs text-fg">
        <input
          type="checkbox"
          data-testid="caption-toggle"
          checked={on || busy}
          disabled={locked}
          onChange={(event) => {
            if (!event.target.checked) {
              abortRef.current?.abort();
              setBusy(false);
              runtime.actions.edit.removeCaptions(clip.id);
              return;
            }
            void enable(language);
          }}
        />
        Captions
      </label>
      <div className="flex gap-1 pt-1">
        {CAPTION_LANGUAGES.map((item) => (
          <button
            key={item.id}
            type="button"
            data-testid={`caption-language-${item.id}`}
            aria-pressed={language === item.id}
            disabled={locked}
            className={`h-6 flex-1 rounded-sm border text-[10px] ${
              language === item.id ? 'border-accent bg-accent/20 text-fg' : 'border-line-strong text-fg-muted'
            }`}
            onClick={() => {
              setLanguage(item.id);
              if ((on || busy) && item.id !== language) void enable(item.id);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {busy ? <p className="text-[10px] leading-snug text-fg-muted">{status}</p> : null}
      {on ? (
        <>
          <div className="grid grid-cols-3 gap-1 pt-1">
            {CAPTION_DESIGNS.map((design) => (
              <button
                key={design.id}
                type="button"
                data-testid={`caption-design-${design.id}`}
                aria-pressed={designId === design.id}
                disabled={locked}
                className={`flex flex-col items-center gap-0.5 rounded-sm border px-1 py-1 ${
                  designId === design.id ? 'border-accent bg-accent/15' : 'border-line-strong hover:bg-surface-3'
                }`}
                onClick={() => runtime.actions.edit.setCaptionLook(clip.id, { text: design.text }, 'Change Caption Design')}
              >
                <span className="px-1 text-sm leading-none" style={previewStyle(design.id)}>
                  Aa
                </span>
                <span className="text-[10px] text-fg-muted">{design.label}</span>
              </button>
            ))}
          </div>
          <div className="flex items-end gap-1 pt-1">
            <NumberField
              className="min-w-0 flex-1"
              label="Size"
              value={fontSize}
              min={20}
              max={160}
              step={1}
              precision={0}
              unit="px"
              disabled={locked}
              onScrubStart={() => runtime.actions.edit.beginTransaction('Change Caption Size')}
              onScrubEnd={() => runtime.actions.edit.commitTransaction()}
              onChange={(value) => runtime.actions.edit.setCaptionLook(clip.id, { fontSize: value }, 'Change Caption Size')}
            />
            <div className="flex gap-0.5 pb-0.5">
              {CAPTION_SIZES.map((size) => (
                <button
                  key={size.id}
                  type="button"
                  aria-label={`Caption size ${size.label}`}
                  aria-pressed={fontSize === size.fontSize}
                  disabled={locked}
                  className={`h-6 w-6 rounded-sm border text-[10px] ${
                    fontSize === size.fontSize ? 'border-accent bg-accent/20 text-fg' : 'border-line-strong text-fg-muted'
                  }`}
                  onClick={() => runtime.actions.edit.setCaptionLook(clip.id, { fontSize: size.fontSize }, 'Change Caption Size')}
                >
                  {size.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-1 pt-1">
            {CAPTION_POSITIONS.map((position) => (
              <button
                key={position.id}
                type="button"
                data-testid={`caption-position-${position.id}`}
                aria-pressed={positionId === position.id}
                disabled={locked}
                className={`h-6 flex-1 rounded-sm border text-[10px] ${
                  positionId === position.id ? 'border-accent bg-accent/20 text-fg' : 'border-line-strong text-fg-muted'
                }`}
                onClick={() => setPosition(position.id)}
              >
                {position.label}
              </button>
            ))}
          </div>
          <p className="pt-1 text-[10px] leading-snug text-fg-subtle">
            {emptyLines
              ? 'Timing follows the speech. Type each line.'
              : 'Edit a line if a word is off. Timing follows the speech.'}
          </p>
          <div className="flex max-h-64 min-w-0 flex-col gap-2 overflow-y-auto pt-1">
            {captions.map((item) => (
              <CaptionLine key={item.id} clip={item} sequence={sequence} locked={locked} />
            ))}
          </div>
        </>
      ) : (
        <p className="text-[10px] leading-snug text-fg-subtle">
          Turns the speech in this clip into captions in the language being spoken. The first time, a speech model downloads and stays in this browser.
        </p>
      )}
    </InspectorSection>
  );
}
