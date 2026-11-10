import { type AlphaMask } from '@timeline/core';

const MEMORY_LIMIT = 240;
const DB_NAME = 'timeline-smart-masks';
const STORE = 'masks';

interface StoredMask {
  readonly cacheId: string;
  readonly sourceFrame: number;
  readonly width: number;
  readonly height: number;
  readonly data: ArrayBuffer;
}

const memory = new Map<string, AlphaMask>();
const order: string[] = [];
const listeners = new Set<(cacheId: string, sourceFrame: number) => void>();

function keyOf(cacheId: string, sourceFrame: number): string {
  return `${cacheId}:${sourceFrame}`;
}

function touch(key: string): void {
  const at = order.indexOf(key);
  if (at >= 0) order.splice(at, 1);
  order.push(key);
  while (order.length > MEMORY_LIMIT) {
    const drop = order.shift();
    if (drop) memory.delete(drop);
  }
}

export function subscribeMaskCache(listener: (cacheId: string, sourceFrame: number) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(cacheId: string, sourceFrame: number): void {
  for (const listener of listeners) listener(cacheId, sourceFrame);
}

export function peekMask(cacheId: string, sourceFrame: number): AlphaMask | null {
  if (!cacheId) return null;
  return memory.get(keyOf(cacheId, sourceFrame)) ?? null;
}

export function nearestMask(cacheId: string, sourceFrame: number, maxDistance: number): { mask: AlphaMask; frame: number } | null {
  if (!cacheId || maxDistance <= 0) return peekMask(cacheId, sourceFrame) ? { mask: peekMask(cacheId, sourceFrame)!, frame: sourceFrame } : null;
  let best: { mask: AlphaMask; frame: number; dist: number } | null = null;
  const prefix = `${cacheId}:`;
  for (const key of memory.keys()) {
    if (!key.startsWith(prefix)) continue;
    const frame = Number(key.slice(prefix.length));
    if (!Number.isFinite(frame)) continue;
    const dist = Math.abs(frame - sourceFrame);
    if (dist > maxDistance) continue;
    const mask = memory.get(key);
    if (!mask) continue;
    if (!best || dist < best.dist) best = { mask, frame, dist };
  }
  return best ? { mask: best.mask, frame: best.frame } : null;
}

export function putMask(cacheId: string, sourceFrame: number, mask: AlphaMask): void {
  if (!cacheId) return;
  const key = keyOf(cacheId, sourceFrame);
  memory.set(key, { data: new Uint8Array(mask.data), width: mask.width, height: mask.height });
  touch(key);
  emit(cacheId, sourceFrame);
  void persist(cacheId, sourceFrame, mask);
}

export function clearMaskCache(cacheId: string): void {
  for (const key of [...memory.keys()]) {
    if (key.startsWith(`${cacheId}:`)) memory.delete(key);
  }
  for (let i = order.length - 1; i >= 0; i--) {
    if (order[i]?.startsWith(`${cacheId}:`)) order.splice(i, 1);
  }
  emit(cacheId, -1);
  void dropPersisted(cacheId);
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: ['cacheId', 'sourceFrame'] });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function persist(cacheId: string, sourceFrame: number, mask: AlphaMask): Promise<void> {
  const db = await openDb();
  if (!db) return;
  const record: StoredMask = {
    cacheId,
    sourceFrame,
    width: mask.width,
    height: mask.height,
    data: mask.data.slice().buffer,
  };
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}

async function dropPersisted(cacheId: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const value = cursor.value as StoredMask;
      if (value.cacheId === cacheId) cursor.delete();
      cursor.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}

export async function hydrateMaskCache(cacheId: string): Promise<void> {
  if (!cacheId) return;
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const value = cursor.value as StoredMask;
      if (value.cacheId === cacheId) {
        const key = keyOf(cacheId, value.sourceFrame);
        if (!memory.has(key)) {
          memory.set(key, { data: new Uint8Array(value.data), width: value.width, height: value.height });
          touch(key);
        }
      }
      cursor.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
  emit(cacheId, -1);
}
