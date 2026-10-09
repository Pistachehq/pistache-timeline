import { getMediaAssets } from '@timeline/core';
import { Button, EmptyState, IconButton, PanelFrame } from '@timeline/ui';
import { FolderOpen, Import } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { executeCommand, shortcutLabel } from '../../commands/commands';
import { useProjectState, useRuntime } from '../../runtime/context';
import { MediaListItem } from './MediaListItem';

/** Project / media bin: lists imported assets and offers import and relink actions. */
export function ProjectPanel() {
  const runtime = useRuntime();
  const assets = useProjectState(useShallow((s) => getMediaAssets(s.project)));
  const projectName = useProjectState((s) => s.project.name);
  const importMedia = () => executeCommand('file.import', runtime);

  return (
    <PanelFrame
      title={`Project: ${projectName}`}
      actions={
        <IconButton label="Import media" shortcut={shortcutLabel('file.import')} icon={<Import />} onClick={importMedia} />
      }
    >
      {assets.length === 0 ? (
        <EmptyState
          icon={<FolderOpen />}
          title="No media imported"
          description="Import video or audio files, then drag them onto the timeline."
          action={
            <Button size="sm" icon={<Import className="size-3.5" />} onClick={importMedia}>
              Import Media
            </Button>
          }
        />
      ) : (
        <>
          <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-1" aria-label="Media assets">
            {assets.map((asset) => (
              <MediaListItem key={asset.id} asset={asset} />
            ))}
          </ul>
          <div className="flex h-6 shrink-0 items-center border-t border-line px-2.5 text-2xs text-fg-subtle">
            {assets.length} item{assets.length === 1 ? '' : 's'}
          </div>
        </>
      )}
    </PanelFrame>
  );
}
