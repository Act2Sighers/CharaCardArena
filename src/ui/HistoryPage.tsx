import React, { useState } from 'react';
import type { BattleEvent, TeamSnapshot, UnitSnapshot } from '../core/types';
import { ELEMENTS } from '../core/elements';
import { BattleMeta } from '../storage/store';
import { HISTORY_LIMIT, useApp } from './AppContext';
import { BattleViewer } from './BattleViewer';
import { ConfirmButton, EmptyState, formatDate } from './common';

function members(t: TeamSnapshot): UnitSnapshot[] {
  return [...t.front.filter((x): x is UnitSnapshot => !!x), ...t.reserve];
}

function TeamLine({ team, win }: { team: TeamSnapshot; win: boolean }) {
  return (
    <div className={`hist-team${win ? ' win' : ''}`}>
      <span className="hist-team-name">{team.name}</span>
      <span className="hist-dots">
        {members(team).map((u, i) => (
          <span key={i} className="dot" title={u.name} style={{ ['--el' as string]: ELEMENTS[u.element].color }} />
        ))}
      </span>
    </div>
  );
}

export function HistoryPage() {
  const { battles, store, run, loaded, toast, removeBattle } = useApp();
  const [open, setOpen] = useState<{ meta: BattleMeta; events: BattleEvent[] } | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  if (open) {
    const meta = battles.find((b) => b.id === open.meta.id) ?? open.meta;
    return (
      <BattleViewer
        teamA={meta.teamA}
        teamB={meta.teamB}
        events={open.events}
        live={false}
        favorite={meta.favorite}
        onToggleFavorite={() => run(() => store.setFavorite(meta.id, !meta.favorite))}
        onClose={() => setOpen(null)}
      />
    );
  }

  const openReplay = async (meta: BattleMeta) => {
    setLoadingId(meta.id);
    try {
      const events = await store.loadBattleEvents(meta.id);
      if (!events) toast('この戦闘の記録が見つかりませんでした。', 'error');
      else setOpen({ meta, events });
    } catch {
      toast('記録を読み込めませんでした。もう一度お試しください。', 'error');
    } finally {
      setLoadingId(null);
    }
  };

  const favs = battles.filter((b) => b.favorite).length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">履歴</h1>
          <p className="page-sub">直近{HISTORY_LIMIT}件を自動で保存します。お気に入り（現在{favs}件）は削除するまで残ります。</p>
        </div>
      </div>
      {!loaded.battles ? (
        <p className="hint">読み込み中…</p>
      ) : battles.length === 0 ? (
        <EmptyState title="まだ戦闘の記録がありません">
          <p>「対戦」で戦わせると、ここに記録が残り、ログを読み返したりリプレイを見たりできます。</p>
        </EmptyState>
      ) : (
        <ul className="hist-list">
          {battles.map((b) => (
            <li key={b.id} className="hist-row">
              <button type="button" className="hist-main" onClick={() => openReplay(b)} disabled={loadingId === b.id}>
                <span className="hist-date">{formatDate(b.createdAt)}{b.reason === 'timeout' ? '・時間切れ' : ''}</span>
                <TeamLine team={b.teamA} win={b.winner === 'A'} />
                <span className="hist-vs">{b.winner === 'draw' ? '引き分け' : 'vs'}</span>
                <TeamLine team={b.teamB} win={b.winner === 'B'} />
                <span className="hist-open">{loadingId === b.id ? '読み込み中…' : 'リプレイ ▶'}</span>
              </button>
              <div className="hist-actions">
                <button
                  type="button"
                  className={`btn btn-small fav${b.favorite ? ' on' : ''}`}
                  aria-pressed={b.favorite}
                  onClick={() => run(() => store.setFavorite(b.id, !b.favorite))}
                  aria-label={b.favorite ? 'お気に入りを外す' : 'お気に入りに追加'}
                >
                  {b.favorite ? '★' : '☆'}
                </button>
                <ConfirmButton
                  label="削除"
                  confirmLabel="削除する"
                  className="btn btn-small btn-danger"
                  onConfirm={() => removeBattle(b)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
