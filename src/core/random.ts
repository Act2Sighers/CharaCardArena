import type { Card, Team } from './types';

function shuffle<T>(arr: T[], random: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 手持ちのカードからランダムにチームを作る。
 * カードが「対戦に必要な合計人数＋2」枚以上あれば、相手側（A）のカードとは重複させない。
 */
export function randomTeam(cards: Card[], size: number, exclude: string[] = [], random: () => number = Math.random): Team {
  const pool = cards.length >= size * 2 + 2 ? cards.filter((c) => !exclude.includes(c.id)) : cards;
  const picked = shuffle(pool, random).slice(0, size).map((c) => c.id);
  const now = Date.now();
  return {
    id: 'random',
    name: 'ランダム編成',
    front: [0, 1, 2].map((i) => picked[i] ?? null),
    reserve: picked.slice(3),
    // リーダーは待機を含むメンバー全員から選ぶ
    leader: picked.length ? picked[Math.floor(random() * picked.length)] : null,
    createdAt: now,
    updatedAt: now,
  };
}
