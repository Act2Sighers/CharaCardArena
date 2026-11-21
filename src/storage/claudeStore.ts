import type { BattleEvent, BattleRecord, Card, Team } from '../core/types';
import { BattleMeta, Store, Unsub } from './store';

/**
 * claude.ai のアーティファクトとして開いたときの保存先。
 * - カード・チーム・戦闘履歴: db capability（閲覧者ごとの非公開領域 data/users/<id>/）
 * - 画像: assets capability
 * 同じアカウントでログインしていれば、スマホと PC で同じデータが見える。
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

interface ClaudeRuntime {
  use(name: string): Promise<Any | null>;
}

function runtime(): ClaudeRuntime | null {
  const c = (window as unknown as { claude?: ClaudeRuntime }).claude;
  return c && typeof c.use === 'function' ? c : null;
}

export async function createClaudeStore(): Promise<Store | null> {
  const rt = runtime();
  if (!rt) return null;
  const [db, user] = await Promise.all([rt.use('db'), rt.use('user')]);
  if (!db || !user) return null;
  let uid: string | null = null;
  try {
    uid = await user.id();
  } catch {
    uid = null;
  }
  if (!uid) return null;
  const assets = await rt.use('assets');

  const root = db.doc(`data/users/${uid}/lib`);
  const col = (name: string) => root.collection(name);

  const subscribe = <T>(name: string, cb: (x: T[]) => void, onError: (m: string) => void): Unsub => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) onError('保存データにまだ接続できていません。通信状況を確認してください。');
    }, 10000);
    const unsub = col(name).onSnapshot(
      (snap: Any) => {
        if (!snap.metadata.fromCache) {
          done = true;
          clearTimeout(timer);
        }
        cb(snap.docs.map((d: Any) => d.data() as T));
      },
      (e: Any) => {
        done = true;
        clearTimeout(timer);
        onError(e?.code === 'revoked' ? '保存データへのアクセスが取り消されました。' : `保存データを読み込めません（${e?.code}）。`);
      },
    );
    return () => {
      clearTimeout(timer);
      unsub();
    };
  };

  // JSON として保存できる形に（undefined を除く）
  const plain = <T>(x: T): Record<string, unknown> => JSON.parse(JSON.stringify(x));

  const withRetry = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e: Any) {
      if (e?.code === 'unavailable' || e?.code === 'store_unavailable') {
        await new Promise((r) => setTimeout(r, 400 + Math.random() * 600));
        return fn();
      }
      throw e;
    }
  };

  return {
    kind: 'cloud',
    canUploadImages: !!assets,
    subscribeCards: (cb, onError) => subscribe<Card>('cards', cb, onError),
    subscribeTeams: (cb, onError) => subscribe<Team>('teams', cb, onError),
    subscribeBattles: (cb, onError) => subscribe<BattleMeta>('battles', cb, onError),
    saveCard: (card) => withRetry(() => col('cards').doc(card.id).set(plain(card))),
    deleteCard: (id) => withRetry(() => col('cards').doc(id).delete()),
    saveTeam: (team) => withRetry(() => col('teams').doc(team.id).set(plain(team))),
    deleteTeam: (id) => withRetry(() => col('teams').doc(id).delete()),
    async saveBattle(record: BattleRecord) {
      const { events, ...meta } = record;
      await withRetry(() => col('battleLogs').doc(record.id).set(plain({ events })));
      await withRetry(() => col('battles').doc(record.id).set(plain(meta)));
    },
    setFavorite: (id, favorite) => withRetry(() => col('battles').doc(id).update({ favorite })),
    async deleteBattle(id) {
      await withRetry(() => col('battles').doc(id).delete());
      await withRetry(() => col('battleLogs').doc(id).delete());
    },
    async loadBattleEvents(id) {
      const snap: Any = await withRetry(() => col('battleLogs').doc(id).get());
      if (!snap.exists) return null;
      return (snap.data() as { events: BattleEvent[] }).events;
    },
    async uploadImage(blob) {
      if (!assets) throw { code: 'not_granted' };
      const res: Any = await withRetry(() => assets.upload(blob, { type: blob.type || 'image/jpeg' }));
      return res.id as string;
    },
    async deleteImage(ref) {
      if (!assets) return;
      try {
        await assets.delete(ref);
      } catch {
        // 削除の失敗は致命的ではないので無視する
      }
    },
    imageUrl: async (ref) => `/_blob/${ref}`,
  };
}
