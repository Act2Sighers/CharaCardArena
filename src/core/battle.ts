import { ELEMENTS } from './elements';
import { teamUnits } from './engine';
import { DEFAULT_LEADER_SKILL, DEFAULT_SKILL, LEADER_SKILLS, LK, SKILLS } from './skills';
import { computeStats } from './styles';
import type {
  BattleEvent, Card, ElementId, Side, Team, TeamSnapshot, UnitId, UnitSnapshot,
} from './types';

// ===== チーム → 戦闘用スナップショット =====

export function unitSnapshot(card: Card, leader = false): UnitSnapshot {
  return {
    cardId: card.id,
    name: card.name,
    element: card.element,
    style: card.style,
    tactic: card.tactic,
    imageRef: card.image ? card.image.cropped : null,
    stats: computeStats(card.style),
    skill: card.skill ?? DEFAULT_SKILL[card.style],
    leaderSkill: card.leaderSkill ?? DEFAULT_LEADER_SKILL,
    leader,
  };
}

/** スキル未設定の古いカードに仮のスキルを補う */
export function withDefaultSkills(card: Card): Card {
  if (card.skill && card.leaderSkill) return card;
  return { ...card, skill: card.skill ?? DEFAULT_SKILL[card.style], leaderSkill: card.leaderSkill ?? DEFAULT_LEADER_SKILL };
}

export function teamMemberIds(team: Team): string[] {
  return [...team.front.filter((x): x is string => !!x), ...team.reserve];
}

export function teamSnapshot(team: Team, cards: Map<string, Card>): TeamSnapshot {
  const leader = pickLeader(team);
  const get = (id: string | null) => (id && cards.get(id) ? unitSnapshot(cards.get(id)!, id === leader) : null);
  return {
    name: team.name,
    front: [0, 1, 2].map((i) => get(team.front[i] ?? null)),
    reserve: team.reserve.map((id) => get(id)).filter((x): x is UnitSnapshot => !!x),
  };
}

/** リーダーが未設定・チーム外なら、前線中央（いなければ最初のメンバー）をリーダーにする */
export function pickLeader(team: Team): string | null {
  const members = teamMemberIds(team);
  if (team.leader && members.includes(team.leader)) return team.leader;
  return team.front[1] ?? members[0] ?? null;
}

/** 前線に空きがあるのに待機がいる場合、待機を前線に詰める。リーダーも補う */
export function normalizeTeam(team: Team): Team {
  const front = [0, 1, 2].map((i) => team.front[i] ?? null);
  const reserve = [...team.reserve];
  for (let i = 0; i < 3; i++) {
    if (!front[i] && reserve.length) front[i] = reserve.shift()!;
  }
  const t = { ...team, front, reserve };
  return { ...t, leader: pickLeader(t) };
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
  charge: number;
  chargeMax: number;
  skillSpent: boolean;
  mimicEl: ElementId | null;
  inverted: boolean;
  leader: boolean;
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
        charge: 0, chargeMax: x.unit.skill ? SKILLS[x.unit.skill]?.interval ?? 0 : 0,
        skillSpent: false, mimicEl: null, inverted: false, leader: !!x.unit.leader,
      };
      if (x.unit.leader && x.unit.leaderSkill === 'warlord') {
        units[x.id].maxHp = units[x.id].hp = Math.round(x.unit.stats.hp * (1 + LK.warlord));
      }
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
  /** その位置に残っている（倒れた）カードを盤面から外す。1つの位置に表示されるのは常に最新の1枚だけ */
  const vacate = (side: Side, slot: number, except: UnitId) => {
    for (const id of state.order) {
      const u = units[id];
      if (id !== except && u.side === side && u.slot === slot && u.entered) upd(id, { slot: -1 });
    }
  };
  let actor = state.actor;
  let ended = state.ended;
  switch (ev.t) {
    case 'enter': {
      vacate(ev.side, ev.slot, ev.unit);
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
      if (ev.chargeMax) upd(ev.unit, { charge: ev.charge ?? 0, chargeMax: ev.chargeMax });
      break;
    }
    case 'attack':
      if (!ev.followup && (ev.tag === undefined || ev.tag === 'normal' || ev.tag === 'skill') && ev.unit === actor) {
        upd(ev.unit, { gauge: 0 });
      }
      break;
    case 'skill':
      if (ev.unit === actor) {
        upd(ev.unit, { charge: 0, gauge: 0, ...(ev.skill === 'revive' && !ev.via ? { skillSpent: true } : {}) });
      }
      break;
    case 'gauge':
      upd(ev.unit, { gauge: ev.value });
      break;
    case 'misfire':
      upd(ev.unit, { charge: 0 });
      break;
    case 'buff':
      if (ev.buff === 'mimic') upd(ev.unit, { mimicEl: ev.on ? ev.element ?? null : null });
      else upd(ev.unit, { inverted: ev.on });
      break;
    case 'revive': {
      const reserveCount = state.order.filter((id) => {
        const u = units[id];
        return u.side === ev.side && !u.entered && u.reserveIndex >= 0 && u.alive;
      }).length;
      if (ev.slot >= 0) vacate(ev.side, ev.slot, ev.unit);
      upd(ev.unit, {
        alive: true, hp: ev.hp, gauge: 0, poison: 0, chilled: false,
        ...(ev.slot >= 0
          ? { slot: ev.slot, entered: true, reserveIndex: -1 }
          : { slot: -1, entered: false, reserveIndex: reserveCount }),
      });
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
      upd(ev.unit, { alive: false, hp: 0, poison: 0, chilled: false, gauge: 0, mimicEl: null, inverted: false });
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
  tone: 'normal' | 'sub' | 'good' | 'bad' | 'system' | 'ko' | 'skill';
}

const POS = ['左', '中央', '右'];
const HEAL_LABEL: Record<string, string> = {
  rain: '恵みの雨：', regen: '再生：', skill: '', nature: '自然治癒：', mercy: '慈愛の導き：',
};

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
        const tag = ev.tag ?? (ev.followup ? 'followup' : 'normal');
        if (tag === 'followup') push(i, `${name(ev.unit)}の追撃！（${ELEMENTS[u.snap.element].effectName}）`, sideOf(ev.unit), 'normal');
        else if (tag === 'counter') push(i, `${name(ev.unit)}の反撃！（応報） → ${name(ev.target)}`, sideOf(ev.unit), 'normal');
        else if (tag === 'assist') push(i, `${name(ev.unit)}の援護射撃！ → ${name(ev.target)}`, sideOf(ev.unit), 'normal');
        else if (tag === 'skill' || tag === 'sweep') push(i, `　→ ${name(ev.target)}`, sideOf(ev.unit), 'normal');
        else push(i, `${name(ev.unit)}の攻撃 → ${name(ev.target)}`, sideOf(ev.unit), 'normal');
        break;
      }
      case 'skill': {
        const sk = SKILLS[ev.skill].name;
        let t = ev.via
          ? `${name(ev.unit)}の「${SKILLS[ev.via].name}」→「${sk}」！`
          : `${name(ev.unit)}のスキル「${sk}」！`;
        if (ev.skill === 'mimic' && ev.element && ev.target) t += `（${name(ev.target)}の${ELEMENTS[ev.element].effectName}をまねる）`;
        if (ev.skill === 'revive' && ev.target) t += `（${name(ev.target)}を蘇らせる）`;
        push(i, t, sideOf(ev.unit), 'skill');
        break;
      }
      case 'misfire':
        push(i, `${name(ev.unit)}の「${SKILLS[ev.skill].name}」は不発…　通常攻撃に切り替え、次の行動が早まる`, sideOf(ev.unit), 'sub');
        break;
      case 'cover':
        push(i, `${name(ev.unit)}が${name(ev.target)}をかばった！`, sideOf(ev.unit), 'good');
        break;
      case 'gauge': {
        const label: Partial<Record<typeof ev.reason, string>> = {
          cheer: `声援：${name(ev.unit)}の行動ゲージが進んだ`,
          hold: `足止め：${name(ev.unit)}の行動ゲージが0に戻った`,
          first: `先手必勝：${name(ev.unit)}の行動ゲージが進んだ`,
          gale: `疾風の号令：${name(ev.unit)}の行動ゲージが進んだ`,
          relief: `交代の名手：${name(ev.unit)}の行動ゲージが進んだ`,
          warlord: `総大将を失い、${name(ev.unit)}の行動ゲージが0になった`,
        };
        const text = label[ev.reason];
        if (text) push(i, text, sideOf(ev.unit), ev.reason === 'hold' || ev.reason === 'warlord' ? 'bad' : 'sub');
        break;
      }
      case 'revive':
        push(i, ev.slot >= 0 ? `${name(ev.unit)}が復活し、${POS[ev.slot]}に立った！` : `${name(ev.unit)}が復活し、待機の最後尾に戻った！`, ev.side, 'good');
        break;
      case 'buff':
        if (ev.buff === 'mimic') {
          if (!ev.on) push(i, `${name(ev.unit)}のものまねが切れた`, sideOf(ev.unit), 'sub');
        } else push(i, ev.on ? `${name(ev.unit)}の属性相性が反転した！` : `${name(ev.unit)}の属性相性が元に戻った`, sideOf(ev.unit), ev.on ? 'good' : 'sub');
        break;
      case 'leader': {
        const ls = LEADER_SKILLS[ev.skill].name;
        push(i, ev.on ? `リーダー${name(ev.unit)}の「${ls}」が有効に！` : `リーダー${name(ev.unit)}が倒れ、「${ls}」の効果が消えた`, sideOf(ev.unit), ev.on ? 'skill' : 'bad');
        break;
      }
      case 'evade':
        push(i, `${name(ev.unit)}はひらりとかわした！（疾風）`, sideOf(ev.unit), 'good');
        break;
      case 'damage': {
        let t: string;
        if (ev.kind === 'splash') t = `延焼！ ${name(ev.unit)}に${ev.amount}ダメージ`;
        else if (ev.kind === 'poison') t = `${name(ev.unit)}は毒で${ev.amount}ダメージ`;
        else if (ev.kind === 'cost') t = `${name(ev.unit)}は捨て身でHPを${ev.amount}削った`;
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
          `${HEAL_LABEL[ev.kind]}${name(ev.unit)}のHPが${ev.amount}回復`,
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

/** その位置に表示するカード（生きているカードを優先し、いなければ最後にそこで倒れたカード） */
export function slotOccupant(view: ViewState, side: Side, slot: number): UnitView | null {
  const cands = view.order.map((id) => view.units[id]).filter((u) => u.side === side && u.slot === slot && u.entered);
  return cands.find((u) => u.alive) ?? cands[cands.length - 1] ?? null;
}
