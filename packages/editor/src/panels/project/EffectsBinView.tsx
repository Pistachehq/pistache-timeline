import { cn } from '@timeline/ui';
import { ArrowLeft } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { useRuntime, useUiState } from '../../runtime/context';
import {
  EFFECT_CATEGORIES,
  effectsBinBreadcrumb,
  getEffectCategory,
  listEffectsBinContents,
  type EffectCategoryId,
} from './effects-catalog';
import { EffectBinFolderItem } from './EffectBinFolderItem';
import { EffectCategoryFolderItem } from './EffectCategoryFolderItem';
import { EffectLibraryItem } from './EffectLibraryItem';

const GRID = 'grid grid-cols-3 gap-1.5';

function EffectsBinBackItem({ label, onBack }: { readonly label: string; readonly onBack: () => void }) {
  return (
    <li className="list-none">
      <button
        type="button"
        className="flex w-full flex-col rounded-sm p-1 text-left outline-none hover:bg-surface-3"
        onClick={onBack}
        onDoubleClick={onBack}
        title="Back"
      >
        <div className="flex aspect-video w-full items-center justify-center rounded-xs bg-surface-1 ring-1 ring-dashed ring-line">
          <ArrowLeft className="size-8 text-fg-muted" strokeWidth={1.5} />
        </div>
        <span className="mt-1 line-clamp-2 min-h-[2lh] px-0.5 text-2xs leading-tight text-fg-subtle">{label}</span>
      </button>
    </li>
  );
}

export function EffectsBinView() {
  const runtime = useRuntime();
  const openCategoryId = useUiState((s) => s.effectsBinOpenCategoryId);
  const openPath = useUiState((s) => s.effectsBinOpenPath);
  const ui = runtime.stores.ui.getState();

  const category = openCategoryId ? getEffectCategory(openCategoryId) : null;
  const { folders, presets } = listEffectsBinContents(openCategoryId, openPath);

  const header = useMemo(() => {
    if (!category) return 'Drag a preset onto a timeline clip';
    if (!openPath || openPath === category.id) return category.name;
    const crumbs = effectsBinBreadcrumb(category.id, openPath);
    return [category.name, ...crumbs].join(' / ');
  }, [category, openPath]);

  const goBack = useCallback(() => {
    if (!openCategoryId) return;
    if (openPath && openPath !== openCategoryId) {
      const parent = openPath.lastIndexOf('/');
      ui.setEffectsBinOpenPath(parent > 0 ? openPath.slice(0, parent) : null);
      return;
    }
    ui.setEffectsBinOpenCategoryId(null);
  }, [openCategoryId, openPath, ui]);

  const openCategory = useCallback(
    (id: EffectCategoryId) => ui.setEffectsBinOpenCategoryId(id),
    [ui],
  );

  const openFolder = useCallback((path: string) => ui.setEffectsBinOpenPath(path), [ui]);

  const backLabel = category ? 'Back' : '';
  const folderKey = `${openCategoryId ?? 'root'}:${openPath ?? ''}`;
  const itemCount = folders.length + presets.length;

  return (
    <div key={folderKey} className="flex min-h-0 flex-1 flex-col animate-tl-slide-up">
      <div className="shrink-0 truncate border-b border-line px-2.5 py-1 text-2xs text-fg-subtle">{header}</div>
      <ul className={cn(GRID, 'min-h-0 flex-1 overflow-y-auto p-1.5')} aria-label="Effect library">
        {category ? <EffectsBinBackItem label={backLabel} onBack={goBack} /> : null}
        {!category
          ? EFFECT_CATEGORIES.map((cat) => (
              <EffectCategoryFolderItem key={cat.id} category={cat} onOpen={() => openCategory(cat.id)} />
            ))
          : null}
        {category
          ? folders.map((folder) => (
              <EffectBinFolderItem key={folder.id} name={folder.name} onOpen={() => openFolder(folder.id)} />
            ))
          : null}
        {category ? presets.map((entry) => <EffectLibraryItem key={entry.id} entry={entry} />) : null}
      </ul>
      <div className="flex h-7 shrink-0 items-center border-t border-line px-2.5 text-2xs text-fg-subtle">
        {category ? (
          <span>
            {itemCount} item{itemCount === 1 ? '' : 's'}
          </span>
        ) : (
          <span>{EFFECT_CATEGORIES.length} categories</span>
        )}
      </div>
    </div>
  );
}
