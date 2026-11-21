/** シード固定の乱数（mulberry32）。同じシードなら同じ戦闘になる。 */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  pick<T>(arr: T[]): T {
    return arr[this.int(arr.length)];
  }
  weighted<T>(arr: T[], weight: (x: T) => number): T {
    const total = arr.reduce((s, x) => s + weight(x), 0);
    let r = this.next() * total;
    for (const x of arr) {
      r -= weight(x);
      if (r < 0) return x;
    }
    return arr[arr.length - 1];
  }
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}
