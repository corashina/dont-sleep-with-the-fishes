export class Rng {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

export function weightedPick(
  rng: Rng,
  items: { weight: number }[],
  fallbackIndex: number,
): number {
  const total = items.reduce((s, i) => s + Math.max(0, i.weight), 0);
  if (total <= 0) return fallbackIndex;
  let r = rng.next() * total;
  for (let i = 0; i < items.length; i++) {
    const w = Math.max(0, items[i].weight);
    if (r < w) return i;
    r -= w;
  }
  return fallbackIndex;
}
