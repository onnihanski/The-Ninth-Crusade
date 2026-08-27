// Seeded PRNG (mulberry32).
//
// Determinism is load-bearing in a roguelike: the same seed must produce the
// same dungeon, the same monster placement, the same damage rolls. That makes
// bugs reproducible and lets players share seeds. Everything random in this
// game goes through one RNG instance owned by the Game.
export class RNG {
  constructor(seed = (Math.random() * 0xffffffff) >>> 0) {
    this.seed = seed >>> 0;
    this._state = this.seed;
  }

  float() {
    this._state = (this._state + 0x6d2b79f5) >>> 0;
    let t = this._state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Inclusive on both ends. */
  int(min, max) {
    return min + Math.floor(this.float() * (max - min + 1));
  }

  chance(p) {
    return this.float() < p;
  }

  pick(arr) {
    return arr[this.int(0, arr.length - 1)];
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Pick from [{ weight, ... }]; missing weights count as 1. */
  weighted(entries) {
    const total = entries.reduce((sum, e) => sum + (e.weight ?? 1), 0);
    let roll = this.float() * total;
    for (const entry of entries) {
      roll -= entry.weight ?? 1;
      if (roll <= 0) return entry;
    }
    return entries[entries.length - 1];
  }
}
