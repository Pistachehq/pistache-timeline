import { cn } from '@timeline/ui';
import { ArrowLeft } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { useRuntime, useUiState } from '../../runtime/context';
import {
  EFFECT_CATEGORIES,
  getEffectCategory,
  listEffectsInCategory,
  type EffectCategoryId,
} from './effects-catalog';
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
        title="Back to categories"
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
  const setOpenCategoryId = runtime.stores.ui.getState().setEffectsBinOpenCategoryId;

  const category = openCategoryId ? getEffectCategory(openCategoryId) : null;
  const items = openCategoryId ? listEffectsInCategory(openCategoryId) : [];

  const backLabel = useMemo(() => (category ? 'Back · Effects' : ''), [category]);

  const goBack = useCallback(() => setOpenCategoryId(null), [setOpenCategoryId]);

  const openCategory = useCallback(
    (id: EffectCategoryId) => setOpenCategoryId(id),
    [setOpenCategoryId],
  );

  const folderKey = openCategoryId ?? 'root';

  return (
    <div key={folderKey} className="flex min-h-0 flex-1 flex-col animate-tl-slide-up">
      {category ? (
        <div className="shrink-0 truncate border-b border-line px-2.5 py-1 text-2xs text-fg-subtle">
          {category.name}
        </div>
      ) : (
        <div className="shrink-0 border-b border-line px-2.5 py-1 text-2xs text-fg-subtle">
          Drag a preset onto a timeline clip
        </div>
      )}
      <ul className={cn(GRID, 'min-h-0 flex-1 overflow-y-auto p-1.5')} aria-label="Effect library">
        {category ? <EffectsBinBackItem label={backLabel} onBack={goBack} /> : null}
        {!category
          ? EFFECT_CATEGORIES.map((cat) => (
              <EffectCategoryFolderItem key={cat.id} category={cat} onOpen={() => openCategory(cat.id)} />
            ))
          : items.map((entry) => <EffectLibraryItem key={entry.id} entry={entry} />)}
      </ul>
      <div className="flex h-7 shrink-0 items-center border-t border-line px-2.5 text-2xs text-fg-subtle">
        {category ? (
          <span>
            {items.length} preset{items.length === 1 ? '' : 's'}
          </span>
        ) : (
          <span>{EFFECT_CATEGORIES.length} categories</span>
        )}
      </div>
    </div>
  );
}
