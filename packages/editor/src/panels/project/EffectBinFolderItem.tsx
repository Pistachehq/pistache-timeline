import { Folder } from 'lucide-react';
import { memo } from 'react';

export const EffectBinFolderItem = memo(function EffectBinFolderItem({
  name,
  onOpen,
}: {
  readonly name: string;
  readonly onOpen: () => void;
}) {
  return (
    <li className="list-none">
      <button
        type="button"
        className="flex w-full flex-col rounded-sm p-1 text-left outline-none hover:bg-surface-3"
        onClick={onOpen}
        onDoubleClick={onOpen}
      >
        <div className="flex aspect-video w-full items-center justify-center rounded-xs bg-surface-2 ring-1 ring-line/60">
          <Folder className="size-8 text-accent/70" strokeWidth={1.5} />
        </div>
        <span className="mt-1 line-clamp-2 min-h-[2lh] px-0.5 text-2xs leading-tight text-fg">{name}</span>
      </button>
    </li>
  );
});
