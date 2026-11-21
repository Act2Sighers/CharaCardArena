import { affinity, affinityMul, FX } from './elements';
import { Rng } from './rng';
import { STYLES } from './styles';
import type {
  Affinity, BattleEvent, BattleResult, Side, TeamSnapshot, UnitId, UnitSnapshot,
} from './types';

export const ENGINE_VERSION = 1;

/** 行動ゲージの満タン値 */
const GAUGE_FULL = 1000;
/** ダメージ係数 */
const DMG_K = 1.5;
/** 1 体あたりの行動回数上限（両チーム合計人数 × この値で時間切れ） */
const ACTIONS_PER_UNIT = 30;
/** 猛進の与ダメージ倍率 */
export const RUSH_BONUS = 1.15;

export interface Unit {
  id: UnitId;
  side: Side;
  snap: UnitSnapshot;
  maxHp: number;
  hp: number;
  gauge: number;
  /** 前線の位置 0..2、待機中・脱落は -1 */
  slot: number;
  alive: boolean;
  poison: number;
  chilled: boolean;
  endureUsed: boolean;
}

/** チームのユニット一覧（前線→待機の順）。ID は前線の空き枠を詰めて振る */
export function teamUnits(side: Side, team: TeamSnapshot): { unit: UnitSnapshot; slot: number; id: UnitId }[] {
  const list: { unit: UnitSnapshot; slot: number; id: UnitId }[] = [];
  team.front.forEach((u, slot) => {
    if (u) list.push({ unit: u, slot, id: '' });
  });
  team.reserve.forEach((u) => list.push({ unit: u, slot: -1, id: '' }));
  list.forEach((x, i) => (x.id = `${side}${i}`));
  return list;
}

export function teamSize(team: TeamSnapshot): number {
  return team.front.filter(Boolean).length + team.reserve.length;
}

export function simulate(teamA: TeamSnapshot, teamB: TeamSnapshot, seed: number): BattleResult {
  const rng = new Rng(seed);
  const events: BattleEvent[] = [];
  const units: Unit[] = [];
  const reserves: Record<Side, Unit[]> = { A: [], B: [] };

  for (const [side, team] of [['A', teamA], ['B', teamB]] as const) {
    for (const x of teamUnits(side, team)) {
      const u: Unit = {
        id: x.id, side, snap: x.unit, maxHp: x.unit.stats.hp, hp: x.unit.stats.hp,
        gauge: 0, slot: x.slot, alive: true, poison: 0, chilled: false, endureUsed: false,
      };
      units.push(u);
      if (x.slot < 0) reserves[side].push(u);
    }
  }

  const onField = (side?: Side) =>
    units.filter((u) => u.alive && u.slot >= 0 && (!side || u.side === side));
  const other = (s: Side): Side => (s === 'A' ? 'B' : 'A');
  const hasAny = (side: Side) => units.some((u) => u.side === side && u.alive);

  // 開始時の登場（ゲージに少しだけばらつきを持たせる）
  for (const u of onField()) {
    u.gauge = Math.floor(rng.range(0, 150));
    events.push({ t: 'enter', unit: u.id, side: u.side, slot: u.slot, initial: true });
  }

  const pendingSlots: { side: Side; slot: number }[] = [];

  const ko = (u: Unit) => {
    u.alive = false;
    events.push({ t: 'ko', unit: u.id });
    pendingSlots.push({ side: u.side, slot: u.slot });
    u.slot = -1;
    u.poison = 0;
    u.chilled = false;
  };

  /** ダメージを適用（地の上限・光の加護・撃破を処理）。実際に与えた量を返す */
  const applyDamage = (
    target: Unit, raw: number, kind: 'attack' | 'followup' | 'splash' | 'poison',
    source: Unit | null, aff: Affinity, execute: boolean,
  ): number => {
    let dmg = Math.max(1, Math.round(raw));
    let capped = false;
    if (target.snap.element === 'earth' && kind !== 'poison') {
      const cap = Math.round(target.maxHp * FX.earthCap);
      if (dmg > cap) {
        dmg = cap;
        capped = true;
      }
    }
    let endured = false;
    if (dmg >= target.hp && target.snap.element === 'light' && !target.endureUsed) {
      // 加護：倒れずに、最大HPの一定割合まで持ち直す
      target.endureUsed = true;
      endured = true;
      target.hp = Math.max(1, Math.round(target.maxHp * FX.lightEndure));
    } else {
      target.hp = Math.max(0, target.hp - dmg);
    }
    events.push({
      t: 'damage', unit: target.id, source: source ? source.id : null, amount: dmg,
      hp: target.hp, kind, aff, capped, execute,
    });
    if (endured) events.push({ t: 'endure', unit: target.id });
    if (target.hp <= 0) ko(target);
    return dmg;
  };

  const heal = (target: Unit, amount: number, source: Unit, kind: 'rain' | 'regen') => {
    const a = Math.min(Math.round(amount), target.maxHp - target.hp);
    if (a <= 0) return;
    target.hp += a;
    events.push({ t: 'heal', unit: target.id, source: source.id, amount: a, hp: target.hp, kind });
  };

  const chooseTarget = (actor: Unit): Unit => {
    const foes = onField(other(actor.side));
    const aggro = (u: Unit) => STYLES[u.snap.style].aggro;
    switch (actor.snap.tactic) {
      case 'snipe': {
        const min = Math.min(...foes.map((f) => f.hp / f.maxHp));
        return rng.pick(foes.filter((f) => f.hp / f.maxHp <= min + 1e-9));
      }
      case 'challenge': {
        const max = Math.max(...foes.map((f) => f.snap.stats.atk));
        return rng.pick(foes.filter((f) => f.snap.stats.atk === max));
      }
      case 'discern': {
        const adv = foes.filter((f) => affinity(actor.snap.element, f.snap.element) === 'adv');
        if (adv.length) return rng.weighted(adv, aggro);
        const neutral = foes.filter((f) => affinity(actor.snap.element, f.snap.element) === 'neutral');
        if (neutral.length) return rng.weighted(neutral, aggro);
        return rng.weighted(foes, aggro);
      }
      case 'rush':
      default:
        return rng.weighted(foes, aggro);
    }
  };

  const strike = (actor: Unit, target: Unit, power: number, followup: boolean) => {
    events.push({ t: 'attack', unit: actor.id, target: target.id, followup });
    if (target.snap.element === 'wind' && rng.chance(FX.windEvade)) {
      events.push({ t: 'evade', unit: target.id, source: actor.id });
      return;
    }
    const aff = affinity(actor.snap.element, target.snap.element);
    let dmg = actor.snap.stats.atk * DMG_K * (100 / (100 + target.snap.stats.def));
    dmg *= affinityMul(aff) * power * rng.range(0.92, 1.08);
    if (actor.snap.tactic === 'rush') dmg *= RUSH_BONUS;
    let execute = false;
    if (actor.snap.element === 'dark') {
      const bonus = 1 + FX.darkExecute * (1 - target.hp / target.maxHp);
      execute = bonus >= 1.15;
      dmg *= bonus;
    }
    const rawForSplash = dmg;
    const targetSlot = target.slot;
    applyDamage(target, dmg, followup ? 'followup' : 'attack', actor, aff, execute);

    if (target.alive && actor.snap.element === 'poison' && target.poison < FX.poisonMax) {
      target.poison += 1;
      events.push({ t: 'poison', unit: target.id, source: actor.id, stacks: target.poison });
    }
    if (target.alive && actor.snap.element === 'ice' && !target.chilled) {
      target.chilled = true;
      events.push({ t: 'chill', unit: target.id, source: actor.id, on: true });
    }
    if (actor.snap.element === 'fire') {
      const neighbors = onField(target.side).filter(
        (u) => u !== target && Math.abs(u.slot - targetSlot) === 1,
      );
      for (const n of neighbors) {
        applyDamage(n, rawForSplash * FX.fireSplash, 'splash', actor, 'neutral', false);
      }
    }
  };

  const fillSlots = () => {
    pendingSlots.sort((a, b) => (a.side === b.side ? a.slot - b.slot : a.side < b.side ? -1 : 1));
    for (const p of pendingSlots) {
      const next = reserves[p.side].shift();
      if (!next) continue;
      next.slot = p.slot;
      next.gauge = 0;
      events.push({ t: 'enter', unit: next.id, side: next.side, slot: p.slot, initial: false });
    }
    pendingSlots.length = 0;
  };

  const sizeTotal = units.length;
  const actionLimit = ACTIONS_PER_UNIT * sizeTotal;
  let actions = 0;

  const score = (side: Side) => {
    const team = units.filter((u) => u.side === side);
    if (team.length === 0) return 0;
    const sum = team.filter((u) => u.alive).reduce((s, u) => s + u.hp / u.maxHp, 0);
    return sum / team.length;
  };

  const finish = (winner: Side | 'draw', reason: 'wipe' | 'timeout'): BattleResult => {
    events.push({
      t: 'end', winner, reason,
      scoreA: Math.round(score('A') * 1000) / 1000,
      scoreB: Math.round(score('B') * 1000) / 1000,
    });
    return { events, winner, reason };
  };

  // 片方が最初から空のときの保険
  if (!hasAny('A') || !hasAny('B')) {
    return finish(hasAny('A') ? 'A' : hasAny('B') ? 'B' : 'draw', 'wipe');
  }

  for (;;) {
    // 次に行動するユニットを決める
    const field = onField();
    const effSpd = (u: Unit) => u.snap.stats.spd * (u.chilled ? FX.iceSlow : 1);
    let actor = field[0];
    let best = Infinity;
    for (const u of field) {
      const t = (GAUGE_FULL - u.gauge) / effSpd(u);
      if (t < best - 1e-9) {
        best = t;
        actor = u;
      }
    }
    for (const u of field) u.gauge = Math.min(GAUGE_FULL, u.gauge + effSpd(u) * best);
    actor.gauge = GAUGE_FULL;
    const gauges: Record<UnitId, number> = {};
    for (const u of field) gauges[u.id] = Math.round((u.gauge / GAUGE_FULL) * 1000) / 1000;
    events.push({ t: 'turn', unit: actor.id, gauges });
    actor.gauge = 0;

    if (actor.chilled) {
      actor.chilled = false;
      events.push({ t: 'chill', unit: actor.id, source: actor.id, on: false });
    }
    if (actor.snap.element === 'grass') heal(actor, actor.maxHp * FX.grassRegen, actor, 'regen');

    const target = chooseTarget(actor);
    strike(actor, target, 1, false);
    if (actor.snap.element === 'thunder' && target.alive && rng.chance(FX.thunderChance)) {
      strike(actor, target, FX.thunderPower, true);
    }

    if (actor.snap.element === 'water' && actor.alive) {
      const allies = onField(actor.side).filter((u) => u.hp < u.maxHp);
      if (allies.length) {
        const min = Math.min(...allies.map((u) => u.hp / u.maxHp));
        const t = allies.find((u) => u.hp / u.maxHp <= min + 1e-9)!;
        heal(t, t.maxHp * FX.waterHeal, actor, 'rain');
      }
    }

    if (actor.alive && actor.poison > 0) {
      applyDamage(actor, actor.maxHp * FX.poisonPerStack * actor.poison, 'poison', null, 'neutral', false);
    }

    fillSlots();
    actions++;

    const aAlive = hasAny('A');
    const bAlive = hasAny('B');
    if (!aAlive || !bAlive) {
      return finish(aAlive ? 'A' : bAlive ? 'B' : 'draw', 'wipe');
    }
    if (actions >= actionLimit) {
      const sa = score('A');
      const sb = score('B');
      return finish(Math.abs(sa - sb) < 1e-6 ? 'draw' : sa > sb ? 'A' : 'B', 'timeout');
    }
  }
}
