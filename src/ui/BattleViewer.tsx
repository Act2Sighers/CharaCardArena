import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { applyEvent, initialView, logLines, slotOccupant, stepStarts, UnitView, ViewState } from '../core/battle';
import { ELEMENTS } from '../core/elements';
import type { BattleEvent, Side, TeamSnapshot, UnitId } from '../core/types';
import { FLIGHT_MS, FxLayer, Pt } from '../fx/fx';
import { LEADER_SKILLS, SKILLS } from '../core/skills';
import type { ElementId } from '../core/types';
import { CardFace } from './CardFace';
import { Crown } from './SkillPicker';

interface Cutin {
  side: Side;
  name: string;
  title: string;
  sub: string;
  element: ElementId;
  kind: 'skill' | 'leader';
}

interface Props {
  teamA: TeamSnapshot;
  teamB: TeamSnapshot;
  events: BattleEvent[];
  onClose(): void;
  /** 戦闘直後の観戦なら true（リプレイなら false） */
  live: boolean;
  favorite?: boolean;
  onToggleFavorite?(): void;
}

const SPEEDS = [1, 2, 4] as const;
type Speed = (typeof SPEEDS)[number];

function loadSpeed(): Speed {
  try {
    const v = Number(localStorage.getItem('cca-speed'));
    return (SPEEDS as readonly number[]).includes(v) ? (v as Speed) : 1;
  } catch {
    return 1;
  }
}

/** イベントの後、次のイベントまでの待ち時間（等速, ms） */
function delayAfter(ev: BattleEvent, next: BattleEvent | undefined): number {
  switch (ev.t) {
    case 'enter':
      if (ev.initial) return next?.t === 'enter' && next.initial ? 150 : 750;
      return 800;
    case 'turn':
      return 340;
    case 'attack':
      return FLIGHT_MS + 50;
    case 'skill':
      return 950;
    case 'misfire':
      return 700;
    case 'cover':
      return 420;
    case 'gauge':
      if (ev.reason === 'spirit') return 90;
      if (ev.reason === 'cheer') return 200;
      return 320;
    case 'revive':
      return 1050;
    case 'buff':
      return ev.on ? 420 : 160;
    case 'leader':
      return 900;
    case 'evade':
      return 560;
    case 'damage':
      if (ev.kind === 'splash') return 280;
      if (ev.kind === 'poison') return 560;
      if (ev.kind === 'sweep') return next?.t === 'attack' && next.tag === 'sweep' ? 160 : 440;
      if (ev.kind === 'cost') return 380;
      return 440;
    case 'heal':
      return 460;
    case 'endure':
      return 850;
    case 'poison':
      return 260;
    case 'chill':
      return ev.on ? 300 : 120;
    case 'ko':
      return 760;
    default:
      return 0;
  }
}

const reducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

export function BattleViewer({ teamA, teamB, events, onClose, live, favorite, onToggleFavorite }: Props) {
  const init = useMemo(() => initialView(teamA, teamB), [teamA, teamB]);
  const lines = useMemo(() => logLines(events, teamA, teamB), [events, teamA, teamB]);
  const steps = useMemo(() => stepStarts(events), [events]);

  const [idx, setIdx] = useState(0);
  const [view, setView] = useState<ViewState>(init);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<Speed>(loadSpeed);
  const [showResult, setShowResult] = useState(false);
  const [cutin, setCutin] = useState<(Cutin & { key: number }) | null>(null);
  const cutinKey = useRef(0);
  const cutinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fieldRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef<FxLayer | null>(null);
  const cardEls = useRef(new Map<UnitId, HTMLElement>());
  const lastTarget = useRef<UnitId | null>(null);
  const logRef = useRef<HTMLOListElement>(null);
  const pendingFx = useRef<{ ev: BattleEvent; view: ViewState }[]>([]);
  const viewRef = useRef(view);
  viewRef.current = view;

  // エフェクト用キャンバス
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const field = fieldRef.current;
    if (!canvas || !field) return;
    const fx = new FxLayer(canvas);
    fx.reduced = reducedMotion();
    fxRef.current = fx;
    const ro = new ResizeObserver(() => fx.resize(field.clientWidth, field.clientHeight));
    ro.observe(field);
    fx.resize(field.clientWidth, field.clientHeight);
    fx.start();
    return () => {
      ro.disconnect();
      fx.stop();
      fxRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (fxRef.current) fxRef.current.speed = speed;
    try {
      localStorage.setItem('cca-speed', String(speed));
    } catch {
      // 保存できなくても再生には影響しない
    }
  }, [speed]);

  const center = useCallback((id: UnitId): { p: Pt; s: number } | null => {
    const el = cardEls.current.get(id);
    const field = fieldRef.current;
    if (!el || !field) return null;
    const r = el.getBoundingClientRect();
    const f = field.getBoundingClientRect();
    return { p: { x: r.left - f.left + r.width / 2, y: r.top - f.top + r.height / 2 }, s: r.width };
  }, []);

  const animate = (id: UnitId, frames: Keyframe[], dur: number) => {
    const el = cardEls.current.get(id);
    if (!el || reducedMotion()) return;
    el.animate(frames, { duration: dur / speed, easing: 'ease-out' });
  };

  const shakeField = (mag: number) => {
    const f = fieldRef.current;
    if (!f || reducedMotion()) return;
    f.animate(
      [
        { transform: 'translate(0,0)' },
        { transform: `translate(${mag}px,${-mag / 2}px)` },
        { transform: `translate(${-mag}px,${mag / 2}px)` },
        { transform: `translate(${mag / 2}px,0)` },
        { transform: 'translate(0,0)' },
      ],
      { duration: 280 / speed },
    );
  };

  const showCutin = (c: Cutin) => {
    const key = ++cutinKey.current;
    setCutin({ ...c, key });
    if (cutinTimer.current) clearTimeout(cutinTimer.current);
    cutinTimer.current = setTimeout(() => setCutin((x) => (x && x.key === key ? null : x)), 1100 / speed);
  };
  useEffect(() => () => {
    if (cutinTimer.current) clearTimeout(cutinTimer.current);
  }, []);

  /** イベントの見た目の演出 */
  const visualize = (ev: BattleEvent, v: ViewState) => {
    const fx = fxRef.current;
    if (!fx) return;
    const unit = (id: UnitId) => v.units[id];
    switch (ev.t) {
      case 'enter': {
        {
          const c = center(ev.unit);
          if (c) fx.enter(c.p, c.s, unit(ev.unit).snap.element, ev.initial);
          animate(ev.unit, [
            { transform: 'scale(0.6) translateY(20px)', opacity: 0, filter: 'brightness(2.5)' },
            { transform: 'scale(1.06)', opacity: 1, filter: 'brightness(1.6)', offset: 0.6 },
            { transform: 'scale(1)', opacity: 1, filter: 'brightness(1)' },
          ], ev.initial ? 420 : 650);
        }
        break;
      }
      case 'attack': {
        lastTarget.current = ev.target;
        const a = center(ev.unit);
        const t = center(ev.target);
        if (!a || !t) break;
        fx.attack(unit(ev.unit).snap.element, a.p, t.p, a.s, ev.followup);
        const dy = unit(ev.unit).side === 'A' ? -14 : 14;
        animate(ev.unit, [
          { transform: 'translateY(0)' },
          { transform: `translateY(${dy}px) scale(1.04)`, offset: 0.35 },
          { transform: 'translateY(0)' },
        ], 360);
        break;
      }
      case 'evade': {
        const c = center(ev.unit);
        if (c) fx.evade(c.p, c.s);
        animate(ev.unit, [
          { transform: 'translateX(0)', opacity: 1 },
          { transform: 'translateX(38%) skewX(-8deg)', opacity: 0.35, offset: 0.3 },
          { transform: 'translateX(0)', opacity: 1 },
        ], 480);
        break;
      }
      case 'damage': {
        const c = center(ev.unit);
        if (!c) break;
        const src = ev.source ? unit(ev.source) : null;
        const tint = src ? ELEMENTS[src.snap.element].glow : '#c88cff';
        if (ev.kind === 'cost') {
          fx.cost(c.p, c.s);
          fx.text(`-${ev.amount}`, { x: c.p.x, y: c.p.y - c.s * 0.2 }, '#ff8a80', c.s * 0.26, { sub: '捨て身' });
        } else if (ev.kind === 'attack' || ev.kind === 'followup' || ev.kind === 'sweep' || ev.kind === 'counter' || ev.kind === 'assist') {
          const strong = ev.aff === 'adv';
          if (src) fx.impact(src.snap.element, c.p, c.s, strong);
          const color = ev.aff === 'adv' ? '#ffd45e' : ev.aff === 'dis' ? '#b8b4c6' : '#ffffff';
          const sub = ev.capped ? '不動' : ev.execute ? '冥闇' : ev.aff === 'adv' ? '効果抜群' : ev.aff === 'dis' ? 'いまひとつ'
            : ev.kind === 'counter' ? '反撃' : ev.kind === 'assist' ? '援護' : undefined;
          fx.text(String(ev.amount), { x: c.p.x, y: c.p.y - c.s * 0.2 }, color, c.s * (strong ? 0.42 : ev.aff === 'dis' ? 0.28 : 0.34), { sub });
          if (strong || src?.snap.element === 'earth') shakeField(strong ? 7 : 5);
        } else if (ev.kind === 'splash') {
          const from = lastTarget.current ? center(lastTarget.current) : null;
          fx.splash(from ? from.p : c.p, c.p, c.s);
          fx.text(String(ev.amount), { x: c.p.x, y: c.p.y - c.s * 0.2 }, '#ffad6b', c.s * 0.26, { delay: 180 / speed, sub: '延焼' });
        } else {
          fx.bubbles(c.p, c.s, '#d9a6ff', 12);
          fx.text(String(ev.amount), { x: c.p.x, y: c.p.y - c.s * 0.2 }, '#d9a6ff', c.s * 0.28, { sub: '毒' });
        }
        animate(ev.unit, [
          { transform: 'translateX(0)', filter: 'brightness(1)' },
          { transform: 'translateX(-7px) rotate(-1.5deg)', filter: `brightness(1.9) drop-shadow(0 0 10px ${tint})`, offset: 0.15 },
          { transform: 'translateX(6px) rotate(1.2deg)', offset: 0.35 },
          { transform: 'translateX(-4px)', offset: 0.55 },
          { transform: 'translateX(2px)', offset: 0.75 },
          { transform: 'translateX(0)', filter: 'brightness(1)' },
        ], ev.kind === 'splash' ? 300 : 420);
        break;
      }
      case 'heal': {
        const c = center(ev.unit);
        if (!c) break;
        fx.heal(c.p, c.s, ev.kind === 'rain' ? 'rain' : ev.kind === 'skill' ? 'skill' : 'regen');
        fx.text(`+${ev.amount}`, { x: c.p.x, y: c.p.y - c.s * 0.1 }, '#9dffa0', c.s * 0.28, { delay: ev.kind === 'rain' ? 150 / speed : 0 });
        animate(ev.unit, [
          { filter: 'brightness(1)' },
          { filter: 'brightness(1.35) drop-shadow(0 0 12px #8dff9a)', offset: 0.4 },
          { filter: 'brightness(1)' },
        ], 520);
        break;
      }
      case 'endure': {
        const c = center(ev.unit);
        if (!c) break;
        fx.endure(c.p, c.s);
        fx.text('加護', { x: c.p.x, y: c.p.y - c.s * 0.35 }, '#ffe39a', c.s * 0.32, { delay: 120 / speed });
        animate(ev.unit, [
          { filter: 'brightness(1)' },
          { filter: 'brightness(2.2) drop-shadow(0 0 18px #ffe39a)', offset: 0.3 },
          { filter: 'brightness(1)' },
        ], 800);
        break;
      }
      case 'poison': {
        const c = center(ev.unit);
        if (c) {
          fx.bubbles(c.p, c.s, '#b673f0', 8);
          fx.text(`毒×${ev.stacks}`, { x: c.p.x, y: c.p.y + c.s * 0.1 }, '#d9a6ff', c.s * 0.2);
        }
        break;
      }
      case 'chill': {
        if (!ev.on) break;
        const c = center(ev.unit);
        if (c) {
          fx.chill(c.p, c.s);
          fx.text('凍え', { x: c.p.x, y: c.p.y + c.s * 0.1 }, '#c9f6ff', c.s * 0.2);
        }
        break;
      }
      case 'ko': {
        const c = center(ev.unit);
        if (c) fx.ko(c.p, c.s, unit(ev.unit).snap.element);
        shakeField(4);
        break;
      }
      case 'skill': {
        const u = unit(ev.unit);
        showCutin({ side: u.side, name: u.snap.name, title: SKILLS[ev.skill].name, sub: ev.via ? `${SKILLS[ev.via].name}で` : 'スキル', element: u.snap.element, kind: 'skill' });
        const c = center(ev.unit);
        if (c) fx.skillAura(c.p, c.s, ELEMENTS[u.snap.element].glow);
        animate(ev.unit, [
          { filter: 'brightness(1)', transform: 'scale(1)' },
          { filter: 'brightness(1.8)', transform: 'scale(1.08)', offset: 0.3 },
          { filter: 'brightness(1)', transform: 'scale(1)' },
        ], 700);
        if (ev.skill === 'mimic' && ev.target) {
          const t = center(ev.target);
          if (c && t && ev.element) fx.beam(t.p, c.p, ELEMENTS[ev.element].glow);
        }
        break;
      }
      case 'misfire': {
        const c = center(ev.unit);
        if (c) fx.misfire(c.p, c.s, SKILLS[ev.skill].name);
        break;
      }
      case 'cover': {
        const g = center(ev.unit);
        const t = center(ev.target);
        if (g && t) {
          fx.shield(t.p, g.s);
          fx.text('かばう', { x: g.p.x, y: g.p.y - g.s * 0.3 }, '#ffe7a8', g.s * 0.24);
          const dx = t.p.x - g.p.x;
          animate(ev.unit, [
            { transform: 'translateX(0)' },
            { transform: `translateX(${dx * 0.45}px) scale(1.05)`, offset: 0.35 },
            { transform: 'translateX(0)' },
          ], 420);
        }
        break;
      }
      case 'gauge': {
        const c = center(ev.unit);
        if (!c) break;
        if (ev.reason === 'hold') {
          fx.text('足止め', { x: c.p.x, y: c.p.y + c.s * 0.15 }, '#ffb3a8', c.s * 0.22);
          fx.gaugeDown(c.p, c.s);
        } else if (ev.reason === 'warlord') {
          fx.gaugeDown(c.p, c.s);
        } else if (ev.reason === 'spirit') {
          fx.gaugeUp(c.p, c.s, true);
        } else {
          fx.gaugeUp(c.p, c.s, false);
          if (ev.reason === 'first') fx.text('先手必勝', { x: c.p.x, y: c.p.y + c.s * 0.15 }, '#f0d394', c.s * 0.2);
        }
        break;
      }
      case 'revive': {
        const src = center(ev.source);
        if (src) fx.text('蘇生', { x: src.p.x, y: src.p.y - src.s * 0.3 }, '#ffe39a', src.s * 0.3);
        const c = ev.slot >= 0 ? center(ev.unit) : src;
        if (c) fx.revive(c.p, c.s);
        if (ev.slot >= 0) {
          animate(ev.unit, [
            { transform: 'translateY(30px) scale(0.8)', opacity: 0, filter: 'brightness(3)' },
            { transform: 'translateY(0) scale(1)', opacity: 1, filter: 'brightness(1)' },
          ], 800);
        }
        break;
      }
      case 'buff': {
        if (!ev.on) break;
        const c = center(ev.unit);
        if (!c) break;
        if (ev.buff === 'mimic' && ev.element) {
          fx.swirl(c.p, c.s, ELEMENTS[ev.element].glow);
          fx.text(`まね：${ELEMENTS[ev.element].name}`, { x: c.p.x, y: c.p.y + c.s * 0.2 }, ELEMENTS[ev.element].glow, c.s * 0.2);
        } else {
          fx.invert(c.p, c.s);
          fx.text('相性反転', { x: c.p.x, y: c.p.y + c.s * 0.2 }, '#e7c6ff', c.s * 0.2);
        }
        break;
      }
      case 'leader': {
        const u = unit(ev.unit);
        const c = center(ev.unit);
        if (ev.on) {
          showCutin({ side: u.side, name: `リーダー ${u.snap.name}`, title: LEADER_SKILLS[ev.skill].name, sub: 'リーダースキル', element: u.snap.element, kind: 'leader' });
          if (c) fx.crownBurst(c.p, c.s);
        } else if (c) {
          fx.text('リーダー離脱', { x: c.p.x, y: c.p.y }, '#ff9b92', c.s * 0.22);
        }
        break;
      }
      case 'end':
        setTimeout(() => setShowResult(true), 400 / speed);
        break;
      default:
        break;
    }
  };

  // 再生ループ
  useEffect(() => {
    if (!playing || idx >= events.length) return;
    const prev = idx > 0 ? events[idx - 1] : null;
    const wait = prev ? delayAfter(prev, events[idx]) : 450;
    const timer = setTimeout(() => {
      const ev = events[idx];
      const next = applyEvent(viewRef.current, ev);
      setView(next);
      setIdx(idx + 1);
      // 演出は盤面の描画（登場したカードの配置）が終わってから行う
      pendingFx.current.push({ ev, view: next });
    }, wait / speed);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, idx, speed, events]);

  // 描画の確定直後（画面に映る前）に、たまっている演出を実行する
  useLayoutEffect(() => {
    const list = pendingFx.current;
    pendingFx.current = [];
    for (const x of list) visualize(x.ev, x.view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  useEffect(() => {
    if (idx >= events.length) setPlaying(false);
  }, [idx, events.length]);

  /** 指定したイベント位置の直前の状態へ移動する */
  const seek = (to: number) => {
    let v = init;
    for (let i = 0; i < to; i++) {
      v = applyEvent(v, events[i]);
    }
    fxRef.current?.clear();
    pendingFx.current = [];
    setCutin(null);
    setView(v);
    setIdx(to);
    setShowResult(to >= events.length && !!v.ended);
  };

  const currentStep = useMemo(() => {
    let s = 0;
    for (let i = 0; i < steps.length; i++) if (steps[i] < idx) s = i;
    return s;
  }, [steps, idx]);

  // ログの自動スクロール
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [idx]);

  const shownLines = lines.filter((l) => l.index < idx);

  const slotUnit = (side: Side, slot: number): UnitView | null => slotOccupant(view, side, slot);

  const reserveList = (side: Side) =>
    view.order
      .map((id) => view.units[id])
      .filter((u) => u.side === side && !u.entered && u.reserveIndex >= 0)
      .sort((a, b) => a.reserveIndex - b.reserveIndex);

  const leaderOf = (side: Side) => {
    const id = view.order.find((x) => view.units[x].side === side && view.units[x].leader);
    return id ? view.units[id] : null;
  };

  const ended = view.ended;
  const done = idx >= events.length;

  const renderSide = (side: Side, team: TeamSnapshot) => {
    const reserves = reserveList(side);
    const total = view.order.filter((id) => view.units[id].side === side).length;
    const alive = view.order.filter((id) => view.units[id].side === side && view.units[id].alive).length;
    const reserveRow = (
      <div className="bench" aria-label="待機">
        <span className="bench-label">待機</span>
        {reserves.length === 0 ? (
          <span className="bench-empty">なし</span>
        ) : (
          reserves.map((u) => (
            <span key={u.id} className="bench-chip" style={{ ['--el' as string]: ELEMENTS[u.snap.element].color }}>
              <span className="dot" />
              {u.snap.name}
            </span>
          ))
        )}
        <span className="bench-count">残り {alive}/{total}</span>
      </div>
    );
    const row = (
      <div className="front-row">
        {[0, 1, 2].map((slot) => {
          const u = slotUnit(side, slot);
          return (
            <div key={slot} className="bslot">
              {u ? (
                <BattleUnit
                  key={u.id}
                  u={u}
                  acting={view.actor === u.id}
                  refFn={(el) => {
                    if (el) cardEls.current.set(u.id, el);
                    else cardEls.current.delete(u.id);
                  }}
                />
              ) : (
                <div className="bslot-empty" />
              )}
            </div>
          );
        })}
      </div>
    );
    return (
      <div className={`side side-${side.toLowerCase()}`}>
        <div className="side-name">
          <span className={`side-tag side-tag-${side.toLowerCase()}`}>{side}</span>
          <span className="side-team">{team.name}</span>
          {leaderOf(side) && (
            <span className={`side-leader${leaderOf(side)!.alive ? '' : ' down'}`}>
              <Crown />
              {LEADER_SKILLS[leaderOf(side)!.snap.leaderSkill ?? 'king'].name}
            </span>
          )}
        </div>
        {side === 'B' ? (
          <>
            {reserveRow}
            {row}
          </>
        ) : (
          <>
            {row}
            {reserveRow}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="battle">
      <div className="battle-top">
        <button type="button" className="btn btn-ghost" onClick={onClose}>← 戻る</button>
        <span className="battle-mode">{live ? '対戦' : 'リプレイ'}</span>
        {onToggleFavorite && (
          <button type="button" className={`btn btn-small fav${favorite ? ' on' : ''}`} onClick={onToggleFavorite} aria-pressed={!!favorite}>
            {favorite ? '★ お気に入り' : '☆ お気に入りに追加'}
          </button>
        )}
      </div>

      <div className="battle-main">
        <div className="field-wrap">
          <div className="field" ref={fieldRef}>
            {renderSide('B', teamB)}
            <div className="midline" aria-hidden="true"><span>VS</span></div>
            {renderSide('A', teamA)}
            <canvas ref={canvasRef} className="fx-canvas" aria-hidden="true" />
            {cutin && (
              <div
                key={cutin.key}
                className={`cutin cutin-${cutin.side.toLowerCase()} cutin-${cutin.kind}`}
                style={{
                  ['--el' as string]: ELEMENTS[cutin.element].color,
                  ['--el-glow' as string]: ELEMENTS[cutin.element].glow,
                  ['--cut-dur' as string]: `${1100 / speed}ms`,
                }}
                aria-hidden="true"
              >
                <div className="cutin-band">
                  <span className="cutin-sub">{cutin.kind === 'leader' && <Crown />}{cutin.sub}</span>
                  <span className="cutin-title">{cutin.title}</span>
                  <span className="cutin-name">{cutin.name}</span>
                </div>
              </div>
            )}
            {showResult && ended && (
              <div className="result">
                <div className={`result-card ${ended.winner === 'draw' ? 'draw' : `win-${ended.winner.toLowerCase()}`}`}>
                  <p className="result-label">{ended.reason === 'timeout' ? '時間切れ' : '決着'}</p>
                  <p className="result-title">
                    {ended.winner === 'draw' ? '引き分け' : `${ended.winner === 'A' ? teamA.name : teamB.name} の勝利`}
                  </p>
                  {ended.reason === 'timeout' && (
                    <p className="result-sub">残りHP {Math.round(ended.scoreA * 100)}% 対 {Math.round(ended.scoreB * 100)}%</p>
                  )}
                  <div className="result-actions">
                    <button type="button" className="btn" onClick={() => { seek(0); setPlaying(true); }}>最初から見る</button>
                    <button type="button" className="btn" onClick={() => setShowResult(false)}>盤面を見る</button>
                    <button type="button" className="btn btn-primary" onClick={onClose}>閉じる</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="controls">
            <button type="button" className="ctl" onClick={() => { seek(0); setPlaying(true); }} aria-label="最初から">⏮</button>
            <button
              type="button"
              className="ctl ctl-main"
              onClick={() => {
                if (done) {
                  seek(0);
                  setPlaying(true);
                } else setPlaying((p) => !p);
              }}
              aria-label={playing ? '一時停止' : '再生'}
            >
              {playing ? '❚❚' : '▶'}
            </button>
            <button type="button" className="ctl" onClick={() => { seek(events.length); setPlaying(false); }} aria-label="結果まで飛ばす">⏭</button>
            <div className="speed" role="group" aria-label="再生速度">
              {SPEEDS.map((s) => (
                <button key={s} type="button" className={`speed-btn${speed === s ? ' on' : ''}`} onClick={() => setSpeed(s)} aria-pressed={speed === s}>
                  ×{s}
                </button>
              ))}
            </div>
            <label className="seek" htmlFor="battle-seek">
              <span className="sr-only">再生位置</span>
              <input
                id="battle-seek"
                type="range"
                min={0}
                max={steps.length - 1}
                value={done ? steps.length - 1 : currentStep}
                onChange={(e) => {
                  const s = Number(e.target.value);
                  seek(s >= steps.length - 1 ? events.length : steps[s]);
                }}
              />
              <span className="seek-num">{done ? steps.length - 1 : currentStep}/{steps.length - 1}</span>
            </label>
          </div>
        </div>

        <section className="log" aria-label="戦闘ログ">
          <h3 className="log-title">戦闘ログ <span className="muted">行を押すとその場面へ</span></h3>
          <ol ref={logRef} className="log-list">
            {shownLines.map((l, i) => (
              <li key={i} className={`log-line tone-${l.tone} ${l.side ? `side-${l.side.toLowerCase()}` : ''}`}>
                <button
                  type="button"
                  onClick={() => {
                    let s = 0;
                    for (const st of steps) if (st <= l.index) s = st;
                    seek(s);
                  }}
                >
                  {l.text}
                </button>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

function BattleUnit({ u, acting, refFn }: { u: UnitView; acting: boolean; refFn(el: HTMLElement | null): void }) {
  const hpPct = (u.hp / u.maxHp) * 100;
  const e = ELEMENTS[u.snap.element];
  const skill = u.snap.skill;
  return (
    <div
      ref={refFn}
      className={`bunit${acting ? ' acting' : ''}${u.alive ? '' : ' ko'}${u.chilled ? ' chilled' : ''}${u.poison ? ' poisoned' : ''} side-${u.side.toLowerCase()}`}
      style={{ ['--el' as string]: e.color, ['--el-glow' as string]: e.glow }}
    >
      <CardFace name={u.snap.name} element={u.snap.element} style={u.snap.style} imageRef={u.snap.imageRef} size="sm" />
      {u.leader && <Crown className="bunit-crown" />}
      <div className="bunit-status">
        {u.poison > 0 && <span className="st st-poison">毒{u.poison}</span>}
        {u.chilled && <span className="st st-chill">凍</span>}
        {u.snap.element === 'light' && !u.endureUsed && u.alive && <span className="st st-light">護</span>}
        {u.mimicEl && <span className="st st-mimic" style={{ background: ELEMENTS[u.mimicEl].color }}>{ELEMENTS[u.mimicEl].name}</span>}
        {u.inverted && <span className="st st-invert">反</span>}
      </div>
      {skill && (
        <div className="bunit-skill" title={SKILLS[skill].text}>
          <span className="bunit-skill-name">{SKILLS[skill].name}</span>
          {u.chargeMax > 0 && !u.skillSpent && (
            <span className="pips" aria-label={`チャージ ${u.charge}/${u.chargeMax}`}>
              {Array.from({ length: u.chargeMax }, (_, i) => (
                <span key={i} className={`pip${i < u.charge ? ' on' : ''}${u.charge >= u.chargeMax ? ' full' : ''}`} />
              ))}
            </span>
          )}
          {u.skillSpent && <span className="pips-done">済</span>}
        </div>
      )}
      <div className="bunit-bars">
        <div className="hp">
          <span className={`hp-fill${hpPct < 30 ? ' low' : hpPct < 60 ? ' mid' : ''}`} style={{ width: `${hpPct}%` }} />
          <span className="hp-num">{u.hp}</span>
        </div>
        <div className="gauge">
          <span className="gauge-fill" style={{ width: `${u.gauge * 100}%` }} />
        </div>
      </div>
    </div>
  );
}
