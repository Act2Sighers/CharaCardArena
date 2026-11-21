import type { StyleId } from './types';

// ===== スキル定義 =====
// 数値はすべてここ（SK / LK）に集約し、説明文もここから組み立てる。

export type SkillId =
  // 仲間思い
  | 'heal_hand' | 'prayer' | 'cheer' | 'revive' | 'cover' | 'keystone'
  // 豪胆
  | 'reckless' | 'sweep' | 'first_strike' | 'focus' | 'late_bloomer'
  // 策士
  | 'hold' | 'intimidate' | 'provoke'
  // 曲者
  | 'mimic' | 'contrarian' | 'copycat'
  // 不屈
  | 'natural_heal' | 'adversity' | 'last_stand' | 'iron_will' | 'retaliate' | 'fighting_spirit'
  // 達人
  | 'weak_spot' | 'mastery' | 'overcome' | 'support_fire';

export type LeaderSkillId =
  | 'king' | 'fortress' | 'gale' | 'strategist' | 'mercy' | 'clan'
  | 'rainbow' | 'comeback' | 'relief' | 'gambit' | 'warlord' | 'back';

export type SkillCategory = 'ally' | 'bold' | 'tactician' | 'trickster' | 'tenacious' | 'master';

/** スキルの数値（バランス調整はここで行う） */
export const SK = {
  /** 不発時に次の行動ゲージが始まる位置（満タンに対する割合） */
  misfireGauge: 0.35,

  healHand: 0.24, healHandBelow: 0.85,
  prayer: 0.13, prayerBelow: 0.9,
  cheer: 0.4,
  revive: 0.35,
  cover: 0.45, coverGuard: 0.25,
  keystone: 0.28,

  recklessCost: 0.08, recklessPower: 2.3,
  sweepPower: 0.6,
  firstStrikeGauge: 0.5, firstStrikePower: 0.35,
  focusStep: 0.18, focusMax: 3,
  lateBloomerStep: 0.045, lateBloomerMax: 0.45,

  intimidate: 0.95,
  provokeChance: 0.4, provokeDef: 0.2,

  mimicTurns: 3,
  contrarianTurns: 3,

  naturalHeal: 0.04,
  adversity: 0.45,
  lastStandBase: 0.1, lastStand: 0.35,
  ironWillBase: 0.06, ironWill: 0.25,
  retaliateChance: 0.3, retaliatePower: 0.55,
  fightingSpirit: 0.07,

  weakSpotPower: 1.3,
  overcomeDeal: 1.0, overcomeTake: 1.1,
  supportChance: 0.25, supportPower: 0.45,
} as const;

/** リーダースキルの数値 */
export const LK = {
  king: 0.1,
  fortress: 0.1,
  galeGauge: 0.3, galeSpd: 0.04,
  strategistMin: 2,
  mercy: 0.02,
  rainbowMax: 0.08,
  comebackBase: 0.06, comeback: 0.18,
  reliefGauge: 1.0, reliefPower: 0.5, reliefBase: 0.2,
  warlord: 0.1,
  backAtk: 0.3,
  clanAtk: 0.14,
} as const;

export interface SkillInfo {
  id: SkillId;
  name: string;
  category: SkillCategory;
  /** アクティブなら発動間隔（自分の行動回数）、パッシブなら null */
  interval: number | null;
  /** 戦闘中 1 回だけ */
  once?: boolean;
  text: string;
  /** 不発になる条件（アクティブのみ） */
  misfire?: string;
  /** どんなキャラクター向けか */
  flavor: string;
}

export interface LeaderSkillInfo {
  id: LeaderSkillId;
  name: string;
  text: string;
  flavor: string;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export const CATEGORIES: { id: SkillCategory; name: string; text: string }[] = [
  { id: 'ally', name: '仲間思い', text: '仲間を癒し、守り、支える' },
  { id: 'bold', name: '豪胆', text: '前に出て、力で押し切る' },
  { id: 'tactician', name: '策士', text: '相手の調子を狂わせる' },
  { id: 'trickster', name: '曲者', text: '型にはまらない奇手を使う' },
  { id: 'tenacious', name: '不屈', text: '倒れずに粘り抜く' },
  { id: 'master', name: '達人', text: '属性と相性を極める' },
];

export const SKILLS: Record<SkillId, SkillInfo> = {
  heal_hand: {
    id: 'heal_hand', name: '癒しの手', category: 'ally', interval: 3,
    text: `HPの割合が最も低い味方（自分を含む）を、最大HPの${pct(SK.healHand)}回復する。`,
    misfire: `前線の味方全員のHPが${pct(SK.healHandBelow)}以上`,
    flavor: '傷ついた仲間を放っておけない',
  },
  prayer: {
    id: 'prayer', name: '祈りの歌', category: 'ally', interval: 4,
    text: `前線の味方全員を、最大HPの${pct(SK.prayer)}ずつ回復する。`,
    misfire: `前線の味方全員のHPが${pct(SK.prayerBelow)}以上`,
    flavor: 'みんなの無事を静かに祈る',
  },
  cheer: {
    id: 'cheer', name: '声援', category: 'ally', interval: 3,
    text: `攻撃しながら声をかけ、自分以外の前線の味方全員の行動ゲージを${pct(SK.cheer)}進める。`,
    misfire: '前線に自分以外の味方がいない',
    flavor: '仲間の背中を押す応援団',
  },
  revive: {
    id: 'revive', name: '蘇生の秘術', category: 'ally', interval: 4, once: true,
    text: `倒れた味方1体を最大HPの${pct(SK.revive)}で復活させる。前線に空きがあればそこへ、なければ待機の最後尾に戻る。戦闘中1回だけ。`,
    misfire: '倒れた味方がいない',
    flavor: '禁じられた術に通じる',
  },
  cover: {
    id: 'cover', name: 'かばう', category: 'ally', interval: null,
    text: `隣の味方が攻撃されたとき、${pct(SK.cover)}の確率で代わりに受ける。かばったときに受けるダメージは${pct(SK.coverGuard)}減る。`,
    flavor: '体を張って仲間を守る',
  },
  keystone: {
    id: 'keystone', name: '陣の要', category: 'ally', interval: null,
    text: `両隣の味方の防御が${pct(SK.keystone)}上がる（中央に置くと2人に効く）。`,
    flavor: 'そこにいるだけで陣形が締まる',
  },

  reckless: {
    id: 'reckless', name: '捨て身', category: 'bold', interval: 3,
    text: `自分の最大HPの${pct(SK.recklessCost)}を削り、威力${SK.recklessPower}倍の攻撃を放つ。`,
    misfire: '残りHPが削る量以下',
    flavor: '後先を考えない一撃',
  },
  sweep: {
    id: 'sweep', name: '薙ぎ払い', category: 'bold', interval: 3,
    text: `敵の前線全員に威力${pct(SK.sweepPower)}の攻撃を行う。`,
    misfire: '敵の前線が1体だけ',
    flavor: '大勢を相手にするほど燃える',
  },
  first_strike: {
    id: 'first_strike', name: '先手必勝', category: 'bold', interval: null,
    text: `登場したとき行動ゲージが${pct(SK.firstStrikeGauge)}進み、最初の攻撃の威力が${pct(SK.firstStrikePower)}上がる。`,
    flavor: '誰よりも早く飛び出す',
  },
  focus: {
    id: 'focus', name: '一点集中', category: 'bold', interval: null,
    text: `同じ相手を続けて攻撃するたびに威力が${pct(SK.focusStep)}上がる（最大${pct(SK.focusStep * SK.focusMax)}）。相手を変えると元に戻る。`,
    flavor: '狙った獲物は逃さない',
  },
  late_bloomer: {
    id: 'late_bloomer', name: '大器晩成', category: 'bold', interval: null,
    text: `自分が行動するたびに攻撃が${pct(SK.lateBloomerStep)}上がる（最大${pct(SK.lateBloomerMax)}）。`,
    flavor: '戦いの中で目覚めていく',
  },

  hold: {
    id: 'hold', name: '足止め', category: 'tactician', interval: 3,
    text: '攻撃した相手の行動ゲージを0に戻す。',
    flavor: '相手の出鼻をくじく',
  },
  intimidate: {
    id: 'intimidate', name: '威圧感', category: 'tactician', interval: null,
    text: `自分が前線にいる間、敵全員の行動ゲージの溜まりが${pct(1 - SK.intimidate)}遅くなる。`,
    flavor: 'にらまれると体がすくむ',
  },
  provoke: {
    id: 'provoke', name: '挑発', category: 'tactician', interval: null,
    text: `敵の戦法に関わらず${pct(SK.provokeChance)}の確率で自分が狙われる。防御が${pct(SK.provokeDef)}上がる。`,
    flavor: 'わざと敵の注意を引く',
  },

  mimic: {
    id: 'mimic', name: 'ものまね', category: 'trickster', interval: 3,
    text: `前線にいる自分と違う属性のカード（敵味方問わず）を1体選び、その属性効果をこの行動と次の${SK.mimicTurns - 1}回の行動の間、追加で使いながら攻撃する。`,
    misfire: '前線に自分と違う属性のカードがいない',
    flavor: '見たものをすぐに真似できる',
  },
  contrarian: {
    id: 'contrarian', name: '天邪鬼', category: 'trickster', interval: 4,
    text: `この行動と次の${SK.contrarianTurns - 1}回の行動の間、自分に関わる属性相性（攻撃も被弾も）を反転させ、苦手だった相手を攻撃する。`,
    misfire: '前線に自分が不利な相手がいない',
    flavor: '常識の逆を突く',
  },
  copycat: {
    id: 'copycat', name: '見よう見まね', category: 'trickster', interval: 3,
    text: '前線の味方1体のアクティブスキルを、その場の条件で自分が使う。',
    misfire: '使えるアクティブスキルを持つ味方がいない',
    flavor: '仲間の技を盗んで覚える',
  },

  natural_heal: {
    id: 'natural_heal', name: '自然治癒', category: 'tenacious', interval: null,
    text: `自分の行動の終わりに、最大HPの${pct(SK.naturalHeal)}回復する。`,
    flavor: '傷の治りが異様に早い',
  },
  adversity: {
    id: 'adversity', name: '逆境', category: 'tenacious', interval: null,
    text: `自分のHPの割合が低いほど攻撃が上がる（最大${pct(SK.adversity)}）。`,
    flavor: '追い詰められてから本気を出す',
  },
  last_stand: {
    id: 'last_stand', name: '背水', category: 'tenacious', interval: null,
    text: `攻撃が${pct(SK.lastStandBase)}上がる。前線の味方が自分だけになると、攻撃と速さが${pct(SK.lastStand)}上がる。`,
    flavor: '最後の一人になっても退かない',
  },
  iron_will: {
    id: 'iron_will', name: '不屈の盾', category: 'tenacious', interval: null,
    text: `受けるダメージが${pct(SK.ironWillBase)}減る。HPが50%以下になると${pct(SK.ironWill)}減る。`,
    flavor: '倒れそうになるほど固くなる',
  },
  retaliate: {
    id: 'retaliate', name: '応報', category: 'tenacious', interval: null,
    text: `攻撃を受けて倒れなかったとき、${pct(SK.retaliateChance)}の確率で威力${pct(SK.retaliatePower)}の反撃をする。`,
    flavor: 'やられたら必ずやり返す',
  },
  fighting_spirit: {
    id: 'fighting_spirit', name: '闘志', category: 'tenacious', interval: null,
    text: `自分以外の味方が攻撃を受けるたびに、自分の行動ゲージが${pct(SK.fightingSpirit)}進む。`,
    flavor: '仲間が傷つくほど燃え上がる',
  },

  weak_spot: {
    id: 'weak_spot', name: '弱点看破', category: 'master', interval: 2,
    text: `自分が有利な属性の敵を狙い、威力${SK.weakSpotPower}倍で攻撃する。`,
    misfire: '前線に自分が有利な敵がいない',
    flavor: '相手の弱みを一目で見抜く',
  },
  mastery: {
    id: 'mastery', name: '本領発揮', category: 'master', interval: null,
    text: '自分の属性効果が強化される（強化の内容は属性ごとに異なる）。',
    flavor: '自分の力を誰よりも知っている',
  },
  overcome: {
    id: 'overcome', name: '苦手克服', category: 'master', interval: null,
    text: `不利な相性の補正を和らげる（不利な相手へ与えるダメージ ×0.7→×${SK.overcomeDeal}、有利をとられて受けるダメージ ×1.5→×${SK.overcomeTake}）。`,
    flavor: '苦手なものから逃げない',
  },
  support_fire: {
    id: 'support_fire', name: '援護射撃', category: 'master', interval: null,
    text: `隣の味方が攻撃した後、${pct(SK.supportChance)}の確率で同じ相手に威力${pct(SK.supportPower)}の追い打ちをする。`,
    flavor: '仲間の動きに合わせるのが得意',
  },
};

export const SKILL_ORDER: SkillId[] = Object.keys(SKILLS) as SkillId[];

export const LEADER_SKILLS: Record<LeaderSkillId, LeaderSkillInfo> = {
  king: { id: 'king', name: '鼓舞する王', text: `味方全員の攻撃が${pct(LK.king)}上がる。`, flavor: '堂々と皆を率いる' },
  fortress: { id: 'fortress', name: '鉄壁の指揮', text: `味方全員の受けるダメージが${pct(LK.fortress)}減る。`, flavor: '守りを固めて負けない' },
  gale: {
    id: 'gale', name: '疾風の号令',
    text: `リーダーが前線に出たとき、前線の味方全員の行動ゲージが${pct(LK.galeGauge)}進む。味方全員の速さが${pct(LK.galeSpd)}上がる。`,
    flavor: '号令ひとつで一斉に動く',
  },
  strategist: {
    id: 'strategist', name: '軍師の采配',
    text: `味方全員のアクティブスキルの発動間隔が1回短くなり（最短${LK.strategistMin}回）、登場した時点でチャージが満タンになっている。不発したときの行動ゲージの還元も2倍になる。`,
    flavor: '仲間の技を引き出す名軍師',
  },
  mercy: { id: 'mercy', name: '慈愛の導き', text: `味方全員が、自分の行動の終わりに最大HPの${pct(LK.mercy)}回復する。`, flavor: '誰ひとり見捨てない' },
  clan: {
    id: 'clan', name: '一族の誇り',
    text: `チームに同じ属性の仲間がいる味方は、属性効果が「本領発揮」と同じだけ強化され、攻撃が${pct(LK.clanAtk)}上がる。`,
    flavor: '同じ血を引く者たちの長',
  },
  rainbow: {
    id: 'rainbow', name: '虹の結束',
    text: `チーム内の属性の種類が多いほど、味方全員の攻撃と防御が上がる（全員違う属性なら${pct(LK.rainbowMax)}）。`,
    flavor: '個性の違いこそ力になる',
  },
  comeback: {
    id: 'comeback', name: '逆転の采配',
    text: `味方全員の攻撃が${pct(LK.comebackBase)}上がる。残り人数が相手より少ない間は、攻撃と速さが${pct(LK.comeback)}上がる。`,
    flavor: '劣勢でこそ采配が冴える',
  },
  relief: {
    id: 'relief', name: '交代の名手',
    text: `味方全員の最初の攻撃の威力が${pct(LK.reliefBase)}上がる。待機から登場した味方は、さらに行動ゲージが満タンになり、最初の攻撃の威力が${pct(LK.reliefPower)}上がる。`,
    flavor: '控えの使い方を心得ている',
  },
  gambit: { id: 'gambit', name: '奇策', text: '味方が有利をとられて受けるダメージが等倍になる。', flavor: '相性の不利を策でひっくり返す' },
  warlord: {
    id: 'warlord', name: '総大将',
    text: `リーダー自身のHP・攻撃・防御・速さが${pct(LK.warlord)}上がる。ただしリーダーが倒れると、前線の味方全員の行動ゲージが0になる。`,
    flavor: '大将が崩れれば全軍が崩れる',
  },
  back: {
    id: 'back', name: '背中で語る',
    text: `リーダーのHPが50%以下になると、味方全員の攻撃が${pct(LK.backAtk)}上がる。`,
    flavor: '傷だらけの姿で皆を奮い立たせる',
  },
};

export const LEADER_SKILL_ORDER: LeaderSkillId[] = Object.keys(LEADER_SKILLS) as LeaderSkillId[];

/** 既存カード・新規カードに最初に設定するスキル（スタイル別） */
export const DEFAULT_SKILL: Record<StyleId, SkillId> = {
  power: 'reckless',
  guard: 'cover',
  swift: 'first_strike',
  tough: 'natural_heal',
  balance: 'cheer',
};
export const DEFAULT_LEADER_SKILL: LeaderSkillId = 'king';

export function isActive(id: SkillId): boolean {
  return SKILLS[id].interval !== null;
}
