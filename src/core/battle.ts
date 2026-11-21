import { ELEMENTS } from './elements';
import { teamUnits } from './engine';
import { computeStats } from './styles';
import type {
  BattleEvent, Card, Side, Team, TeamSnapshot, UnitId, UnitSnapshot,
} from './types';

// ===== チーム → 戦闘用スナップショット =====

export function unitSnapshot(card: Card): UnitSnapshot {
  return {
    cardId: card.id,
    name: card.name,
    element: card.element,
    style: card.style,
    tactic: card.tactic,
    imageRef: card.image ? card.image.cropped : null,
    stats: computeStats(card.style),
  };
}

export function teamMemberIds(team: Team): string[] {
  return [...team.front.filter((x): x is string => !!x), ...team.reserve];
}

export function teamSnapshot(team: Team, cards: Map<string, Card>): TeamSnapshot {
  const get = (id: string | null) => (id && cards.get(id) ? unitSnapshot(cards.get(id)!) : null);
  return {
    name: team.name,
    front: [0, 1, 2].map((i) => get(team.front[i] ?? null)),
    reserve: team.reserve.map((id) => get(id)).filter((x): x is UnitSnapshot => !!x),
  };
}

/** 前線に空きがあるのに待機がいる場合、待機を前線に詰める */
export function normalizeTeam(team: Team): Team {
  const front = [0, 1, 2].map((i) => team.front[i] ?? null);
  const reserve = [...team.reserve];
  for (let i = 0; i < 3; i++) {
    if (!front[i] && reserve.length) front[i] = reserve.shift()!;
  }
  return { ...team, front, reserve };
}

// ===== 再生用の状態 =====

export interface UnitView {
  id: UnitId;
  side: Side;
  snap: UnitSnapshot;
  maxHp: number;
  hp: number;
  slot: number;
  /** 待機の何番目か（待機中のみ） */
  reserveIndex: number;
  alive: boolean;
  entered: boolean;
  poison: number;
  chilled: boolean;
  endureUsed: boolean;
  gauge: number;
}

export interface ViewState {
  units: Record<UnitId, UnitView>;
  order: UnitId[];
  actor: UnitId | null;
  ended: BattleEvent & { t: 'end' } | null;
}

export function initialView(teamA: TeamSnapshot, teamB: TeamSnapshot): ViewState {
  const units: Record<UnitId, UnitView> = {};
  const order: UnitId[] = [];
  for (const [side, team] of [['A', teamA], ['B', teamB]] as const) {
    let r = 0;
    for (const x of teamUnits(side, team)) {
      units[x.id] = {
        id: x.id, side, snap: x.unit, maxHp: x.unit.stats.hp, hp: x.unit.stats.hp,
        slot: -1, reserveIndex: x.slot < 0 ? r++ : -1, alive: true, entered: false,
        poison: 0, chilled: false, endureUsed: false, gauge: 0,
      };
      order.push(x.id);
    }
    // 開始前は前線メンバーもまだ「登場前」だが、位置だけは決めておく
    for (const x of teamUnits(side, team)) if (x.slot >= 0) units[x.id].slot = x.slot;
  }
  return { units, order, actor: null, ended: null };
}

/** イベント 1 つを状態に反映する（新しいオブジェクトを返す） */
export function applyEvent(state: ViewState, ev: BattleEvent): ViewState {
  const units = { ...state.units };
  const upd = (id: UnitId, patch: Partial<UnitView>) => {
    units[id] = { ...units[id], ...patch };
  };
  let actor = state.actor;
  let ended = state.ended;
  switch (ev.t) {
    case 'enter': {
      upd(ev.unit, { slot: ev.slot, entered: true, reserveIndex: -1, gauge: 0 });
      if (!ev.initial) {
        // 残りの待機の順番を繰り上げる
        for (const id of state.order) {
          const u = units[id];
          if (u.side === ev.side && u.reserveIndex > 0) upd(id, { reserveIndex: u.reserveIndex - 1 });
        }
      }
      break;
    }
    case 'turn': {
      actor = ev.unit;
      for (const [id, g] of Object.entries(ev.gauges)) upd(id, { gauge: g });
      break;
    }
    case 'damage':
      upd(ev.unit, { hp: ev.hp });
      break;
    case 'heal':
      upd(ev.unit, { hp: ev.hp });
      break;
    case 'endure':
      upd(ev.unit, { endureUsed: true });
      break;
    case 'poison':
      upd(ev.unit, { poison: ev.stacks });
      break;
    case 'chill':
      upd(ev.unit, { chilled: ev.on });
      break;
    case 'ko':
      upd(ev.unit, { alive: false, hp: 0, poison: 0, chilled: false, gauge: 0 });
      break;
    case 'end':
      ended = ev;
      actor = null;
      break;
    default:
      break;
  }
  return { units, order: state.order, actor, ended };
}

/** 行動の区切り（turn イベント）ごとにステップ番号を振る */
export function stepStarts(events: BattleEvent[]): number[] {
  const starts = [0];
  events.forEach((e, i) => {
    if (e.t === 'turn' && i > 0) starts.push(i);
  });
  // 最後の end を独立したステップに
  const last = events.length - 1;
  if (last > 0 && events[last].t === 'end' && starts[starts.length - 1] !== last) starts.push(last);
  return starts;
}

// ===== 戦闘ログ文章 =====

export interface LogLine {
  index: number;
  text: string;
  side: Side | null;
  tone: 'normal' | 'sub' | 'good' | 'bad' | 'system' | 'ko';
}

const POS = ['左', '中央', '右'];

export function logLines(
  events: BattleEvent[], teamA: TeamSnapshot, teamB: TeamSnapshot,
): LogLine[] {
  const v = initialView(teamA, teamB);
  const name = (id: UnitId) => v.units[id]?.snap.name ?? id;
  const sideOf = (id: UnitId) => v.units[id]?.side ?? null;
  const teamName = (s: Side) => (s === 'A' ? teamA.name : teamB.name);
  const lines: LogLine[] = [];
  const push = (index: number, text: string, side: Side | null, tone: LogLine['tone']) =>
    lines.push({ index, text, side, tone });

  let startedLine = false;
  events.forEach((ev, i) => {
    switch (ev.t) {
      case 'enter':
        if (ev.initial) {
          if (!startedLine) {
            push(i, `戦闘開始！ ${teamA.name} 対 ${teamB.name}`, null, 'system');
            startedLine = true;
          }
          push(i, `${name(ev.unit)}が${POS[ev.slot]}に布陣`, ev.side, 'sub');
        } else {
          push(i, `待機していた${name(ev.unit)}が${POS[ev.slot]}に登場！`, ev.side, 'system');
        }
        break;
      case 'attack': {
        const u = v.units[ev.unit];
        if (ev.followup) push(i, `${name(ev.unit)}の追撃！（${ELEMENTS[u.snap.element].effectName}）`, sideOf(ev.unit), 'normal');
        else push(i, `${name(ev.unit)}の攻撃 → ${name(ev.target)}`, sideOf(ev.unit), 'normal');
        break;
      }
      case 'evade':
        push(i, `${name(ev.unit)}はひらりとかわした！（疾風）`, sideOf(ev.unit), 'good');
        break;
      case 'damage': {
        let t: string;
        if (ev.kind === 'splash') t = `延焼！ ${name(ev.unit)}に${ev.amount}ダメージ`;
        else if (ev.kind === 'poison') t = `${name(ev.unit)}は毒で${ev.amount}ダメージ`;
        else {
          t = `${name(ev.unit)}に${ev.amount}ダメージ`;
          if (ev.aff === 'adv') t += '　効果は抜群だ！';
          if (ev.aff === 'dis') t += '　いまひとつのようだ…';
        }
        if (ev.execute) t += '（冥闇）';
        if (ev.capped) t += '（不動で軽減）';
        push(i, t, sideOf(ev.unit), 'sub');
        break;
      }
      case 'heal':
        push(
          i,
          ev.kind === 'rain'
            ? `恵みの雨：${name(ev.unit)}のHPが${ev.amount}回復`
            : `再生：${name(ev.unit)}のHPが${ev.amount}回復`,
          sideOf(ev.unit), 'good',
        );
        break;
      case 'endure':
        push(i, `${name(ev.unit)}は加護の力で踏みとどまった！`, sideOf(ev.unit), 'good');
        break;
      case 'poison':
        push(i, `${name(ev.unit)}に毒が回った（${ev.stacks}段階）`, sideOf(ev.unit), 'bad');
        break;
      case 'chill':
        if (ev.on) push(i, `${name(ev.unit)}は凍えて動きが鈍った`, sideOf(ev.unit), 'bad');
        else push(i, `${name(ev.unit)}の凍えが解けた`, sideOf(ev.unit), 'sub');
        break;
      case 'ko':
        push(i, `${name(ev.unit)}は倒れた…`, sideOf(ev.unit), 'ko');
        break;
      case 'end': {
        const pa = Math.round(ev.scoreA * 100);
        const pb = Math.round(ev.scoreB * 100);
        if (ev.reason === 'timeout') {
          push(i, `時間切れ！ 残りHP判定（${pa}% 対 ${pb}%）`, null, 'system');
        }
        if (ev.winner === 'draw') push(i, '引き分け！', null, 'system');
        else push(i, `${teamName(ev.winner)}の勝利！`, ev.winner, 'system');
        break;
      }
      default:
        break;
    }
  });
  return lines;
}
