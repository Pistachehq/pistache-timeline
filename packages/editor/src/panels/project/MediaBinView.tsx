import {
  countMediaBinItems,
  listMediaBinFolderContents,
  type MediaAssetId,
  type MediaBinFolderId,
} from '@timeline/core';
import { cn } from '@timeline/ui';
import { ArrowLeft } from 'lucide-react';
import { type DragEvent, type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRuntime, useProjectState, useUiState } from '../../runtime/context';
import { ASSET_DRAG_TYPE } from '../dnd';
import { assetIdsForBinMove, selectMediaAssetClick } from './media-bin-selection';
import { MediaBinMarqueeSelection } from './MediaBinMarqueeSelection';
import { MediaFolderGridItem } from './MediaFolderGridItem';
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
      const assetId = event.dataTransfer.getData(ASSET_DRAG_TYPE) as MediaAssetId;
      if (assetId) {
        const { assetIds } = runtime.stores.selection.getState();
        runtime.actions.media.moveAssetsToBin(assetIdsForBinMove(assetId, assetIds), folderId);
      }
    },
    [folderId, runtime.actions.media],
  );

  return { active, onDragOver, onDragLeave, onDrop };
}

function MediaBinBackItem({
  label,
  onBack,
}: {
  readonly label: string;
  readonly onBack: () => void;
}) {
  return (
    <li className="list-none">
      <button
        type="button"
        className="flex w-full flex-col rounded-sm p-1 text-left outline-none hover:bg-surface-3"
        onClick={onBack}
        onDoubleClick={onBack}
        title="Go to parent folder"
      >
        <div className="flex aspect-video w-full items-center justify-center rounded-xs bg-surface-1 ring-1 ring-dashed ring-line">
          <ArrowLeft className="size-8 text-fg-muted" strokeWidth={1.5} />
        </div>
        <span className="mt-1 line-clamp-2 min-h-[2lh] px-0.5 text-2xs leading-tight text-fg-subtle">{label}</span>
      </button>
    </li>
  );
}

export function MediaBinView() {
  const runtime = useRuntime();
  const project = useProjectState((s) => s.project);
  const openFolderId = useUiState((s) => s.mediaBinOpenFolderId);
  const setOpenFolderId = runtime.stores.ui.getState().setMediaBinOpenFolderId;

  const currentFolder = openFolderId ? project.mediaBinFolders[openFolderId] : null;

  useEffect(() => {
    if (openFolderId && !project.mediaBinFolders[openFolderId]) {
      setOpenFolderId(null);
    }
  }, [openFolderId, project.mediaBinFolders, setOpenFolderId]);

  const { folders, assets } = listMediaBinFolderContents(project, openFolderId);
  const drop = useAssetDropTarget(openFolderId);

  const backLabel = useMemo(() => {
    if (!currentFolder) return '';
    const parent = currentFolder.parentId ? project.mediaBinFolders[currentFolder.parentId] : null;
    return parent ? `Back · ${parent.name}` : 'Back · Project';
  }, [currentFolder, project.mediaBinFolders]);

  const goBack = useCallback(() => {
    if (!currentFolder) return;
    setOpenFolderId(currentFolder.parentId);
  }, [currentFolder, setOpenFolderId]);

  const openFolder = useCallback(
    (folderId: MediaBinFolderId) => {
      setOpenFolderId(folderId);
    },
    [setOpenFolderId],
  );

  const counts = countMediaBinItems(project);
  const gridRef = useRef<HTMLUListElement>(null);
  const orderedAssetIds = useMemo(() => assets.map((a) => a.id), [assets]);

  const onAssetSelectClick = useCallback(
    (assetId: MediaAssetId) => (event: MouseEvent) => {
      selectMediaAssetClick(runtime.stores.selection.getState(), orderedAssetIds, assetId, event);
    },
    [orderedAssetIds, runtime.stores.selection],
  );

  const folderKey = openFolderId ?? 'root';

  return (
    <div key={folderKey} className="flex min-h-0 flex-1 flex-col animate-tl-slide-up">
      <MediaBinMarqueeSelection gridRef={gridRef} />
      {currentFolder ? (
        <div className="shrink-0 truncate border-b border-line px-2.5 py-1 text-2xs text-fg-subtle">
          {currentFolder.name}
        </div>
      ) : null}
      <ul
        ref={gridRef}
        data-media-bin-grid
        className={cn(
          GRID,
          'min-h-0 flex-1 overflow-y-auto p-1.5 transition-colors duration-150',
          drop.active && 'rounded-sm bg-accent/10',
        )}
        aria-label="Media assets"
        onDragOver={drop.onDragOver}
        onDragLeave={drop.onDragLeave}
        onDrop={drop.onDrop}
      >
        {currentFolder ? <MediaBinBackItem label={backLabel} onBack={goBack} /> : null}
        {folders.map((folder) => (
          <MediaFolderGridItem key={folder.id} folder={folder} onOpen={() => openFolder(folder.id)} />
        ))}
        {assets.map((asset) => (
          <MediaListItem key={asset.id} asset={asset} onSelectClick={onAssetSelectClick(asset.id)} />
        ))}
      </ul>
      <div className="flex h-7 shrink-0 items-center justify-between border-t border-line px-2.5 text-2xs text-fg-subtle">
        <span>
          {counts.assets} item{counts.assets === 1 ? '' : 's'}
          {counts.folders > 0 ? ` · ${counts.folders} folder${counts.folders === 1 ? '' : 's'}` : ''}
        </span>
      </div>
    </div>
  );
}
