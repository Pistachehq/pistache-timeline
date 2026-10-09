import { Check } from 'lucide-react';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { cn } from '../cn';

export type MenuEntry =
  | {
      type: 'item';
      id: string;
      label: string;
      shortcut?: string | undefined;
      disabled?: boolean | undefined;
      checked?: boolean | undefined;
      onSelect: () => void;
    }
  | { type: 'separator'; id: string };

export interface MenuDefinition {
  id: string;
  label: string;
  items: readonly MenuEntry[];
}

export interface MenuBarProps {
  menus: readonly MenuDefinition[];
  className?: string;
}

function enabledItemIndexes(items: readonly MenuEntry[]): number[] {
  return items.flatMap((item, index) => (item.type === 'item' && !item.disabled ? [index] : []));
}

/** Application menu bar with dropdown menus and full keyboard navigation. */
export function MenuBar({ menus, className }: MenuBarProps) {
  const [open, setOpen] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const triggerRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (open === null) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(null);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const focusItem = (menuIndex: number, which: 'first' | 'last') => {
    const items = menus[menuIndex]?.items ?? [];
    const indexes = enabledItemIndexes(items);
    const target = which === 'first' ? indexes[0] : indexes[indexes.length - 1];
    requestAnimationFrame(() => {
      if (target !== undefined) itemRefs.current[target]?.focus();
    });
  };

  const openMenu = (index: number, focus?: 'first' | 'last') => {
    const wrapped = (index + menus.length) % menus.length;
    setOpen(wrapped);
    if (focus) focusItem(wrapped, focus);
    else triggerRefs.current[wrapped]?.focus();
  };

  const close = (restoreFocus: boolean) => {
    const current = open;
    setOpen(null);
    if (restoreFocus && current !== null) triggerRefs.current[current]?.focus();
  };

  const onMenuKeyDown = (event: KeyboardEvent, menuIndex: number) => {
    const items = menus[menuIndex]?.items ?? [];
    const indexes = enabledItemIndexes(items);
    const focused = itemRefs.current.findIndex((el) => el === document.activeElement);
    const position = indexes.indexOf(focused);
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        itemRefs.current[indexes[(position + 1) % indexes.length] ?? 0]?.focus();
        break;
      case 'ArrowUp':
        event.preventDefault();
        itemRefs.current[indexes[(position - 1 + indexes.length) % indexes.length] ?? 0]?.focus();
        break;
      case 'ArrowRight':
        event.preventDefault();
        openMenu(menuIndex + 1, 'first');
        break;
      case 'ArrowLeft':
        event.preventDefault();
        openMenu(menuIndex - 1, 'first');
        break;
      case 'Escape':
        event.preventDefault();
        close(true);
        break;
      case 'Tab':
        close(false);
        break;
    }
    event.stopPropagation();
  };

  return (
    <div ref={rootRef} role="menubar" aria-label="Application menu" className={cn('flex items-center', className)}>
      {menus.map((menu, menuIndex) => {
        const isOpen = open === menuIndex;
        return (
          <div key={menu.id} className="relative">
            <button
              ref={(el) => {
                triggerRefs.current[menuIndex] = el;
              }}
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={isOpen}
              className={cn(
                'h-6 rounded-sm px-2 text-sm text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg',
                isOpen && 'bg-surface-4 text-fg',
              )}
              onClick={() => (isOpen ? close(false) : openMenu(menuIndex))}
              onPointerEnter={() => {
                if (open !== null && !isOpen) openMenu(menuIndex);
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  openMenu(menuIndex, 'first');
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  openMenu(menuIndex, 'last');
                } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                  event.preventDefault();
                  const delta = event.key === 'ArrowRight' ? 1 : -1;
                  if (open !== null) openMenu(menuIndex + delta);
                  else triggerRefs.current[(menuIndex + delta + menus.length) % menus.length]?.focus();
                } else if (event.key === 'Escape') {
                  close(true);
                }
                event.stopPropagation();
              }}
            >
              {menu.label}
            </button>
            {isOpen ? (
              <div
                role="menu"
                aria-label={menu.label}
                className="absolute top-full left-0 z-50 mt-1 min-w-[220px] rounded-md border border-line-strong bg-surface-2 py-1 shadow-popover"
                onKeyDown={(event) => onMenuKeyDown(event, menuIndex)}
              >
                {menu.items.map((item, itemIndex) =>
                  item.type === 'separator' ? (
                    <div key={item.id} role="separator" className="my-1 h-px bg-line" />
                  ) : (
                    <button
                      key={item.id}
                      ref={(el) => {
                        itemRefs.current[itemIndex] = el;
                      }}
                      type="button"
                      role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                      aria-checked={item.checked}
                      aria-disabled={item.disabled}
                      tabIndex={-1}
                      disabled={item.disabled}
                      className={cn(
                        'flex h-6 w-full items-center gap-2 px-2 text-left text-sm outline-none',
                        item.disabled
                          ? 'cursor-default text-fg-disabled'
                          : 'text-fg hover:bg-accent hover:text-accent-fg focus:bg-accent focus:text-accent-fg',
                      )}
                      onClick={() => {
                        close(false);
                        item.onSelect();
                      }}
                    >
                      <span className="flex w-4 justify-center">
                        {item.checked ? <Check className="size-3.5" /> : null}
                      </span>
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.shortcut ? (
                        <span className="pl-6 text-xs opacity-70">{item.shortcut}</span>
                      ) : null}
                    </button>
                  ),
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
