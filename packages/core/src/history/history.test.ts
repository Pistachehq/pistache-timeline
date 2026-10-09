import { describe, expect, it } from 'vitest';
import {
  applyChange,
  beginTransaction,
  canRedo,
  canUndo,
  cancelTransaction,
  commitTransaction,
  createHistory,
  redo,
  redoLabel,
  undo,
  undoLabel,
} from './history';

describe('edit history', () => {
  it('undoes and redoes changes in order', () => {
    let h = createHistory({ n: 0 });
    h = applyChange(h, 'One', { n: 1 });
    h = applyChange(h, 'Two', { n: 2 });
    expect(undoLabel(h)).toBe('Two');
    h = undo(h);
    expect(h.present.n).toBe(1);
    expect(redoLabel(h)).toBe('Two');
    h = redo(h);
    expect(h.present.n).toBe(2);
    h = undo(undo(h));
    expect(h.present.n).toBe(0);
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(true);
  });

  it('clears the redo stack on a new change', () => {
    let h = createHistory(0);
    h = applyChange(h, 'A', 1);
    h = undo(h);
    h = applyChange(h, 'B', 2);
    expect(canRedo(h)).toBe(false);
  });

  it('ignores no-op changes', () => {
    const state = { n: 0 };
    const h = applyChange(createHistory(state), 'Nothing', state);
    expect(h.past).toHaveLength(0);
  });

  it('respects the history limit', () => {
    let h = createHistory(0, 3);
    for (let i = 1; i <= 10; i++) h = applyChange(h, `#${i}`, i);
    expect(h.past.map((e) => e.state)).toEqual([7, 8, 9]);
  });

  it('groups transaction changes into a single entry', () => {
    let h = createHistory(0);
    h = beginTransaction(h, 'Drag');
    h = applyChange(h, 'step', 1);
    h = beginTransaction(h, 'nested');
    h = applyChange(h, 'step', 2);
    h = commitTransaction(h);
    expect(h.transaction).not.toBeNull();
    expect(canUndo(h)).toBe(false);
    h = applyChange(h, 'step', 3);
    h = commitTransaction(h);
    expect(h.past).toEqual([{ label: 'Drag', state: 0 }]);
    expect(undo(h).present).toBe(0);
  });

  it('cancelling a transaction restores the initial state', () => {
    let h = createHistory(0);
    h = beginTransaction(h, 'Drag');
    h = applyChange(h, 'step', 5);
    h = cancelTransaction(h);
    expect(h.present).toBe(0);
    expect(h.past).toHaveLength(0);
  });

  it('empty transactions record nothing', () => {
    const h = commitTransaction(beginTransaction(createHistory(0), 'Nothing'));
    expect(h.past).toHaveLength(0);
    expect(h.transaction).toBeNull();
  });
});
