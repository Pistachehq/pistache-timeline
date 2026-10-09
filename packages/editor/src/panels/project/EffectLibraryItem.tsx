import { cn } from '@timeline/ui';
import { Sparkles } from 'lucide-react';
import { memo, type DragEvent } from 'react';
import { useRuntime } from '../../runtime/context';
import { writeEffectDragData } from '../dnd';
import { type EffectLibraryEntry } from './effects-catalog';

export const EffectLibraryItem = memo(function EffectLibraryItem({
  entry,
}: {
  readonly entry: EffectLibraryEntry;
}) {
  const runtime = useRuntime();

  const onDragStart = (event: DragEvent) => {
    writeEffectDragData(event.dataTransfer, entry.payload);
    runtime.stores.ui.getState().setEffectDrag(entry.payload);
  };

  const onDragEnd = () => {
    runtime.stores.ui.getState().setEffectDrag(null);
  };

  return (
    <li
      className="list-none"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      data-effect-library-id={entry.id}
    >
      <div
        className={cn(
          'flex w-full cursor-grab flex-col rounded-sm p-1 active:cursor-grabbing',
          'hover:bg-surface-3',
        )}
        title={`${entry.name}\nDrag onto a timeline clip`}
      >
        <div className="flex aspect-video w-full items-center justify-center rounded-xs bg-surface-1 ring-1 ring-line/60">
          <Sparkles className="size-7 text-accent/80" strokeWidth={1.5} />
        </div>
        <span className="mt-1 line-clamp-2 min-h-[2lh] px-0.5 text-2xs font-medium leading-tight text-fg">
          {entry.name}
        </span>
      </div>
    </li>
  );
});
