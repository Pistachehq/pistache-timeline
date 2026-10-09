import { countMediaBinItems } from '@timeline/core';
import { Button, cn, EmptyState, IconButton, PanelFrame } from '@timeline/ui';
import { FolderOpen, FolderPlus, FolderUp, Import } from 'lucide-react';
import { type DragEvent } from 'react';
import { executeCommand, shortcutLabel } from '../../commands/commands';
import { useProjectState, useRuntime, useUiState } from '../../runtime/context';
import { type ProjectBinTab } from '../../state/ui-store';
import { allowOsFileDrop, filesFromDataTransfer, isOsFileDrag } from '../file-drop';
import { EffectsBinView } from './EffectsBinView';
import { MediaBinView } from './MediaBinView';

function BinTab({
  active,
  label,
  onClick,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={cn(
        'rounded-sm px-2 py-0.5 text-2xs font-medium transition-colors',
        active ? 'bg-surface-4 text-fg' : 'text-fg-subtle hover:bg-surface-3 hover:text-fg',
      )}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/** Project / media bin: lists imported assets and offers import and relink actions. */
export function ProjectPanel() {
  const runtime = useRuntime();
  const project = useProjectState((s) => s.project);
  const projectName = project.name;
  const { assets: assetCount, folders: folderCount } = countMediaBinItems(project);
  const openBinFolderId = useUiState((s) => s.mediaBinOpenFolderId);
  const binTab = useUiState((s) => s.projectBinTab);
  const setBinTab = runtime.stores.ui.getState().setProjectBinTab;
  const importMedia = () => executeCommand('file.import', runtime);
  const importFolder = () => executeCommand('file.importFolder', runtime);
  const newFolder = () => runtime.actions.media.createBinFolder(openBinFolderId);

  const onDropFiles = (event: DragEvent) => {
    if (!isOsFileDrag(event.dataTransfer)) return;
    event.preventDefault();
    void runtime.actions.media.importLocalFiles(filesFromDataTransfer(event.dataTransfer));
  };

  return (
    <PanelFrame
      title={`Project: ${projectName}`}
      actions={
        binTab === 'media' ? (
          <>
            <IconButton label="New folder" icon={<FolderPlus />} onClick={newFolder} />
            <IconButton
              label="Import folder"
              shortcut={shortcutLabel('file.importFolder')}
              icon={<FolderUp />}
              onClick={importFolder}
            />
            <IconButton
              label="Import media"
              shortcut={shortcutLabel('file.import')}
              icon={<Import />}
              onClick={importMedia}
            />
          </>
        ) : null
      }
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div
          className="flex shrink-0 gap-1 border-b border-line px-2 py-1"
          role="tablist"
          aria-label="Project panel"
        >
          <BinTab active={binTab === 'media'} label="Media" onClick={() => setBinTab('media' satisfies ProjectBinTab)} />
          <BinTab
            active={binTab === 'effects'}
            label="Effects"
            onClick={() => setBinTab('effects' satisfies ProjectBinTab)}
          />
        </div>
        {binTab === 'effects' ? (
          <EffectsBinView />
        ) : (
          <div
            className="flex min-h-0 flex-1 flex-col"
            onDragOver={allowOsFileDrop}
            onDrop={onDropFiles}
          >
            {assetCount === 0 && folderCount === 0 ? (
              <EmptyState
                icon={<FolderOpen />}
                title="No media imported"
                description="Drop files or folders here (video, audio, images), import a folder to keep its structure, or create bins and drag clips into them."
                action={
                  <Button size="sm" icon={<Import className="size-3.5" />} onClick={importMedia}>
                    Import Media
                  </Button>
                }
              />
            ) : (
              <div className="flex min-h-0 flex-1 flex-col animate-tl-fade-in">
                <MediaBinView />
              </div>
            )}
          </div>
        )}
      </div>
    </PanelFrame>
  );
}
