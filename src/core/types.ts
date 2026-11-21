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
  | { t: 'turn'; unit: UnitId; gauges: Record<UnitId, number> }
  | { t: 'attack'; unit: UnitId; target: UnitId; followup: boolean }
  | { t: 'evade'; unit: UnitId; source: UnitId }
  | {
      t: 'damage'; unit: UnitId; source: UnitId | null; amount: number; hp: number;
      kind: 'attack' | 'followup' | 'splash' | 'poison';
      aff: Affinity; capped: boolean; execute: boolean;
    }
  | { t: 'heal'; unit: UnitId; source: UnitId; amount: number; hp: number; kind: 'rain' | 'regen' }
  | { t: 'endure'; unit: UnitId }
  | { t: 'poison'; unit: UnitId; source: UnitId; stacks: number }
  | { t: 'chill'; unit: UnitId; source: UnitId; on: boolean }
  | { t: 'ko'; unit: UnitId }
  | { t: 'end'; winner: Side | 'draw'; reason: 'wipe' | 'timeout'; scoreA: number; scoreB: number };

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
