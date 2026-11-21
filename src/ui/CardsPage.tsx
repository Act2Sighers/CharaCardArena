import React, { useMemo, useState } from 'react';
import { ELEMENT_ORDER, ELEMENTS } from '../core/elements';
import type { Card, ElementId } from '../core/types';
import { useApp } from './AppContext';
import { CardFace } from './CardFace';
import { CardEditor } from './CardEditor';
import { EmptyState } from './common';

export function CardsPage() {
  const { cards, loaded } = useApp();
  const [editing, setEditing] = useState<Card | 'new' | null>(null);
  const [filter, setFilter] = useState<ElementId | 'all'>('all');

  const shown = useMemo(() => (filter === 'all' ? cards : cards.filter((c) => c.element === filter)), [cards, filter]);

  if (editing) {
    return <CardEditor card={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />;
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">カード</h1>
          <p className="page-sub">{cards.length} 枚</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>＋ 新しいカード</button>
      </div>

      {cards.length > 0 && (
        <div className="filter-row" role="group" aria-label="属性で絞り込み">
          <button type="button" className={`filter-chip${filter === 'all' ? ' on' : ''}`} onClick={() => setFilter('all')}>すべて</button>
          {ELEMENT_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              className={`filter-chip${filter === id ? ' on' : ''}`}
              style={{ ['--el' as string]: ELEMENTS[id].color }}
              onClick={() => setFilter(id)}
            >
              <span className="dot" />{ELEMENTS[id].name}
            </button>
          ))}
        </div>
      )}

      {!loaded.cards ? (
        <p className="hint">読み込み中…</p>
      ) : cards.length === 0 ? (
        <EmptyState title="まだカードがありません">
          <p>「新しいカード」から、画像と名前、属性を決めて最初の1枚を作りましょう。チームを組むには最低1枚、3対3の対戦には6枚ほどあると楽しめます。</p>
          <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>最初のカードを作る</button>
        </EmptyState>
      ) : (
        <div className="card-grid">
          {shown.map((c) => (
            <button key={c.id} type="button" className="card-tile" onClick={() => setEditing(c)} aria-label={`${c.name}を編集`}>
              <CardFace name={c.name} element={c.element} style={c.style} imageRef={c.image?.cropped} size="md" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
