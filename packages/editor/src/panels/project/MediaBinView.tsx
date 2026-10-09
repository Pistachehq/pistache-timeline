import {
  countMediaBinItems,
  listMediaBinFolderContents,
  type MediaAssetId,
  type MediaBinFolderId,
  type Project,
} from '@timeline/core';
import { cn } from '@timeline/ui';
import { ChevronRight, Folder, FolderOpen, Trash2 } from 'lucide-react';
import { type DragEvent, useCallback, useState } from 'react';
import { useRuntime, useProjectState } from '../../runtime/context';
import { ASSET_DRAG_TYPE } from '../dnd';
import { MediaListItem } from './MediaListItem';

const GRID = 'grid grid-cols-3 gap-1.5';

function useAssetDropTarget(folderId: MediaBinFolderId | null) {
  const runtime = useRuntime();
  const [active, setActive] = useState(false);

  const onDragOver = useCallback((event: DragEvent) => {
    if (!event.dataTransfer.types.includes(ASSET_DRAG_TYPE)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    setActive(true);
  }, []);

  const onDragLeave = useCallback((event: DragEvent) => {
    event.stopPropagation();
    setActive(false);
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setActive(false);
      const assetId = event.dataTransfer.getData(ASSET_DRAG_TYPE);
      if (assetId) runtime.actions.media.moveAssetToBin(assetId as MediaAssetId, folderId);
    },
    [folderId, runtime.actions.media],
  );

  return { active, onDragOver, onDragLeave, onDrop };
}

function BinFolderRow({
  project,
  folderId,
  collapsed,
  toggleCollapsed,
}: {
  project: Project;
  folderId: MediaBinFolderId;
  collapsed: ReadonlySet<string>;
  toggleCollapsed: (id: MediaBinFolderId) => void;
}) {
  const runtime = useRuntime();
  const folder = project.mediaBinFolders[folderId];
  if (!folder) return null;
  const expanded = !collapsed.has(folderId);
  const drop = useAssetDropTarget(folderId);
  const { folders, assets } = listMediaBinFolderContents(project, folderId);
  const childCount = folders.length + assets.length;

  return (
    <li className="col-span-3 list-none">
      <div
        className={cn(
          'group flex items-center gap-0.5 rounded-sm py-1 pr-1',
          drop.active && 'bg-accent/20 ring-1 ring-accent/50',
        )}
        onDragOver={drop.onDragOver}
        onDragLeave={drop.onDragLeave}
        onDrop={drop.onDrop}
      >
        <button
          type="button"
          className="flex size-7 shrink-0 items-center justify-center rounded-xs text-fg-muted hover:bg-surface-3"
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse folder' : 'Expand folder'}
          onClick={() => toggleCollapsed(folderId)}
        >
          <ChevronRight className={cn('size-3.5 transition-transform', expanded && 'rotate-90')} />
        </button>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xs py-0.5 text-left hover:bg-surface-3"
          onDoubleClick={() => void runtime.actions.media.promptRenameBinFolder(folderId)}
          title="Double-click to rename"
        >
          {expanded ? (
            <FolderOpen className="size-4 shrink-0 text-accent" />
          ) : (
            <Folder className="size-4 shrink-0 text-accent" />
          )}
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{folder.name}</span>
          <span className="shrink-0 text-2xs text-fg-subtle">{childCount}</span>
        </button>
        <button
          type="button"
          className="rounded-xs p-1 text-fg-subtle opacity-0 hover:bg-surface-4 hover:text-danger group-hover:opacity-100"
          aria-label={`Delete folder ${folder.name}`}
          onClick={() => void runtime.actions.media.removeBinFolder(folderId)}
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      {expanded ? (
        <MediaBinLevel
          project={project}
          parentId={folderId}
          collapsed={collapsed}
          toggleCollapsed={toggleCollapsed}
          nested
        />
      ) : null}
    </li>
  );
}

function MediaBinLevel({
  project,
  parentId,
  collapsed,
  toggleCollapsed,
  nested = false,
}: {
  project: Project;
  parentId: MediaBinFolderId | null;
  collapsed: ReadonlySet<string>;
  toggleCollapsed: (id: MediaBinFolderId) => void;
  nested?: boolean;
}) {
  const { folders, assets } = listMediaBinFolderContents(project, parentId);
  const drop = useAssetDropTarget(parentId);

  return (
    <ul
      className={cn(
        GRID,
        parentId === null && 'min-h-0 flex-1 overflow-y-auto p-1.5',
        nested && 'mt-1 w-full border-l border-line/50 pl-2',
        drop.active && parentId === null && 'rounded-sm bg-accent/10',
      )}
      aria-label={parentId === null ? 'Media assets' : undefined}
      onDragOver={drop.onDragOver}
      onDragLeave={drop.onDragLeave}
      onDrop={drop.onDrop}
    >
      {folders.map((folder) => (
        <BinFolderRow
          key={folder.id}
          project={project}
          folderId={folder.id}
          collapsed={collapsed}
          toggleCollapsed={toggleCollapsed}
        />
      ))}
      {assets.map((asset) => (
        <MediaListItem key={asset.id} asset={asset} />
      ))}
    </ul>
  );
}

export function MediaBinView() {
  const project = useProjectState((s) => s.project);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  const toggleCollapsed = useCallback((folderId: MediaBinFolderId) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }, []);

  const counts = countMediaBinItems(project);

  return (
    <>
      <MediaBinLevel
        project={project}
        parentId={null}
        collapsed={collapsed}
        toggleCollapsed={toggleCollapsed}
      />
      <div className="flex h-7 shrink-0 items-center justify-between border-t border-line px-2.5 text-2xs text-fg-subtle">
        <span>
          {counts.assets} item{counts.assets === 1 ? '' : 's'}
          {counts.folders > 0 ? ` · ${counts.folders} folder${counts.folders === 1 ? '' : 's'}` : ''}
        </span>
      </div>
    </>
  );
}
