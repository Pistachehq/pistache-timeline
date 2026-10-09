/*
 * Snapshot-based undo/redo.
 *
 * Because the project model is immutable and structurally shared, storing the
 * previous project for each edit is cheap: only the changed branches are new
 * objects. Each entry records the state *before* an edit so it can be
 * restored, plus a label for menus ("Undo Move Clip").
 *
 * Transactions group several edits into a single undo step. They are used for
 * continuous interactions (dragging a numeric field) and compound commands.
 */

export interface HistoryEntry<T> {
  readonly label: string;
  readonly state: T;
}

interface PendingTransaction<T> {
  readonly label: string;
  readonly before: T;
  readonly depth: number;
}

export interface EditHistory<T> {
  readonly present: T;
  readonly past: readonly HistoryEntry<T>[];
  readonly future: readonly HistoryEntry<T>[];
  readonly limit: number;
  readonly transaction: PendingTransaction<T> | null;
}

export const DEFAULT_HISTORY_LIMIT = 200;

export function createHistory<T>(present: T, limit = DEFAULT_HISTORY_LIMIT): EditHistory<T> {
  return { present, past: [], future: [], limit, transaction: null };
}

function pushPast<T>(history: EditHistory<T>, entry: HistoryEntry<T>): readonly HistoryEntry<T>[] {
  const past = [...history.past, entry];
  return past.length > history.limit ? past.slice(past.length - history.limit) : past;
}

/**
 * Records a change from `history.present` to `next`. No-op changes (same
 * reference) are ignored. Inside a transaction the change is applied but not
 * recorded until the transaction commits.
 */
export function applyChange<T>(history: EditHistory<T>, label: string, next: T): EditHistory<T> {
  if (next === history.present) return history;
  if (history.transaction) return { ...history, present: next };
  return {
    ...history,
    present: next,
    past: pushPast(history, { label, state: history.present }),
    future: [],
  };
}

/** Opens a transaction. Nested calls are counted and merged into the outermost one. */
export function beginTransaction<T>(history: EditHistory<T>, label: string): EditHistory<T> {
  if (history.transaction) {
    return { ...history, transaction: { ...history.transaction, depth: history.transaction.depth + 1 } };
  }
  return { ...history, transaction: { label, before: history.present, depth: 1 } };
}

/** Closes a transaction, recording one history entry if anything changed. */
export function commitTransaction<T>(history: EditHistory<T>): EditHistory<T> {
  const { transaction } = history;
  if (!transaction) return history;
  if (transaction.depth > 1) {
    return { ...history, transaction: { ...transaction, depth: transaction.depth - 1 } };
  }
  if (transaction.before === history.present) return { ...history, transaction: null };
  return {
    ...history,
    transaction: null,
    past: pushPast(history, { label: transaction.label, state: transaction.before }),
    future: [],
  };
}

/** Aborts the whole transaction and restores the state from before it began. */
export function cancelTransaction<T>(history: EditHistory<T>): EditHistory<T> {
  if (!history.transaction) return history;
  return { ...history, present: history.transaction.before, transaction: null };
}

export function canUndo<T>(history: EditHistory<T>): boolean {
  return history.transaction === null && history.past.length > 0;
}

export function canRedo<T>(history: EditHistory<T>): boolean {
  return history.transaction === null && history.future.length > 0;
}

export function undoLabel<T>(history: EditHistory<T>): string | null {
  return history.past[history.past.length - 1]?.label ?? null;
}

export function redoLabel<T>(history: EditHistory<T>): string | null {
  return history.future[history.future.length - 1]?.label ?? null;
}

export function undo<T>(history: EditHistory<T>): EditHistory<T> {
  const entry = history.past[history.past.length - 1];
  if (!entry || history.transaction) return history;
  return {
    ...history,
    present: entry.state,
    past: history.past.slice(0, -1),
    future: [...history.future, { label: entry.label, state: history.present }],
  };
}

export function redo<T>(history: EditHistory<T>): EditHistory<T> {
  const entry = history.future[history.future.length - 1];
  if (!entry || history.transaction) return history;
  return {
    ...history,
    present: entry.state,
    future: history.future.slice(0, -1),
    past: pushPast(history, { label: entry.label, state: history.present }),
  };
}

/** Replaces the present state and clears all history (e.g. when opening a project). */
export function resetHistory<T>(history: EditHistory<T>, present: T): EditHistory<T> {
  return createHistory(present, history.limit);
}
