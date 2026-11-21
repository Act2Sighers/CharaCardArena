import React, { useMemo, useState } from 'react';
import { ELEMENT_ORDER, ELEMENTS } from '../core/elements';
import { SKILLS } from '../core/skills';
import type { Card, ElementId } from '../core/types';
import { useApp } from './AppContext';
import { CardFace } from './CardFace';
import { CardEditor } from './CardEditor';
import { VoiceEditor } from './VoiceEditor';
import { countLines } from '../core/voice';
import { EmptyState } from './common';

export function CardsPage() {
  const { cards, loaded } = useApp();
  const [editing, setEditing] = useState<Card | 'new' | null>(null);
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const { cardMap } = useApp();
  const [filter, setFilter] = useState<ElementId | 'all'>('all');

  const shown = useMemo(() => (filter === 'all' ? cards : cards.filter((c) => c.element === filter)), [cards, filter]);

  const voiceCard = voiceId ? cardMap.get(voiceId) : null;
  if (editing) {
    const latest = editing === 'new' ? null : cardMap.get(editing.id) ?? editing;
    // 台詞画面を開いている間もカード編集画面は残しておき、編集途中の内容を失わないようにする
    return (
      <>
        <div hidden={!!voiceCard}>
          <CardEditor
            card={latest}
            onClose={() => setEditing(null)}
            onOpenVoice={latest ? () => setVoiceId(latest.id) : undefined}
          />
        </div>
        {voiceCard && <VoiceEditor key={voiceCard.id} card={voiceCard} onClose={() => setVoiceId(null)} />}
      </>
    );
  }
  if (voiceCard) {
    return <VoiceEditor key={voiceCard.id} card={voiceCard} onClose={() => setVoiceId(null)} />;
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
              <span className="tile-skill">
                {c.skill ? SKILLS[c.skill].name : '—'}
                {countLines(c.voice) > 0 && <span className="tile-voice">台詞{countLines(c.voice)}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
