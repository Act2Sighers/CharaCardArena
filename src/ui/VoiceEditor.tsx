import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ELEMENTS } from '../core/elements';
import { LEADER_SKILLS, SKILLS } from '../core/skills';
import type { Card } from '../core/types';
import {
  CardVoice, charCount, clipLine, countLines, FREQ_LABEL, LINE_MAX, LINES_PER_TIMING, skillCanMisfire, skillSpeaks,
  TIMING_GROUPS, TIMING_ORDER, TIMINGS, TimingId, VK, VoiceFreq,
} from '../core/voice';
import { useApp } from './AppContext';
import { CardFace } from './CardFace';
import { Crown, skillKindLabel } from './SkillPicker';

type Draft = Record<TimingId, string[]>;

function toDraft(v: CardVoice | undefined): Draft {
  const d = {} as Draft;
  for (const t of TIMING_ORDER) {
    const src = v?.lines[t] ?? [];
    d[t] = Array.from({ length: LINES_PER_TIMING }, (_, i) => src[i] ?? '');
  }
  return d;
}

const FREQ_ORDER: VoiceFreq[] = ['low', 'mid', 'high'];

/** 台詞の登録・編集（カード編集とは別の画面） */
export function VoiceEditor({ card, onClose }: { card: Card; onClose(): void }) {
  const { store, run } = useApp();
  const [freq, setFreq] = useState<VoiceFreq>(card.voice?.freq ?? 'mid');
  const [draft, setDraft] = useState<Draft>(() => toDraft(card.voice));
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ text: string; key: number } | null>(null);
  const previewKey = useRef(0);

  useEffect(() => {
    if (!preview) return;
    const t = setTimeout(() => setPreview(null), 1500 + charCount(preview.text) * 90);
    return () => clearTimeout(t);
  }, [preview]);

  const voice: CardVoice = useMemo(() => {
    const lines: CardVoice['lines'] = {};
    for (const t of TIMING_ORDER) {
      // 登録された内容はそのまま保存する（空欄だけを除く）
      const l = draft[t].filter((x) => x.trim().length > 0);
      if (l.length) lines[t] = l;
    }
    return { freq, lines };
  }, [draft, freq]);
  const total = countLines(voice);

  const setLine = (t: TimingId, i: number, value: string) => {
    setDraft((d) => ({ ...d, [t]: d[t].map((x, k) => (k === i ? clipLine(value) : x)) }));
  };

  const save = async () => {
    setBusy(true);
    const ok = await run(() => store.saveCard({ ...card, voice, updatedAt: Date.now() }), '台詞を保存しました');
    setBusy(false);
    if (ok) onClose();
  };

  const skill = card.skill ? SKILLS[card.skill] : null;
  const leader = card.leaderSkill ? LEADER_SKILLS[card.leaderSkill] : null;

  /** タイミングごとの補足（スキルの内容など） */
  const context = (t: TimingId): React.ReactNode => {
    if (t === 'skill' && skill && card.skill) {
      return (
        <div className="voice-context">
          <b>スキル「{skill.name}」</b><span className="muted">{skillKindLabel(card.skill)}</span>
          <p>{skill.text}</p>
          {!skillSpeaks(card.skill) && <p className="warn-text">このスキルは常に効いているパッシブで発動の瞬間が無いため、この台詞は使われません。</p>}
        </div>
      );
    }
    if (t === 'misfire' && skill && card.skill) {
      return (
        <div className="voice-context">
          <b>スキル「{skill.name}」</b>
          {skillCanMisfire(card.skill) ? <p>不発になる条件：{skill.misfire}</p> : <p className="warn-text">このスキルは不発にならないため、この台詞は使われません。</p>}
        </div>
      );
    }
    if (t === 'leader' && leader) {
      return (
        <div className="voice-context">
          <b><Crown /> リーダースキル「{leader.name}」</b>
          <p>{leader.text}</p>
          <p className="muted">チームのリーダーにしたときだけ使われます。</p>
        </div>
      );
    }
    if (t === 'endure' && card.element !== 'light') {
      return <div className="voice-context"><p className="warn-text">{ELEMENTS[card.element].name}属性なので、「ものまね」で光属性をまねている間だけ使われます。</p></div>;
    }
    if (t === 'hp60' || t === 'hp30') {
      return (
        <div className="voice-context hp-sample">
          <span className={`hp-swatch ${t === 'hp60' ? 'mid' : 'low'}`} />
          <span className="muted">ゲージがこの色に変わるとき</span>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="editor voice-editor">
      <div className="editor-head">
        <button type="button" className="btn btn-ghost" onClick={onClose}>← 戻る</button>
        <h2>台詞：{card.name}</h2>
      </div>

      <div className="voice-top">
        <div className="voice-card">
          <CardFace name={card.name} element={card.element} style={card.style} imageRef={card.image?.cropped} size="sm" />
          {preview && (
            <div key={preview.key} className="speech speech-preview" style={{ ['--el' as string]: ELEMENTS[card.element].color }}>
              <span className="speech-text">{preview.text}</span>
            </div>
          )}
        </div>
        <div className="panel voice-freq">
          <h3 className="panel-title">喋る頻度</h3>
          <div className="freq-row" role="group" aria-label="喋る頻度">
            {FREQ_ORDER.map((f) => (
              <button key={f} type="button" className={`freq-btn${freq === f ? ' on' : ''}`} aria-pressed={freq === f} onClick={() => setFreq(f)}>
                <span className="freq-name">{FREQ_LABEL[f]}</span>
                <span className="freq-num">約{Math.round(VK.prob[f] * 100)}%</span>
              </button>
            ))}
          </div>
          <p className="hint">
            台詞を登録したタイミングが来たとき、喋ろうとする確率です。ほかのカードと同時に喋ろうとしたときは1人だけが選ばれます。
            「戦闘開始時」「戦闘勝利時」は誰か1人が必ず喋り、頻度が高いほど選ばれやすくなります。
          </p>
          <p className="voice-total">登録済み {total} 件<span className="muted">（1つのタイミングに{LINES_PER_TIMING}つまで・1つ{LINE_MAX}文字まで）</span></p>
        </div>
      </div>

      {TIMING_GROUPS.map((g) => (
        <section key={g.id} className={`panel voice-group${g.id === 'frequent' ? ' frequent' : ''}`}>
          <h3 className="section-title">{g.name}</h3>
          {g.id === 'frequent' && (
            <p className="warn-text">
              ここにあるのは戦闘中に何度も起きるタイミングです。台詞が多いと盤面が賑やかになりすぎるため、喋る確率は通常の約{Math.round(VK.frequentFactor * 100)}%に抑えています。
            </p>
          )}
          <div className="voice-timings">
            {TIMING_ORDER.filter((t) => TIMINGS[t].group === g.id).map((t) => {
              const filled = draft[t].filter((x) => x.trim()).length;
              return (
                <div key={t} className="voice-timing">
                  <div className="voice-timing-head">
                    <span className="voice-timing-name">{TIMINGS[t].name}</span>
                    <span className={`voice-count${filled ? ' on' : ''}`}>{filled}/{LINES_PER_TIMING}</span>
                  </div>
                  <p className="voice-timing-text">{TIMINGS[t].text}</p>
                  {context(t)}
                  <div className="voice-inputs">
                    {draft[t].map((line, i) => (
                      <div key={i} className="voice-input">
                        <label className="sr-only" htmlFor={`voice-${t}-${i}`}>{TIMINGS[t].name} {i + 1}</label>
                        <input
                          id={`voice-${t}-${i}`}
                          type="text"
                          value={line}
                          placeholder={i === 0 ? '台詞を入力（空欄なら喋りません）' : '別の台詞（任意）'}
                          onChange={(e) => setLine(t, i, e.target.value)}
                        />
                        <span className={`voice-counter${charCount(line) >= LINE_MAX ? ' max' : ''}`}>{charCount(line)}/{LINE_MAX}</span>
                        <button
                          type="button"
                          className="btn btn-small btn-ghost"
                          disabled={!line.trim()}
                          onClick={() => setPreview({ text: line, key: ++previewKey.current })}
                          aria-label="吹き出しで表示してみる"
                        >
                          試す
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <div className="editor-actions sticky">
        <span className="spacer" />
        <button type="button" className="btn" onClick={onClose} disabled={busy}>キャンセル</button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>{busy ? '保存中…' : '保存'}</button>
      </div>
    </div>
  );
}
