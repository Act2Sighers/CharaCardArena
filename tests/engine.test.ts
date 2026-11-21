import { describe, expect, it } from 'vitest';
import { applyEvent, initialView, logLines } from '../src/core/battle';
import { simulate } from '../src/core/engine';
import { Rng } from '../src/core/rng';
import { randomUnit, team, unit } from './helpers';

describe('engine', () => {
  it('同じシードなら同じ結果になる', () => {
    const a = team('A', [unit('a1', 'fire'), unit('a2', 'water'), unit('a3', 'dark')]);
    const b = team('B', [unit('b1', 'ice'), unit('b2', 'grass'), unit('b3', 'light')]);
    const r1 = simulate(a, b, 42);
    const r2 = simulate(a, b, 42);
    expect(r1).toEqual(r2);
    expect(r1.events.at(-1)?.t).toBe('end');
  });

  it('ランダムなチームで多数回戦っても破綻しない', () => {
    const rng = new Rng(7);
    for (let n = 0; n < 1500; n++) {
      const size = 1 + rng.int(6);
      const a = team('A', Array.from({ length: size }, (_, i) => randomUnit(rng, i)), rng.int(size));
      const b = team('B', Array.from({ length: size }, (_, i) => randomUnit(rng, i + 10)), rng.int(size));
      const r = simulate(a, b, rng.int(1e9));
      // 再生用の状態に全イベントを適用して整合性を確認
      let v = initialView(a, b);
      for (const e of r.events) v = applyEvent(v, e);
      for (const u of Object.values(v.units)) {
        expect(u.hp).toBeGreaterThanOrEqual(0);
        expect(u.hp).toBeLessThanOrEqual(u.maxHp);
        if (!u.alive) expect(u.hp).toBe(0);
      }
      // 前線は常に最大 3 体、同じ枠に 2 体いない
      const field = Object.values(v.units).filter((u) => u.alive && u.entered && u.slot >= 0);
      expect(new Set(field.map((u) => `${u.side}${u.slot}`)).size).toBe(field.length);
      if (r.reason === 'wipe' && r.winner !== 'draw') {
        const loser = r.winner === 'A' ? 'B' : 'A';
        expect(Object.values(v.units).some((u) => u.side === loser && u.alive)).toBe(false);
      }
      expect(logLines(r.events, a, b).length).toBeGreaterThan(0);
    }
  });

  it('待機は倒れたカードの位置に順番どおり入る', () => {
    const a = team('A', [unit('a1', 'fire', 'power'), unit('a2', 'fire', 'power'), unit('a3', 'fire', 'power'), unit('a4', 'fire', 'power')]);
    const b = team('B', [unit('b1', 'grass', 'swift'), unit('b2', 'grass', 'swift'), unit('b3', 'grass', 'swift'), unit('b4', 'grass', 'swift')]);
    const r = simulate(a, b, 3);
    const enters = r.events.filter((e) => e.t === 'enter' && !e.initial);
    expect(enters.length).toBeGreaterThan(0);
    for (const e of enters) {
      if (e.t !== 'enter') continue;
      const idx = r.events.indexOf(e);
      const ko = r.events.slice(0, idx).reverse().find((x) => x.t === 'ko' && x.unit.startsWith(e.side));
      expect(ko).toBeTruthy();
    }
  });
});

describe('skills', () => {
  const run = (a: ReturnType<typeof team>, b: ReturnType<typeof team>, n = 60) => {
    const all = [];
    for (let s = 0; s < n; s++) all.push(...simulate(a, b, s).events);
    return all;
  };
  it('アクティブスキルが発動し、条件を満たさなければ不発になる', () => {
    // 回復役しかいない側は、序盤は全員満タンなので不発が起こる
    const a = team('A', [unit('h', 'water', 'balance', 'rush', 'heal_hand'), unit('s', 'fire', 'power', 'rush', 'sweep'), unit('r', 'grass', 'tough', 'rush', 'revive')], 0);
    const b = team('B', [unit('x', 'earth', 'guard', 'rush', 'hold'), unit('y', 'ice', 'swift', 'rush', 'mimic'), unit('z', 'fire', 'power', 'rush', 'contrarian')], 1);
    const ev = run(a, b);
    const used = new Set<string>(ev.filter((e) => e.t === 'skill').map((e) => (e.t === 'skill' ? e.skill : '')));
    for (const s of ['heal_hand', 'sweep', 'hold', 'mimic', 'contrarian', 'revive']) expect(used.has(s)).toBe(true);
    expect(ev.some((e) => e.t === 'misfire')).toBe(true);
    expect(ev.some((e) => e.t === 'revive')).toBe(true);
    expect(ev.some((e) => e.t === 'leader' && e.on)).toBe(true);
  });
  it('パッシブスキル（かばう・応報・援護射撃）が発動する', () => {
    const a = team('A', [unit('c', 'earth', 'guard', 'rush', 'cover'), unit('m', 'fire', 'balance', 'rush', 'retaliate'), unit('p', 'wind', 'swift', 'rush', 'support_fire')]);
    const b = team('B', [unit('x', 'water', 'power'), unit('y', 'thunder', 'power'), unit('z', 'poison', 'power')]);
    const ev = run(a, b);
    expect(ev.some((e) => e.t === 'cover')).toBe(true);
    expect(ev.some((e) => e.t === 'attack' && e.tag === 'counter')).toBe(true);
    expect(ev.some((e) => e.t === 'attack' && e.tag === 'assist')).toBe(true);
  });
});
