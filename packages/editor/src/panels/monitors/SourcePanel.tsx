import { findTrack } from '@timeline/core';
import { useEffect, useState } from 'react';
import { useSelectionState } from '../../runtime/context';
import { useActiveSequence, useAsset, useSingleSelectedClip } from '../../runtime/hooks';
import { AudioClipMixer } from './AudioClipMixer';
import { EffectControlsPanel } from './EffectControlsPanel';
import { SourceMonitor } from './SourceMonitor';

type SourceTab = 'source' | 'effects' | 'mixer';

function PanelTab({
  active,
  label,
  testId,
  flexible,
  onClick,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly testId: string;
  readonly flexible?: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      title={label}
      data-testid={testId}
      className={`h-6 rounded-t-sm px-2 text-xs whitespace-nowrap ${
        flexible ? 'min-w-0 max-w-[42%] truncate' : 'shrink-0'
      } ${active ? 'bg-surface-1 font-semibold text-fg shadow-[inset_0_-2px_0_var(--color-accent)]' : 'text-fg-muted hover:bg-surface-3 hover:text-fg'}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/**
 * Top-left panel group. Source is always there. Effect Controls appears for a
 * selected video-track clip, and the audio mixer for a selected audio clip.
 */
export function SourcePanel() {
  const [tab, setTab] = useState<SourceTab>('source');
  const clip = useSingleSelectedClip();
  const sequence = useActiveSequence();
  const assetId = useSelectionState((state) => state.assetId);
  const sourceAsset = useAsset(assetId ?? clip?.assetId);
  const track = sequence && clip ? findTrack(sequence, clip.trackId) : undefined;
  const linked = sequence && clip?.linkId ? sequence.clips[clip.linkId] : undefined;
  const linkedTrack = sequence && linked ? findTrack(sequence, linked.trackId) : undefined;
  const showEffects = track?.kind === 'video' || linkedTrack?.kind === 'video';
  const mixerClip = track?.kind === 'audio' ? clip : linkedTrack?.kind === 'audio' ? linked : undefined;
  const showMixer = mixerClip !== undefined;
  const sourceName = sourceAsset?.name ?? clip?.name;
  const sourceLabel = sourceName ? `Source: ${sourceName}` : 'Source';

  useEffect(() => {
    if (tab === 'effects' && !showEffects) setTab('source');
    if (tab === 'mixer' && !showMixer) setTab('source');
  }, [showEffects, showMixer, tab]);

  const active: SourceTab = tab === 'effects' && showEffects ? 'effects' : tab === 'mixer' && showMixer ? 'mixer' : 'source';

  return (
    <section
      aria-label={active === 'effects' ? 'Effect Controls' : active === 'mixer' ? 'Audio Mixer' : 'Source'}
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-sm bg-surface-1"
    >
      <div role="tablist" aria-label="Source panel" className="flex h-7 shrink-0 items-end gap-0.5 border-b border-line bg-surface-2 px-1">
        <PanelTab active={active === 'source'} label={sourceLabel} testId="source-tab" flexible onClick={() => setTab('source')} />
        {showEffects ? (
          <PanelTab active={active === 'effects'} label="Effect Controls" testId="effect-controls-tab" onClick={() => setTab('effects')} />
        ) : null}
        {showMixer ? (
          <PanelTab active={active === 'mixer'} label="Audio Mixer" testId="audio-mixer-tab" onClick={() => setTab('mixer')} />
        ) : null}
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col">
        {active === 'effects' ? (
          <EffectControlsPanel />
        ) : active === 'mixer' && mixerClip && sequence ? (
          <AudioClipMixer clip={mixerClip} sequence={sequence} />
        ) : (
          <SourceMonitor />
        )}
      </div>
    </section>
  );
}
