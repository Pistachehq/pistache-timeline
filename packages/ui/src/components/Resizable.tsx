import { Group, Panel, Separator, useDefaultLayout, type GroupProps, type PanelProps } from 'react-resizable-panels';
import { cn } from '../cn';

/*
 * Thin wrappers around react-resizable-panels so the editor depends on a
 * stable local API and shared styling rather than on the library directly.
 */

export interface ResizableGroupProps extends Omit<GroupProps, 'orientation'> {
  orientation: 'horizontal' | 'vertical';
  /** When set, the layout is remembered in localStorage under this id. */
  storageId?: string;
}

export function ResizableGroup({ orientation, storageId, className, ...props }: ResizableGroupProps) {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: `timeline-layout:${storageId ?? 'ephemeral'}`,
    storage: storageId ? localStorage : memoryStorage,
  });
  return (
    <Group
      orientation={orientation}
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
      className={cn('h-full w-full', className)}
      {...props}
    />
  );
}

export type ResizablePanelProps = PanelProps;

export function ResizablePanel({ className, ...props }: ResizablePanelProps) {
  return <Panel className={cn('min-h-0 min-w-0', className)} {...props} />;
}

export function ResizableHandle({ orientation }: { orientation: 'horizontal' | 'vertical' }) {
  return (
    <Separator
      className={cn(
        'group relative flex shrink-0 items-center justify-center bg-surface-0 outline-none',
        orientation === 'horizontal' ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize',
      )}
    >
      <span
        className={cn(
          'rounded-full bg-transparent transition-colors group-hover:bg-accent/60 group-focus-visible:bg-accent group-data-[separator=active]:bg-accent',
          orientation === 'horizontal' ? 'h-8 w-0.5' : 'h-0.5 w-8',
        )}
      />
    </Separator>
  );
}

const memoryValues = new Map<string, string>();
const memoryStorage = {
  getItem: (key: string) => memoryValues.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memoryValues.set(key, value);
  },
};
