/**
 * 种子化伪随机数生成器（mulberry32）。
 * 游戏内一切随机行为必须经由它，保证相同种子可复现，便于单测与回放。
 */
export class Rng {
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0
  }

  /** 返回 [0, 1) 内的浮点数。 */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** 返回 [min, max] 内的整数，两端都包含。 */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1))
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick: 数组为空')
    return items[this.int(0, items.length - 1)]!
  }

  chance(probability: number): boolean {
    return this.next() < probability
  }
}
