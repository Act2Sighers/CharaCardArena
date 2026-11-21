import type { LeaderSkillId, SkillId } from './skills';

// ===== 基本データ型 =====

export type ElementId =
  | 'water' | 'fire' | 'thunder' | 'poison' | 'grass'
  | 'ice' | 'earth' | 'wind' | 'light' | 'dark';

export type StyleId = 'power' | 'guard' | 'swift' | 'tough' | 'balance';

export type TacticId = 'rush' | 'snipe' | 'discern' | 'challenge';

/** 画像の切り抜き範囲（元画像のピクセル座標） */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CardImage {
  /** 切り抜き済み画像（カード表示用）の参照 */
  cropped: string;
  /** 元画像（縮小済み、切り抜き直し用）の参照 */
  original: string;
  crop: CropRect;
}

export interface Card {
  id: string;
  name: string;
  element: ElementId;
  style: StyleId;
  tactic: TacticId;
  /** スキル（必須） */
  skill: SkillId;
  /** リーダースキル（必須。リーダーのときだけ有効） */
  leaderSkill: LeaderSkillId;
  description: string;
  image: CardImage | null;
  createdAt: number;
  updatedAt: number;
}

export interface Team {
  id: string;
  name: string;
  /** 前線の 左・中央・右（空き枠は null） */
  front: (string | null)[];
  /** 待機（登場順） */
  reserve: string[];
  /** リーダーのカード ID（必須） */
  leader: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Stats {
  hp: number;
  atk: number;
  def: number;
  spd: number;
}

/** 戦闘用に固定したカード情報（履歴にも保存する） */
export interface UnitSnapshot {
  cardId: string;
  name: string;
  element: ElementId;
  style: StyleId;
  tactic: TacticId;
  imageRef: string | null;
  stats: Stats;
  /** 以下はエンジン v2 以降（古い履歴には無い） */
  skill?: SkillId;
  leaderSkill?: LeaderSkillId;
  leader?: boolean;
}

export interface TeamSnapshot {
  name: string;
  /** 前線 3 枠（空きは null） */
  front: (UnitSnapshot | null)[];
  reserve: UnitSnapshot[];
}

export type Side = 'A' | 'B';

/** 戦闘中のユニット ID: "A0".."A5" / "B0".."B5" */
export type UnitId = string;

export type Affinity = 'adv' | 'dis' | 'neutral';

export type BattleEvent =
  | { t: 'enter'; unit: UnitId; side: Side; slot: number; initial: boolean }
  | { t: 'turn'; unit: UnitId; gauges: Record<UnitId, number>; charge?: number; chargeMax?: number }
  | { t: 'attack'; unit: UnitId; target: UnitId; followup: boolean; tag?: AttackTag }
  | { t: 'evade'; unit: UnitId; source: UnitId }
  | {
      t: 'damage'; unit: UnitId; source: UnitId | null; amount: number; hp: number;
      kind: DamageKind;
      aff: Affinity; capped: boolean; execute: boolean;
    }
  | { t: 'heal'; unit: UnitId; source: UnitId; amount: number; hp: number; kind: HealKind }
  | { t: 'endure'; unit: UnitId }
  | { t: 'poison'; unit: UnitId; source: UnitId; stacks: number }
  | { t: 'chill'; unit: UnitId; source: UnitId; on: boolean }
  | { t: 'ko'; unit: UnitId }
  | { t: 'skill'; unit: UnitId; skill: SkillId; via?: SkillId; target?: UnitId; element?: ElementId }
  | { t: 'misfire'; unit: UnitId; skill: SkillId; gauge: number }
  | { t: 'cover'; unit: UnitId; target: UnitId }
  | { t: 'gauge'; unit: UnitId; value: number; reason: GaugeReason }
  | { t: 'revive'; unit: UnitId; source: UnitId; side: Side; slot: number; hp: number }
  | { t: 'buff'; unit: UnitId; buff: 'mimic' | 'invert'; on: boolean; element?: ElementId }
  | { t: 'leader'; unit: UnitId; skill: LeaderSkillId; on: boolean }
  | { t: 'end'; winner: Side | 'draw'; reason: 'wipe' | 'timeout'; scoreA: number; scoreB: number };

export type AttackTag = 'normal' | 'followup' | 'skill' | 'sweep' | 'counter' | 'assist';
export type DamageKind = 'attack' | 'followup' | 'splash' | 'poison' | 'sweep' | 'counter' | 'assist' | 'cost';
export type HealKind = 'rain' | 'regen' | 'skill' | 'nature' | 'mercy';
export type GaugeReason = 'cheer' | 'hold' | 'spirit' | 'first' | 'gale' | 'relief' | 'warlord' | 'misfire';

export interface BattleResult {
  events: BattleEvent[];
  winner: Side | 'draw';
  reason: 'wipe' | 'timeout';
}

export interface BattleRecord {
  id: string;
  createdAt: number;
  seed: number;
  engineVersion: number;
  teamA: TeamSnapshot;
  teamB: TeamSnapshot;
  winner: Side | 'draw';
  reason: 'wipe' | 'timeout';
  events: BattleEvent[];
  favorite: boolean;
}
