import React, { useState } from 'react';
import {
  CATEGORIES, LEADER_SKILL_ORDER, LEADER_SKILLS, LeaderSkillId, SKILL_ORDER, SKILLS, SkillCategory, SkillId,
} from '../core/skills';

export function skillKindLabel(id: SkillId): string {
  const s = SKILLS[id];
  if (s.interval === null) return 'パッシブ';
  return `アクティブ・${s.interval}回ごと${s.once ? '・1回限り' : ''}`;
}

/** スキル選択（キャラクター像ごとのタブ） */
export function SkillPicker({ value, onChange }: { value: SkillId; onChange(id: SkillId): void }) {
  const [cat, setCat] = useState<SkillCategory>(SKILLS[value].category);
  const list = SKILL_ORDER.filter((id) => SKILLS[id].category === cat);
  return (
    <div className="skill-picker">
      <div className="cat-tabs" role="tablist" aria-label="スキルの分類">
        {CATEGORIES.map((c) => {
          const has = SKILLS[value].category === c.id;
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={cat === c.id}
              className={`cat-tab${cat === c.id ? ' on' : ''}${has ? ' has' : ''}`}
              onClick={() => setCat(c.id)}
            >
              {c.name}
            </button>
          );
        })}
      </div>
      <p className="hint">{CATEGORIES.find((c) => c.id === cat)!.text}</p>
      <div className="opt-list skill-list">
        {list.map((id) => {
          const s = SKILLS[id];
          const on = id === value;
          return (
            <button key={id} type="button" className={`opt skill-opt${on ? ' on' : ''}`} aria-pressed={on} onClick={() => onChange(id)}>
              <span className="opt-name">
                {s.name}
                <span className={`kind-tag ${s.interval === null ? 'passive' : 'active'}`}>{skillKindLabel(id)}</span>
              </span>
              <span className="skill-flavor">{s.flavor}</span>
              <span className="opt-text">{s.text}</span>
              {s.misfire && <span className="opt-text misfire-note">不発：{s.misfire}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function LeaderSkillPicker({ value, onChange }: { value: LeaderSkillId; onChange(id: LeaderSkillId): void }) {
  return (
    <div className="opt-list skill-list">
      {LEADER_SKILL_ORDER.map((id) => {
        const s = LEADER_SKILLS[id];
        const on = id === value;
        return (
          <button key={id} type="button" className={`opt skill-opt${on ? ' on' : ''}`} aria-pressed={on} onClick={() => onChange(id)}>
            <span className="opt-name"><Crown /> {s.name}</span>
            <span className="skill-flavor">{s.flavor}</span>
            <span className="opt-text">{s.text}</span>
          </button>
        );
      })}
    </div>
  );
}

/** リーダーの王冠マーク */
export function Crown({ className = '' }: { className?: string }) {
  return (
    <svg className={`crown ${className}`} viewBox="0 0 24 18" aria-hidden="true">
      <path d="M2 15 L3.5 4 L8.5 9 L12 2 L15.5 9 L20.5 4 L22 15 Z" fill="currentColor" stroke="rgba(0,0,0,0.55)" strokeWidth="1.2" strokeLinejoin="round" />
      <rect x="2" y="14.5" width="20" height="3" rx="1" fill="currentColor" stroke="rgba(0,0,0,0.55)" strokeWidth="1" />
    </svg>
  );
}
