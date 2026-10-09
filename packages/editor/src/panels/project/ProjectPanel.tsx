import { countMediaBinItems } from '@timeline/core';
import { Button, EmptyState, IconButton, PanelFrame } from '@timeline/ui';
import { FolderOpen, FolderPlus, FolderUp, Import } from 'lucide-react';
import { type DragEvent } from 'react';
import { executeCommand, shortcutLabel } from '../../commands/commands';
import { useProjectState, useRuntime, useUiState } from '../../runtime/context';
import { allowOsFileDrop, filesFromDataTransfer, isOsFileDrag } from '../file-drop';
import { MediaBinView } from './MediaBinView';

/** Project / media bin: lists imported assets and offers import and relink actions. */
export function ProjectPanel() {
  const runtime = useRuntime();
  const project = useProjectState((s) => s.project);
  const projectName = project.name;
  const { assets: assetCount, folders: folderCount } = countMediaBinItems(project);
  const openBinFolderId = useUiState((s) => s.mediaBinOpenFolderId);
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
        <>
          <IconButton label="New folder" icon={<FolderPlus />} onClick={newFolder} />
          <IconButton
            label="Import folder"
            shortcut={shortcutLabel('file.importFolder')}
            icon={<FolderUp />}
            onClick={importFolder}
          />
          <IconButton label="Import media" shortcut={shortcutLabel('file.import')} icon={<Import />} onClick={importMedia} />
        </>
      }
    >
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
          <div className="flex min-h-0 flex-1 flex-col">
            <MediaBinView />
          </div>
        )}
      </div>
    </PanelFrame>
  );
}
