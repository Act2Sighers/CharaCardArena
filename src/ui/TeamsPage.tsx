import React, { useState } from 'react';
import { normalizeTeam, teamMemberIds } from '../core/battle';
import { ELEMENTS } from '../core/elements';
import type { Card, Team } from '../core/types';
import { newId } from '../storage/store';
import { useApp } from './AppContext';
import { CardFace } from './CardFace';
import { ConfirmButton, EmptyState } from './common';

export const TEAM_MAX = 6;
const POS = ['左', '中央', '右'];

/** 枠の指定: front 0..2 / reserve 0..2 */
type SlotKey = { kind: 'front' | 'reserve'; i: number };

function slotEq(a: SlotKey | null, b: SlotKey) {
  return !!a && a.kind === b.kind && a.i === b.i;
}

export function TeamsPage() {
  const { teams, cardMap, loaded } = useApp();
  const [editing, setEditing] = useState<Team | 'new' | null>(null);

  if (editing) return <TeamEditor team={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">チーム</h1>
          <p className="page-sub">1〜{TEAM_MAX}人。4人以上のときは3人を超えた分が「待機」になります。</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>＋ 新しいチーム</button>
      </div>
      {!loaded.teams ? (
        <p className="hint">読み込み中…</p>
      ) : teams.length === 0 ? (
        <EmptyState title="まだチームがありません">
          <p>カードを前線の3枠と待機の枠に並べてチームを作ります。対戦は同じ人数のチーム同士で行います。</p>
          <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>チームを作る</button>
        </EmptyState>
      ) : (
        <div className="team-list">
          {teams.map((t) => (
            <button key={t.id} type="button" className="team-row" onClick={() => setEditing(t)}>
              <div className="team-row-head">
                <span className="team-name">{t.name}</span>
                <span className="team-size">{teamMemberIds(t).length}人</span>
              </div>
              <TeamStrip team={t} cardMap={cardMap} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TeamStrip({ team, cardMap }: { team: Team; cardMap: Map<string, Card> }) {
  return (
    <div className="team-strip">
      <div className="team-strip-front">
        {[0, 1, 2].map((i) => {
          const c = team.front[i] ? cardMap.get(team.front[i]!) : null;
          return c ? (
            <CardFace key={i} name={c.name} element={c.element} imageRef={c.image?.cropped} size="xs" />
          ) : (
            <div key={i} className="slot-empty xs" />
          );
        })}
      </div>
      {team.reserve.length > 0 && (
        <div className="team-strip-reserve">
          <span className="muted">待機</span>
          {team.reserve.map((id) => {
            const c = cardMap.get(id);
            return c ? (
              <span key={id} className="mini-chip" style={{ ['--el' as string]: ELEMENTS[c.element].color }}>
                {c.name}
              </span>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}

function TeamEditor({ team, onClose }: { team: Team | null; onClose(): void }) {
  const { cards, cardMap, store, run, toast } = useApp();
  const [name, setName] = useState(team?.name ?? '');
  const [front, setFront] = useState<(string | null)[]>(() => [0, 1, 2].map((i) => team?.front[i] ?? null));
  const [reserve, setReserve] = useState<(string | null)[]>(() => [0, 1, 2].map((i) => team?.reserve[i] ?? null));
  const [selected, setSelected] = useState<SlotKey | null>(null);
  const [busy, setBusy] = useState(false);

  const members = [...front, ...reserve].filter((x): x is string => !!x);
  const frontCount = front.filter(Boolean).length;
  const reserveCount = reserve.filter(Boolean).length;

  const get = (k: SlotKey) => (k.kind === 'front' ? front[k.i] : reserve[k.i]);
  const setSlot = (k: SlotKey, v: string | null, f = front, r = reserve) => {
    const nf = [...f];
    const nr = [...r];
    if (k.kind === 'front') nf[k.i] = v;
    else nr[k.i] = v;
    return { nf, nr };
  };

  const tapSlot = (k: SlotKey) => {
    if (!selected) {
      if (get(k)) setSelected(k);
      return;
    }
    if (slotEq(selected, k)) {
      setSelected(null);
      return;
    }
    // 入れ替え
    const a = get(selected);
    const b = get(k);
    let { nf, nr } = setSlot(selected, b);
    ({ nf, nr } = setSlot(k, a, nf, nr));
    setFront(nf);
    setReserve(nr);
    setSelected(null);
  };

  const removeSelected = () => {
    if (!selected) return;
    const { nf, nr } = setSlot(selected, null);
    setFront(nf);
    setReserve(nr);
    setSelected(null);
  };

  const addCard = (id: string) => {
    if (members.includes(id)) {
      // すでに入っているカードは外す
      setFront(front.map((x) => (x === id ? null : x)));
      setReserve(reserve.map((x) => (x === id ? null : x)));
      setSelected(null);
      return;
    }
    if (members.length >= TEAM_MAX) {
      toast(`チームは最大${TEAM_MAX}人です。`, 'error');
      return;
    }
    const fi = front.findIndex((x) => !x);
    if (fi >= 0) {
      setFront(front.map((x, i) => (i === fi ? id : x)));
      return;
    }
    const ri = reserve.findIndex((x) => !x);
    if (ri >= 0) setReserve(reserve.map((x, i) => (i === ri ? id : x)));
  };

  const save = async () => {
    if (members.length === 0) {
      toast('カードを1枚以上入れてください。', 'error');
      return;
    }
    const now = Date.now();
    const next = normalizeTeam({
      id: team?.id ?? newId(),
      name: name.trim() || `チーム${now.toString().slice(-4)}`,
      front,
      reserve: reserve.filter((x): x is string => !!x),
      createdAt: team?.createdAt ?? now,
      updatedAt: now,
    });
    setBusy(true);
    const ok = await run(() => store.saveTeam(next), team ? 'チームを保存しました' : 'チームを作成しました');
    setBusy(false);
    if (ok) onClose();
  };

  const remove = async () => {
    if (!team) return;
    setBusy(true);
    const ok = await run(() => store.deleteTeam(team.id), 'チームを削除しました');
    setBusy(false);
    if (ok) onClose();
  };

  const renderSlot = (k: SlotKey, label: string) => {
    const id = get(k);
    const c = id ? cardMap.get(id) : null;
    const isSel = slotEq(selected, k);
    return (
      <button
        key={`${k.kind}${k.i}`}
        type="button"
        className={`slot${isSel ? ' selected' : ''}${selected && !isSel ? ' target' : ''}`}
        onClick={() => tapSlot(k)}
        aria-label={`${label}${c ? `：${c.name}` : '：空き'}`}
      >
        <span className="slot-label">{label}</span>
        {c ? (
          <CardFace name={c.name} element={c.element} style={c.style} imageRef={c.image?.cropped} size="sm" />
        ) : (
          <span className="slot-empty">空き</span>
        )}
      </button>
    );
  };

  const warn =
    reserveCount > 0 && frontCount < 3 ? '前線に空きがあるので、保存時に待機のカードが前線へ移ります。' : null;

  return (
    <div className="editor">
      <div className="editor-head">
        <button type="button" className="btn btn-ghost" onClick={onClose}>← 一覧へ</button>
        <h2>{team ? 'チームを編集' : '新しいチーム'}</h2>
      </div>
      <div className="field">
        <label htmlFor="team-name">チーム名</label>
        <input id="team-name" type="text" value={name} maxLength={20} placeholder="チームの名前" onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="formation">
        <div className="formation-row">
          <h3 className="formation-title">前線 <span className="muted">開始時に戦う3人</span></h3>
          <div className="slots">{[0, 1, 2].map((i) => renderSlot({ kind: 'front', i }, POS[i]))}</div>
        </div>
        <div className="formation-row reserve">
          <h3 className="formation-title">待機 <span className="muted">前線が倒れたら、その位置に順番に入る</span></h3>
          <div className="slots">{[0, 1, 2].map((i) => renderSlot({ kind: 'reserve', i }, `待機${i + 1}`))}</div>
        </div>
        <div className="formation-bar">
          <span>
            {members.length}人（前線{frontCount}・待機{reserveCount}）
          </span>
          {selected ? (
            <span className="formation-actions">
              <span className="hint">入れ替える枠を選んでください</span>
              <button type="button" className="btn btn-small" onClick={removeSelected}>チームから外す</button>
              <button type="button" className="btn btn-small btn-ghost" onClick={() => setSelected(null)}>選択解除</button>
            </span>
          ) : (
            <span className="hint">枠を押して選び、別の枠を押すと入れ替わります。</span>
          )}
        </div>
        {warn && <p className="hint warn">{warn}</p>}
      </div>

      <h3 className="section-title">カードを入れる <span className="muted">押すと空いている枠に入ります（もう一度押すと外れます）</span></h3>
      {cards.length === 0 ? (
        <p className="hint">先に「カード」でカードを作ってください。</p>
      ) : (
        <div className="card-grid small">
          {cards.map((c) => {
            const inTeam = members.includes(c.id);
            return (
              <button key={c.id} type="button" className={`card-tile${inTeam ? ' in-team' : ''}`} onClick={() => addCard(c.id)} aria-pressed={inTeam}>
                <CardFace name={c.name} element={c.element} style={c.style} imageRef={c.image?.cropped} size="sm" />
                {inTeam && <span className="in-team-mark">編成中</span>}
              </button>
            );
          })}
        </div>
      )}

      <div className="editor-actions sticky">
        {team && <ConfirmButton label="削除" confirmLabel="もう一度押すと削除" onConfirm={remove} disabled={busy} />}
        <span className="spacer" />
        <button type="button" className="btn" onClick={onClose} disabled={busy}>キャンセル</button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>{busy ? '保存中…' : '保存'}</button>
      </div>
    </div>
  );
}
