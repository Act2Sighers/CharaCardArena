import { SKILLS, SkillId } from './skills';

// ===== 台詞 =====

export type TimingId =
  | 'start' | 'victory'
  | 'attack' | 'skill' | 'misfire' | 'leader'
  | 'hp60' | 'hp30' | 'endure' | 'last_one'
  | 'self_ko' | 'ally_ko' | 'kill' | 'enter'
  | 'hurt' | 'healed' | 'element';

export type VoiceFreq = 'low' | 'mid' | 'high';

export interface CardVoice {
  freq: VoiceFreq;
  /** タイミングごとの台詞（各最大 LINES_PER_TIMING 個） */
  lines: Partial<Record<TimingId, string[]>>;
}

/** 1 つの台詞の最大文字数 */
export const LINE_MAX = 40;
/** 1 つのタイミングに登録できる台詞の数 */
export const LINES_PER_TIMING = 3;

/** 発話の数値（調整はここで行う） */
export const VK = {
  /** 1 回の機会で喋ろうとする確率 */
  prob: { low: 0.25, mid: 0.5, high: 0.85 } as Record<VoiceFreq, number>,
  /** 「必ず 1 人が喋る」タイミングでの選ばれやすさ */
  weight: { low: 1, mid: 2, high: 4 } as Record<VoiceFreq, number>,
  /** よく起きるタイミングでは確率をこの倍率に下げる */
  frequentFactor: 1 / 3,
  /** 取り合いに負けたときに次の機会へ上乗せする確率と、その上限 */
  carry: 0.15,
  carryMax: 0.45,
};

export const FREQ_LABEL: Record<VoiceFreq, string> = { low: 'ちょっと', mid: 'そこそこ', high: 'たくさん' };

export type TimingGroup = 'bookend' | 'action' | 'state' | 'exit' | 'frequent';

export interface TimingInfo {
  id: TimingId;
  name: string;
  text: string;
  group: TimingGroup;
  /** よく起きる（警告を出し、確率を下げる） */
  frequent?: boolean;
  /** 必ず誰かが喋る */
  mandatory?: boolean;
}

export const TIMING_GROUPS: { id: TimingGroup; name: string }[] = [
  { id: 'bookend', name: '戦闘の始まりと終わり' },
  { id: 'action', name: '行動' },
  { id: 'state', name: 'HP・戦況' },
  { id: 'exit', name: '退場・登場' },
  { id: 'frequent', name: 'よく起きるタイミング' },
];

export const TIMINGS: Record<TimingId, TimingInfo> = {
  start: {
    id: 'start', name: '戦闘開始時', group: 'bookend', mandatory: true,
    text: '戦闘の始まりに、両チームの前線にいるカードの中から1人だけが喋ります。リーダーは「リーダースキル発動時」の台詞も候補になります。',
  },
  victory: {
    id: 'victory', name: '戦闘勝利時', group: 'bookend', mandatory: true,
    text: '勝ったチームの前線で生き残っているカードの中から、台詞のある1人が必ず喋ります。',
  },
  attack: { id: 'attack', name: '通常攻撃時', group: 'action', text: '通常攻撃をする直前。' },
  skill: { id: 'skill', name: 'スキル発動時', group: 'action', text: 'スキルを発動したとき。' },
  misfire: { id: 'misfire', name: 'スキル不発時', group: 'action', text: 'アクティブスキルが不発になったとき。' },
  leader: {
    id: 'leader', name: 'リーダースキル発動時', group: 'action',
    text: 'リーダーとして前線に出て、リーダースキルが効き始めたとき（戦闘開始時、または待機から登場したとき）。',
  },
  hp60: { id: 'hp60', name: 'HPが60%を下回った時', group: 'state', text: 'HPゲージが黄色に変わったとき。前線にいる間に1回まで。' },
  hp30: { id: 'hp30', name: 'HPが30%を下回った時', group: 'state', text: 'HPゲージが赤色に変わったとき。前線にいる間に1回まで。' },
  endure: { id: 'endure', name: '加護で踏みとどまった時', group: 'state', text: '光属性の「加護」で倒れずに踏みとどまったとき（光属性、または「ものまね」で光をまねている間だけ）。' },
  last_one: { id: 'last_one', name: '最後の1人になった時', group: 'state', text: 'チームの生き残りが自分1人になったとき（待機中ならば登場したとき）。' },
  self_ko: { id: 'self_ko', name: '自身の退場時', group: 'exit', text: '自分のHPが0になったとき。味方の「他の味方の退場時」や、倒した相手の「敵を倒した時」と機会を取り合います。' },
  ally_ko: { id: 'ally_ko', name: '他の味方の退場時', group: 'exit', text: '前線の味方の誰かのHPが0になったとき。' },
  kill: { id: 'kill', name: '敵を倒した時', group: 'exit', text: '自分の攻撃で敵のHPを0にしたとき。' },
  enter: { id: 'enter', name: '登場時', group: 'exit', text: '待機から前線に登場したとき、または蘇生されて前線に立ったとき。' },
  hurt: { id: 'hurt', name: 'ダメージを受けた時', group: 'frequent', frequent: true, text: 'ダメージを受けて、HPゲージの色が変わらなかったとき。' },
  healed: { id: 'healed', name: '他の誰かに回復された時', group: 'frequent', frequent: true, text: '自分以外のカードの効果でHPが回復したとき。' },
  element: {
    id: 'element', name: '属性効果の発動時', group: 'frequent', frequent: true,
    text: '自分の属性効果が働いたとき（飛び火、追撃、毒、凍え、回避、ダメージ上限、恵みの雨、再生、冥闇）。',
  },
};

export const TIMING_ORDER: TimingId[] = Object.keys(TIMINGS) as TimingId[];

/** 発動の瞬間があるパッシブスキル（スキル発動時の台詞が使われる） */
const TRIGGERED_PASSIVES: SkillId[] = ['cover', 'retaliate', 'support_fire', 'first_strike'];

/** このスキルで「スキル発動時」の台詞が使われるか */
export function skillSpeaks(id: SkillId): boolean {
  return SKILLS[id].interval !== null || TRIGGERED_PASSIVES.includes(id);
}

/** このスキルで「スキル不発時」の台詞が使われるか */
export function skillCanMisfire(id: SkillId): boolean {
  return SKILLS[id].interval !== null && !!SKILLS[id].misfire;
}

/** 文字数（サロゲートペアも 1 文字として数える） */
export function charCount(s: string): number {
  return Array.from(s).length;
}

export function clipLine(s: string): string {
  const chars = Array.from(s.replace(/[\r\n]+/g, ' '));
  return chars.length > LINE_MAX ? chars.slice(0, LINE_MAX).join('') : s.replace(/[\r\n]+/g, ' ');
}

/** 登録済みの台詞（空欄を除く） */
export function linesOf(voice: CardVoice | undefined, t: TimingId): string[] {
  return (voice?.lines[t] ?? []).filter((x) => x.trim().length > 0).slice(0, LINES_PER_TIMING);
}

export function countLines(voice: CardVoice | undefined): number {
  if (!voice) return 0;
  return TIMING_ORDER.reduce((n, t) => n + linesOf(voice, t).length, 0);
}
