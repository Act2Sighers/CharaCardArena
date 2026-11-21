import type { BattleEvent, BattleRecord, Card, Team } from '../core/types';
import { BattleMeta, newId, Store, Unsub } from './store';

/** この端末の IndexedDB に保存する実装（claude.ai の外で開いたとき・開発時用） */

const DB_NAME = 'characard-arena';
const STORES = ['cards', 'teams', 'battles', 'battleLogs', 'images'] as const;
type StoreName = (typeof STORES)[number];

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(db: IDBDatabase, store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function createLocalStore(): Promise<Store> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
  } catch {
    db = null;
  }
  // IndexedDB が使えない環境ではメモリ上だけで動かす
  const mem: Record<StoreName, Map<string, unknown>> = {
    cards: new Map(), teams: new Map(), battles: new Map(), battleLogs: new Map(), images: new Map(),
  };

  const getAll = async <T>(s: StoreName): Promise<T[]> => {
    if (!db) return [...mem[s].values()] as T[];
    return tx<T[]>(db, s, 'readonly', (st) => st.getAll() as IDBRequest<T[]>);
  };
  const get = async <T>(s: StoreName, key: string): Promise<T | undefined> => {
    if (!db) return mem[s].get(key) as T | undefined;
    return tx<T | undefined>(db, s, 'readonly', (st) => st.get(key) as IDBRequest<T | undefined>);
  };
  const put = async (s: StoreName, key: string, value: unknown) => {
    if (!db) {
      mem[s].set(key, value);
      return;
    }
    await tx(db, s, 'readwrite', (st) => st.put(value, key));
  };
  const del = async (s: StoreName, key: string) => {
    if (!db) {
      mem[s].delete(key);
      return;
    }
    await tx(db, s, 'readwrite', (st) => st.delete(key));
  };

  const listeners: Record<'cards' | 'teams' | 'battles', Set<(x: never[]) => void>> = {
    cards: new Set(), teams: new Set(), battles: new Set(),
  };
  const emit = async (s: 'cards' | 'teams' | 'battles') => {
    const all = await getAll<never>(s);
    listeners[s].forEach((cb) => cb(all));
  };
  const subscribe = <T>(s: 'cards' | 'teams' | 'battles', cb: (x: T[]) => void, onError: (m: string) => void): Unsub => {
    const fn = cb as unknown as (x: never[]) => void;
    listeners[s].add(fn);
    getAll<T>(s).then(cb).catch((e) => onError(String(e)));
    return () => listeners[s].delete(fn);
  };

  const urlCache = new Map<string, string>();

  return {
    kind: 'local',
    canUploadImages: true,
    subscribeCards: (cb, onError) => subscribe<Card>('cards', cb, onError),
    subscribeTeams: (cb, onError) => subscribe<Team>('teams', cb, onError),
    subscribeBattles: (cb, onError) => subscribe<BattleMeta>('battles', cb, onError),
    async saveCard(card) {
      await put('cards', card.id, card);
      await emit('cards');
    },
    async deleteCard(id) {
      await del('cards', id);
      await emit('cards');
    },
    async saveTeam(team) {
      await put('teams', team.id, team);
      await emit('teams');
    },
    async deleteTeam(id) {
      await del('teams', id);
      await emit('teams');
    },
    async saveBattle(record: BattleRecord) {
      const { events, ...meta } = record;
      await put('battleLogs', record.id, { events });
      await put('battles', record.id, meta);
      await emit('battles');
    },
    async setFavorite(id, favorite) {
      const m = await get<BattleMeta>('battles', id);
      if (!m) return;
      await put('battles', id, { ...m, favorite });
      await emit('battles');
    },
    async deleteBattle(id) {
      await del('battles', id);
      await del('battleLogs', id);
      await emit('battles');
    },
    async loadBattleEvents(id) {
      const x = await get<{ events: BattleEvent[] }>('battleLogs', id);
      return x ? x.events : null;
    },
    async uploadImage(blob) {
      const id = newId();
      await put('images', id, blob);
      return id;
    },
    async deleteImage(ref) {
      await del('images', ref);
      const u = urlCache.get(ref);
      if (u) URL.revokeObjectURL(u);
      urlCache.delete(ref);
    },
    async imageUrl(ref) {
      const cached = urlCache.get(ref);
      if (cached) return cached;
      const blob = await get<Blob>('images', ref);
      if (!blob) return '';
      const url = URL.createObjectURL(blob);
      urlCache.set(ref, url);
      return url;
    },
  };
}
