import type { Stats, StyleId, TacticId } from './types';

export interface StyleInfo {
  id: StyleId;
  name: string;
  short: string;
  text: string;
  /** 基準値に掛ける倍率 */
  mul: Stats;
  /** 「猛進」の敵に狙われやすさ（重み） */
  aggro: number;
}

export interface TacticInfo {
  id: TacticId;
  name: string;
  text: string;
}

/** 基準ステータス（全スタイル共通） */
export const BASE: Stats = { hp: 520, atk: 100, def: 100, spd: 100 };

export const STYLES: Record<StyleId, StyleInfo> = {
  power: {
    id: 'power', name: '剛撃', short: 'アタッカー',
    text: '攻撃力が非常に高いが、守りは薄い。',
    mul: { hp: 0.98, atk: 1.4, def: 0.75, spd: 1.0 }, aggro: 1,
  },
  guard: {
    id: 'guard', name: '堅守', short: 'ガード',
    text: '防御力が非常に高く、HPも多い。攻撃力は低め。敵に狙われやすい。',
    mul: { hp: 1.22, atk: 0.8, def: 1.6, spd: 0.92 }, aggro: 2.6,
  },
  swift: {
    id: 'swift', name: '迅速', short: 'スピード',
    text: '非常に素早く、行動回数で押す。HPは低め。',
    mul: { hp: 0.82, atk: 1.0, def: 0.92, spd: 1.29 }, aggro: 1,
  },
  tough: {
    id: 'tough', name: '頑健', short: 'タフ',
    text: 'HPが非常に多く粘り強い。動きは遅め。',
    mul: { hp: 1.48, atk: 1.06, def: 1.0, spd: 0.76 }, aggro: 1,
  },
  balance: {
    id: 'balance', name: '均衡', short: 'バランス',
    text: '目立った長所も短所もない、すべてが平均以上の型。',
    mul: { hp: 1.04, atk: 1.04, def: 1.04, spd: 1.02 }, aggro: 1,
  },
};

export const STYLE_ORDER: StyleId[] = ['power', 'guard', 'swift', 'tough', 'balance'];

export const TACTICS: Record<TacticId, TacticInfo> = {
  rush: { id: 'rush', name: '猛進', text: '相手を選ばず勢いで攻める。与えるダメージ+15%。堅守の敵に引き寄せられやすい。' },
  snipe: { id: 'snipe', name: '狙撃', text: 'HPの割合が最も低い敵を狙い、確実に数を減らす。' },
  discern: { id: 'discern', name: '見極め', text: '自分が有利な属性の敵を優先し、不利な敵はなるべく避ける。' },
  challenge: { id: 'challenge', name: '挑戦', text: '攻撃力が最も高い、いちばん危険な敵に挑む。' },
};

export const TACTIC_ORDER: TacticId[] = ['rush', 'snipe', 'discern', 'challenge'];

export function computeStats(style: StyleId): Stats {
  const m = STYLES[style].mul;
  return {
    hp: Math.round(BASE.hp * m.hp),
    atk: Math.round(BASE.atk * m.atk),
    def: Math.round(BASE.def * m.def),
    spd: Math.round(BASE.spd * m.spd),
  };
}

/** 表示用：各ステータスの目盛り上限 */
export const STAT_MAX: Stats = { hp: 800, atk: 140, def: 160, spd: 145 };
