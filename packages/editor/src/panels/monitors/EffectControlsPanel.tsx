import {
  channelAt,
  clampLocalFrame,
  CLIP_SPEED_LIMITS,
  evaluateClipTransform,
  getClipDuration,
  keyframeAtFrame,
  TRANSFORM_LIMITS,
  type BlendMode,
  type Clip,
  type MotionChannelId,
  type ScalarKeyframe,
  type Sequence,
} from '@timeline/core';
import { NumberField, Select } from '@timeline/ui';
import { ChevronLeft, ChevronRight, ChevronRight as Twirl, RotateCcw, Timer } from 'lucide-react';
import { type PointerEvent as ReactPointerEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFormatDisplayTime } from '../../hooks/use-format-display-time';
import { usePlaybackState, useRuntime } from '../../runtime/context';
import { useActiveSequence, useAsset, useSingleSelectedClip } from '../../runtime/hooks';
import { textAnimationLabel } from '../project/text-animation-label';
import { clientMarqueeBox, elementBounds, rectsIntersect } from '../marquee-geometry';
import { playheadStepFromWheel } from '../timeline/timeline-wheel-playhead';

const POSITION = TRANSFORM_LIMITS.position;
const SCALE = TRANSFORM_LIMITS.scale;
const ROTATION = TRANSFORM_LIMITS.rotation;
const OPACITY = TRANSFORM_LIMITS.opacity;

interface FieldSpec {
  readonly id: MotionChannelId;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly precision: number;
  readonly unit?: string;
}

type Row =
  | { readonly type: 'group'; readonly id: string; readonly label: string; readonly depth: number }
  | { readonly type: 'motion'; readonly id: string; readonly label: string; readonly depth: number; readonly fields: readonly FieldSpec[] }
  | { readonly type: 'toggle'; readonly id: string; readonly label: string; readonly depth: number }
  | { readonly type: 'blend'; readonly id: string; readonly depth: number }
  | { readonly type: 'speed'; readonly id: 'speed'; readonly depth: number }
  | { readonly type: 'static'; readonly id: string; readonly label: string; readonly value: string; readonly depth: number };

interface LaneKey {
  readonly channel: MotionChannelId;
  readonly key: ScalarKeyframe;
}

const BLEND_OPTIONS: { value: BlendMode; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
];

function withChannel(patch: Partial<ReturnType<typeof evaluateClipTransform>>, id: MotionChannelId, value: number) {
  switch (id) {
    case 'positionX':
      return { ...patch, positionX: value };
    case 'positionY':
      return { ...patch, positionY: value };
    case 'scaleX':
      return { ...patch, scaleX: value };
    case 'scaleY':
      return { ...patch, scaleY: value };
    case 'rotation':
      return { ...patch, rotation: value };
    case 'opacity':
      return { ...patch, opacity: value };
    case 'anchorX':
      return { ...patch, anchorX: value };
    case 'anchorY':
      return { ...patch, anchorY: value };
  }
}

function titleCase(value: string): string {
  return value
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function effectLabel(kind: string, libraryId?: string): string {
  if (kind === 'library' && libraryId) return titleCase(libraryId);
  return titleCase(kind);
}

function field(
  id: MotionChannelId,
  label: string,
  range: { min: number; max: number },
  step: number,
  unit?: string,
): FieldSpec {
  return unit ? { id, label, min: range.min, max: range.max, step, precision: 1, unit } : { id, label, min: range.min, max: range.max, step, precision: 1 };
}

function buildRows(clip: Clip): Row[] {
  const rows: Row[] = [];
  const applied: Row[] = [];
  if (clip.text && clip.text.animation !== 'none') {
    applied.push({
      type: 'static',
      id: 'text-animation',
      label: textAnimationLabel(clip.text.animation),
      value: `${clip.text.animationFrames}f`,
      depth: 1,
    });
  }
  clip.effects.video.forEach((effect, index) => {
    applied.push({
      type: 'static',
      id: `video-effect-${index}`,
      label: effectLabel(effect.kind, effect.kind === 'library' ? effect.libraryId : undefined),
      value: '',
      depth: 1,
    });
  });
  clip.effects.audio.forEach((effect, index) => {
    applied.push({
      type: 'static',
      id: `audio-effect-${index}`,
      label: effectLabel(effect.kind),
      value: '',
      depth: 1,
    });
  });
  if (applied.length > 0) {
    rows.push({ type: 'group', id: 'effects', label: 'Effects', depth: 0 });
    rows.push(...applied);
  }
  const scaleX = field('scaleX', 'Scale', SCALE, 1, '%');
  const scaleY = field('scaleY', 'Scale Height', SCALE, 1, '%');
  rows.push(
    { type: 'group', id: 'video', label: 'Video', depth: 0 },
    { type: 'group', id: 'motion', label: 'Motion', depth: 1 },
    {
      type: 'motion',
      id: 'position',
      label: 'Position',
      depth: 2,
      fields: [field('positionX', 'Position X', POSITION, 1), field('positionY', 'Position Y', POSITION, 1)],
    },
    ...(clip.transform.uniformScale
      ? [{ type: 'motion' as const, id: 'scale', label: 'Scale', depth: 2, fields: [scaleX] }]
      : [
          { type: 'motion' as const, id: 'scale-x', label: 'Scale Width', depth: 2, fields: [{ ...scaleX, label: 'Scale Width' }] },
          { type: 'motion' as const, id: 'scale-y', label: 'Scale Height', depth: 2, fields: [scaleY] },
        ]),
    { type: 'toggle', id: 'uniform', label: 'Uniform Scale', depth: 2 },
    {
      type: 'motion',
      id: 'rotation',
      label: 'Rotation',
      depth: 2,
      fields: [field('rotation', 'Rotation', ROTATION, 0.5, '°')],
    },
    {
      type: 'motion',
      id: 'anchor',
      label: 'Anchor Point',
      depth: 2,
      fields: [field('anchorX', 'Anchor X', POSITION, 1), field('anchorY', 'Anchor Y', POSITION, 1)],
    },
    { type: 'group', id: 'opacity', label: 'Opacity', depth: 1 },
    {
      type: 'motion',
      id: 'opacity-value',
      label: 'Opacity',
      depth: 2,
      fields: [field('opacity', 'Opacity', OPACITY, 1, '%')],
    },
    { type: 'blend', id: 'blend', depth: 2 },
    { type: 'group', id: 'time', label: 'Time Remapping', depth: 1 },
    { type: 'speed', id: 'speed', depth: 2 },
  );
  return rows;
}

function visibleRows(rows: readonly Row[], collapsed: ReadonlySet<string>): Row[] {
  const hidden: number[] = [];
  const out: Row[] = [];
  for (const row of rows) {
    while (hidden.length > 0 && row.depth <= hidden[hidden.length - 1]!) hidden.pop();
    if (hidden.length > 0) continue;
    out.push(row);
    if (row.type === 'group' && collapsed.has(row.id)) hidden.push(row.depth);
  }
  return out;
}

function Diamond({ filled, selected }: { readonly filled: boolean; readonly selected?: boolean }) {
  return (
    <span
      className={`inline-block size-2 rotate-45 border ${
        selected ? 'border-white bg-white' : filled ? 'border-sky-300 bg-sky-300' : 'border-fg-subtle bg-transparent'
      }`}
    />
  );
}

export function EffectControlsPanel() {
  const clip = useSingleSelectedClip();
  const sequence = useActiveSequence();
  if (!sequence || !clip) return <EffectControlsChrome title="No clip selected" rows={[]} clip={null} sequence={null} />;
  return <EffectControlsChrome title="" rows={buildRows(clip)} clip={clip} sequence={sequence} />;
}

function EffectControlsChrome({
  title,
  rows,
  clip,
  sequence,
}: {
  readonly title: string;
  readonly rows: readonly Row[];
  readonly clip: Clip | null;
  readonly sequence: Sequence | null;
}) {
  const [split, setSplit] = useState(46);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<readonly { channel: MotionChannelId; id: string }[]>([]);
  const [drag, setDrag] = useState<{ readonly ids: readonly string[]; readonly delta: number } | null>(null);
  const [laneMarquee, setLaneMarquee] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const splitRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);
  const scrubbing = useRef(false);
  const runtime = useRuntime();
  const playhead = usePlaybackState((state) => state.playhead);
  const formatTime = useFormatDisplayTime();
  const asset = useAsset(clip?.assetId);
  const { edit } = runtime.actions;

  const duration = clip ? Math.max(1, getClipDuration(clip)) : 1;
  const local = clip ? clampLocalFrame(clip, playhead - clip.start) : 0;
  const outside = clip ? playhead < clip.start || playhead >= clip.start + duration : true;
  const shown = clip ? evaluateClipTransform(clip, clip.start + local) : null;
  const span = Math.max(1, duration - 1);
  const fraction = (frame: number) => `${(Math.min(span, Math.max(0, frame)) / span) * 100}%`;
  const visible = visibleRows(rows, collapsed);
  const clipTitle = clip ? (asset?.name ?? clip.name) : title;
  const liveSelected: LaneKey[] = clip
    ? selected.flatMap((item) => {
        const key = channelAt(clip.animation, item.channel).keyframes.find((candidate) => candidate.id === item.id);
        return key ? [{ channel: item.channel, key }] : [];
      })
    : [];

  const seekLocal = (frame: number) => {
    if (!clip) return;
    runtime.stores.playback.getState().setPlaying(false);
    runtime.stores.playback.getState().setPlayhead(clip.start + clampLocalFrame(clip, frame));
  };

  const frameFromPointer = (clientX: number) => {
    const el = rightRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const width = Math.max(1, el.clientWidth * zoom);
    const x = clientX - rect.left + el.scrollLeft;
    return Math.round(Math.min(1, Math.max(0, x / width)) * span);
  };

  const placePlayhead = () => {
    const el = rightRef.current;
    const line = playheadRef.current;
    if (!el || !line) return;
    const width = Math.max(1, el.clientWidth * zoom);
    const track = rulerRef.current?.firstElementChild;
    if (track instanceof HTMLElement) track.style.width = `${width}px`;
    const x = (local / span) * width - el.scrollLeft;
    line.style.transform = `translateX(${x}px)`;
  };

  const syncFromLeft = () => {
    if (syncing.current || !leftRef.current || !rightRef.current) return;
    syncing.current = true;
    rightRef.current.scrollTop = leftRef.current.scrollTop;
    syncing.current = false;
  };

  const syncFromRight = () => {
    const el = rightRef.current;
    if (!el) return;
    if (rulerRef.current) rulerRef.current.scrollLeft = el.scrollLeft;
    placePlayhead();
    if (syncing.current || !leftRef.current) return;
    syncing.current = true;
    leftRef.current.scrollTop = el.scrollTop;
    syncing.current = false;
  };

  const onSplitPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onSplitPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const bounds = splitRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0) return;
    const next = ((event.clientX - bounds.left) / bounds.width) * 100;
    setSplit(Math.min(68, Math.max(34, next)));
  };

  const beginScrub = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!clip || event.button !== 0) return;
    if ((event.target as HTMLElement).closest('button')) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    scrubbing.current = true;
    seekLocal(frameFromPointer(event.clientX));
  };

  const moveScrub = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!scrubbing.current) return;
    seekLocal(frameFromPointer(event.clientX));
  };

  const endScrub = (event: ReactPointerEvent<HTMLDivElement>) => {
    scrubbing.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  useEffect(() => {
    const ruler = rulerRef.current;
    if (!ruler || !clip || !sequence) return;
    const clipStart = clip.start;
    const clipEnd = clip.start + Math.max(1, getClipDuration(clip)) - 1;
    const rate = sequence.frameRate;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        setZoom((current) => Math.min(16, Math.max(1, current * (event.deltaY > 0 ? 0.9 : 1.1))));
        return;
      }
      const delta = playheadStepFromWheel(
        event.deltaY,
        event.deltaMode,
        runtime.stores.ui.getState().timeDisplayFormat,
        rate,
        event.altKey,
      );
      if (delta === 0) return;
      event.preventDefault();
      const playback = runtime.stores.playback.getState();
      const next = Math.max(clipStart, Math.min(clipEnd, playback.playhead + delta));
      playback.setPlaying(false);
      playback.setPlayhead(next);
    };
    ruler.addEventListener('wheel', onWheel, { passive: false });
    return () => ruler.removeEventListener('wheel', onWheel);
  }, [clip, sequence, runtime]);

  useEffect(() => {
    const lanes = rightRef.current;
    if (!lanes || !clip) return;
    const clipStart = clip.start;
    let gesture: { pointerId: number; additive: boolean; startX: number; startY: number; active: boolean } | null = null;

    const localFrameAt = (clientX: number) => {
      const rect = lanes.getBoundingClientRect();
      const width = Math.max(1, lanes.clientWidth * zoom);
      const x = clientX - rect.left + lanes.scrollLeft;
      return Math.round(Math.min(1, Math.max(0, x / width)) * span);
    };

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if ((event.target as HTMLElement).closest('button')) return;
      gesture = {
        pointerId: event.pointerId,
        additive: event.shiftKey || event.ctrlKey || event.metaKey,
        startX: event.clientX,
        startY: event.clientY,
        active: false,
      };
    };

    const onMove = (event: PointerEvent) => {
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      if (!gesture.active && Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < 4) return;
      gesture.active = true;
      const bounds = elementBounds(lanes);
      setLaneMarquee(clientMarqueeBox(gesture.startX, gesture.startY, event.clientX, event.clientY, bounds));
    };

    const onUp = (event: PointerEvent) => {
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      const g = gesture;
      gesture = null;
      setLaneMarquee(null);
      if (!g.active) {
        const playback = runtime.stores.playback.getState();
        playback.setPlaying(false);
        playback.setPlayhead(clipStart + clampLocalFrame(clip, localFrameAt(event.clientX)));
        if (!g.additive) setSelected([]);
        return;
      }
      const bounds = elementBounds(lanes);
      const box = clientMarqueeBox(g.startX, g.startY, event.clientX, event.clientY, bounds);
      if (!box) return;
      const rect = new DOMRect(box.left, box.top, box.width, box.height);
      const hits: { channel: MotionChannelId; id: string }[] = [];
      for (const el of lanes.querySelectorAll<HTMLElement>('[data-keyframe-ids]')) {
        if (!rectsIntersect(el.getBoundingClientRect(), rect)) continue;
        const ids = el.dataset.keyframeIds?.split(' ') ?? [];
        const channels = el.dataset.keyframeChannels?.split(' ') ?? [];
        ids.forEach((id, index) => {
          const channel = channels[index];
          if (id && channel) hits.push({ channel: channel as MotionChannelId, id });
        });
      }
      setSelected((current) => {
        if (!g.additive) return hits;
        const seen = new Set(current.map((item) => `${item.channel}:${item.id}`));
        return [...current, ...hits.filter((item) => !seen.has(`${item.channel}:${item.id}`))];
      });
    };

    lanes.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      lanes.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [clip, runtime, span, zoom]);

  const toggleGroup = (id: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setAnimated = (channels: readonly MotionChannelId[], enabled: boolean) => {
    if (!clip) return;
    if (!enabled) {
      const hasKeys = channels.some((id) => channelAt(clip.animation, id).keyframes.length > 0);
      if (hasKeys && !window.confirm('Turn off animation? Keyframes on this property will be removed.')) return;
    }
    edit.beginTransaction(enabled ? 'Enable Animation' : 'Disable Animation');
    for (const id of channels) edit.setMotionAnimated(clip.id, id, enabled);
    edit.commitTransaction();
  };

  const changeField = (spec: FieldSpec, value: number, siblings: readonly FieldSpec[]) => {
    if (!clip || !shown) return;
    let patch = withChannel({}, spec.id, value);
    const animated = siblings.some((item) => channelAt(clip.animation, item.id).enabled);
    if (animated) {
      for (const item of siblings) {
        if (item.id === spec.id || !channelAt(clip.animation, item.id).enabled) continue;
        patch = withChannel(patch, item.id, shown[item.id]);
      }
    }
    edit.setClipTransform(clip.id, patch, `Change ${spec.label}`);
  };

  const keysFor = (fields: readonly FieldSpec[]): Map<number, LaneKey[]> => {
    const byFrame = new Map<number, LaneKey[]>();
    if (!clip) return byFrame;
    for (const spec of fields) {
      const channel = channelAt(clip.animation, spec.id);
      if (!channel.enabled) continue;
      for (const key of channel.keyframes) {
        const list = byFrame.get(key.frame) ?? [];
        list.push({ channel: spec.id, key });
        byFrame.set(key.frame, list);
      }
    }
    return byFrame;
  };

  const startDrag = (keys: readonly LaneKey[], event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!clip) return;
    event.stopPropagation();
    event.preventDefault();
    const inSelection =
      keys.length > 0 &&
      keys.every((item) =>
        liveSelected.some((selectedKey) => selectedKey.channel === item.channel && selectedKey.key.id === item.key.id),
      );
    const moving = inSelection ? liveSelected : keys;
    setSelected(moving.map((item) => ({ channel: item.channel, id: item.key.id })));
    const origins = moving.map((item) => ({ channel: item.channel, id: item.key.id, frame: item.key.frame }));
    const anchor = keys[0]?.key.frame ?? 0;
    edit.beginTransaction('Move Keyframes');
    const move = (ev: PointerEvent) =>
      setDrag({ ids: origins.map((item) => item.id), delta: frameFromPointer(ev.clientX) - anchor });
    const up = (ev: PointerEvent) => {
      const delta = frameFromPointer(ev.clientX) - anchor;
      setDrag(null);
      if (delta !== 0) {
        edit.moveMotionKeyframes(
          clip.id,
          origins.map((item) => ({ channel: item.channel, keyframeId: item.id, frame: item.frame + delta })),
        );
      }
      edit.commitTransaction();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const removeSelected = () => {
    if (!clip) return;
    for (const item of liveSelected) edit.toggleKeyframe(clip.id, item.channel, item.key.frame);
    setSelected([]);
  };

  useLayoutEffect(() => {
    placePlayhead();
    const el = rightRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => placePlayhead());
    observer.observe(el);
    return () => observer.disconnect();
  });

  const marks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div
      className="flex min-h-0 flex-1 flex-col outline-none"
      data-testid="effect-controls"
      tabIndex={-1}
      onKeyDown={(event) => {
        if ((event.key === 'Delete' || event.key === 'Backspace') && selected.length > 0) {
          event.preventDefault();
          removeSelected();
        }
      }}
    >
      <div
        ref={splitRef}
        className="grid min-h-0 flex-1 overflow-hidden"
        style={{ gridTemplateColumns: `minmax(0, ${split}%) 6px minmax(0, 1fr)` }}
      >
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          <div className="flex h-7 shrink-0 items-center border-b border-line bg-surface-2 px-2">
            <span className="truncate text-2xs text-fg">{clipTitle}</span>
          </div>
          <div ref={leftRef} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto" onScroll={syncFromLeft}>
            {clip && shown
              ? visible.map((row) => (
                  <PropertyRow
                    key={row.id}
                    row={row}
                    clip={clip}
                    shown={shown}
                    local={local}
                    collapsed={collapsed.has(row.type === 'group' ? row.id : '')}
                    onToggle={() => row.type === 'group' && toggleGroup(row.id)}
                    onAnimate={setAnimated}
                    onChange={changeField}
                    onSeek={seekLocal}
                    onScrubStart={(label) => edit.beginTransaction(label)}
                    onScrubEnd={() => edit.commitTransaction()}
                    onReset={(channels) => {
                      edit.beginTransaction('Reset Property');
                      for (const id of channels) edit.resetMotion(clip.id, id);
                      edit.commitTransaction();
                    }}
                    onToggleKeyframe={(channels) => {
                      for (const id of channels) edit.toggleKeyframe(clip.id, id);
                    }}
                    onUniform={(checked) => edit.setClipTransform(clip.id, { uniformScale: checked }, 'Change Scale')}
                    onBlend={(mode) => edit.setClipTransform(clip.id, { blendMode: mode }, 'Change Blend Mode')}
                    onSpeed={(speed) => edit.setClipSpeed(clip.id, speed)}
                  />
                ))
              : (
                  <p className="px-3 py-6 text-center text-xs text-fg-subtle">
                    Select one clip on the timeline. Its motion keyframes show up here.
                  </p>
                )}
          </div>
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize effect controls"
          className="relative z-10 cursor-col-resize touch-none"
          onPointerDown={onSplitPointerDown}
          onPointerMove={onSplitPointerMove}
        >
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line" />
        </div>
        <div className="relative flex min-h-0 min-w-0 flex-col overflow-hidden">
          <div
            ref={rulerRef}
            className="h-7 shrink-0 cursor-text touch-none overflow-hidden border-b border-line bg-surface-2 [scrollbar-gutter:stable]"
            onPointerDown={beginScrub}
            onPointerMove={moveScrub}
            onPointerUp={endScrub}
            onPointerCancel={endScrub}
          >
            <div className="relative h-full min-w-full" style={{ width: `${zoom * 100}%` }}>
              {sequence && clip
                ? marks.map((mark) => {
                    const frame = clip.start + Math.round(mark * span);
                    const label = formatTime(frame, sequence.frameRate);
                    return (
                      <span
                        key={mark}
                        className="pointer-events-none absolute bottom-0.5 text-[9px] text-fg-subtle"
                        style={
                          mark === 0
                            ? { left: 4 }
                            : mark === 1
                              ? { right: 4 }
                              : { left: `${mark * 100}%`, transform: 'translateX(-50%)' }
                        }
                      >
                        {label}
                      </span>
                    );
                  })
                : null}
            </div>
          </div>
          <div ref={rightRef} className="relative min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable]" onScroll={syncFromRight} data-testid="effect-controls-lanes">
            <div className="relative min-h-full min-w-full" style={{ width: `${zoom * 100}%` }}>
              {clip && shown
                ? visible.map((row) => (
                    <LaneRow
                      key={row.id}
                      row={row}
                      fraction={fraction}
                      keys={row.type === 'motion' ? keysFor(row.fields) : new Map()}
                      drag={drag}
                      selectedIds={liveSelected.map((item) => item.key.id)}
                      onDrag={startDrag}
                      onSelect={(keys) => setSelected(keys.map((item) => ({ channel: item.channel, id: item.key.id })))}
                    />
                  ))
                : null}
            </div>
          </div>
          <div
            ref={playheadRef}
            aria-hidden
            className={`pointer-events-none absolute inset-y-0 left-0 z-20 w-px ${outside ? 'bg-fg-subtle/50' : 'bg-playhead'}`}
          />
        </div>
      </div>
      <div className="flex h-7 shrink-0 items-center gap-2 border-t border-line px-2 text-2xs text-fg-subtle">
        <span>{clip ? (outside ? 'Playhead is outside this clip' : `Frame ${local} of ${duration}`) : 'Effect Controls'}</span>
        {clip && liveSelected.length > 0 ? (
          <span className="ml-auto flex items-center gap-1">
            <InterpolationButton
              label="Linear"
              active={liveSelected.every((item) => item.key.interpolation === 'linear')}
              onClick={() => {
                for (const item of liveSelected) edit.setMotionInterpolation(clip.id, item.channel, item.key.id, 'linear');
              }}
            />
            <InterpolationButton
              label="Hold"
              active={liveSelected.every((item) => item.key.interpolation === 'hold')}
              onClick={() => {
                for (const item of liveSelected) edit.setMotionInterpolation(clip.id, item.channel, item.key.id, 'hold');
              }}
            />
            <button type="button" className="rounded-sm px-1.5 py-0.5 hover:bg-surface-3" onClick={removeSelected}>
              Delete
            </button>
          </span>
        ) : (
          <span className="ml-auto">Drag the lanes to select keyframes</span>
        )}
      </div>
      {laneMarquee ? (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[30] border border-accent bg-accent/15"
          style={laneMarquee}
          data-testid="effect-controls-marquee"
        />
      ) : null}
    </div>
  );
}

function InterpolationButton({
  label,
  active,
  onClick,
}: {
  readonly label: string;
  readonly active: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`rounded-sm px-1.5 py-0.5 ${active ? 'bg-accent/20 text-fg' : 'hover:bg-surface-3'}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function PropertyRow({
  row,
  clip,
  shown,
  local,
  collapsed,
  onToggle,
  onAnimate,
  onChange,
  onSeek,
  onScrubStart,
  onScrubEnd,
  onReset,
  onToggleKeyframe,
  onUniform,
  onBlend,
  onSpeed,
}: {
  readonly row: Row;
  readonly clip: Clip;
  readonly shown: ReturnType<typeof evaluateClipTransform>;
  readonly local: number;
  readonly collapsed: boolean;
  readonly onToggle: () => void;
  readonly onAnimate: (channels: readonly MotionChannelId[], enabled: boolean) => void;
  readonly onChange: (spec: FieldSpec, value: number, siblings: readonly FieldSpec[]) => void;
  readonly onSeek: (frame: number) => void;
  readonly onScrubStart: (label: string) => void;
  readonly onScrubEnd: () => void;
  readonly onReset: (channels: readonly MotionChannelId[]) => void;
  readonly onToggleKeyframe: (channels: readonly MotionChannelId[]) => void;
  readonly onUniform: (checked: boolean) => void;
  readonly onBlend: (mode: BlendMode) => void;
  readonly onSpeed: (speed: number) => void;
}) {
  const pad = { paddingLeft: 6 + row.depth * 12 };
  if (row.type === 'group') {
    return (
      <button
        type="button"
        className="flex h-6 w-full shrink-0 items-center gap-1 overflow-hidden border-b border-line/50 bg-surface-2 text-left text-2xs font-medium text-fg-muted hover:text-fg"
        style={pad}
        onClick={onToggle}
      >
        <Twirl className={`size-3 shrink-0 ${collapsed ? '' : 'rotate-90'}`} />
        <span className="truncate">{row.label}</span>
      </button>
    );
  }
  if (row.type === 'toggle') {
    return (
      <label className="flex h-6 shrink-0 items-center gap-2 overflow-hidden border-b border-line/50 text-2xs text-fg" style={pad}>
        <input
          type="checkbox"
          className="size-3 accent-accent"
          checked={clip.transform.uniformScale}
          onChange={(event) => onUniform(event.target.checked)}
        />
        {row.label}
      </label>
    );
  }
  if (row.type === 'blend') {
    return (
      <div className="flex h-6 shrink-0 items-center gap-2 overflow-hidden border-b border-line/50 pr-1 text-2xs" style={pad}>
        <span className="text-fg-muted">Blend Mode</span>
        <Select
          label="Blend mode"
          className="ml-auto h-5 max-w-[9rem] text-2xs"
          value={shown.blendMode}
          options={BLEND_OPTIONS}
          onValueChange={onBlend}
        />
      </div>
    );
  }
  if (row.type === 'speed') {
    return (
      <div className="flex h-6 shrink-0 items-center gap-2 overflow-hidden border-b border-line/50 pr-1 text-2xs" style={pad}>
        <span className="min-w-0 flex-1 truncate text-fg">Speed</span>
        <NumberField
          compact
          className="w-16 shrink"
          label="Speed"
          value={clip.speed}
          min={CLIP_SPEED_LIMITS.min}
          max={CLIP_SPEED_LIMITS.max}
          step={1}
          precision={0}
          unit="%"
          onScrubStart={() => onScrubStart('Change Speed')}
          onScrubEnd={onScrubEnd}
          onChange={onSpeed}
        />
      </div>
    );
  }
  if (row.type === 'static') {
    return (
      <div className="flex h-6 shrink-0 items-center gap-2 overflow-hidden border-b border-line/50 pr-2 text-2xs" style={pad}>
        <span className="min-w-0 flex-1 truncate text-fg">{row.label}</span>
        {row.value ? <span className="font-mono text-fg-subtle">{row.value}</span> : null}
      </div>
    );
  }
  const channels = row.fields.map((spec) => spec.id);
  const enabled = channels.some((id) => channelAt(clip.animation, id).enabled);
  const atKey = channels.some((id) => keyframeAtFrame(channelAt(clip.animation, id), local) !== undefined);
  const frames = channels.flatMap((id) => (channelAt(clip.animation, id).enabled ? channelAt(clip.animation, id).keyframes.map((key) => key.frame) : []));
  const previous = frames.filter((frame) => frame < local).sort((a, b) => b - a)[0];
  const next = frames.filter((frame) => frame > local).sort((a, b) => a - b)[0];
  return (
    <div className="flex h-6 shrink-0 items-center gap-0.5 overflow-hidden border-b border-line/50 pr-1" style={pad}>
      <button
        type="button"
        aria-label={enabled ? `Disable ${row.label} animation` : `Enable ${row.label} animation`}
        aria-pressed={enabled}
        className={`flex size-4 shrink-0 items-center justify-center rounded-sm ${enabled ? 'text-accent' : 'text-fg-subtle hover:text-fg'}`}
        onClick={() => onAnimate(channels, !enabled)}
      >
        <Timer className="size-3" />
      </button>
      <span className="min-w-0 flex-1 truncate text-2xs text-fg-muted">{row.label}</span>
      <span className="flex min-w-0 items-center">
        {row.fields.map((spec) => (
          <NumberField
            key={spec.id}
            compact
            className="w-14 shrink"
            label={spec.label}
            value={shown[spec.id]}
            min={spec.min}
            max={spec.max}
            step={spec.step}
            precision={spec.precision}
            {...(spec.unit ? { unit: spec.unit } : {})}
            onScrubStart={() => onScrubStart(`Change ${spec.label}`)}
            onScrubEnd={onScrubEnd}
            onChange={(value) => onChange(spec, value, row.fields)}
          />
        ))}
      </span>
      <button type="button" aria-label="Previous keyframe" className="text-fg-subtle hover:text-fg disabled:opacity-30" disabled={previous === undefined} onClick={() => previous !== undefined && onSeek(previous)}>
        <ChevronLeft className="size-3" />
      </button>
      <button
        type="button"
        aria-label={atKey ? 'Remove keyframe' : 'Add keyframe'}
        className="flex size-4 items-center justify-center disabled:opacity-30"
        disabled={!enabled}
        onClick={() => onToggleKeyframe(channels)}
      >
        <Diamond filled={atKey} />
      </button>
      <button type="button" aria-label="Next keyframe" className="text-fg-subtle hover:text-fg disabled:opacity-30" disabled={next === undefined} onClick={() => next !== undefined && onSeek(next)}>
        <ChevronRight className="size-3" />
      </button>
      <button type="button" aria-label={`Reset ${row.label}`} className="text-fg-subtle hover:text-fg" onClick={() => onReset(channels)}>
        <RotateCcw className="size-3" />
      </button>
    </div>
  );
}

function LaneRow({
  row,
  fraction,
  keys,
  drag,
  selectedIds,
  onDrag,
  onSelect,
}: {
  readonly row: Row;
  readonly fraction: (frame: number) => string;
  readonly keys: ReadonlyMap<number, LaneKey[]>;
  readonly drag: { readonly ids: readonly string[]; readonly delta: number } | null;
  readonly selectedIds: readonly string[];
  readonly onDrag: (keys: readonly LaneKey[], event: ReactPointerEvent<HTMLButtonElement>) => void;
  readonly onSelect: (keys: readonly LaneKey[]) => void;
}) {
  return (
    <div className={`relative h-6 shrink-0 border-b border-line/50 ${row.type === 'group' ? 'bg-surface-2' : ''}`}>
      {row.type === 'motion'
        ? [...keys.entries()].map(([frame, laneKeys]) => {
            const ids = laneKeys.map((item) => item.key.id);
            const dragging = drag !== null && ids.some((id) => drag.ids.includes(id));
            const at = dragging && drag ? frame + drag.delta : frame;
            const selected = ids.some((id) => selectedIds.includes(id));
            return (
              <button
                key={frame}
                type="button"
                data-keyframe-ids={ids.join(' ')}
                data-keyframe-channels={laneKeys.map((item) => item.channel).join(' ')}
                aria-label={`${row.label} keyframe at frame ${at}`}
                className="absolute top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 p-1"
                style={{ left: fraction(at) }}
                onPointerDown={(event) => onDrag(laneKeys, event)}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(laneKeys);
                }}
              >
                <Diamond filled selected={selected} />
              </button>
            );
          })
        : null}
    </div>
  );
}
