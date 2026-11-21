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
    for (let n = 0; n < 400; n++) {
      const size = 1 + rng.int(6);
      const a = team('A', Array.from({ length: size }, (_, i) => randomUnit(rng, i)));
      const b = team('B', Array.from({ length: size }, (_, i) => randomUnit(rng, i + 10)));
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
