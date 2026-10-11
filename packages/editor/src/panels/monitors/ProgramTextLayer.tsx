import { textAnimationFrame, textAnimationProgress, type Clip, type Sequence } from '@timeline/core';
import { cn } from '@timeline/ui';
import { useEffect, useRef } from 'react';
import { usePlaybackState, useRuntime, useUiState } from '../../runtime/context';
import { ensureCatalogFont, ensureCustomFont } from '../inspector/text-fonts';
import { programClipWrapperStyle } from './program-clip-layout';

interface ProgramTextLayerProps {
  readonly clip: Clip;
  readonly sequence: Sequence;
  readonly stackIndex: number;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly selected: boolean;
}

export function ProgramTextLayer({
  clip,
  sequence,
  stackIndex,
  frameWidth,
  frameHeight,
  selected,
}: ProgramTextLayerProps) {
  const text = clip.text;
  const playhead = usePlaybackState((state) => state.playhead);
  const runtime = useRuntime();
  const editing = useUiState((s) => s.textEditingClipId === clip.id);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!text) return;
    if (text.fontDataUrl) void ensureCustomFont(text.fontFamily, text.fontDataUrl);
    else ensureCatalogFont(text.fontFamily);
  }, [text]);

  const wasEditing = useRef(false);
  useEffect(() => {
    const node = editorRef.current;
    if (!editing || !node || !text) {
      wasEditing.current = false;
      return;
    }
    if (!wasEditing.current) {
      node.textContent = text.content;
      node.focus();
      const range = document.createRange();
      range.selectNodeContents(node);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    wasEditing.current = true;
  }, [editing, text]);

  useEffect(() => {
    if (!editing) return;
    const onPointerDown = (event: PointerEvent) => {
      const node = editorRef.current;
      if (!node) return;
      if (event.target instanceof Node && node.contains(event.target)) return;
      node.blur();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
    return runtime.stores.selection.subscribe((state, previous) => {
      const deselectedClip = !state.clipIds.includes(clip.id);
      const pickedAsset = state.assetId !== null && state.assetId !== previous.assetId;
      if (deselectedClip || pickedAsset) {
        editorRef.current?.blur();
        runtime.stores.ui.getState().setTextEditingClipId(null);
      }
    });
  }, [clip.id, editing, runtime]);

  if (!text) return null;

  const progress =
    text.animation === 'none'
      ? 1
      : textAnimationProgress(playhead - clip.start, text.animationFrames || 60);
  const frame = textAnimationFrame(text.content, text.animation, progress);
  const fit = frameWidth > 0 ? frameWidth / sequence.resolution.width : 1;
  const box = programClipWrapperStyle(clip, sequence, playhead, frameWidth, frameHeight, 0, 0);
  const decoration = [text.underline ? 'underline' : '', text.strike ? 'line-through' : ''].filter(Boolean).join(' ');

  const commit = () => {
    const node = editorRef.current;
    if (!node) return;
    const content = node.innerText.replace(/\u00a0/g, ' ');
    runtime.actions.edit.setClipText(clip.id, { content }, 'Edit Text');
    runtime.stores.ui.getState().setTextEditingClipId(null);
  };

  return (
    <div
      data-program-layer={clip.id}
      data-program-text=""
      className={cn('absolute', text.align !== 'justify' && 'max-w-[80%]', selected && 'ring-1 ring-pink-200/70')}
      style={{
        ...box,
        width: text.align === 'justify' ? '72%' : 'max-content',
        height: 'auto',
        zIndex: (stackIndex + 1) * 10,
        letterSpacing: `${(text.letterSpacing + (editing ? 0 : frame.letterSpacing)) * fit}px`,
        fontFamily: `"${text.fontFamily}", sans-serif`,
        fontSize: text.fontSize * fit,
        fontWeight: text.bold ? 700 : 400,
        fontStyle: text.italic ? 'italic' : 'normal',
        textDecoration: decoration || 'none',
        color: text.color,
        textAlign: text.align,
        lineHeight: 1.2,
        whiteSpace: 'pre-wrap',
        textShadow: text.shadow
          ? `${text.shadow.offsetX * fit}px ${text.shadow.offsetY * fit}px ${text.shadow.blur * fit}px ${text.shadow.color}`
          : 'none',
        WebkitTextStroke: text.outlineWidth > 0 ? `${text.outlineWidth * fit}px ${text.outlineColor}` : undefined,
        paintOrder: 'stroke fill',
      }}
    >
      {editing ? (
        <div
          ref={editorRef}
          contentEditable
          role="textbox"
          aria-label="Edit text"
          className="cursor-text px-2 py-1 outline-none"
          suppressContentEditableWarning
          onPointerDown={(event) => event.stopPropagation()}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              runtime.stores.ui.getState().setTextEditingClipId(null);
            }
          }}
        />
      ) : (
        <span
          className="pointer-events-none block px-2 py-1"
          style={
            text.backgroundColor
              ? { background: text.backgroundColor, borderRadius: '0.3em' }
              : undefined
          }
        >
          {frame.runs.map((run, index) => (
            <span
              key={`${index}-${run.text}`}
              style={{
                opacity: run.opacity,
                display: text.align === 'justify' && run.offsetY === 0 && run.scale === 1 ? 'inline' : 'inline-block',
                transform: `translateY(${run.offsetY}px) scale(${run.scale})`,
                filter: run.blur > 0.2 ? `blur(${run.blur}px)` : undefined,
                whiteSpace: 'pre-wrap',
              }}
            >
              {run.text}
            </span>
          ))}
          {frame.caret ? <span className="animate-pulse">▍</span> : null}
        </span>
      )}
    </div>
  );
}
