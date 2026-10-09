/** 整数格点上的哈希，落在 [0, 1) */
function hash(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(seed, 0x9e3779b9)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const fade = (t: number): number => t * t * (3 - 2 * t)

/** 平滑的值噪声，落在 [0, 1) */
export function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = fade(x - ix)
  const fy = fade(y - iy)
  const a = hash(ix, iy, seed)
  const b = hash(ix + 1, iy, seed)
  const c = hash(ix, iy + 1, seed)
  const d = hash(ix + 1, iy + 1, seed)
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
}

/** 分形叠加的值噪声：每层频率加倍、幅度减半，落在 [0, 1) */
export function fbm(x: number, y: number, seed: number, octaves: number): number {
  let sum = 0
  let amp = 0.5
  let norm = 0
  let f = 1
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(x * f, y * f, seed + o * 1013) * amp
    norm += amp
    amp *= 0.5
    f *= 2
  }
  return sum / norm
}

/** 细胞噪声里到次近与最近特征点的距离差：细胞交界处为 0，画裂纹用 */
export function cellEdge(x: number, y: number, seed: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  let f1 = 81
  let f2 = 81
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = ix + i
      const cy = iy + j
      const dx = cx + hash(cx, cy, seed) - x
      const dy = cy + hash(cx, cy, seed + 7) - y
      const d = dx * dx + dy * dy
      if (d < f1) {
        f2 = f1
        f1 = d
      } else if (d < f2) f2 = d
    }
  }
  return Math.sqrt(f2) - Math.sqrt(f1)
}

/** 细胞噪声里最近的特征点：(x, y) 相对它的偏移，与它自己的哈希 */
export function cellNearest(x: number, y: number, seed: number): { dx: number; dy: number; h: number } {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  let best = 81
  let dx = 0
  let dy = 0
  let h = 0
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = ix + i
      const cy = iy + j
      const ox = x - cx - hash(cx, cy, seed)
      const oy = y - cy - hash(cx, cy, seed + 7)
      const d = ox * ox + oy * oy
      if (d < best) {
        best = d
        dx = ox
        dy = oy
        h = hash(cx, cy, seed + 13)
      }
    }
  }
  return { dx, dy, h }
}
