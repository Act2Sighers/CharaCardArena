import { ELEMENTS } from '../core/elements';
import type { ElementId } from '../core/types';

/** 戦闘エフェクト用のキャンバス描画（パーティクルと時間付きの演出） */

export interface Pt {
  x: number;
  y: number;
}

type Shape = 'dot' | 'spark' | 'shard' | 'leaf' | 'bubble' | 'rock' | 'flake' | 'smoke' | 'drop';

interface Particle {
  x: number; y: number; vx: number; vy: number;
  ax: number; ay: number; drag: number;
  life: number; max: number;
  size: number; size2: number;
  color: string; shape: Shape;
  rot: number; vr: number;
  alpha: number;
  add: boolean;
}

interface Timed {
  t: number;
  dur: number;
  delay: number;
  draw(ctx: CanvasRenderingContext2D, p: number): void;
}

export const FLIGHT_MS = 330;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t;

export class FxLayer {
  private ctx: CanvasRenderingContext2D;
  private parts: Particle[] = [];
  private timed: Timed[] = [];
  private raf = 0;
  private last = 0;
  private w = 0;
  private h = 0;
  /** 再生速度（エフェクトの時間もこの倍率で進む） */
  speed = 1;
  /** 動きを減らす設定 */
  reduced = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(w: number, h: number) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  start() {
    const loop = (now: number) => {
      const dt = this.last ? Math.min(50, now - this.last) : 16;
      this.last = now;
      this.step(dt * this.speed);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.last = 0;
  }

  clear() {
    this.parts = [];
    this.timed = [];
    this.ctx.clearRect(0, 0, this.w, this.h);
  }

  private step(dt: number) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    const s = dt / 1000;

    // 時間付きの演出
    this.timed = this.timed.filter((e) => {
      e.t += dt;
      if (e.t < e.delay) return true;
      const p = (e.t - e.delay) / e.dur;
      if (p >= 1) return false;
      ctx.save();
      e.draw(ctx, p);
      ctx.restore();
      return true;
    });

    // パーティクル
    this.parts = this.parts.filter((q) => {
      q.life += dt;
      if (q.life >= q.max) return false;
      q.vx += q.ax * s;
      q.vy += q.ay * s;
      const d = Math.pow(q.drag, s * 60);
      q.vx *= d;
      q.vy *= d;
      q.x += q.vx * s;
      q.y += q.vy * s;
      q.rot += q.vr * s;
      const k = q.life / q.max;
      const a = q.alpha * (1 - k);
      const size = lerp(q.size, q.size2, k);
      ctx.save();
      ctx.globalCompositeOperation = q.add ? 'lighter' : 'source-over';
      ctx.globalAlpha = Math.max(0, a);
      drawParticle(ctx, q, size);
      ctx.restore();
      return true;
    });
  }

  private emit(p: Partial<Particle> & { x: number; y: number }) {
    if (this.reduced && this.parts.length > 220) return;
    this.parts.push({
      vx: 0, vy: 0, ax: 0, ay: 0, drag: 1, life: 0, max: 600, size: 4, size2: 0,
      color: '#fff', shape: 'dot', rot: Math.random() * Math.PI * 2, vr: 0, alpha: 1, add: true, ...p,
    });
  }

  private burst(at: Pt, n: number, opt: Partial<Particle> & { speed: [number, number] }) {
    const count = this.reduced ? Math.ceil(n / 2) : n;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = rand(opt.speed[0], opt.speed[1]);
      this.emit({ ...opt, x: at.x, y: at.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, max: (opt.max ?? 600) * rand(0.7, 1.2) });
    }
  }

  private add(draw: Timed['draw'], dur: number, delay = 0) {
    this.timed.push({ t: 0, dur, delay, draw });
  }

  private ring(at: Pt, color: string, r0: number, r1: number, dur: number, width = 3, delay = 0) {
    this.add((ctx, p) => {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1 - p;
      ctx.strokeStyle = color;
      ctx.lineWidth = width * (1 - p) + 0.5;
      ctx.beginPath();
      ctx.arc(at.x, at.y, lerp(r0, r1, easeOut(p)), 0, Math.PI * 2);
      ctx.stroke();
    }, dur, delay);
  }

  private flash(at: Pt, color: string, r: number, dur = 260) {
    this.add((ctx, p) => {
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, r);
      g.addColorStop(0, withAlpha(color, 0.9 * (1 - p)));
      g.addColorStop(1, withAlpha(color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(at.x, at.y, r, 0, Math.PI * 2);
      ctx.fill();
    }, dur);
  }

  /** 画面全体の閃光 */
  screenFlash(color: string, dur = 180, alpha = 0.35) {
    this.add((ctx, p) => {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = withAlpha(color, alpha * (1 - p));
      ctx.fillRect(0, 0, this.w, this.h);
    }, dur);
  }

  /** 浮かび上がる文字 */
  text(str: string, at: Pt, color: string, size: number, opts: { sub?: string; delay?: number; outline?: string } = {}) {
    const ox = rand(-6, 6);
    this.add((ctx, p) => {
      const y = at.y - easeOut(Math.min(1, p * 1.6)) * size * 1.4;
      const pop = p < 0.12 ? 0.6 + (p / 0.12) * 0.55 : p < 0.22 ? 1.15 - ((p - 0.12) / 0.1) * 0.15 : 1;
      ctx.globalAlpha = p > 0.7 ? (1 - p) / 0.3 : 1;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.round(size * pop)}px "Chakra Petch", "Zen Kaku Gothic New", system-ui, sans-serif`;
      ctx.lineWidth = Math.max(3, size * 0.16);
      ctx.strokeStyle = opts.outline ?? 'rgba(10,10,16,0.85)';
      ctx.strokeText(str, at.x + ox, y);
      ctx.fillStyle = color;
      ctx.fillText(str, at.x + ox, y);
      if (opts.sub) {
        ctx.font = `700 ${Math.round(size * 0.42)}px "Zen Kaku Gothic New", system-ui, sans-serif`;
        ctx.lineWidth = 3;
        ctx.strokeText(opts.sub, at.x + ox, y - size * 0.78);
        ctx.fillText(opts.sub, at.x + ox, y - size * 0.78);
      }
    }, 950, opts.delay ?? 0);
  }

  // ===================== 属性ごとの攻撃演出 =====================

  /** 攻撃開始（飛翔体など）。着弾は impact で描く */
  attack(el: ElementId, from: Pt, to: Pt, s: number, followup = false) {
    const c = ELEMENTS[el];
    const F = FLIGHT_MS;
    const dir = Math.atan2(to.y - from.y, to.x - from.x);
    switch (el) {
      case 'fire': {
        this.add((ctx, p) => {
          const t = easeIn(p);
          const x = lerp(from.x, to.x, t);
          const y = lerp(from.y, to.y, t) - Math.sin(p * Math.PI) * s * 0.25;
          ctx.globalCompositeOperation = 'lighter';
          const r = s * 0.22;
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, '#fff7d1');
          g.addColorStop(0.35, '#ffb347');
          g.addColorStop(1, 'rgba(224,65,47,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
          for (let i = 0; i < 3; i++) {
            this.emit({ x, y, vx: rand(-40, 40), vy: rand(-60, 10), max: 380, size: rand(3, 7) * s / 90, color: Math.random() < 0.5 ? '#ff9b3d' : '#ff5a2a', drag: 0.95 });
          }
        }, F);
        break;
      }
      case 'water': {
        for (let i = 0; i < 14; i++) {
          const delay = i * 14;
          const off = rand(-0.1, 0.1) * s;
          this.add((ctx, p) => {
            const t = easeIn(p);
            const x = lerp(from.x, to.x, t) + off;
            const y = lerp(from.y, to.y, t) - Math.sin(p * Math.PI) * s * 0.55 + off;
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = withAlpha(c.glow, 0.85);
            ctx.beginPath();
            ctx.ellipse(x, y, s * 0.05, s * 0.035, dir, 0, Math.PI * 2);
            ctx.fill();
          }, F - 60, delay);
        }
        break;
      }
      case 'thunder': {
        // 溜めの火花
        this.burst(from, 14, { speed: [60, 180], max: 280, size: 2.5, size2: 0, color: c.glow, shape: 'spark', drag: 0.9 });
        this.flash(from, c.color, s * 0.5, 220);
        break;
      }
      case 'poison': {
        for (let i = 0; i < 4; i++) {
          const off = rand(-0.18, 0.18) * s;
          this.add((ctx, p) => {
            const x = lerp(from.x, to.x + off, p);
            const y = lerp(from.y, to.y + off * 0.5, p) - Math.sin(p * Math.PI) * s * 0.9;
            ctx.globalCompositeOperation = 'lighter';
            const r = s * 0.09;
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, '#f1d2ff');
            g.addColorStop(0.5, c.color);
            g.addColorStop(1, 'rgba(154,79,214,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
          }, F, i * 40);
        }
        break;
      }
      case 'grass': {
        for (let i = 0; i < 9; i++) {
          const phase = (i / 9) * Math.PI * 2;
          this.add((ctx, p) => {
            const t = easeIn(p);
            const rr = s * 0.3 * (1 - t);
            const x = lerp(from.x, to.x, t) + Math.cos(phase + p * 9) * rr;
            const y = lerp(from.y, to.y, t) + Math.sin(phase + p * 9) * rr;
            ctx.translate(x, y);
            ctx.rotate(phase + p * 12);
            ctx.fillStyle = i % 2 ? c.glow : c.color;
            ctx.beginPath();
            ctx.ellipse(0, 0, s * 0.07, s * 0.03, 0, 0, Math.PI * 2);
            ctx.fill();
          }, F, i * 10);
        }
        break;
      }
      case 'ice': {
        for (let i = 0; i < 5; i++) {
          const off = (i - 2) * s * 0.09;
          const nx = -Math.sin(dir) * off;
          const ny = Math.cos(dir) * off;
          this.add((ctx, p) => {
            const t = easeIn(p);
            const x = lerp(from.x + nx, to.x + nx * 0.2, t);
            const y = lerp(from.y + ny, to.y + ny * 0.2, t);
            ctx.globalCompositeOperation = 'lighter';
            ctx.translate(x, y);
            ctx.rotate(dir);
            ctx.fillStyle = '#e9fbff';
            ctx.strokeStyle = c.color;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(s * 0.13, 0);
            ctx.lineTo(-s * 0.06, s * 0.035);
            ctx.lineTo(-s * 0.1, 0);
            ctx.lineTo(-s * 0.06, -s * 0.035);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }, F - i * 15, i * 15);
        }
        break;
      }
      case 'earth': {
        // 上空から岩が落ちてくる
        for (let i = 0; i < 6; i++) {
          const sx = to.x + rand(-0.4, 0.4) * s;
          const size = rand(0.07, 0.14) * s;
          const rot0 = rand(0, 6);
          const top = to.y - s * 2.2 - rand(0, s * 0.4);
          const pts = rockShape();
          this.add((ctx, p) => {
            const y = lerp(top, to.y + rand(-2, 2), easeIn(p));
            ctx.translate(sx + (to.x - sx) * p * 0.6, y);
            ctx.rotate(rot0 + p * 4);
            ctx.fillStyle = i % 2 ? '#8a5a2b' : '#b87a3c';
            ctx.strokeStyle = '#3d2410';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            pts.forEach(([a, r], k) => {
              const px = Math.cos(a) * r * size;
              const py = Math.sin(a) * r * size;
              if (k) ctx.lineTo(px, py);
              else ctx.moveTo(px, py);
            });
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }, F, i * 18);
        }
        break;
      }
      case 'wind': {
        for (let i = 0; i < 7; i++) {
          const off = rand(-0.3, 0.3) * s;
          this.add((ctx, p) => {
            const t = easeOut(p);
            const x = lerp(from.x, to.x, t);
            const y = lerp(from.y, to.y, t) + off;
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = withAlpha(c.glow, 0.8 * (1 - p * 0.5));
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x - Math.cos(dir) * s * 0.4, y - Math.sin(dir) * s * 0.4);
            ctx.lineTo(x, y);
            ctx.stroke();
          }, F, i * 20);
        }
        break;
      }
      case 'light': {
        this.add((ctx, p) => {
          ctx.globalCompositeOperation = 'lighter';
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2 + p * 2;
            const r = s * 0.6 * (1 - p);
            ctx.fillStyle = withAlpha('#fffbe8', 0.9);
            ctx.beginPath();
            ctx.arc(from.x + Math.cos(a) * r, from.y + Math.sin(a) * r, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }, F * 0.8);
        this.flash(from, '#fff6cf', s * 0.6, F);
        break;
      }
      case 'dark': {
        for (let i = 0; i < 3; i++) {
          const phase = (i / 3) * Math.PI * 2;
          this.add((ctx, p) => {
            const t = easeIn(p);
            const rr = s * 0.25 * (1 - t);
            const x = lerp(from.x, to.x, t) + Math.cos(phase + p * 10) * rr;
            const y = lerp(from.y, to.y, t) + Math.sin(phase + p * 10) * rr;
            const r = s * 0.12;
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, 'rgba(20,6,30,0.95)');
            g.addColorStop(0.6, withAlpha(c.glow, 0.5));
            g.addColorStop(1, 'rgba(60,20,90,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
          }, F, i * 25);
        }
        break;
      }
    }
    if (followup) this.text('追撃', from, c.glow, s * 0.22);
  }

  /** 着弾（ダメージ発生時） */
  impact(el: ElementId, at: Pt, s: number, strong: boolean) {
    const c = ELEMENTS[el];
    const k = strong ? 1.4 : 1;
    switch (el) {
      case 'fire':
        this.flash(at, '#ff8a3d', s * 0.9 * k, 320);
        this.burst(at, 34, { speed: [80, 320 * k], max: 700, size: 6 * s / 90, size2: 0, color: '#ff7a2f', drag: 0.92, ay: -120 });
        this.burst(at, 16, { speed: [40, 160], max: 900, size: 4, size2: 0, color: '#ffd36b', shape: 'spark', drag: 0.9, ay: -200 });
        this.ring(at, '#ffb36b', s * 0.1, s * 0.9 * k, 420, 4);
        break;
      case 'water':
        this.ring(at, c.glow, s * 0.1, s * 0.75 * k, 480, 3);
        this.ring(at, c.color, s * 0.05, s * 0.5 * k, 520, 2, 90);
        this.burst(at, 26, { speed: [120, 300 * k], max: 700, size: 4.5 * s / 90, size2: 1, color: c.glow, shape: 'drop', ay: 600, drag: 0.97 });
        this.flash(at, c.color, s * 0.6, 260);
        break;
      case 'thunder': {
        const top: Pt = { x: at.x + rand(-s * 0.3, s * 0.3), y: Math.max(0, at.y - s * 2.6) };
        const path = boltPath(top, at, 9, s * 0.18);
        const branch = boltPath(path[3], { x: at.x + rand(-s * 0.6, s * 0.6), y: at.y + rand(-s * 0.2, s * 0.3) }, 5, s * 0.12);
        this.add((ctx, p) => {
          const flick = p < 0.5 ? 1 : Math.random() < 0.5 ? 0.3 : 1;
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = (1 - p) * flick;
          for (const [w, col] of [[9, withAlpha(c.color, 0.35)], [4, c.glow], [1.6, '#ffffff']] as const) {
            ctx.strokeStyle = col;
            ctx.lineWidth = w;
            ctx.lineJoin = 'round';
            for (const pts of [path, branch]) {
              ctx.beginPath();
              pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
              ctx.stroke();
            }
          }
        }, 300);
        this.screenFlash('#fff6b0', 140, strong ? 0.45 : 0.28);
        this.burst(at, 24, { speed: [120, 380 * k], max: 420, size: 3, size2: 0, color: c.glow, shape: 'spark', drag: 0.88 });
        this.flash(at, c.color, s * 0.7 * k, 260);
        break;
      }
      case 'poison':
        this.flash(at, c.color, s * 0.7, 300);
        this.burst(at, 20, { speed: [40, 200], max: 700, size: 7 * s / 90, size2: 2, color: c.color, drag: 0.92 });
        this.bubbles(at, s, c.glow, 10);
        break;
      case 'grass':
        this.burst(at, 26, { speed: [80, 260 * k], max: 800, size: 6 * s / 90, size2: 3, color: c.color, shape: 'leaf', vr: 8, drag: 0.93, ay: 60 });
        this.burst(at, 14, { speed: [30, 120], max: 700, size: 3, size2: 0, color: c.glow, drag: 0.95, ay: -40 });
        this.ring(at, c.glow, s * 0.1, s * 0.7 * k, 420, 3);
        break;
      case 'ice':
        this.flash(at, '#dffbff', s * 0.8 * k, 280);
        this.burst(at, 22, { speed: [80, 300 * k], max: 700, size: 7 * s / 90, size2: 2, color: '#e9fbff', shape: 'shard', vr: 6, drag: 0.92 });
        this.burst(at, 10, { speed: [20, 90], max: 1100, size: 6 * s / 90, size2: 3, color: c.glow, shape: 'flake', vr: 2, drag: 0.96, ay: 30 });
        this.ring(at, c.color, s * 0.15, s * 0.8 * k, 460, 3);
        break;
      case 'earth':
        this.burst(at, 18, { speed: [60, 240 * k], max: 800, size: 6 * s / 90, size2: 3, color: '#a06a35', shape: 'rock', vr: 6, ay: 700, drag: 0.98, add: false });
        this.burst(at, 12, { speed: [20, 80], max: 900, size: 16 * s / 90, size2: 30 * s / 90, color: 'rgba(190,150,100,1)', shape: 'smoke', alpha: 0.35, add: false });
        this.ring(at, c.glow, s * 0.2, s * 1.0 * k, 400, 4);
        break;
      case 'wind':
        for (let i = 0; i < 3; i++) {
          const a0 = rand(-0.9, -0.2) + i * 0.15;
          const cx = at.x + rand(-s * 0.1, s * 0.1);
          const cy = at.y + rand(-s * 0.2, s * 0.2);
          this.add((ctx, p) => {
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = withAlpha(i === 1 ? '#ffffff' : c.glow, 1 - p);
            ctx.lineWidth = 3.5 * (1 - p) + 0.5;
            ctx.lineCap = 'round';
            ctx.beginPath();
            const r = s * (0.45 + i * 0.08);
            ctx.arc(cx - r * 0.6, cy + r * 0.3, r, a0, a0 + easeOut(p) * 1.6);
            ctx.stroke();
          }, 320, i * 70);
        }
        this.burst(at, 16, { speed: [100, 300], max: 500, size: 2.5, size2: 0, color: c.glow, shape: 'spark', drag: 0.9 });
        break;
      case 'light': {
        const w = s * 0.5 * k;
        this.add((ctx, p) => {
          ctx.globalCompositeOperation = 'lighter';
          const a = p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8;
          const g = ctx.createLinearGradient(at.x - w, 0, at.x + w, 0);
          g.addColorStop(0, 'rgba(255,248,214,0)');
          g.addColorStop(0.5, withAlpha('#fffbe8', 0.85 * a));
          g.addColorStop(1, 'rgba(255,248,214,0)');
          ctx.fillStyle = g;
          ctx.fillRect(at.x - w, 0, w * 2, at.y + s * 0.3);
        }, 520);
        this.flash(at, '#fff6cf', s * 0.9 * k, 380);
        this.burst(at, 20, { speed: [20, 120], max: 1000, size: 3, size2: 0, color: '#fffbe8', drag: 0.95, ay: -90 });
        this.ring(at, '#fff3c4', s * 0.1, s * 0.8, 500, 2);
        break;
      }
      case 'dark':
        this.add((ctx, p) => {
          const r = s * 0.9 * (1 - easeIn(p)) + 2;
          ctx.globalCompositeOperation = 'source-over';
          const g = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, r);
          g.addColorStop(0, `rgba(8,2,14,${0.85 * (1 - p)})`);
          g.addColorStop(0.7, withAlpha(c.glow, 0.35 * (1 - p)));
          g.addColorStop(1, 'rgba(40,10,60,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(at.x, at.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = withAlpha(c.glow, 0.7 * (1 - p));
          ctx.lineWidth = 2;
          for (let k2 = 0; k2 < 3; k2++) {
            ctx.beginPath();
            ctx.arc(at.x, at.y, r * (0.5 + k2 * 0.2), p * 8 + k2 * 2, p * 8 + k2 * 2 + 1.8);
            ctx.stroke();
          }
        }, 460);
        // 吸い込まれる粒
        for (let i = 0; i < (this.reduced ? 8 : 18); i++) {
          const a = Math.random() * Math.PI * 2;
          const d = s * rand(0.6, 1.1);
          this.emit({ x: at.x + Math.cos(a) * d, y: at.y + Math.sin(a) * d, vx: -Math.cos(a) * d * 2.4, vy: -Math.sin(a) * d * 2.4, max: 420, size: 3.5, size2: 0, color: c.glow, drag: 0.98 });
        }
        this.burst(at, 14, { speed: [60, 220 * k], max: 600, size: 5 * s / 90, size2: 0, color: '#6a3aa0', drag: 0.92 }, );
        break;
    }
  }

  /** 延焼（両隣への飛び火） */
  splash(from: Pt, to: Pt, s: number) {
    this.add((ctx, p) => {
      const x = lerp(from.x, to.x, p);
      const y = lerp(from.y, to.y, p) - Math.sin(p * Math.PI) * s * 0.35;
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x, y, 0, x, y, s * 0.12);
      g.addColorStop(0, '#ffe9b0');
      g.addColorStop(1, 'rgba(255,90,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, s * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }, 220);
    setTimeout(() => {
      this.flash(to, '#ff7a2f', s * 0.5, 260);
      this.burst(to, 14, { speed: [40, 160], max: 600, size: 4, size2: 0, color: '#ff8a3d', drag: 0.92, ay: -150 });
    }, 200 / this.speed);
  }

  bubbles(at: Pt, s: number, color: string, n: number) {
    for (let i = 0; i < (this.reduced ? Math.ceil(n / 2) : n); i++) {
      this.emit({
        x: at.x + rand(-0.3, 0.3) * s, y: at.y + rand(-0.1, 0.3) * s,
        vx: rand(-15, 15), vy: rand(-90, -40), max: rand(700, 1100),
        size: rand(3, 7) * s / 90, size2: rand(5, 9) * s / 90, color, shape: 'bubble', drag: 0.99,
      });
    }
  }

  /** 回復 */
  heal(at: Pt, s: number, kind: 'rain' | 'regen') {
    if (kind === 'rain') {
      for (let i = 0; i < (this.reduced ? 8 : 18); i++) {
        this.emit({
          x: at.x + rand(-0.45, 0.45) * s, y: at.y - s * rand(0.9, 1.4),
          vx: 0, vy: rand(320, 460), max: rand(260, 360), size: 2.5, size2: 2, color: '#a9d6ff', shape: 'spark', alpha: 0.9,
        });
      }
      this.ring(at, '#8cc4ff', s * 0.1, s * 0.55, 500, 2, 200);
    } else {
      this.burst(at, 12, { speed: [10, 50], max: 1000, size: 4 * s / 90, size2: 2, color: '#9be58f', shape: 'leaf', vr: 3, ay: -70, drag: 0.97 });
    }
    this.burst({ x: at.x, y: at.y + s * 0.3 }, 12, { speed: [5, 30], max: 1000, size: 3, size2: 0, color: '#b8ffb0', ay: -110, drag: 0.98 });
  }

  /** 光の加護で踏みとどまる */
  endure(at: Pt, s: number) {
    this.add((ctx, p) => {
      ctx.globalCompositeOperation = 'lighter';
      const a = p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85;
      const w = s * 0.75;
      const g = ctx.createLinearGradient(at.x - w, 0, at.x + w, 0);
      g.addColorStop(0, 'rgba(255,220,120,0)');
      g.addColorStop(0.5, `rgba(255,236,170,${0.75 * a})`);
      g.addColorStop(1, 'rgba(255,220,120,0)');
      ctx.fillStyle = g;
      ctx.fillRect(at.x - w, 0, w * 2, this.h);
    }, 900);
    this.ring(at, '#ffe39a', s * 0.2, s * 1.1, 700, 4);
    this.burst(at, 26, { speed: [30, 140], max: 1200, size: 3.5, size2: 0, color: '#fff1c2', ay: -120, drag: 0.96 });
    this.screenFlash('#fff1c2', 220, 0.25);
  }

  /** 凍える */
  chill(at: Pt, s: number) {
    this.burst(at, 12, { speed: [20, 80], max: 1100, size: 7 * s / 90, size2: 3, color: '#c9f6ff', shape: 'flake', vr: 2, drag: 0.95, ay: 40 });
  }

  /** 撃破 */
  ko(at: Pt, s: number, el: ElementId) {
    const c = ELEMENTS[el];
    this.burst(at, 30, { speed: [60, 280], max: 1000, size: 8 * s / 90, size2: 2, color: '#a8a39a', shape: 'shard', vr: 8, ay: 500, drag: 0.98, add: false });
    this.burst(at, 18, { speed: [40, 200], max: 900, size: 6 * s / 90, size2: 0, color: c.glow, shape: 'shard', vr: 6, ay: 300, drag: 0.97 });
    this.ring(at, withAlpha(c.glow, 0.9), s * 0.2, s * 1.2, 600, 3);
  }

  /** 登場 */
  enter(at: Pt, s: number, el: ElementId, initial: boolean) {
    const c = ELEMENTS[el];
    this.ring(at, c.glow, s * 0.1, s * (initial ? 0.8 : 1.2), initial ? 450 : 650, initial ? 2 : 4);
    this.flash(at, c.color, s * (initial ? 0.6 : 1.0), initial ? 280 : 420);
    if (!initial) {
      this.add((ctx, p) => {
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(at.x, at.y);
        for (let i = 0; i < 12; i++) {
          ctx.rotate((Math.PI * 2) / 12);
          ctx.fillStyle = withAlpha(c.glow, 0.45 * (1 - p));
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(s * 1.4 * easeOut(p), -s * 0.06);
          ctx.lineTo(s * 1.4 * easeOut(p), s * 0.06);
          ctx.closePath();
          ctx.fill();
        }
      }, 600);
      this.burst(at, 24, { speed: [80, 260], max: 800, size: 4, size2: 0, color: c.glow, drag: 0.92 });
    }
  }

  /** 回避（風） */
  evade(at: Pt, s: number) {
    this.burst(at, 14, { speed: [120, 260], max: 450, size: 2.5, size2: 0, color: '#d2fff1', shape: 'spark', drag: 0.9 });
    this.text('MISS', at, '#d2fff1', s * 0.26);
  }
}

function drawParticle(ctx: CanvasRenderingContext2D, q: Particle, size: number) {
  switch (q.shape) {
    case 'dot': {
      const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, size * 2);
      g.addColorStop(0, q.color);
      g.addColorStop(1, withAlpha(q.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(q.x, q.y, size * 2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'spark': {
      ctx.strokeStyle = q.color;
      ctx.lineWidth = Math.max(1, size * 0.6);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(q.x, q.y);
      ctx.lineTo(q.x - q.vx * 0.04, q.y - q.vy * 0.04);
      ctx.stroke();
      break;
    }
    case 'drop': {
      ctx.fillStyle = q.color;
      ctx.translate(q.x, q.y);
      ctx.rotate(Math.atan2(q.vy, q.vx));
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 1.6, size * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'shard': {
      ctx.fillStyle = q.color;
      ctx.translate(q.x, q.y);
      ctx.rotate(q.rot);
      ctx.beginPath();
      ctx.moveTo(size, 0);
      ctx.lineTo(-size * 0.6, size * 0.5);
      ctx.lineTo(-size * 0.4, -size * 0.6);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'leaf': {
      ctx.fillStyle = q.color;
      ctx.translate(q.x, q.y);
      ctx.rotate(q.rot);
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 1.4, size * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'bubble': {
      ctx.strokeStyle = q.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(q.x, q.y, size, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'rock': {
      ctx.fillStyle = q.color;
      ctx.translate(q.x, q.y);
      ctx.rotate(q.rot);
      ctx.fillRect(-size / 2, -size / 2, size, size * 0.8);
      break;
    }
    case 'flake': {
      ctx.strokeStyle = q.color;
      ctx.lineWidth = 1.3;
      ctx.translate(q.x, q.y);
      ctx.rotate(q.rot);
      for (let i = 0; i < 3; i++) {
        ctx.rotate(Math.PI / 3);
        ctx.beginPath();
        ctx.moveTo(-size, 0);
        ctx.lineTo(size, 0);
        ctx.stroke();
      }
      break;
    }
    case 'smoke': {
      const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, size);
      g.addColorStop(0, q.color);
      g.addColorStop(1, withAlpha(q.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(q.x, q.y, size, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
}

function boltPath(a: Pt, b: Pt, n: number, jitter: number): Pt[] {
  const pts: Pt[] = [a];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    pts.push({ x: lerp(a.x, b.x, t) + rand(-jitter, jitter), y: lerp(a.y, b.y, t) + rand(-jitter * 0.3, jitter * 0.3) });
  }
  pts.push(b);
  return pts;
}

function rockShape(): [number, number][] {
  const n = 6 + Math.floor(Math.random() * 3);
  return Array.from({ length: n }, (_, i) => [(i / n) * Math.PI * 2, rand(0.7, 1.1)] as [number, number]);
}

/** #rrggbb / rgba() に透明度を付ける */
export function withAlpha(color: string, a: number): string {
  if (color.startsWith('#')) {
    const n = parseInt(color.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a))})`;
  }
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b] = m[1].split(',').map((x) => x.trim());
    return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
  }
  return color;
}
