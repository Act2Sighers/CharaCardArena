import { affinity, AFF_ADV, AFF_DIS, ELEMENT_FX_KEY, FX, FX_MASTERY, FxKey } from './elements';
import { Rng } from './rng';
import { isActive, LK, SK, SKILLS, SkillId } from './skills';
import { STYLES } from './styles';
import type {
  Affinity, AttackTag, BattleEvent, BattleResult, DamageKind, ElementId, GaugeReason, HealKind,
  Side, TeamSnapshot, UnitId, UnitSnapshot,
} from './types';

export const ENGINE_VERSION = 2;

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
  /** 凍え中の速さ倍率（凍えさせた側の属性効果の強さ） */
  chillPower: number;
  endureUsed: boolean;
  // --- スキル関連 ---
  skill: SkillId | null;
  charge: number;
  skillSpent: boolean;
  actions: number;
  firstBonus: number;
  focusTarget: UnitId | null;
  focusStacks: number;
  mimicEl: ElementId | null;
  mimicTurns: number;
  invertTurns: number;
  leader: boolean;
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
  const leaders: Record<Side, Unit | null> = { A: null, B: null };

  for (const [side, team] of [['A', teamA], ['B', teamB]] as const) {
    for (const x of teamUnits(side, team)) {
      const isLeader = !!x.unit.leader && !leaders[side];
      const warlord = isLeader && x.unit.leaderSkill === 'warlord';
      const maxHp = Math.round(x.unit.stats.hp * (warlord ? 1 + LK.warlord : 1));
      const u: Unit = {
        id: x.id, side, snap: x.unit, maxHp, hp: maxHp,
        gauge: 0, slot: x.slot, alive: true, poison: 0, chilled: false, chillPower: 1, endureUsed: false,
        skill: x.unit.skill ?? null, charge: 0, skillSpent: false, actions: 0, firstBonus: 0,
        focusTarget: null, focusStacks: 0, mimicEl: null, mimicTurns: 0, invertTurns: 0, leader: isLeader,
      };
      units.push(u);
      if (isLeader) leaders[side] = u;
      if (x.slot < 0) reserves[side].push(u);
    }
  }

  const other = (s: Side): Side => (s === 'A' ? 'B' : 'A');
  const onField = (side?: Side) => units.filter((u) => u.alive && u.slot >= 0 && (!side || u.side === side));
  const hasAny = (side: Side) => units.some((u) => u.side === side && u.alive);
  const aliveCount = (side: Side) => units.filter((u) => u.side === side && u.alive).length;
  const has = (u: Unit, s: SkillId) => u.skill === s;
  const neighbors = (u: Unit) => onField(u.side).filter((x) => x !== u && Math.abs(x.slot - u.slot) === 1);

  // ===== リーダースキル =====
  /** そのチームのリーダースキル（リーダーが前線で生きている間だけ） */
  const leaderSkill = (side: Side) => {
    const l = leaders[side];
    return l && l.alive && l.slot >= 0 ? l.snap.leaderSkill ?? null : null;
  };
  const teamOf = (side: Side) => units.filter((u) => u.side === side);
  const rainbowBonus = (side: Side) => {
    const team = teamOf(side);
    const kinds = new Set(team.map((u) => u.snap.element)).size;
    return LK.rainbowMax * (kinds / Math.max(1, team.length));
  };
  const clanBoosted = (u: Unit) =>
    leaderSkill(u.side) === 'clan' && teamOf(u.side).filter((x) => x.snap.element === u.snap.element).length >= 2;

  // ===== 属性効果 =====
  const hasEl = (u: Unit, el: ElementId) => u.snap.element === el || (u.mimicEl === el && u.mimicTurns > 0);
  /** 属性効果の数値（自分の属性で、本領発揮または一族の誇りがあれば強化値） */
  const fxv = (u: Unit, el: ElementId): number => {
    const k: FxKey = ELEMENT_FX_KEY[el];
    const boosted = u.snap.element === el && (has(u, 'mastery') || clanBoosted(u));
    return boosted ? FX_MASTERY[k] : FX[k];
  };

  // ===== 能力値 =====
  const atkOf = (u: Unit): number => {
    let m = 1;
    const ls = leaderSkill(u.side);
    if (ls === 'king') m *= 1 + LK.king;
    if (ls === 'back') {
      const l = leaders[u.side]!;
      if (l.hp / l.maxHp <= 0.5) m *= 1 + LK.backAtk;
    }
    if (ls === 'comeback') m *= 1 + (aliveCount(u.side) < aliveCount(other(u.side)) ? LK.comeback : LK.comebackBase);
    if (ls === 'rainbow') m *= 1 + rainbowBonus(u.side);
    if (ls === 'warlord' && u.leader) m *= 1 + LK.warlord;
    if (ls === 'clan' && clanBoosted(u)) m *= 1 + LK.clanAtk;
    if (has(u, 'adversity')) m *= 1 + SK.adversity * (1 - u.hp / u.maxHp);
    if (has(u, 'last_stand')) m *= 1 + (onField(u.side).length === 1 ? SK.lastStand : SK.lastStandBase);
    if (has(u, 'late_bloomer')) m *= 1 + Math.min(SK.lateBloomerMax, SK.lateBloomerStep * u.actions);
    return u.snap.stats.atk * m;
  };
  const defOf = (u: Unit): number => {
    let m = 1;
    const ls = leaderSkill(u.side);
    if (ls === 'rainbow') m *= 1 + rainbowBonus(u.side);
    if (ls === 'warlord' && u.leader) m *= 1 + LK.warlord;
    if (has(u, 'provoke')) m *= 1 + SK.provokeDef;
    if (u.slot >= 0) for (const n of neighbors(u)) if (has(n, 'keystone')) m *= 1 + SK.keystone;
    return u.snap.stats.def * m;
  };
  const spdOf = (u: Unit): number => {
    let m = u.chilled ? u.chillPower : 1;
    const ls = leaderSkill(u.side);
    if (ls === 'gale') m *= 1 + LK.galeSpd;
    if (ls === 'comeback' && aliveCount(u.side) < aliveCount(other(u.side))) m *= 1 + LK.comeback;
    if (ls === 'warlord' && u.leader) m *= 1 + LK.warlord;
    if (has(u, 'last_stand') && onField(u.side).length === 1) m *= 1 + SK.lastStand;
    for (const e of onField(other(u.side))) if (has(e, 'intimidate')) m *= SK.intimidate;
    return u.snap.stats.spd * m;
  };
  const takenMul = (u: Unit): number => {
    let m = 1;
    if (has(u, 'iron_will')) m *= 1 - (u.hp / u.maxHp <= 0.5 ? SK.ironWill : SK.ironWillBase);
    if (leaderSkill(u.side) === 'fortress') m *= 1 - LK.fortress;
    return m;
  };

  // ===== イベント補助 =====
  const gaugeEv = (u: Unit, reason: GaugeReason) =>
    events.push({ t: 'gauge', unit: u.id, value: Math.round((u.gauge / GAUGE_FULL) * 1000) / 1000, reason });
  const addGauge = (u: Unit, frac: number, reason: GaugeReason) => {
    u.gauge = Math.min(GAUGE_FULL, u.gauge + frac * GAUGE_FULL);
    gaugeEv(u, reason);
  };

  const pendingSlots: { side: Side; slot: number }[] = [];
  const dead: Unit[] = [];

  const ko = (u: Unit) => {
    u.alive = false;
    events.push({ t: 'ko', unit: u.id });
    pendingSlots.push({ side: u.side, slot: u.slot });
    u.slot = -1;
    u.poison = 0;
    u.chilled = false;
    u.mimicTurns = 0;
    u.mimicEl = null;
    u.invertTurns = 0;
    dead.push(u);
    if (u.leader && u.snap.leaderSkill) {
      events.push({ t: 'leader', unit: u.id, skill: u.snap.leaderSkill, on: false });
      if (u.snap.leaderSkill === 'warlord') {
        for (const a of onField(u.side)) {
          a.gauge = 0;
          gaugeEv(a, 'warlord');
        }
      }
    }
  };

  /** ダメージを適用（地の上限・光の加護・撃破を処理）。実際に与えた量を返す */
  const applyDamage = (
    target: Unit, raw: number, kind: DamageKind, source: Unit | null, aff: Affinity, execute: boolean,
  ): number => {
    let dmg = Math.max(1, Math.round(raw));
    let capped = false;
    if (hasEl(target, 'earth') && kind !== 'poison' && kind !== 'cost') {
      const cap = Math.round(target.maxHp * fxv(target, 'earth'));
      if (dmg > cap) {
        dmg = cap;
        capped = true;
      }
    }
    let endured = false;
    if (kind === 'cost') {
      dmg = Math.min(dmg, target.hp - 1);
      target.hp -= dmg;
    } else if (dmg >= target.hp && hasEl(target, 'light') && !target.endureUsed) {
      // 加護：倒れずに、最大HPの一定割合まで持ち直す
      target.endureUsed = true;
      endured = true;
      target.hp = Math.max(1, Math.round(target.maxHp * fxv(target, 'light')));
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

  const heal = (target: Unit, amount: number, source: Unit, kind: HealKind) => {
    const a = Math.min(Math.round(amount), target.maxHp - target.hp);
    if (a <= 0) return;
    target.hp += a;
    events.push({ t: 'heal', unit: target.id, source: source.id, amount: a, hp: target.hp, kind });
  };

  // ===== 狙う相手 =====
  const chooseTarget = (actor: Unit): Unit => {
    const foes = onField(other(actor.side));
    const provokers = foes.filter((f) => has(f, 'provoke'));
    if (provokers.length && rng.chance(SK.provokeChance)) return rng.pick(provokers);
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
        const adv = foes.filter((f) => affOf(actor, f) === 'adv');
        if (adv.length) return rng.weighted(adv, aggro);
        const neutral = foes.filter((f) => affOf(actor, f) === 'neutral');
        if (neutral.length) return rng.weighted(neutral, aggro);
        return rng.weighted(foes, aggro);
      }
      case 'rush':
      default:
        return rng.weighted(foes, aggro);
    }
  };

  /** 天邪鬼による反転を含めた属性相性 */
  const affOf = (a: Unit, d: Unit): Affinity => {
    let r = affinity(a.snap.element, d.snap.element);
    const flips = (a.invertTurns > 0 ? 1 : 0) + (d.invertTurns > 0 ? 1 : 0);
    if (flips === 1) r = r === 'adv' ? 'dis' : r === 'dis' ? 'adv' : 'neutral';
    return r;
  };
  const affMulOf = (a: Unit, d: Unit, aff: Affinity): number => {
    if (aff === 'adv') {
      if (leaderSkill(d.side) === 'gambit') return 1;
      return has(d, 'overcome') ? SK.overcomeTake : AFF_ADV;
    }
    if (aff === 'dis') return has(a, 'overcome') ? SK.overcomeDeal : AFF_DIS;
    return 1;
  };

  // ===== 攻撃 =====
  const strike = (actor: Unit, target0: Unit, power: number, tag: AttackTag): Unit => {
    let target = target0;
    let covered = false;
    // かばう（単体攻撃のみ）
    if (tag !== 'sweep' && tag !== 'counter') {
      const guards = neighbors(target).filter((n) => has(n, 'cover'));
      if (guards.length && rng.chance(SK.cover)) {
        const g = rng.pick(guards);
        events.push({ t: 'cover', unit: g.id, target: target.id });
        target = g;
        covered = true;
      }
    }
    events.push({ t: 'attack', unit: actor.id, target: target.id, followup: tag === 'followup', tag });
    if (hasEl(target, 'wind') && rng.chance(fxv(target, 'wind'))) {
      events.push({ t: 'evade', unit: target.id, source: actor.id });
      return target;
    }
    const aff = affOf(actor, target);
    let dmg = atkOf(actor) * DMG_K * (100 / (100 + defOf(target)));
    dmg *= affMulOf(actor, target, aff) * power * rng.range(0.92, 1.08);
    if (actor.snap.tactic === 'rush') dmg *= RUSH_BONUS;
    if (tag === 'normal' || tag === 'skill' || tag === 'sweep') {
      if (actor.firstBonus > 0) {
        dmg *= 1 + actor.firstBonus;
        actor.firstBonus = 0;
      }
    }
    if (has(actor, 'focus') && (tag === 'normal' || tag === 'skill')) {
      if (actor.focusTarget === target.id) actor.focusStacks = Math.min(SK.focusMax, actor.focusStacks + 1);
      else actor.focusStacks = 0;
      actor.focusTarget = target.id;
      dmg *= 1 + SK.focusStep * actor.focusStacks;
    }
    let execute = false;
    if (hasEl(actor, 'dark')) {
      const bonus = 1 + fxv(actor, 'dark') * (1 - target.hp / target.maxHp);
      execute = bonus >= 1.15;
      dmg *= bonus;
    }
    dmg *= takenMul(target);
    if (covered) dmg *= 1 - SK.coverGuard;
    const rawForSplash = dmg;
    const targetSlot = target.slot;
    const kind: DamageKind = tag === 'normal' || tag === 'skill' ? 'attack' : tag;
    applyDamage(target, dmg, kind, actor, aff, execute);

    if (target.alive && hasEl(actor, 'poison') && target.poison < FX.poisonMax) {
      target.poison += 1;
      events.push({ t: 'poison', unit: target.id, source: actor.id, stacks: target.poison });
    }
    if (target.alive && hasEl(actor, 'ice') && !target.chilled) {
      target.chilled = true;
      target.chillPower = fxv(actor, 'ice');
      events.push({ t: 'chill', unit: target.id, source: actor.id, on: true });
    }
    if (hasEl(actor, 'fire') && tag !== 'sweep') {
      const ns = onField(target.side).filter((u) => u !== target && Math.abs(u.slot - targetSlot) === 1);
      for (const n of ns) applyDamage(n, rawForSplash * fxv(actor, 'fire'), 'splash', actor, 'neutral', false);
    }
    // 闘志：味方が攻撃を受けるたび
    for (const ally of onField(target.side)) {
      if (ally !== target && has(ally, 'fighting_spirit')) addGauge(ally, SK.fightingSpirit, 'spirit');
    }
    // 応報：反撃（反撃に対しては反撃しない）
    if (tag !== 'counter' && target.alive && has(target, 'retaliate') && actor.alive && actor.slot >= 0
      && rng.chance(SK.retaliateChance)) {
      strike(target, actor, SK.retaliatePower, 'counter');
    }
    return target;
  };

  /** 単体攻撃の後に続く追撃（雷の追撃・援護射撃） */
  const afterStrike = (actor: Unit, target: Unit, tag: AttackTag) => {
    if (actor.alive && target.alive && hasEl(actor, 'thunder') && rng.chance(fxv(actor, 'thunder'))) {
      strike(actor, target, FX.thunderPower, 'followup');
    }
    if (tag === 'normal' || tag === 'skill') {
      for (const n of actor.slot >= 0 ? neighbors(actor) : []) {
        if (target.alive && has(n, 'support_fire') && rng.chance(SK.supportChance)) {
          strike(n, target, SK.supportPower, 'assist');
        }
      }
    }
  };

  const normalAttack = (actor: Unit) => {
    const t = strike(actor, chooseTarget(actor), 1, 'normal');
    afterStrike(actor, t, 'normal');
  };

  // ===== アクティブスキル =====
  const lowAllies = (actor: Unit, below: number) => onField(actor.side).filter((u) => u.hp / u.maxHp < below);
  const advFoes = (actor: Unit) => onField(other(actor.side)).filter((f) => affOf(actor, f) === 'adv');
  const copyable = (actor: Unit) =>
    onField(actor.side).filter(
      (a) => a !== actor && a.skill && isActive(a.skill) && a.skill !== 'copycat' && a.skill !== 'revive'
        && canUse(actor, a.skill),
    );

  const canUse = (actor: Unit, s: SkillId): boolean => {
    switch (s) {
      case 'heal_hand': return lowAllies(actor, SK.healHandBelow).length > 0;
      case 'prayer': return lowAllies(actor, SK.prayerBelow).length > 0;
      case 'cheer': return onField(actor.side).some((u) => u !== actor);
      case 'revive': return dead.some((d) => d.side === actor.side && !d.alive);
      case 'reckless': return actor.hp > actor.maxHp * SK.recklessCost + 1;
      case 'sweep': return onField(other(actor.side)).length >= 2;
      case 'hold': return true;
      case 'mimic': return onField().some((u) => u !== actor && u.snap.element !== actor.snap.element);
      case 'contrarian':
        return onField(other(actor.side)).some((f) => affinity(f.snap.element, actor.snap.element) === 'adv');
      case 'copycat': return copyable(actor).length > 0;
      case 'weak_spot': return advFoes(actor).length > 0;
      default: return false;
    }
  };

  const execSkill = (actor: Unit, s: SkillId, via?: SkillId) => {
    const announce = (extra: Partial<{ target: UnitId; element: ElementId }> = {}) =>
      events.push({ t: 'skill', unit: actor.id, skill: s, ...(via ? { via } : {}), ...extra });
    switch (s) {
      case 'heal_hand': {
        const list = lowAllies(actor, SK.healHandBelow);
        const min = Math.min(...list.map((u) => u.hp / u.maxHp));
        const t = list.find((u) => u.hp / u.maxHp <= min + 1e-9)!;
        announce({ target: t.id });
        heal(t, t.maxHp * SK.healHand, actor, 'skill');
        break;
      }
      case 'prayer':
        announce();
        for (const u of onField(actor.side)) heal(u, u.maxHp * SK.prayer, actor, 'skill');
        break;
      case 'cheer': {
        announce();
        for (const u of onField(actor.side)) if (u !== actor) addGauge(u, SK.cheer, 'cheer');
        const t = strike(actor, chooseTarget(actor), 1, 'skill');
        afterStrike(actor, t, 'skill');
        break;
      }
      case 'revive': {
        const cands = dead.filter((d) => d.side === actor.side && !d.alive);
        const t = rng.pick(cands);
        announce({ target: t.id });
        t.alive = true;
        t.hp = Math.max(1, Math.round(t.maxHp * SK.revive));
        t.gauge = 0;
        t.firstBonus = 0;
        dead.splice(dead.indexOf(t), 1);
        // 待機がいなければ前線の空きへ、いれば待機の最後尾へ
        const used = new Set(onField(actor.side).map((u) => u.slot));
        const free = reserves[actor.side].length === 0 ? [0, 1, 2].find((sl) => !used.has(sl)) : undefined;
        if (free !== undefined) {
          t.slot = free;
        } else {
          t.slot = -1;
          reserves[actor.side].push(t);
        }
        events.push({ t: 'revive', unit: t.id, source: actor.id, side: t.side, slot: t.slot, hp: t.hp });
        if (t.slot >= 0) onEnter(t, false);
        actor.skillSpent = true;
        break;
      }
      case 'reckless': {
        announce();
        applyDamage(actor, actor.maxHp * SK.recklessCost, 'cost', actor, 'neutral', false);
        const t = strike(actor, chooseTarget(actor), SK.recklessPower, 'skill');
        afterStrike(actor, t, 'skill');
        break;
      }
      case 'sweep':
        announce();
        for (const f of onField(other(actor.side))) {
          if (!actor.alive) break;
          strike(actor, f, SK.sweepPower, 'sweep');
        }
        break;
      case 'hold': {
        const t0 = chooseTarget(actor);
        announce({ target: t0.id });
        const t = strike(actor, t0, 1, 'skill');
        if (t.alive) {
          t.gauge = 0;
          gaugeEv(t, 'hold');
        }
        afterStrike(actor, t, 'skill');
        break;
      }
      case 'mimic': {
        const src = rng.pick(onField().filter((u) => u !== actor && u.snap.element !== actor.snap.element));
        actor.mimicEl = src.snap.element;
        actor.mimicTurns = SK.mimicTurns;
        announce({ target: src.id, element: src.snap.element });
        events.push({ t: 'buff', unit: actor.id, buff: 'mimic', on: true, element: src.snap.element });
        const t = strike(actor, chooseTarget(actor), 1, 'skill');
        afterStrike(actor, t, 'skill');
        break;
      }
      case 'contrarian': {
        actor.invertTurns = SK.contrarianTurns;
        announce();
        events.push({ t: 'buff', unit: actor.id, buff: 'invert', on: true });
        const now = onField(other(actor.side)).filter((f) => affOf(actor, f) === 'adv');
        const t = strike(actor, now.length ? rng.pick(now) : chooseTarget(actor), 1, 'skill');
        afterStrike(actor, t, 'skill');
        break;
      }
      case 'copycat': {
        const src = rng.pick(copyable(actor));
        execSkill(actor, src.skill!, 'copycat');
        break;
      }
      case 'weak_spot': {
        const t0 = rng.pick(advFoes(actor));
        announce({ target: t0.id });
        const t = strike(actor, t0, SK.weakSpotPower, 'skill');
        afterStrike(actor, t, 'skill');
        break;
      }
      default:
        normalAttack(actor);
    }
  };

  const intervalOf = (u: Unit): number => {
    const base = u.skill ? SKILLS[u.skill].interval ?? 0 : 0;
    if (leaderSkill(u.side) === 'strategist') return Math.max(LK.strategistMin, base - 1);
    return base;
  };

  // ===== 登場 =====
  const onEnter = (u: Unit, initial: boolean) => {
    if (leaderSkill(u.side) === 'strategist' && u.skill && isActive(u.skill)) u.charge = Math.max(u.charge, intervalOf(u) - 1);
    if (leaderSkill(u.side) === 'relief') u.firstBonus = Math.max(u.firstBonus, LK.reliefBase);
    if (has(u, 'first_strike')) {
      u.firstBonus = Math.max(u.firstBonus, SK.firstStrikePower);
      addGauge(u, SK.firstStrikeGauge, 'first');
    }
    if (!initial && leaderSkill(u.side) === 'relief' && !u.leader) {
      u.firstBonus = Math.max(u.firstBonus, LK.reliefPower);
      addGauge(u, LK.reliefGauge, 'relief');
    }
    if (u.leader && u.snap.leaderSkill) {
      events.push({ t: 'leader', unit: u.id, skill: u.snap.leaderSkill, on: true });
      if (u.snap.leaderSkill === 'relief') for (const a of onField(u.side)) a.firstBonus = Math.max(a.firstBonus, LK.reliefBase);
      if (u.snap.leaderSkill === 'gale') for (const a of onField(u.side)) addGauge(a, LK.galeGauge, 'gale');
      if (u.snap.leaderSkill === 'strategist') {
        for (const a of onField(u.side)) if (a.skill && isActive(a.skill)) a.charge = Math.max(a.charge, intervalOf(a) - 1);
      }
    }
  };

  const fillSlots = () => {
    pendingSlots.sort((a, b) => (a.side === b.side ? a.slot - b.slot : a.side < b.side ? -1 : 1));
    const entered: Unit[] = [];
    for (const p of pendingSlots) {
      if (onField(p.side).some((u) => u.slot === p.slot)) continue;
      const next = reserves[p.side].shift();
      if (!next) continue;
      next.slot = p.slot;
      next.gauge = 0;
      events.push({ t: 'enter', unit: next.id, side: next.side, slot: p.slot, initial: false });
      entered.push(next);
    }
    pendingSlots.length = 0;
    for (const u of entered) onEnter(u, false);
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

  // 開始時の登場（ゲージに少しだけばらつきを持たせる）
  const starters = onField();
  for (const u of starters) {
    u.gauge = Math.floor(rng.range(0, 150));
    events.push({ t: 'enter', unit: u.id, side: u.side, slot: u.slot, initial: true });
  }
  for (const u of starters) onEnter(u, true);

  for (;;) {
    // 次に行動するユニットを決める
    const field = onField();
    let actor = field[0];
    let best = Infinity;
    const spds = new Map(field.map((u) => [u, spdOf(u)]));
    for (const u of field) {
      const t = (GAUGE_FULL - u.gauge) / spds.get(u)!;
      if (t < best - 1e-9) {
        best = t;
        actor = u;
      }
    }
    for (const u of field) u.gauge = Math.min(GAUGE_FULL, u.gauge + spds.get(u)! * best);
    actor.gauge = GAUGE_FULL;
    const gauges: Record<UnitId, number> = {};
    for (const u of field) gauges[u.id] = Math.round((u.gauge / GAUGE_FULL) * 1000) / 1000;

    const interval = intervalOf(actor);
    const usesCharge = !!actor.skill && isActive(actor.skill) && !actor.skillSpent;
    if (usesCharge) actor.charge = Math.min(interval, actor.charge + 1);
    events.push({
      t: 'turn', unit: actor.id, gauges,
      ...(usesCharge ? { charge: actor.charge, chargeMax: interval } : {}),
    });
    actor.gauge = 0;

    if (actor.chilled) {
      actor.chilled = false;
      events.push({ t: 'chill', unit: actor.id, source: actor.id, on: false });
    }
    if (hasEl(actor, 'grass')) heal(actor, actor.maxHp * fxv(actor, 'grass'), actor, 'regen');

    let misfired = false;
    if (usesCharge && actor.charge >= interval) {
      if (canUse(actor, actor.skill!)) {
        actor.charge = 0;
        execSkill(actor, actor.skill!);
      } else {
        // 不発：チャージは使い切り、通常攻撃のあと行動ゲージが少し進んだ状態から始まる
        actor.charge = 0;
        misfired = true;
        events.push({
          t: 'misfire', unit: actor.id, skill: actor.skill!,
          gauge: SK.misfireGauge * (leaderSkill(actor.side) === 'strategist' ? 2 : 1),
        });
        normalAttack(actor);
      }
    } else {
      normalAttack(actor);
    }

    if (actor.alive && hasEl(actor, 'water')) {
      const allies = onField(actor.side).filter((u) => u.hp < u.maxHp);
      if (allies.length) {
        const min = Math.min(...allies.map((u) => u.hp / u.maxHp));
        const t = allies.find((u) => u.hp / u.maxHp <= min + 1e-9)!;
        heal(t, t.maxHp * fxv(actor, 'water'), actor, 'rain');
      }
    }
    if (actor.alive && has(actor, 'natural_heal')) heal(actor, actor.maxHp * SK.naturalHeal, actor, 'nature');
    if (actor.alive && leaderSkill(actor.side) === 'mercy') heal(actor, actor.maxHp * LK.mercy, actor, 'mercy');

    if (actor.alive && actor.poison > 0) {
      applyDamage(actor, actor.maxHp * FX.poisonPerStack * actor.poison, 'poison', null, 'neutral', false);
    }

    if (actor.alive) {
      actor.actions++;
      if (actor.mimicTurns > 0 && --actor.mimicTurns === 0) {
        events.push({ t: 'buff', unit: actor.id, buff: 'mimic', on: false, element: actor.mimicEl ?? undefined });
        actor.mimicEl = null;
      }
      if (actor.invertTurns > 0 && --actor.invertTurns === 0) {
        events.push({ t: 'buff', unit: actor.id, buff: 'invert', on: false });
      }
      if (misfired) addGauge(actor, SK.misfireGauge * (leaderSkill(actor.side) === 'strategist' ? 2 : 1), 'misfire');
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
