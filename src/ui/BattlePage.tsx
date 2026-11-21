import React, { useMemo, useState } from 'react';
import { stripVoices, teamMemberIds, teamSnapshot } from '../core/battle';
import { ENGINE_VERSION, simulate } from '../core/engine';
import { randomSeed } from '../core/rng';
import { randomTeam } from '../core/random';
import type { BattleRecord, TeamSnapshot } from '../core/types';
import { newId } from '../storage/store';
import { useApp } from './AppContext';
import { BattleViewer } from './BattleViewer';
import { EmptyState } from './common';
import { TeamStrip } from './TeamsPage';

type Opponent = { kind: 'team'; id: string } | { kind: 'random' };

export function BattlePage() {
  const { teams, cards, cardMap, battles, saveBattle, store, run, loaded } = useApp();
  const [aId, setAId] = useState<string | null>(null);
  const [opp, setOpp] = useState<Opponent | null>(null);
  const [current, setCurrent] = useState<BattleRecord | null>(null);

  const teamA = teams.find((t) => t.id === aId) ?? null;
  const sizeA = teamA ? teamMemberIds(teamA).length : 0;
  const candidates = useMemo(
    () => (teamA ? teams.filter((t) => teamMemberIds(t).length === sizeA) : []),
    [teams, teamA, sizeA],
  );

  if (current) {
    const meta = battles.find((b) => b.id === current.id);
    return (
      <BattleViewer
        teamA={current.teamA}
        teamB={current.teamB}
        events={current.events}
        live
        favorite={meta?.favorite}
        onToggleFavorite={meta ? () => run(() => store.setFavorite(meta.id, !meta.favorite)) : undefined}
        onClose={() => setCurrent(null)}
      />
    );
  }

  const start = () => {
    if (!teamA || !opp) return;
    const teamB = opp.kind === 'team' ? teams.find((t) => t.id === opp.id) : randomTeam(cards, sizeA, teamMemberIds(teamA));
    if (!teamB) return;
    const snapA: TeamSnapshot = teamSnapshot(teamA, cardMap);
    const snapB: TeamSnapshot = teamSnapshot(teamB, cardMap);
    const seed = randomSeed();
    const result = simulate(snapA, snapB, seed);
    const record: BattleRecord = {
      id: newId(),
      createdAt: Date.now(),
      seed,
      engineVersion: ENGINE_VERSION,
      teamA: stripVoices(snapA),
      teamB: stripVoices(snapB),
      winner: result.winner,
      reason: result.reason,
      events: result.events,
      favorite: false,
    };
    setCurrent(record);
    // 結果は開始時点で確定しているので、すぐ履歴に保存する
    void saveBattle(record);
  };

  if (!loaded.teams) return <div className="page"><p className="hint">読み込み中…</p></div>;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">対戦</h1>
          <p className="page-sub">同じ人数のチーム同士で、自動で戦います。</p>
        </div>
      </div>

      {teams.length === 0 ? (
        <EmptyState title="対戦にはチームが必要です">
          <p>「チーム」でチームを作ると、ここで戦わせられます。相手は保存したチームか、手持ちのカードからのランダム編成を選べます。</p>
        </EmptyState>
      ) : (
        <div className="setup">
          <section className="setup-col">
            <h2 className="section-title"><span className="side-tag side-tag-a">A</span> チームを選ぶ</h2>
            <div className="team-list">
              {teams.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`team-row${aId === t.id ? ' on' : ''}`}
                  aria-pressed={aId === t.id}
                  onClick={() => {
                    setAId(t.id);
                    setOpp(null);
                  }}
                >
                  <div className="team-row-head">
                    <span className="team-name">{t.name}</span>
                    <span className="team-size">{teamMemberIds(t).length}人</span>
                  </div>
                  <TeamStrip team={t} cardMap={cardMap} />
                </button>
              ))}
            </div>
          </section>

          <section className="setup-col">
            <h2 className="section-title"><span className="side-tag side-tag-b">B</span> 相手を選ぶ</h2>
            {!teamA ? (
              <p className="hint">先に左（スマホでは上）でチームを選んでください。</p>
            ) : (
              <div className="team-list">
                <button
                  type="button"
                  className={`team-row random${opp?.kind === 'random' ? ' on' : ''}`}
                  aria-pressed={opp?.kind === 'random'}
                  disabled={cards.length < sizeA}
                  onClick={() => setOpp({ kind: 'random' })}
                >
                  <div className="team-row-head">
                    <span className="team-name">ランダム編成</span>
                    <span className="team-size">{sizeA}人</span>
                  </div>
                  <p className="hint">
                    {cards.length < sizeA
                      ? `カードが${sizeA}枚以上必要です。`
                      : cards.length >= sizeA * 2 + 2
                        ? `手持ちのカードから、${teamA.name}にいないカードをランダムで選んで並べます（リーダーもランダム）。`
                        : '手持ちのカードから、開始時にランダムで選んで並べます（リーダーもランダム）。'}
                  </p>
                </button>
                {candidates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`team-row${opp?.kind === 'team' && opp.id === t.id ? ' on' : ''}`}
                    aria-pressed={opp?.kind === 'team' && opp.id === t.id}
                    onClick={() => setOpp({ kind: 'team', id: t.id })}
                  >
                    <div className="team-row-head">
                      <span className="team-name">{t.name}{t.id === teamA.id ? '（同じチーム）' : ''}</span>
                      <span className="team-size">{teamMemberIds(t).length}人</span>
                    </div>
                    <TeamStrip team={t} cardMap={cardMap} />
                  </button>
                ))}
                {candidates.length <= 1 && (
                  <p className="hint">{sizeA}人のチームはほかにありません。同じ人数のチームを作るか、ランダム編成を選んでください。</p>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {teamA && (
        <div className="start-bar">
          <button type="button" className="btn btn-primary btn-big" disabled={!opp} onClick={start}>
            戦闘開始
          </button>
        </div>
      )}
    </div>
  );
}
