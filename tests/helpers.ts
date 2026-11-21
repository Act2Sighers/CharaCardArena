import { ELEMENT_ORDER } from '../src/core/elements';
import { Rng } from '../src/core/rng';
import { computeStats, STYLE_ORDER, TACTIC_ORDER } from '../src/core/styles';
import type { ElementId, StyleId, TacticId, TeamSnapshot, UnitSnapshot } from '../src/core/types';

export function unit(name: string, element: ElementId, style: StyleId = 'balance', tactic: TacticId = 'rush'): UnitSnapshot {
  return { cardId: name, name, element, style, tactic, imageRef: null, stats: computeStats(style) };
}

export function randomUnit(rng: Rng, i: number): UnitSnapshot {
  return unit(`u${i}`, rng.pick(ELEMENT_ORDER), rng.pick(STYLE_ORDER), rng.pick(TACTIC_ORDER));
}

export function team(name: string, members: UnitSnapshot[]): TeamSnapshot {
  return {
    name,
    front: [0, 1, 2].map((i) => members[i] ?? null),
    reserve: members.slice(3),
  };
}
