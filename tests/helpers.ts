import { ELEMENT_ORDER } from '../src/core/elements';
import { Rng } from '../src/core/rng';
import { LEADER_SKILL_ORDER, LeaderSkillId, SKILL_ORDER, SkillId } from '../src/core/skills';
import { computeStats, STYLE_ORDER, TACTIC_ORDER } from '../src/core/styles';
import type { ElementId, StyleId, TacticId, TeamSnapshot, UnitSnapshot } from '../src/core/types';

export function unit(
  name: string, element: ElementId, style: StyleId = 'balance', tactic: TacticId = 'rush',
  skill?: SkillId, leaderSkill: LeaderSkillId = 'king',
): UnitSnapshot {
  return { cardId: name, name, element, style, tactic, imageRef: null, stats: computeStats(style), skill, leaderSkill };
}

export function randomUnit(rng: Rng, i: number, skills = true): UnitSnapshot {
  return unit(
    `u${i}`, rng.pick(ELEMENT_ORDER), rng.pick(STYLE_ORDER), rng.pick(TACTIC_ORDER),
    skills ? rng.pick(SKILL_ORDER) : undefined, rng.pick(LEADER_SKILL_ORDER),
  );
}

/** members の leaderIndex 番目をリーダーにしたチーム */
export function team(name: string, members: UnitSnapshot[], leaderIndex: number | null = null): TeamSnapshot {
  const ms = members.map((m, i) => ({ ...m, leader: leaderIndex === i }));
  return {
    name,
    front: [0, 1, 2].map((i) => ms[i] ?? null),
    reserve: ms.slice(3),
  };
}
