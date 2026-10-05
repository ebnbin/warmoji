import { FRAME_U, UNIT } from '../../util/units.ts'
import { fbm } from '../../util/noise.ts'
import { Rng } from '../../util/rng.ts'
import { makeBasin } from '../basin.ts'
import { bilinear } from '../grid.ts'
import type { Basin } from '../basin'
import type { PetriConfig } from '../../types/maps'
import type { Point } from '../../util/vec'

/** 能走的地面按这么细的格子算距离场，格 */
const BASIN_CELL_U = 0.25
/** 建距离场时窄过两倍这么宽（格）的缝填掉：圆皿里没有缝 */
const NECK_U = 0.35
/** 菌落场比琼脂面多铺这么宽（格）：着色器在皿壁边上插值不出界 */
const FIELD_PAD_U = 0.4
/** 密度低过它就当没有：稀得看不出，也就不再往前爬 */
const TRACE = 1e-5
/** 划线的每一道往两头各留这么多（占一区的角度）不划到记号笔的分界线上，后一区的头一道往前一区里多伸进这么多 */
const EDGE_GAP = 0.08
const DRAG_BACK = 0.18
/** 菌落沿线落下时左右散开多远：落菌密的一区按 dense，稀的按 sparse，格；间距按 ±jitter 倍抖 */
const SCATTER_U = { dense: 0.12, sparse: 0.4 } as const
const SPACING_JITTER = 0.3
/** 菌落离皿壁至少这么远，格 */
const WALL_KEEP_U = 0.4
/** 杂菌离别的菌落至少这么远，格 */
const STRAY_GAP_U = 2
/** 琼脂里的气泡：几个、半径（格） */
const BUBBLES = [4, 8] as const
const BUBBLE_U = [0.06, 0.2] as const
/** 开局就有的菌落长得多熟：按 matureS 的这个比例上下 */
const SEED_AGE = [0.6, 1] as const

/** 一个圆：圆心与半径，格 */
export interface Disc {
  readonly x: number
  readonly y: number
  readonly r: number
}

/** 皿底记号笔分的一区：从 a0 转到 a1（弧度，顺着划线的方向），区号 1–4 */
export interface Quadrant {
  readonly a0: number
  readonly a1: number
  readonly label: number
}

/**
 * 一只培养皿，格：皿心、琼脂面的半径与玻璃壁厚，能走的琼脂面；接种时记号笔分的四区与落下的菌落；
 * 琼脂里的气泡，灯箱网格的偏移（占一格网格的比例），皿底标签写在哪
 */
export interface PetriPlan {
  readonly cx: number
  readonly cy: number
  readonly radius: number
  readonly wall: number
  readonly basin: Basin
  readonly quadrants: readonly Quadrant[]
  readonly seeds: readonly Disc[]
  readonly bubbles: readonly Disc[]
  readonly grid: Point
  readonly label: Point
}

/**
 * 菌落场：格子 (0, 0) 的左上角在 (x0, y0) 像素，cell 是格子边长（像素）；inside 是琼脂面上的格。
 * u 是菌落的密度（0 到 1，也就是有多厚），m 是溶菌物质的浓度（以最低抑菌浓度计），age 是长熟了多久（秒），rate 是这格的增长率倍数
 */
export interface ColonyField {
  readonly cols: number
  readonly rows: number
  readonly cell: number
  readonly x0: number
  readonly y0: number
  readonly inside: Uint8Array
  readonly rate: Float32Array
  readonly u: Float32Array
  readonly m: Float32Array
  readonly age: Float32Array
  readonly lap: Float32Array
}

const between = (rng: Rng, r: readonly [number, number]): number => r[0] + rng.next() * (r[1] - r[0])

let last: { cfg: PetriConfig; seed: number; plan: PetriPlan } | null = null

/** 沿折线每隔约 spacing 格落一个菌落：间距和左右的位置都抖一抖 */
function seedAlong(rng: Rng, pts: readonly Point[], spacing: number, scatter: number, size: readonly [number, number], out: Disc[]): void {
  let next = spacing * rng.next()
  let walked = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!
    const b = pts[i]!
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len <= 0) continue
    const nx = -(b.y - a.y) / len
    const ny = (b.x - a.x) / len
    while (next <= walked + len) {
      const t = (next - walked) / len
      const side = (rng.next() * 2 - 1) * scatter
      out.push({ x: a.x + (b.x - a.x) * t + nx * side, y: a.y + (b.y - a.y) * t + ny * side, r: between(rng, size) })
      next += spacing * (1 + (rng.next() * 2 - 1) * SPACING_JITTER)
    }
    walked += len
  }
}

/**
 * 这一局的培养皿，按种子定下：皿心在方框正中；接种按四区划线，从随机一区起顺着随机的方向依次划，每区来回划几道、一道比一道往前，
 * 后一区的头一道伸回前一区里（接种环从上一区蘸菌），第 k 区按 spacingU[k] 的间距沿线落菌；再在别处落几个杂菌。皿心的空地与皿壁边上不落
 */
export function petriPlan(cfg: PetriConfig, seed: number): PetriPlan {
  if (last && last.cfg === cfg && last.seed === seed) return last.plan
  const rng = new Rng(seed)
  const cx = FRAME_U / 2
  const cy = FRAME_U / 2
  const R = cfg.dish.radiusU
  const side = Math.ceil((2 * (R + 1)) / BASIN_CELL_U)
  const b0 = { x: (cx - (side * BASIN_CELL_U) / 2) * UNIT, y: (cy - (side * BASIN_CELL_U) / 2) * UNIT }
  const basin = makeBasin((x, y) => Math.hypot(x - cx * UNIT, y - cy * UNIT) < R * UNIT, b0.x, b0.y, side, side, BASIN_CELL_U * UNIT, { x: cx * UNIT, y: cy * UNIT }, NECK_U * UNIT)

  const s = cfg.streak
  const start = rng.next() * Math.PI * 2
  const dir = rng.next() < 0.5 ? 1 : -1
  const streaked = rng.int(s.quadrants[0], s.quadrants[1])
  const quarter = Math.PI / 2
  const quadrants: Quadrant[] = [0, 1, 2, 3].map((k) => ({ a0: start + dir * k * quarter, a1: start + dir * (k + 1) * quarter, label: k + 1 }))
  const fits = (d: Disc): boolean => {
    const r = Math.hypot(d.x - cx, d.y - cy)
    return r - d.r >= cfg.plazaU && r + d.r <= R - WALL_KEEP_U
  }
  const seeds: Disc[] = []
  for (let k = 0; k < streaked; k++) {
    const q = quadrants[k]!
    const n = rng.int(s.strokes[0], s.strokes[1])
    const back = k > 0 ? DRAG_BACK : 0
    const from = q.a0 + dir * quarter * (EDGE_GAP - back)
    const span = quarter * (1 - 2 * EDGE_GAP + back)
    const pts: Point[] = []
    for (let j = 0; j <= n; j++) {
      const a = from + dir * span * (j / n) + (rng.next() * 2 - 1) * 0.03
      const band = j % 2 === 0 ? s.band[0] : s.band[1]
      const r = R * (band + (rng.next() * 2 - 1) * 0.03)
      pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r })
    }
    const spacing = s.spacingU[Math.min(k, s.spacingU.length - 1)]!
    const found: Disc[] = []
    seedAlong(rng, pts, spacing, spacing < 1 ? SCATTER_U.dense : SCATTER_U.sparse, s.colonyU, found)
    for (const d of found) if (fits(d)) seeds.push(d)
  }
  const strays = rng.int(s.strays[0], s.strays[1])
  for (let k = 0, tries = 0; k < strays && tries < 200; tries++) {
    const a = rng.next() * Math.PI * 2
    const r = cfg.plazaU + 1 + rng.next() * (R * s.band[1] - cfg.plazaU - 1)
    const d: Disc = { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, r: between(rng, s.colonyU) }
    if (!fits(d) || seeds.some((o) => Math.hypot(o.x - d.x, o.y - d.y) < STRAY_GAP_U)) continue
    seeds.push(d)
    k++
  }

  const bubbles: Disc[] = []
  const nb = rng.int(BUBBLES[0], BUBBLES[1])
  for (let k = 0; k < nb; k++) {
    const a = rng.next() * Math.PI * 2
    const r = Math.sqrt(rng.next()) * (R - 0.8)
    bubbles.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, r: between(rng, BUBBLE_U) })
  }
  // 标签写在离屏幕下方最近的那一区正中
  const down = Math.PI / 2
  const near = (q: Quadrant): number => Math.abs(Math.atan2(Math.sin((q.a0 + q.a1) / 2 - down), Math.cos((q.a0 + q.a1) / 2 - down)))
  const lq = quadrants.reduce((a, q) => (near(q) < near(a) ? q : a))
  const la = (lq.a0 + lq.a1) / 2
  const plan: PetriPlan = {
    cx,
    cy,
    radius: R,
    wall: cfg.dish.wallU,
    basin,
    quadrants,
    seeds,
    bubbles,
    grid: { x: rng.next(), y: rng.next() },
    label: { x: cx + Math.cos(la) * R * 0.62, y: cy + Math.sin(la) * R * 0.62 },
  }
  last = { cfg, seed, plan }
  return plan
}

/** 菌落扩散的系数，格²/秒：费希尔方程的前沿速度是 2√(D·增长率) */
export function diffusionU(cfg: PetriConfig): number {
  const c = cfg.colony
  return (c.frontU * c.frontU) / (4 * c.growth)
}

/** 前沿过渡带最窄多宽，格：增长率最高的地方 √(D/增长率) */
export function frontWidthU(cfg: PetriConfig): number {
  return Math.sqrt(diffusionU(cfg) / (cfg.colony.growth * (1 + cfg.colony.patchy)))
}

/** 溶菌物质刚放下时的峰值浓度（以最低抑菌浓度计）：holdS 秒后衰减到最低抑菌浓度 */
export function lysinPeak(cfg: PetriConfig): number {
  return Math.pow(2, cfg.lysis.holdS / cfg.lysis.halfLifeS)
}

/**
 * 开局的菌落场：琼脂面上的格，每格的增长率按噪声起伏；按接种落下的菌落一开始就长满、长熟了一阵，再先长 preS 秒，
 * 菌落的边自然长出前沿的过渡带
 */
export function makeColony(plan: PetriPlan, cfg: PetriConfig, seed: number): ColonyField {
  const c = cfg.colony
  const cols = Math.ceil((2 * (plan.radius + FIELD_PAD_U)) / c.cellU)
  const rows = cols
  const cell = c.cellU * UNIT
  const x0 = (plan.cx - (cols * c.cellU) / 2) * UNIT
  const y0 = (plan.cy - (rows * c.cellU) / 2) * UNIT
  const n = cols * rows
  const f: ColonyField = {
    cols,
    rows,
    cell,
    x0,
    y0,
    inside: new Uint8Array(n),
    rate: new Float32Array(n),
    u: new Float32Array(n),
    m: new Float32Array(n),
    age: new Float32Array(n),
    lap: new Float32Array(n),
  }
  const rng = new Rng(seed)
  const noiseSeed = Math.floor(rng.next() * 0x7fffffff)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x
      const ux = (x0 + (x + 0.5) * cell) / UNIT
      const uy = (y0 + (y + 0.5) * cell) / UNIT
      // 边上一圈格子永远不在琼脂面上：拉普拉斯算子不用判越界
      if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1) continue
      if (Math.hypot(ux - plan.cx, uy - plan.cy) > plan.radius - c.cellU / 2) continue
      f.inside[i] = 1
      const wobble = (fbm(ux / c.waveU, uy / c.waveU, noiseSeed, 3) - 0.5) * 4
      f.rate[i] = 1 + c.patchy * Math.max(-1, Math.min(1, wobble))
    }
  }
  for (const d of plan.seeds) {
    const age = c.matureS * between(rng, SEED_AGE)
    const c0 = Math.max(0, Math.floor(((d.x - d.r) * UNIT - x0) / cell) - 1)
    const c1 = Math.min(cols - 1, Math.ceil(((d.x + d.r) * UNIT - x0) / cell) + 1)
    const ry0 = Math.max(0, Math.floor(((d.y - d.r) * UNIT - y0) / cell) - 1)
    const ry1 = Math.min(rows - 1, Math.ceil(((d.y + d.r) * UNIT - y0) / cell) + 1)
    for (let y = ry0; y <= ry1; y++) {
      for (let x = c0; x <= c1; x++) {
        const i = y * cols + x
        if (!f.inside[i]) continue
        const dist = Math.hypot((x0 + (x + 0.5) * cell) / UNIT - d.x, (y0 + (y + 0.5) * cell) / UNIT - d.y)
        if (dist > d.r) continue
        f.u[i] = 1
        f.age[i] = Math.max(f.age[i]!, age)
      }
    }
  }
  const dt = c.stepMs / 1000
  for (let t = 0; t < c.preS; t += dt) stepColony(f, cfg, dt)
  return f
}

/**
 * 积分一步：菌落按费希尔方程扩散、按逻辑斯谛增长，增长按溶菌物质的浓度打折（到最低抑菌浓度长不出来），高过它的按超出的倍数溶掉；
 * 溶菌物质按半衰期衰减；长熟的格记着长熟了多久，被溶得不熟了从头算
 */
export function stepColony(f: ColonyField, cfg: PetriConfig, dt: number): void {
  const c = cfg.colony
  const { cols, rows, inside, u, m, age, lap, rate } = f
  const d = diffusionU(cfg) / (c.cellU * c.cellU)
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      const i = y * cols + x
      if (!inside[i]) continue
      // 琼脂面外的邻格按本格算：菌落顶到皿壁就停，不往外漏
      const v = u[i]!
      const e = inside[i + 1] ? u[i + 1]! : v
      const w = inside[i - 1] ? u[i - 1]! : v
      const n = inside[i - cols] ? u[i - cols]! : v
      const s = inside[i + cols] ? u[i + cols]! : v
      const ne = inside[i - cols + 1] ? u[i - cols + 1]! : v
      const nw = inside[i - cols - 1] ? u[i - cols - 1]! : v
      const se = inside[i + cols + 1] ? u[i + cols + 1]! : v
      const sw = inside[i + cols - 1] ? u[i + cols - 1]! : v
      lap[i] = (4 * (e + w + n + s) + ne + nw + se + sw - 20 * v) / 6
    }
  }
  const decay = Math.pow(0.5, dt / cfg.lysis.halfLifeS)
  const lyse = cfg.lysis.lysePerS
  for (let i = 0; i < u.length; i++) {
    if (!inside[i]) continue
    const k = m[i]!
    let v = u[i]!
    v += dt * (d * lap[i]! + c.growth * rate[i]! * Math.max(0, 1 - k) * v * (1 - v))
    if (k > 1) v *= Math.exp(-dt * lyse * (k - 1))
    v = v < TRACE ? 0 : v > 1 ? 1 : v
    u[i] = v
    m[i] = k * decay
    age[i] = v >= c.mature ? age[i]! + dt : 0
  }
}

/** 半径是标准身体 size 倍的一具身体死在 (x, y) 像素：放下一团溶菌物质，按高斯分布，铺多宽随个头等比例放大 */
export function dropLysin(f: ColonyField, cfg: PetriConfig, x: number, y: number, size: number): void {
  const peak = lysinPeak(cfg)
  const sig = (cfg.lysis.radiusU * size * UNIT) / Math.sqrt(2 * Math.log(peak))
  const reach = sig * 3
  const c0 = Math.max(0, Math.floor((x - reach - f.x0) / f.cell))
  const c1 = Math.min(f.cols - 1, Math.ceil((x + reach - f.x0) / f.cell))
  const r0 = Math.max(0, Math.floor((y - reach - f.y0) / f.cell))
  const r1 = Math.min(f.rows - 1, Math.ceil((y + reach - f.y0) / f.cell))
  const k = 1 / (2 * sig * sig)
  for (let cy = r0; cy <= r1; cy++) {
    for (let cx = c0; cx <= c1; cx++) {
      const i = cy * f.cols + cx
      if (!f.inside[i]) continue
      const dx = f.x0 + (cx + 0.5) * f.cell - x
      const dy = f.y0 + (cy + 0.5) * f.cell - y
      f.m[i] = f.m[i]! + peak * Math.exp(-(dx * dx + dy * dy) * k)
    }
  }
}

/** (x, y) 像素处菌落的密度，琼脂面外为 0 */
export function colonyAt(f: ColonyField, x: number, y: number): number {
  return bilinear(f.u, f.cols, f.rows, f.cell, f.x0, f.y0, x, y, 0)
}
