import React, { useEffect, useState } from 'react';
import { STAT_MAX } from '../core/styles';
import type { Stats } from '../core/types';

/** 2 回押しで実行する確認ボタン（ダイアログが使えない環境向け） */
export function ConfirmButton({
  label, confirmLabel, onConfirm, className = 'btn btn-danger', disabled,
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  className?: string;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={`${className}${armed ? ' armed' : ''}`}
      disabled={disabled}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}

const STAT_LABEL: Record<keyof Stats, string> = { hp: 'HP', atk: '攻撃', def: '防御', spd: '速さ' };

export function StatBars({ stats, compact = false }: { stats: Stats; compact?: boolean }) {
  return (
    <dl className={`statbars${compact ? ' compact' : ''}`}>
      {(Object.keys(STAT_LABEL) as (keyof Stats)[]).map((k) => (
        <div key={k} className="statbar">
          <dt>{STAT_LABEL[k]}</dt>
          <dd>
            <span className="statbar-track">
              <span className="statbar-fill" style={{ width: `${Math.min(100, (stats[k] / STAT_MAX[k]) * 100)}%` }} />
            </span>
            <span className="statbar-num">{stats[k]}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children}
    </div>
  );
}

export function formatDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
