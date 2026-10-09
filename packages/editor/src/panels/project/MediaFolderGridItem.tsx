import { listMediaBinFolderContents, type MediaAssetId, type MediaBinFolder } from '@timeline/core';
import { cn, IconButton } from '@timeline/ui';
import { Folder, Pencil, Trash2 } from 'lucide-react';
import { memo, useCallback, useState, type DragEvent } from 'react';
import { useRuntime, useProjectState } from '../../runtime/context';
import { ASSET_DRAG_TYPE } from '../dnd';
import { assetIdsForBinMove } from './media-bin-selection';

export const MediaFolderGridItem = memo(function MediaFolderGridItem({
  folder,
  onOpen,
}: {
  readonly folder: MediaBinFolder;
  readonly onOpen: () => void;
}) {
  const runtime = useRuntime();
  const project = useProjectState((s) => s.project);
  const { folders, assets } = listMediaBinFolderContents(project, folder.id);
  const childCount = folders.length + assets.length;
  const [dropActive, setDropActive] = useState(false);

  const onDragOver = useCallback((event: DragEvent) => {
    if (!event.dataTransfer.types.includes(ASSET_DRAG_TYPE)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    setDropActive(true);
  }, []);

  const onDragLeave = useCallback((event: DragEvent) => {
    event.stopPropagation();
    setDropActive(false);
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setDropActive(false);
      const assetId = event.dataTransfer.getData(ASSET_DRAG_TYPE) as MediaAssetId;
      if (assetId) {
        const { assetIds } = runtime.stores.selection.getState();
        runtime.actions.media.moveAssetsToBin(assetIdsForBinMove(assetId, assetIds), folder.id);
      }
    },
    [folder.id, runtime.actions.media],
  );

  return (
    <li
      className="group relative list-none"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      data-testid="media-folder-item"
    >
      <button
        type="button"
        className={cn(
          'flex w-full flex-col rounded-sm p-1 text-left outline-none hover:bg-surface-3',
          dropActive && 'bg-accent/20 ring-1 ring-accent/50',
        )}
        onDoubleClick={onOpen}
        title={`${folder.name}\nDouble-click to open.`}
      >
        <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xs bg-surface-2 ring-1 ring-line/60">
          <Folder className="size-10 text-accent" strokeWidth={1.25} />
          <span className="absolute bottom-0.5 right-0.5 rounded-xs bg-black/70 px-1 py-px text-[10px] leading-none text-white/90">
            {childCount}
          </span>
        </div>
        <span className="mt-1 line-clamp-2 min-h-[2lh] px-0.5 text-2xs leading-tight text-fg">{folder.name}</span>
      </button>
      <div className="absolute right-1 top-1 flex gap-0.5 rounded-xs bg-surface-0/90 p-0.5 opacity-0 shadow-sm ring-1 ring-line/60 group-focus-within:opacity-100 group-hover:opacity-100">
        <IconButton
          label={`Rename ${folder.name}`}
          icon={<Pencil className="size-3" />}
          onClick={() => void runtime.actions.media.promptRenameBinFolder(folder.id)}
        />
        <IconButton
          label={`Delete folder ${folder.name}`}
          icon={<Trash2 className="size-3" />}
          onClick={() => void runtime.actions.media.removeBinFolder(folder.id)}
        />
      </div>
    </li>
  );
});
