import { describe, expect, it } from 'vitest';
import { simulate } from '../src/core/engine';
import { Rng } from '../src/core/rng';
import type { BattleEvent, UnitSnapshot } from '../src/core/types';
import { CardVoice, TIMING_ORDER, TimingId, VoiceFreq } from '../src/core/voice';
import { randomUnit, team } from './helpers';

const FREQS: VoiceFreq[] = ['low', 'mid', 'high'];

/** タイミングの一部にだけ台詞を持たせる */
function randomVoice(rng: Rng, owner: string): CardVoice | undefined {
  if (rng.chance(0.2)) return undefined;
  const lines: CardVoice['lines'] = {};
  for (const t of TIMING_ORDER) {
    if (rng.chance(0.5)) continue;
    const n = 1 + rng.int(3);
    lines[t] = Array.from({ length: n }, (_, i) => `${owner}:${t}:${i}「そのまま」`);
  }
  return { freq: rng.pick(FREQS), lines };
}

function withVoices(rng: Rng, n: number, offset: number): UnitSnapshot[] {
  return Array.from({ length: n }, (_, i) => {
    const u = randomUnit(rng, i + offset);
    return { ...u, voice: randomVoice(rng, u.name) };
  });
}

describe('台詞', () => {
  it('喋るのは台詞を登録したカードだけで、内容は登録どおり。1つの機会に1人まで', () => {
    const rng = new Rng(2024);
    let speeches = 0;
    for (let n = 0; n < 600; n++) {
      const size = 1 + rng.int(6);
      const am = withVoices(rng, size, 0);
      const bm = withVoices(rng, size, 10);
      const a = team('A', am, rng.int(size));
      const b = team('B', bm, rng.int(size));
      const { events } = simulate(a, b, rng.int(1e9));
      const byId = new Map<string, UnitSnapshot>();
      [...am, ...bm].forEach((u, i) => byId.set(i < size ? `A${i}` : `B${i - size}`, u));
      // ID は前線→待機の順なので、team() の並びと一致する
      events.forEach((e, i) => {
        if (e.t !== 'speak') return;
        speeches++;
        const u = byId.get(e.unit)!;
        expect(u.voice?.lines[e.timing]).toContain(e.text);
        // 直前のイベントも発話なら、同じ瞬間に2人が喋り始めたことになる
        // （勝利時の台詞だけは戦闘終了という別の瞬間なので、直前の台詞のあとに続いてよい）
        if (e.timing !== 'victory') expect(events[i - 1]?.t).not.toBe('speak');
      });
    }
    expect(speeches).toBeGreaterThan(1000);
  });

  it('台詞の有無で戦闘の結果は変わらない', () => {
    const rng = new Rng(77);
    for (let n = 0; n < 200; n++) {
      const size = 3 + rng.int(4);
      const am = withVoices(rng, size, 0);
      const bm = withVoices(rng, size, 10);
      const seed = rng.int(1e9);
      const strip = (ms: UnitSnapshot[]) => ms.map(({ voice: _v, ...rest }) => rest);
      const r1 = simulate(team('A', am, 0), team('B', bm, 1), seed);
      const r2 = simulate(team('A', strip(am), 0), team('B', strip(bm), 1), seed);
      const noSpeak = (ev: BattleEvent[]) => ev.filter((e) => e.t !== 'speak');
      expect(noSpeak(r1.events)).toEqual(r2.events);
    }
  });

  it('喋る頻度が設定どおりになる（取り合いの無い通常攻撃時）', () => {
    for (const freq of FREQS) {
      const rng = new Rng(5);
      let attacks = 0;
      let spoken = 0;
      for (let n = 0; n < 300; n++) {
        const me = { ...randomUnit(rng, 0), skill: 'iron_will' as const, voice: { freq, lines: { attack: ['いくよ'] } } };
        const others = [randomUnit(rng, 1), randomUnit(rng, 2)].map((u) => ({ ...u, skill: 'iron_will' as const }));
        const foes = [randomUnit(rng, 10), randomUnit(rng, 11), randomUnit(rng, 12)];
        const { events } = simulate(team('A', [me, ...others], 1), team('B', foes, 0), rng.int(1e9));
        for (const e of events) {
          if (e.t === 'attack' && e.unit === 'A0' && (e.tag === 'normal' || e.tag === undefined)) attacks++;
          if (e.t === 'speak' && e.unit === 'A0') spoken++;
        }
      }
      const expected = { low: 0.25, mid: 0.5, high: 0.85 }[freq];
      expect(Math.abs(spoken / attacks - expected)).toBeLessThan(0.04);
    }
  });

  it('戦闘開始時と勝利時は、台詞があれば必ず1人が喋る', () => {
    const rng = new Rng(9);
    for (let n = 0; n < 200; n++) {
      const v = (t: TimingId[]): CardVoice => ({ freq: 'low', lines: Object.fromEntries(t.map((x) => [x, ['！']])) });
      const am = [0, 1, 2].map((i) => ({ ...randomUnit(rng, i), voice: v(['start', 'victory']) }));
      const bm = [0, 1, 2].map((i) => ({ ...randomUnit(rng, i + 10), voice: v(['start', 'victory']) }));
      const { events, winner } = simulate(team('A', am, 0), team('B', bm, 0), rng.int(1e9));
      expect(events.filter((e) => e.t === 'speak' && e.timing === 'start').length).toBe(1);
      if (winner !== 'draw') {
        const vic = events.filter((e) => e.t === 'speak' && e.timing === 'victory');
        expect(vic.length).toBe(1);
        expect(vic[0].t === 'speak' && vic[0].unit.startsWith(winner)).toBe(true);
      }
    }
  });
});
