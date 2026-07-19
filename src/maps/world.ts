import type { MapDecor } from './registry'
import type { DecorInstance } from './registry'
import { Rng } from '../core/rng'
import type { Point } from '../core/vec'

// 无限地图的世界模型（纯逻辑，禁 phaser/DOM）。设计原则：有限地图未来
// 可以成为无限地图的子集——活跃判定/装饰分块对有界世界同样成立（只是
// 永不触发/被矩形裁剪），消费方通过这里的函数问世界问题，不自己算几何。

export interface WorldDef {
  readonly kind: 'infinite' | 'bounded'
  /** bounded 时的矩形尺寸（infinite 忽略） */
  readonly width?: number
  readonly height?: number
}

/** 活跃判定：按轴距离（Chebyshev 方形）。半边长取 32 格时，25×25 有界图
 * 上任意两点的轴距 ≤25，永不休眠——同一机制天然兼容有界世界 */
export function isWithinActive(dx: number, dy: number, half: number): boolean {
  return Math.abs(dx) <= half && Math.abs(dy) <= half
}

/** 环带随机点（面积均匀）：r² 在 [rMin², rMax²] 均匀采样，角度均匀 */
export function ringPoint(rng: Rng, center: Point, rMin: number, rMax: number): Point {
  const r = Math.sqrt(rMin * rMin + rng.next() * (rMax * rMax - rMin * rMin))
  const a = rng.next() * Math.PI * 2
  return { x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r }
}

// ── 装饰分块 ────────────────────────────────────────────────
// 块只是精灵生命周期的批次粒度：装饰按「格」逐格决定，每格的随机流由
// (种子, 格坐标) 哈希派生——任何访问顺序、任何块划分都得到同一摆放。
// 密度的低频噪声场同样按世界格坐标哈希采样，跨块天然连续。

/** 整数坐标哈希 → [0,1)：装饰的一切逐格随机都从它派生（负坐标安全） */
export function hash01(seed: number, x: number, y: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0
  h = Math.imul(h ^ (x | 0), 0x85ebca6b) >>> 0
  h = (h ^ (h >>> 13)) >>> 0
  h = Math.imul(h ^ (y | 0), 0xc2b2ae35) >>> 0
  h = (h ^ (h >>> 16)) >>> 0
  return h / 0x100000000
}

/** 低频值噪声（世界格坐标，波长 waveU 格）：晶格值来自 hash01，平滑双线性 */
export function worldNoise(seed: number, xU: number, yU: number, waveU: number): number {
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

/** 块坐标（floor 除法，负坐标正确） */
export function chunkOf(xU: number, chunkCells: number): number {
  return Math.floor(xU / chunkCells)
}

/** 覆盖矩形（格坐标）的全部块，外扩 pad 块：相机视野 → 应活跃的块集合 */
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

/** 一个块的装饰摆放（世界格坐标）：与 rollDecor 同风格——噪声场调制逐格
 * 密度成簇、允许溢出邻格；密度基准由种子一次性决定（全图统一）。
 * 完全确定：同 (seed, 块) 任何时刻重建结果一致 */
export function chunkDecor(
  def: MapDecor,
  seed: number,
  cx: number,
  cy: number,
  chunkCells: number,
): DecorInstance[] {
  // 全图统一的密度基准：与格无关，只由种子决定
  const densityRoll = hash01(seed, 0x5eed, 0x5eed)
  const density = def.density[0] + densityRoll * (def.density[1] - def.density[0])
  const out: DecorInstance[] = []
  const x0 = cx * chunkCells
  const y0 = cy * chunkCells
  for (let dy = 0; dy < chunkCells; dy++) {
    for (let dx = 0; dx < chunkCells; dx++) {
      const xU = x0 + dx
      const yU = y0 + dy
      // 每格独立随机流：跨块确定性的关键
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

// ── 终波缩圈 ────────────────────────────────────────────────

export interface ZoneDef {
  readonly r0: number
  readonly rMin: number
  readonly holdMs: number
  readonly shrinkEndMs: number
}

/** 缩圈半径曲线：观察期恒 r0 → 线性收缩 → 到底后恒 rMin */
export function zoneRadiusAt(tMs: number, def: ZoneDef): number {
  if (tMs <= def.holdMs) return def.r0
  if (tMs >= def.shrinkEndMs) return def.rMin
  const k = (tMs - def.holdMs) / (def.shrinkEndMs - def.holdMs)
  return def.r0 + (def.rMin - def.r0) * k
}

/** 点是否在圈外（圈伤判定） */
export function outsideZone(p: Point, center: Point, radius: number): boolean {
  const dx = p.x - center.x
  const dy = p.y - center.y
  return dx * dx + dy * dy > radius * radius
}

// 无限地图（kind='infinite' 的关卡）：无边界世界 + 活跃方形 + 终波缩圈。
// 活跃判定用按轴距离（Chebyshev 方形）：与地图/分块/视口的矩形几何同构；
// 32 格半边长 > 有限地图对角任意两点的轴距（25）——未来把有限图统一进
// 同一机制时，图上永远无人休眠，行为零差异
export const INFINITE = {
  /** 活跃方形半边长：超出的敌人休眠（冻结 AI/物理/不占刷怪上限，保留全状态） */
  activeHalf: 32,
  /** 刷怪环带（以队伍中心为圆心）：内环避脸；外环 = 活跃半边长之半——
   * 奔跑方向的前方早有已落地的敌人在等，一直跑不能白嫖（多数落点在屏外，
   * 近处落点仍有 ⚠️ 预告） */
  spawnRingMin: 4,
  spawnRingMax: 16,
  /** 装饰分块边长（格）：块 = 精灵批量建/销毁的粒度，噪声连续性与块无关 */
  chunkCells: 8,
  /** 装饰活跃范围 = 相机视野外扩的块数（销毁再多留一块防抖） */
  chunkPad: 1,
} as const

// 终波缩圈（无限地图的 Boss 战边界）：圈心 = 终波开始时的队伍中心。
// 它不是吃鸡式终局压缩——只为封住「跑得比 Boss 快就能无限避战」：
// 半径先停留（让玩家看清圈）再缓缩 4 格即停，之后恒为 rMin 的固定竞技场；
// 圈外队员按 tick 掉血，敌人不受圈伤
export const ZONE = {
  r0: 16,
  rMin: 12,
  /** 开圈后的静止观察期 */
  holdMs: 6000,
  /** 收缩结束时刻（此后维持 rMin 到波末） */
  shrinkEndMs: 38_000,
  tickMs: 500,
  tickDamage: 6,
} as const
