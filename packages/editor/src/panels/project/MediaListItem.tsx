import { type MediaAsset, mediaTimeToSeconds } from '@timeline/core';
import { formatSeconds } from '@timeline/shared';
import { cn, IconButton } from '@timeline/ui';
import { AudioLines, Film, ImageIcon, Link2Off, ListPlus, Loader2, Trash2 } from 'lucide-react';
import { memo } from 'react';
import { useMediaState, useRuntime, useSelectionState } from '../../runtime/context';
import { ASSET_DRAG_TYPE } from '../dnd';

function MediaThumb({ asset }: { asset: MediaAsset }) {
  const entry = useMediaState((s) => s.entries[asset.id]);
  const Icon = asset.kind === 'image' ? ImageIcon : asset.hasVideo ? Film : AudioLines;
  const iconClass =
    asset.kind === 'image'
      ? 'text-fg-muted'
      : asset.hasVideo
        ? 'text-clip-video-strong'
        : 'text-clip-audio-strong';
  const duration = formatSeconds(mediaTimeToSeconds(asset.duration));

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xs bg-surface-0 ring-1 ring-line/60">
      {entry?.thumbnail ? (
        <img src={entry.thumbnail} alt="" className="size-full object-cover" draggable={false} />
      ) : (
        <div className="flex size-full items-center justify-center bg-surface-2">
          <Icon className={cn('size-6', iconClass)} />
        </div>
      )}
      {entry?.status === 'resolving' ? (
        <Loader2 className="absolute inset-0 m-auto size-5 animate-spin text-fg-muted" />
      ) : null}
      {!offlineBadge(entry?.status) ? (
        <span className="absolute bottom-0.5 right-0.5 rounded-xs bg-black/70 px-1 py-px font-mono text-[10px] leading-none text-white/90">
          {duration}
        </span>
      ) : null}
    </div>
  );
}

function offlineBadge(status: string | undefined): boolean {
  return status === 'offline' || status === 'error';
}

export const MediaListItem = memo(function MediaListItem({ asset }: { asset: MediaAsset }) {
  const runtime = useRuntime();
  const selected = useSelectionState((s) => s.assetId === asset.id);
  const status = useMediaState((s) => s.entries[asset.id]?.status);
  const offline = offlineBadge(status);

  return (
    <li
      className={cn(
        'group relative list-none',
        selected && 'z-10',
      )}
      draggable={!offline}
      onDragStart={(event) => {
        event.dataTransfer.setData(ASSET_DRAG_TYPE, asset.id);
        event.dataTransfer.effectAllowed = 'copyMove';
        runtime.stores.ui.getState().setAssetDrag(asset.id);
      }}
      onDragEnd={() => runtime.stores.ui.getState().setAssetDrag(null)}
      data-testid="media-item"
    >
      <button
        type="button"
        className={cn(
          'flex w-full flex-col rounded-sm p-1 text-left outline-none',
          selected ? 'bg-accent-muted ring-1 ring-accent/40' : 'hover:bg-surface-3',
        )}
        aria-pressed={selected}
        onClick={() => runtime.stores.selection.getState().selectAsset(asset.id)}
        onDoubleClick={() => runtime.actions.edit.insertAssetAtPlayhead(asset.id)}
        title={`${asset.source.fileName}\nDouble-click to insert at the playhead, or drag onto a track.`}
      >
        <MediaThumb asset={asset} />
        <span className="mt-1 line-clamp-2 min-h-[2lh] px-0.5 text-2xs leading-tight text-fg">{asset.name}</span>
        {offline ? (
          <span className="px-0.5 text-[10px] text-danger">Offline</span>
        ) : null}
      </button>
      <div
        className={cn(
          'absolute right-1 top-1 flex gap-0.5 rounded-xs bg-surface-0/90 p-0.5 shadow-sm ring-1 ring-line/60',
          offline ? '' : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100',
        )}
      >
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
