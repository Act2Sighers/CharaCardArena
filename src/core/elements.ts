import type { Affinity, ElementId } from './types';

export interface ElementInfo {
  id: ElementId;
  name: string;
  /** 基本色 */
  color: string;
  /** 明るい側の色（発光・文字用） */
  glow: string;
  /** 暗い側の色（枠の陰影用） */
  deep: string;
  /** この属性が有利をとる属性 */
  beats: ElementId[];
  effectName: string;
  effectText: string;
}

/** 属性効果の数値（バランス調整はここで行う） */
export const FX = {
  /** 水: 行動後、HP割合最小の味方を最大HPのこの割合だけ回復 */
  waterHeal: 0.05,
  /** 炎: 両隣への飛び火（与ダメージに対する割合） */
  fireSplash: 0.27,
  /** 雷: 追撃の発生率と威力 */
  thunderChance: 0.5,
  thunderPower: 0.6,
  /** 毒: 1段階あたりの被ダメージ（最大HP比）と最大段階 */
  poisonPerStack: 0.02,
  poisonMax: 3,
  /** 草: 行動開始時の自己回復（最大HP比） */
  grassRegen: 0.07,
  /** 氷: 凍え中の速さ倍率 */
  iceSlow: 0.55,
  /** 地: 1回で受けるダメージの上限（最大HP比） */
  earthCap: 0.12,
  /** 風: 回避率 */
  windEvade: 0.28,
  /** 闇: 相手の減っているHP割合1あたりの与ダメージ上昇 */
  darkExecute: 0.75,
  /** 光: 加護で踏みとどまったときに残るHP（最大HP比） */
  lightEndure: 0.26,
} as const;

/** 「本領発揮」「一族の誇り」で強化されたときの値 */
export const FX_MASTERY = {
  waterHeal: 0.085,
  fireSplash: 0.42,
  thunderChance: 0.72,
  poisonPerStack: 0.032,
  grassRegen: 0.105,
  iceSlow: 0.33,
  earthCap: 0.09,
  windEvade: 0.38,
  lightEndure: 0.5,
  darkExecute: 1.1,
} as const;

export type FxKey = keyof typeof FX_MASTERY;

/** 各属性の効果がどの数値を使うか */
export const ELEMENT_FX_KEY: Record<ElementId, FxKey> = {
  water: 'waterHeal', fire: 'fireSplash', thunder: 'thunderChance', poison: 'poisonPerStack',
  grass: 'grassRegen', ice: 'iceSlow', earth: 'earthCap', wind: 'windEvade', light: 'lightEndure', dark: 'darkExecute',
};

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** 強化時の説明（本領発揮・一族の誇り） */
export function masteryText(id: ElementId): string {
  const k = ELEMENT_FX_KEY[id];
  if (k === 'iceSlow') return `凍えた相手の速さ低下 ${pct(1 - FX.iceSlow)}→${pct(1 - FX_MASTERY.iceSlow)}`;
  const label: Record<FxKey, string> = {
    waterHeal: '回復量', fireSplash: '飛び火', thunderChance: '追撃の確率', poisonPerStack: '毒1段階のダメージ',
    grassRegen: '回復量', iceSlow: '', earthCap: '1回のダメージ上限', windEvade: '回避率',
    lightEndure: '踏みとどまった後のHP', darkExecute: '最大上昇量',
  };
  return `${ELEMENTS[id].effectName}の${label[k]} ${pct(FX[k])}→${pct(FX_MASTERY[k])}`;
}

export const ELEMENTS: Record<ElementId, ElementInfo> = {
  water: {
    id: 'water', name: '水', color: '#2f7de1', glow: '#8cc4ff', deep: '#123a73',
    beats: ['fire', 'earth', 'poison'],
    effectName: '恵みの雨',
    effectText: `行動するたびに、HP割合が最も低い味方を最大HPの${pct(FX.waterHeal)}回復する。`,
  },
  fire: {
    id: 'fire', name: '炎', color: '#e0412f', glow: '#ff9b6a', deep: '#6e140c',
    beats: ['grass', 'ice'],
    effectName: '延焼',
    effectText: `攻撃した相手の両隣の敵にも、与えたダメージの${pct(FX.fireSplash)}が飛び火する。`,
  },
  thunder: {
    id: 'thunder', name: '雷', color: '#f2c81f', glow: '#fff08a', deep: '#6b5400',
    beats: ['water', 'wind'],
    effectName: '迅雷',
    effectText: `攻撃後${pct(FX.thunderChance)}の確率で、同じ相手に威力${pct(FX.thunderPower)}の追撃を放つ。`,
  },
  poison: {
    id: 'poison', name: '毒', color: '#9a4fd6', glow: '#d9a6ff', deep: '#3d1561',
    beats: ['thunder', 'grass'],
    effectName: '蝕毒',
    effectText: `攻撃した相手に毒を重ねる（最大${FX.poisonMax}段階）。毒を受けた敵は行動するたびに最大HPの${pct(FX.poisonPerStack)}×段階数のダメージを受ける。`,
  },
  grass: {
    id: 'grass', name: '草', color: '#3fae4a', glow: '#9be58f', deep: '#14481a',
    beats: ['water', 'light'],
    effectName: '再生',
    effectText: `自分の行動の始めに、自分のHPを最大HPの${pct(FX.grassRegen)}回復する。`,
  },
  ice: {
    id: 'ice', name: '氷', color: '#5fd0e8', glow: '#c9f6ff', deep: '#155563',
    beats: ['water', 'dark'],
    effectName: '凍気',
    effectText: `攻撃した相手を凍えさせ、次に行動するまで速さを${pct(1 - FX.iceSlow)}下げる。`,
  },
  earth: {
    id: 'earth', name: '地', color: '#e8892a', glow: '#ffc27a', deep: '#5c2f06',
    beats: ['ice', 'thunder'],
    effectName: '不動',
    effectText: `1回の攻撃で受けるダメージは、最大HPの${pct(FX.earthCap)}までに抑えられる。`,
  },
  wind: {
    id: 'wind', name: '風', color: '#7fd6bf', glow: '#d2fff1', deep: '#22574a',
    beats: ['earth'],
    effectName: '疾風',
    effectText: `${pct(FX.windEvade)}の確率で、相手の攻撃（追撃を含む）を完全に避ける。`,
  },
  light: {
    id: 'light', name: '光', color: '#f4f1e6', glow: '#ffffff', deep: '#7a7461',
    beats: ['poison'],
    effectName: '加護',
    effectText: `戦闘中に1回だけ、倒れるはずのダメージを受けても踏みとどまり、HPが最大HPの${pct(FX.lightEndure)}まで戻る。`,
  },
  dark: {
    id: 'dark', name: '闇', color: '#2a2233', glow: '#a87fd8', deep: '#0a070e',
    beats: ['fire'],
    effectName: '冥闇',
    effectText: `相手のHPが減っているほど与えるダメージが上がる（HP0に近いほど最大+${pct(FX.darkExecute)}）。`,
  },
};

export const ELEMENT_ORDER: ElementId[] = [
  'water', 'fire', 'grass', 'poison', 'thunder', 'earth', 'ice', 'wind', 'light', 'dark',
];

export const AFF_ADV = 1.5;
export const AFF_DIS = 0.7;

export function affinity(attacker: ElementId, defender: ElementId): Affinity {
  if (ELEMENTS[attacker].beats.includes(defender)) return 'adv';
  if (ELEMENTS[defender].beats.includes(attacker)) return 'dis';
  return 'neutral';
}

export function affinityMul(a: Affinity): number {
  return a === 'adv' ? AFF_ADV : a === 'dis' ? AFF_DIS : 1;
}

/** この属性に不利をとる属性（=この属性が弱点） */
export function weakTo(id: ElementId): ElementId[] {
  return ELEMENT_ORDER.filter((e) => ELEMENTS[e].beats.includes(id));
}
