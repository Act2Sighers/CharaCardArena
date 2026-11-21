import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { BattleRecord, Card, Team } from '../core/types';
import { createClaudeStore } from '../storage/claudeStore';
import { createLocalStore } from '../storage/localStore';
import { BattleMeta, errorMessage, Store } from '../storage/store';

/** 自動保存する戦闘履歴の件数（お気に入りは別枠で無期限） */
export const HISTORY_LIMIT = 50;

interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

interface AppData {
  store: Store;
  cards: Card[];
  teams: Team[];
  battles: BattleMeta[];
  cardMap: Map<string, Card>;
  loaded: { cards: boolean; teams: boolean; battles: boolean };
  loadError: string | null;
  toast(text: string, tone?: 'info' | 'error'): void;
  /** 保存処理を実行し、失敗したらトーストで知らせる。成功で true */
  run(fn: () => Promise<void>, okText?: string): Promise<boolean>;
  saveBattle(record: BattleRecord): Promise<void>;
  /** 戦闘記録を削除し、ほかで使われていない画像も片付ける */
  removeBattle(meta: BattleMeta): Promise<void>;
  /** カードの画像を削除してよいか（履歴やほかのカードが参照していなければ true） */
  imageInUse(ref: string, exceptCardId?: string): boolean;
}

const Ctx = createContext<AppData | null>(null);

export function useApp(): AppData {
  const v = useContext(Ctx);
  if (!v) throw new Error('AppProvider がありません');
  return v;
}

export function useStoreInit(): Store | null {
  const [store, setStore] = useState<Store | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      let s: Store | null = null;
      try {
        s = await createClaudeStore();
      } catch {
        s = null;
      }
      if (!s) s = await createLocalStore();
      if (alive) setStore(s);
    })();
    return () => {
      alive = false;
    };
  }, []);
  return store;
}

export function AppProvider({ store, children }: { store: Store; children: React.ReactNode }) {
  const [cards, setCards] = useState<Card[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [battles, setBattles] = useState<BattleMeta[]>([]);
  const [loaded, setLoaded] = useState({ cards: false, teams: false, battles: false });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  useEffect(() => {
    const onErr = (m: string) => setLoadError(m);
    const u1 = store.subscribeCards((x) => {
      setCards([...x].sort((a, b) => b.updatedAt - a.updatedAt));
      setLoaded((l) => ({ ...l, cards: true }));
    }, onErr);
    const u2 = store.subscribeTeams((x) => {
      setTeams([...x].sort((a, b) => b.updatedAt - a.updatedAt));
      setLoaded((l) => ({ ...l, teams: true }));
    }, onErr);
    const u3 = store.subscribeBattles((x) => {
      setBattles([...x].sort((a, b) => b.createdAt - a.createdAt));
      setLoaded((l) => ({ ...l, battles: true }));
    }, onErr);
    return () => {
      u1();
      u2();
      u3();
    };
  }, [store]);

  const toast = useCallback((text: string, tone: 'info' | 'error' = 'info') => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 2600);
  }, []);

  const run = useCallback(
    async (fn: () => Promise<void>, okText?: string) => {
      try {
        await fn();
        if (okText) toast(okText);
        return true;
      } catch (e) {
        toast(errorMessage(e), 'error');
        return false;
      }
    },
    [toast],
  );

  const battlesRef = useRef(battles);
  battlesRef.current = battles;
  const cardsRef = useRef(cards);
  cardsRef.current = cards;

  /** 記録を削除し、その記録だけが使っていた画像（削除済みカードの画像）も消す */
  const deleteWithImages = async (meta: BattleMeta) => {
    await store.deleteBattle(meta.id);
    battlesRef.current = battlesRef.current.filter((b) => b.id !== meta.id);
    const refs = new Set(
      [...meta.teamA.front, ...meta.teamA.reserve, ...meta.teamB.front, ...meta.teamB.reserve]
        .map((u) => u?.imageRef)
        .filter((x): x is string => !!x),
    );
    for (const ref of refs) if (!imageInUse(ref)) await store.deleteImage(ref);
  };

  const saveBattle = useCallback(
    async (record: BattleRecord) => {
      await run(async () => {
        await store.saveBattle(record);
        // お気に入り以外が上限を超えたら古いものから削除
        const normal = [record, ...battlesRef.current.filter((b) => b.id !== record.id)]
          .filter((b) => !b.favorite)
          .sort((a, b) => b.createdAt - a.createdAt);
        for (const old of normal.slice(HISTORY_LIMIT)) await deleteWithImages(old);
      });
    },
    [run, store],
  );

  const removeBattle = useCallback(
    async (meta: BattleMeta) => {
      await run(() => deleteWithImages(meta), '記録を削除しました');
    },
    [run, store],
  );

  const imageInUse = useCallback((ref: string, exceptCardId?: string) => {
    if (cardsRef.current.some((c) => c.id !== exceptCardId && c.image && (c.image.cropped === ref || c.image.original === ref))) return true;
    return battlesRef.current.some((b) =>
      [...b.teamA.front, ...b.teamA.reserve, ...b.teamB.front, ...b.teamB.reserve].some((u) => u?.imageRef === ref),
    );
  }, []);

  const cardMap = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);

  const value: AppData = {
    store, cards, teams, battles, cardMap, loaded, loadError, toast, run, saveBattle, removeBattle, imageInUse,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>{t.text}</div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

/** 画像参照から表示用 URL を得る */
export function useImageUrl(ref: string | null | undefined): string | null {
  const { store } = useApp();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!ref) {
      setUrl(null);
      return;
    }
    store.imageUrl(ref).then((u) => alive && setUrl(u || null)).catch(() => alive && setUrl(null));
    return () => {
      alive = false;
    };
  }, [ref, store]);
  return url;
}
