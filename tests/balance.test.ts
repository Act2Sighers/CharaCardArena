import { it } from 'vitest';
import { affinity, ELEMENT_ORDER, ELEMENTS } from '../src/core/elements';
import { simulate } from '../src/core/engine';
import { Rng } from '../src/core/rng';
import { STYLE_ORDER, STYLES, TACTIC_ORDER, TACTICS } from '../src/core/styles';
import { randomUnit, team, unit } from './helpers';
import { LEADER_SKILL_ORDER, LEADER_SKILLS, SKILL_ORDER, SKILLS } from '../src/core/skills';
import type { UnitSnapshot } from '../src/core/types';

// 大量のランダム対戦で、属性・スタイル・戦法ごとの勝率を表示する（調整用）
it('balance report', () => {
  const rng = new Rng(12345);
  const stat = new Map<string, { w: number; n: number }>();
  const add = (k: string, win: number) => {
    const s = stat.get(k) ?? { w: 0, n: 0 };
    s.w += win; s.n += 1; stat.set(k, s);
  };
  let timeouts = 0; let total = 0; let actions = 0;
  const sizeLen: Record<number, number[]> = {};
  const N = Number((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.BALANCE_N ?? 6000);
  for (let n = 0; n < N; n++) {
    const size = [3, 3, 4, 5, 6][rng.int(5)];
    const am = Array.from({ length: size }, (_, i) => randomUnit(rng, i));
    const bm = Array.from({ length: size }, (_, i) => randomUnit(rng, i + 10));
    const la = rng.int(Math.min(3, size));
    const lb = rng.int(Math.min(3, size));
    const r = simulate(team('A', am, la), team('B', bm, lb), rng.int(1e9));
    for (const e of r.events) {
      if (e.t === 'skill') add(`U:${e.via ?? e.skill}`, 1);
      if (e.t === 'misfire') add(`U:${e.skill}`, 0);
    }
    total++;
    if (r.reason === 'timeout') timeouts++;
    const turns = r.events.filter((e) => e.t === 'turn').length;
    actions += turns;
    (sizeLen[size] ??= []).push(turns);
    const score = (side: 'A' | 'B') => (r.winner === 'draw' ? 0.5 : r.winner === side ? 1 : 0);
    const reg = (ms: UnitSnapshot[], s: number, li: number) => {
      for (const m of ms) {
        add(`E:${m.element}`, s); add(`S:${m.style}`, s); add(`T:${m.tactic}`, s); add(`K:${m.skill}`, s);
      }
      add(`L:${ms[li].leaderSkill}`, s);
    };
    reg(am, score('A'), la); reg(bm, score('B'), lb);
  }
  const pct = (k: string) => { const s = stat.get(k)!; return ((s.w / s.n) * 100).toFixed(1).padStart(5); };
  const out: string[] = [];
  out.push(`battles=${total} timeouts=${timeouts} avgTurns=${(actions / total).toFixed(1)}`);
  for (const [k, v] of Object.entries(sizeLen)) out.push(`  size ${k}: avg turns ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)}`);
  out.push('-- element --');
  for (const e of ELEMENT_ORDER) out.push(`${ELEMENTS[e].name} ${pct(`E:${e}`)}`);
  out.push('-- style --');
  for (const s of STYLE_ORDER) out.push(`${STYLES[s].name} ${pct(`S:${s}`)}`);
  out.push('-- tactic --');
  for (const t of TACTIC_ORDER) out.push(`${TACTICS[t].name} ${pct(`T:${t}`)}`);
  out.push('-- skill (win% / 発動率) --');
  for (const k of SKILL_ORDER) {
    const u = stat.get(`U:${k}`);
    out.push(`${SKILLS[k].name.padEnd(6, '　')} ${pct(`K:${k}`)}${u ? `   発動${((u.w / u.n) * 100).toFixed(0)}%` : ''}`);
  }
  out.push('-- leader --');
  for (const k of LEADER_SKILL_ORDER) out.push(`${LEADER_SKILLS[k].name.padEnd(6, '　')} ${pct(`L:${k}`)}`);
  console.log(out.join('\n'));
}, 120000);

// 単一属性チーム同士の勝率表（相性が中立の組み合わせの平均が 50% 付近か確認する）
it('element matrix', () => {
  const out: string[] = ['    ' + ELEMENT_ORDER.map(e => ELEMENTS[e].name.padStart(4)).join('')];
  const neutralAvg: Record<string, number[]> = {};
  for (const ea of ELEMENT_ORDER) {
    let row = ELEMENTS[ea].name + '  ';
    for (const eb of ELEMENT_ORDER) {
      let w = 0; const N = 200;
      for (let s = 0; s < N; s++) {
        const a = team('A', [unit('a1', ea), unit('a2', ea), unit('a3', ea)]);
        const b = team('B', [unit('b1', eb), unit('b2', eb), unit('b3', eb)]);
        const r = simulate(a, b, s * 7919 + 1);
        w += r.winner === 'A' ? 1 : r.winner === 'draw' ? 0.5 : 0;
      }
      const p = Math.round(w / N * 100);
      if (ea !== eb && affinity(ea, eb) === 'neutral') (neutralAvg[ea] ??= []).push(p);
      row += String(p).padStart(5);
    }
    out.push(row);
  }
  out.push('neutral avg: ' + ELEMENT_ORDER.map(e => ELEMENTS[e].name + Math.round(neutralAvg[e].reduce((a, b) => a + b, 0) / neutralAvg[e].length)).join(' '));
  console.log(out.join('\n'));
}, 60000);
