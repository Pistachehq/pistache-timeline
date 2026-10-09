import { type MediaAsset, mediaTimeToSeconds } from '@timeline/core';
import { formatBytes, formatSeconds } from '@timeline/shared';
import { cn, IconButton } from '@timeline/ui';
import { AudioLines, Film, Link2Off, ListPlus, Loader2, Trash2 } from 'lucide-react';
import { memo } from 'react';
import { useMediaState, useRuntime, useSelectionState } from '../../runtime/context';
import { ASSET_DRAG_TYPE } from '../dnd';

function Thumbnail({ asset }: { asset: MediaAsset }) {
  const entry = useMediaState((s) => s.entries[asset.id]);
  const Icon = asset.hasVideo ? Film : AudioLines;
  return (
    <div className="relative flex h-9 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xs bg-surface-0">
      {entry?.thumbnail ? (
        <img src={entry.thumbnail} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : (
        <Icon className={cn('size-4', asset.hasVideo ? 'text-clip-video-strong' : 'text-clip-audio-strong')} />
      )}
      {entry?.status === 'resolving' ? (
        <Loader2 className="absolute size-3.5 animate-spin text-fg-muted" />
      ) : null}
    </div>
  );
}

function describe(asset: MediaAsset): string {
  const parts = [formatSeconds(mediaTimeToSeconds(asset.duration))];
  if (asset.resolution) parts.push(`${asset.resolution.width}×${asset.resolution.height}`);
  else parts.push('Audio');
  parts.push(formatBytes(asset.source.size));
  return parts.join(' · ');
}

export const MediaListItem = memo(function MediaListItem({ asset }: { asset: MediaAsset }) {
  const runtime = useRuntime();
  const selected = useSelectionState((s) => s.assetId === asset.id);
  const status = useMediaState((s) => s.entries[asset.id]?.status);
  const offline = status === 'offline' || status === 'error';

  return (
    <li
      className={cn(
        'group flex cursor-default items-center gap-2 rounded-sm px-1.5 py-1',
        selected ? 'bg-accent-muted' : 'hover:bg-surface-3',
      )}
      draggable={!offline}
      onDragStart={(event) => {
        event.dataTransfer.setData(ASSET_DRAG_TYPE, asset.id);
        event.dataTransfer.effectAllowed = 'copy';
        runtime.stores.ui.getState().setAssetDrag(asset.id);
      }}
      onDragEnd={() => runtime.stores.ui.getState().setAssetDrag(null)}
      data-testid="media-item"
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 text-left outline-none"
        aria-pressed={selected}
        onClick={() => runtime.stores.selection.getState().selectAsset(asset.id)}
        onDoubleClick={() => runtime.actions.edit.insertAssetAtPlayhead(asset.id)}
        title={`${asset.source.fileName}\nDouble-click to insert at the playhead, or drag onto a track.`}
      >
        <Thumbnail asset={asset} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-fg">{asset.name}</span>
          <span className="block truncate text-2xs text-fg-subtle">
            {offline ? <span className="text-danger">Media offline</span> : describe(asset)}
          </span>
        </span>
      </button>
      <div className={cn('flex items-center', offline ? '' : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100')}>
        {offline ? (
          <IconButton
            label={`Relink ${asset.name}`}
            icon={<Link2Off />}
            className="text-danger"
            onClick={() => void runtime.actions.media.relinkAsset(asset.id)}
          />
        ) : (
          <IconButton
            label="Insert at playhead"
            icon={<ListPlus />}
            onClick={() => runtime.actions.edit.insertAssetAtPlayhead(asset.id)}
          />
        )}
        <IconButton
          label={`Remove ${asset.name}`}
          icon={<Trash2 />}
          onClick={() => void runtime.actions.media.removeAsset(asset.id)}
        />
      </div>
    </li>
  );
});
