import React from 'react';
import { AFF_ADV, AFF_DIS, ELEMENT_ORDER, ELEMENTS, weakTo } from '../core/elements';
import { computeStats, STYLE_ORDER, STYLES, TACTIC_ORDER, TACTICS } from '../core/styles';
import { ElementBadge } from './CardFace';
import { StatBars } from './common';

export function RulesPage() {
  return (
    <div className="page rules">
      <div className="page-head">
        <div>
          <h1 className="page-title">ルール</h1>
          <p className="page-sub">戦闘はすべて自動で進みます。プレイヤーが決めるのはカードの属性・スタイル・戦法と、チームの並びです。</p>
        </div>
      </div>

      <section className="panel">
        <h2 className="section-title">戦闘の流れ</h2>
        <ol className="rule-steps">
          <li>両チームの<b>前線（最大3人）</b>だけで戦闘が始まります。</li>
          <li>各カードの<b>行動ゲージ</b>が速さに応じて溜まり、満タンになったカードから1体ずつ攻撃します。</li>
          <li>ダメージは「攻撃力 ×（防御力による軽減）× 属性相性」で決まります。相性が有利なら<b>×{AFF_ADV}</b>、不利なら<b>×{AFF_DIS}</b>です。</li>
          <li>HPが0になったカードは脱落し、<b>待機</b>のカードが順番にその位置へ入ります（HP満タン・ゲージ0から）。</li>
          <li>相手チームを全員倒したら勝ちです。決着がつかないまま行動回数が上限に達すると、残りHPの割合（待機中は満タンとして計算）で判定します。</li>
        </ol>
      </section>

      <section className="panel">
        <h2 className="section-title">属性と効果</h2>
        <div className="rule-elements">
          {ELEMENT_ORDER.map((id) => {
            const e = ELEMENTS[id];
            return (
              <div key={id} className="rule-el" style={{ ['--el' as string]: e.color }}>
                <div className="rule-el-head">
                  <ElementBadge element={id} />
                  <span className="rule-el-name">{e.effectName}</span>
                </div>
                <p>{e.effectText}</p>
                <p className="aff-line">
                  <span className="muted">有利:</span> {e.beats.map((b) => ELEMENTS[b].name).join('・')}
                  <span className="muted"> ／ 不利:</span> {weakTo(id).map((b) => ELEMENTS[b].name).join('・')}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <h2 className="section-title">スタイル（能力値の配分）</h2>
        <div className="rule-styles">
          {STYLE_ORDER.map((id) => (
            <div key={id} className="rule-style">
              <h3>{STYLES[id].name}<small>{STYLES[id].short}</small></h3>
              <p>{STYLES[id].text}</p>
              <StatBars stats={computeStats(id)} compact />
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2 className="section-title">戦法（攻撃する相手の選び方）</h2>
        <dl className="rule-tactics">
          {TACTIC_ORDER.map((id) => (
            <div key={id}>
              <dt>{TACTICS[id].name}</dt>
              <dd>{TACTICS[id].text}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
