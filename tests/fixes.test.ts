import { describe, expect, it } from 'vitest';
import { applyEvent, initialView, slotOccupant, ViewState } from '../src/core/battle';
import { simulate } from '../src/core/engine';
import { randomTeam } from '../src/core/random';
import { Rng } from '../src/core/rng';
import type { BattleEvent, Card, Side } from '../src/core/types';
import { randomUnit, team } from './helpers';

/** 各位置に「表示されるカード」が常に最新の1枚だけであることを確かめる */
function checkSlots(v: ViewState) {
  for (const side of ['A', 'B'] as Side[]) {
    for (const slot of [0, 1, 2]) {
      const n = v.order.filter((id) => v.units[id].side === side && v.units[id].slot === slot && v.units[id].entered).length;
      expect(n).toBeLessThanOrEqual(1);
    }
  }
}

describe('蘇生したカードの表示', () => {
  it('蘇生→待機から再登場→再び撃破されたとき、その位置には蘇生したカードが表示される', () => {
    let found = 0;
    const rng = new Rng(99);
    for (let n = 0; n < 3000 && found < 20; n++) {
      // 蘇生持ちの多い 5〜6 人チーム
      const size = 5 + rng.int(2);
      const ms = Array.from({ length: size }, (_, i) => ({ ...randomUnit(rng, i), skill: i < 2 ? 'revive' as const : randomUnit(rng, i).skill }));
      const a = team('A', ms, 0);
      const b = team('B', Array.from({ length: size }, (_, i) => randomUnit(rng, i + 10)), 0);
      const { events } = simulate(a, b, rng.int(1e9));
      let v = initialView(a, b);
      const revived = new Set<string>();
      const reentered = new Set<string>();
      for (const e of events as BattleEvent[]) {
        v = applyEvent(v, e);
        checkSlots(v);
        if (e.t === 'revive' && e.slot < 0) revived.add(e.unit);
        if (e.t === 'enter' && !e.initial && revived.has(e.unit)) reentered.add(e.unit);
        if (e.t === 'ko' && reentered.has(e.unit)) {
          const u = v.units[e.unit];
          const shown = slotOccupant(v, u.side, u.slot);
          expect(shown?.id).toBe(e.unit);
          found++;
        }
      }
    }
    expect(found).toBeGreaterThan(0);
  });
});

describe('ランダム編成', () => {
  const card = (i: number): Card => ({
    id: `c${i}`, name: `c${i}`, element: 'fire', style: 'balance', tactic: 'rush', skill: 'cheer', leaderSkill: 'king',
    description: '', image: null, createdAt: 0, updatedAt: 0,
  });
  it('カードが「合計人数＋2」枚以上なら、相手チームのカードと重複しない', () => {
    const cards = Array.from({ length: 10 }, (_, i) => card(i)); // 4対4 → 8+2 = 10
    const mine = ['c0', 'c1', 'c2', 'c3'];
    for (let s = 0; s < 200; s++) {
      const t = randomTeam(cards, 4, mine);
      const ids = [...t.front, ...t.reserve];
      expect(ids.some((id) => id && mine.includes(id))).toBe(false);
      expect(new Set(ids).size).toBe(4);
    }
  });
  it('枚数が足りなければ重複を許す（チームは組める）', () => {
    const cards = Array.from({ length: 9 }, (_, i) => card(i));
    const t = randomTeam(cards, 4, ['c0', 'c1', 'c2', 'c3']);
    expect([...t.front, ...t.reserve].filter(Boolean).length).toBe(4);
  });
  it('リーダーは待機のカードからも選ばれる', () => {
    const cards = Array.from({ length: 14 }, (_, i) => card(i));
    let inReserve = 0;
    for (let s = 0; s < 300; s++) {
      const t = randomTeam(cards, 6);
      if (t.leader && t.reserve.includes(t.leader)) inReserve++;
    }
    // 6人中3人が待機なので、おおよそ半分
    expect(inReserve).toBeGreaterThan(100);
    expect(inReserve).toBeLessThan(200);
  });
});
