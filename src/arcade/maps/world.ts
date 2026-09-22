import type { MapDecor } from '../../types/maps'
import type { DecorInstance } from '../../types/maps'
import { Rng } from '../../util/rng'
import type { Point } from '../../util/vec'

/** 按轴距离（Chebyshev 方形） */
export function isWithinActive(dx: number, dy: number, half: number): boolean {
  return Math.abs(dx) <= half && Math.abs(dy) <= half
}

/** 面积均匀 */
export function ringPoint(rng: Rng, center: Point, rMin: number, rMax: number): Point {
  const r = Math.sqrt(rMin * rMin + rng.next() * (rMax * rMax - rMin * rMin))
  const a = rng.next() * Math.PI * 2
  return { x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r }
}

// ── 装饰分块 ──
// 每格的随机流由 (种子, 格坐标) 哈希派生：任何访问顺序、任何块划分都得到同一摆放

/** [0,1)，负坐标安全 */
function hash01(seed: number, x: number, y: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0
  h = Math.imul(h ^ (x | 0), 0x85ebca6b) >>> 0
  h = (h ^ (h >>> 13)) >>> 0
  h = Math.imul(h ^ (y | 0), 0xc2b2ae35) >>> 0
  h = (h ^ (h >>> 16)) >>> 0
  return h / 0x100000000
}

/** 晶格值来自 hash01，平滑双线性 */
function worldNoise(seed: number, xU: number, yU: number, waveU: number): number {
  const gx = xU / waveU
  const gy = yU / waveU
  const ix = Math.floor(gx)
  const iy = Math.floor(gy)
  const smooth = (t: number): number => t * t * (3 - 2 * t)
  const fx = smooth(gx - ix)
  const fy = smooth(gy - iy)
  const v00 = hash01(seed, ix, iy)
  const v10 = hash01(seed, ix + 1, iy)
  const v01 = hash01(seed, ix, iy + 1)
  const v11 = hash01(seed, ix + 1, iy + 1)
  return (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy
}

/** 负坐标正确 */
function chunkOf(xU: number, chunkCells: number): number {
  return Math.floor(xU / chunkCells)
}

/** 外扩 pad 块 */
export function chunksInRect(
  x0U: number,
  y0U: number,
  x1U: number,
  y1U: number,
  chunkCells: number,
  pad: number,
): { cx: number; cy: number }[] {
  const cx0 = chunkOf(x0U, chunkCells) - pad
  const cy0 = chunkOf(y0U, chunkCells) - pad
  const cx1 = chunkOf(x1U, chunkCells) + pad
  const cy1 = chunkOf(y1U, chunkCells) + pad
  const out: { cx: number; cy: number }[] = []
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) out.push({ cx, cy })
  }
  return out
}

export function chunkKey(cx: number, cy: number): string {
  return `${cx},${cy}`
}

/** 完全确定：同 (seed, 块) 任何时刻重建结果一致 */
export function chunkDecor(
  def: MapDecor,
  seed: number,
  cx: number,
  cy: number,
  chunkCells: number,
): DecorInstance[] {
  // 密度基准只由种子决定
  const densityRoll = hash01(seed, 0x5eed, 0x5eed)
  const density = def.density[0] + densityRoll * (def.density[1] - def.density[0])
  const out: DecorInstance[] = []
  const x0 = cx * chunkCells
  const y0 = cy * chunkCells
  for (let dy = 0; dy < chunkCells; dy++) {
    for (let dx = 0; dx < chunkCells; dx++) {
      const xU = x0 + dx
      const yU = y0 + dy
      const rng = new Rng((hash01(seed ^ 0x00d5c0de, xU, yU) * 0xffffffff) >>> 0)
      const local =
        density * (0.15 + 1.7 * Math.pow(worldNoise(seed, xU + 0.5, yU + 0.5, 6), 1.5))
      if (rng.next() >= local) continue
      const emoji =
        def.emojis[Math.min(def.emojis.length - 1, Math.floor(rng.next() * def.emojis.length))]!
      const sizeU = def.sizeU[0] + rng.next() * (def.sizeU[1] - def.sizeU[0])
      out.push({
        emoji,
        xU: xU + 0.5 + (rng.next() * 2 - 1) * 1.1,
        yU: yU + 0.5 + (rng.next() * 2 - 1) * 1.1,
        sizeU,
        alpha: def.alpha[0] + rng.next() * (def.alpha[1] - def.alpha[0]),
        rotation: (rng.next() * 2 - 1) * Math.PI,
      })
    }
  }
  return out
}

// ── 终波缩圈 ──

export interface ZoneDef {
  readonly r0: number
  readonly rMin: number
  readonly holdMs: number
  readonly shrinkEndMs: number
}

/** 观察期恒 r0 → 线性收缩 → 恒 rMin */
export function zoneRadiusAt(tMs: number, def: ZoneDef): number {
  if (tMs <= def.holdMs) return def.r0
  if (tMs >= def.shrinkEndMs) return def.rMin
  const k = (tMs - def.holdMs) / (def.shrinkEndMs - def.holdMs)
  return def.r0 + (def.rMin - def.r0) * k
}

export function outsideZone(p: Point, center: Point, radius: number): boolean {
  const dx = p.x - center.x
  const dy = p.y - center.y
  return dx * dx + dy * dy > radius * radius
}

