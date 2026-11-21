import React from 'react';
import { AFF_ADV, AFF_DIS, ELEMENT_ORDER, ELEMENTS, masteryText, weakTo } from '../core/elements';
import { CATEGORIES, LEADER_SKILL_ORDER, LEADER_SKILLS, SK, SKILL_ORDER, SKILLS } from '../core/skills';
import { computeStats, STYLE_ORDER, STYLES, TACTIC_ORDER, TACTICS } from '../core/styles';
import { ElementBadge } from './CardFace';
import { StatBars } from './common';
import { Crown, skillKindLabel } from './SkillPicker';

export function RulesPage() {
  return (
    <div className="page rules">
      <div className="page-head">
        <div>
          <h1 className="page-title">ルール</h1>
          <p className="page-sub">戦闘はすべて自動で進みます。プレイヤーが決めるのはカードの属性・スタイル・戦法・スキルと、チームの並びとリーダーです。</p>
        </div>
      </div>

      <section className="panel">
        <h2 className="section-title">戦闘の流れ</h2>
        <ol className="rule-steps">
          <li>両チームの<b>前線（最大3人）</b>だけで戦闘が始まります。</li>
          <li>各カードの<b>行動ゲージ</b>が速さに応じて溜まり、満タンになったカードから1体ずつ攻撃します。</li>
          <li>ダメージは「攻撃力 ×（防御力による軽減）× 属性相性」で決まります。相性が有利なら<b>×{AFF_ADV}</b>、不利なら<b>×{AFF_DIS}</b>です。</li>
          <li>HPが0になったカードは脱落し、<b>待機</b>のカードが順番にその位置へ入ります（HP満タン・ゲージ0から）。</li>
          <li>各カードは<b>スキル</b>を1つ持ちます。チームの<b>リーダー</b>は、前線にいる間だけ<b>リーダースキル</b>でチーム全体を助けます。</li>
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
        <h2 className="section-title">スキル</h2>
        <p>
          <b>アクティブスキル</b>は、自分が決められた回数だけ行動するとチャージが溜まり（戦闘画面の●）、次の行動で通常攻撃の代わりに発動します。
          <b>パッシブスキル</b>は常に効いているか、条件を満たすたびに自動で発動します。
        </p>
        <p>
          <b>不発保証：</b>チャージが溜まったのに発動の条件を満たしていないと「不発」になります。不発したときはチャージを使い切って通常攻撃を行い、
          そのかわり次の行動ゲージが{Math.round(SK.misfireGauge * 100)}%進んだ状態から始まります。
          パッシブスキルの多くは、条件を満たしていなくても小さな効果があり、条件を満たすと大きくなります。
        </p>
        {CATEGORIES.map((cat) => (
          <div key={cat.id}>
            <h3 className="rule-cat">{cat.name}<span className="muted">　{cat.text}</span></h3>
            <div className="rule-skills">
              {SKILL_ORDER.filter((id) => SKILLS[id].category === cat.id).map((id) => (
                <div key={id} className="rule-skill">
                  <h4>{SKILLS[id].name}<span className={`kind-tag ${SKILLS[id].interval === null ? 'passive' : 'active'}`}>{skillKindLabel(id)}</span></h4>
                  <p>{SKILLS[id].text}</p>
                  {SKILLS[id].misfire && <p className="misfire-note">不発：{SKILLS[id].misfire}</p>}
                </div>
              ))}
            </div>
          </div>
        ))}
        <h3 className="rule-cat">「本領発揮」「一族の誇り」による属性効果の強化</h3>
        <ul className="rule-steps">
          {ELEMENT_ORDER.map((id) => (
            <li key={id}>{ELEMENTS[id].name}：{masteryText(id)}</li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2 className="section-title"><Crown /> リーダースキル</h2>
        <p>チーム編成で必ず1人をリーダーにします。リーダースキルはリーダーが前線にいる間だけ効き、リーダーが倒れると消えます。リーダーを待機に置くと、前線に出たときから効き始めます。</p>
        <div className="rule-skills">
          {LEADER_SKILL_ORDER.map((id) => (
            <div key={id} className="rule-skill">
              <h4>{LEADER_SKILLS[id].name}</h4>
              <p>{LEADER_SKILLS[id].text}</p>
            </div>
          ))}
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
