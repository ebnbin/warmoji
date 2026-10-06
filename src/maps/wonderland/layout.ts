import { FRAME_U } from '../../util/units.ts'
import { fbm } from '../../util/noise.ts'
import { Rng } from '../../util/rng.ts'
import type { ObstacleId } from '../../types/obstacles'
import type { WonderlandConfig } from '../../types/maps'
import type { Point } from '../../util/vec'

/** 草坪的中心，格：方框正中 */
const MID = FRAME_U / 2
/** 摆东西时每样试多少次 */
const TRIES = 540
/** 草坪的边按这个种子起伏 */
const LAWN_NOISE = 0x2b7e15
/** 茶桌沿长边方向能挪多远，格 */
const TABLE_SLIDE_U = 2
/** 椅子离桌边多远，格：推进去贴着桌布 */
const CHAIR_TUCK_U = 0.05
/** 立着的东西离草坪边至少多远，格：比障碍之间的空当多出这么多，树篱的叶子伸出来一点 */
const BORDER_EXTRA_U = 0.4
/** 茶壶、茶杯、蘑菇与扑克牌篱离茶桌至少多远，格：桌边一圈留给人走 */
const TABLE_GAP_U = 2
/** 花坛的门拱离花坛的角至少多远，格 */
const HOOP_CORNER_U = 1.2
/** 桌布垂下来的那一圈多宽，格：挡弹体与视线的只有它，桌子底下是空的 */
const SKIRT_U = 0.3
/** 散落的怀表、钥匙与纸牌：几个 */
const WATCHES = [2, 3] as const
const KEYS = [2, 3] as const
const FALLEN = [5, 8] as const
/** 大茶壶摆不下时最小缩到几倍 */
const TEAPOT_MIN = 0.75
/** 每块草坪试几次才换下一块 */
const ZONE_TRIES = 60
/** 兔子洞偏离正上方最多多少，弧度 */
const HOLE_SPREAD = 0.9
/** 兔子洞与柴郡猫离彼此至少差多少角度，弧度 */
const HOLE_CAT_APART = 1.6

/** 一块地的形状，格 */
export type Shape =
  | { readonly kind: 'disc'; readonly x: number; readonly y: number; readonly r: number }
  /** 转过 a 弧度的圆角矩形：半长 hx、半宽 hy、圆角 round */
  | { readonly kind: 'box'; readonly x: number; readonly y: number; readonly hx: number; readonly hy: number; readonly a: number; readonly round: number }
  /** 转过 a 弧度的椭圆：半轴 rx、ry */
  | { readonly kind: 'ellipse'; readonly x: number; readonly y: number; readonly rx: number; readonly ry: number; readonly a: number }
  /** 两头圆的一段：从 a 到 b，半粗 r */
  | { readonly kind: 'seg'; readonly ax: number; readonly ay: number; readonly bx: number; readonly by: number; readonly r: number }

/** (x, y) 离形状的边多远，格：里面为负 */
export function sdf(s: Shape, x: number, y: number): number {
  switch (s.kind) {
    case 'disc':
      return Math.hypot(x - s.x, y - s.y) - s.r
    case 'box': {
      const c = Math.cos(s.a)
      const n = Math.sin(s.a)
      const dx = x - s.x
      const dy = y - s.y
      const qx = Math.abs(dx * c + dy * n) - (s.hx - s.round)
      const qy = Math.abs(-dx * n + dy * c) - (s.hy - s.round)
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - s.round
    }
    case 'ellipse': {
      const c = Math.cos(s.a)
      const n = Math.sin(s.a)
      const dx = x - s.x
      const dy = y - s.y
      const u = (dx * c + dy * n) / s.rx
      const v = (-dx * n + dy * c) / s.ry
      return (Math.hypot(u, v) - 1) * Math.min(s.rx, s.ry)
    }
    case 'seg': {
      const ex = s.bx - s.ax
      const ey = s.by - s.ay
      const t = Math.max(0, Math.min(1, ((x - s.ax) * ex + (y - s.ay) * ey) / (ex * ex + ey * ey || 1)))
      return Math.hypot(x - s.ax - ex * t, y - s.ay - ey * t) - s.r
    }
  }
}

/** 形状的外接框，格：[x0, y0, x1, y1] */
export function boundsOf(s: Shape): readonly [number, number, number, number] {
  switch (s.kind) {
    case 'disc':
      return [s.x - s.r, s.y - s.r, s.x + s.r, s.y + s.r]
    case 'box': {
      const c = Math.abs(Math.cos(s.a))
      const n = Math.abs(Math.sin(s.a))
      const ex = s.hx * c + s.hy * n
      const ey = s.hx * n + s.hy * c
      return [s.x - ex, s.y - ey, s.x + ex, s.y + ey]
    }
    case 'ellipse': {
      const r = Math.max(s.rx, s.ry)
      return [s.x - r, s.y - r, s.x + r, s.y + r]
    }
    case 'seg':
      return [Math.min(s.ax, s.bx) - s.r, Math.min(s.ay, s.by) - s.r, Math.max(s.ax, s.bx) + s.r, Math.max(s.ay, s.by) + s.r]
  }
}

/** 障碍的种类：扑克牌篱与篱下的老鼠洞，花坛的矮篱与门拱，草坪上的门拱，茶桌、椅子、茶杯、茶碟、茶壶与菌柄 */
export type ObstacleKind = 'card' | 'hole' | 'lowHedge' | 'hoop' | 'table' | 'chair' | 'cup' | 'saucer' | 'teapot' | 'stem'

/**
 * 一样障碍：地上占的形状（格），顶离地多高、底下空着多高（米），什么材质；owner 是它在自己那一组里的序号（第几排牌、第几只杯）。
 * 跨得过顶的身体从上面过去，整个身子矮过底下空当的从底下钻过去
 */
export interface Obstacle {
  readonly kind: ObstacleKind
  readonly shape: Shape
  readonly topM: number
  readonly underM: number
  readonly material: ObstacleId
  readonly owner: number
  /** 只有一圈边挡弹体与视线、里面是空的（垂到地的桌布围着桌子底下），边多宽，格 */
  readonly skirtU?: number
}

/** 茶桌，格：桌心、长、宽，横着摆还是竖着摆；朝开局站位那一边的法线 */
export interface Table {
  readonly x: number
  readonly y: number
  readonly len: number
  readonly wid: number
  readonly horiz: boolean
  readonly nx: number
  readonly ny: number
}

/** 桌上摆的一样东西：沿桌长 u、沿桌宽 v（格，桌心为原点），多大（格），色相与一个随机数 */
export interface TableItem {
  readonly kind: 'pot' | 'cup' | 'plate' | 'stand' | 'candle' | 'jar' | 'hat'
  readonly u: number
  readonly v: number
  readonly r: number
  readonly hue: number
  readonly k: number
}

/** 一把椅子，格：中心、朝向（椅背在 a 方向的反面），大扶手椅还是普通椅子，色相 */
export interface Chair {
  readonly x: number
  readonly y: number
  readonly a: number
  readonly grand: boolean
  readonly hue: number
}

/** 立在草坪上的大茶壶，格：壶身中心、长轴朝 a（壶嘴朝 a，壶把在反面），壶身半长半宽；摆不下缩小过的按 k 倍 */
export interface Teapot {
  readonly x: number
  readonly y: number
  readonly a: number
  readonly rx: number
  readonly ry: number
  readonly k: number
}

/** 茶壶占地的几块：壶身、壶嘴、壶把，各自顶多高（占壶高的比例） */
export function teapotParts(t: Teapot): { readonly part: 'body' | 'spout' | 'handle'; readonly shape: Shape; readonly top: number }[] {
  const c = Math.cos(t.a)
  const n = Math.sin(t.a)
  const k = t.k
  return [
    { part: 'body', shape: { kind: 'ellipse', x: t.x, y: t.y, rx: t.rx, ry: t.ry, a: t.a }, top: 1 },
    { part: 'spout', shape: { kind: 'seg', ax: t.x + c * t.rx * 0.8, ay: t.y + n * t.rx * 0.8, bx: t.x + c * (t.rx + 1.3 * k), by: t.y + n * (t.rx + 1.3 * k), r: 0.36 * k }, top: 0.74 },
    { part: 'handle', shape: { kind: 'seg', ax: t.x - c * t.rx * 0.85, ay: t.y - n * t.rx * 0.85, bx: t.x - c * (t.rx + 0.95 * k), by: t.y - n * (t.rx + 0.95 * k), r: 0.3 * k }, top: 0.8 },
  ]
}

/** 一只大茶杯或茶碟，格：中心、半径、杯把朝 a；saucer 是垫着的茶碟半径（散落的茶碟就是它自己），tipped 是碟里洒了茶 */
export interface Cup {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly a: number
  readonly saucer: number
  readonly hue: number
}

/** 一排扑克牌篱：一段段直的（格），老鼠洞在第 hole 段的 t 处（沿段从 0 到 1）；花色 0–3 */
export interface CardRow {
  readonly pieces: readonly { readonly ax: number; readonly ay: number; readonly bx: number; readonly by: number }[]
  readonly hole: number
  readonly t: number
  readonly suit: number
}

/** 矮篱围的花坛，格：中心、半长半宽（篱的外沿）、转角 a；门拱在哪几处（格，篱的中线上） */
export interface Bed {
  readonly x: number
  readonly y: number
  readonly hx: number
  readonly hy: number
  readonly a: number
  readonly hoops: readonly Point[]
}

/** 一个门拱，格：中心、拱的方向（两条腿的连线）a */
export interface Hoop {
  readonly x: number
  readonly y: number
  readonly a: number
}

/** 一棵大蘑菇，格：菌柄中心、菌盖半径、色相 */
export interface Mushroom {
  readonly x: number
  readonly y: number
  readonly cap: number
  readonly hue: number
}

/** 躺在草上的一样东西，格：怀表、钥匙、掉在地上的纸牌、洒的茶 */
export interface Decal {
  readonly kind: 'watch' | 'key' | 'card' | 'tea'
  readonly x: number
  readonly y: number
  readonly a: number
  readonly r: number
  readonly k: number
}

/** 树篱边上的一处，格：在草坪边上，朝草坪里的单位方向 */
export interface Rim {
  readonly x: number
  readonly y: number
  readonly nx: number
  readonly ny: number
}

/**
 * 这一局的奇境，格：草坪（圆角方形的半边长、圆角、边的起伏）与开局站位，黑白格的偏移；茶桌与桌上的东西、椅子，
 * 茶壶、茶杯、茶碟、扑克牌篱、花坛、门拱、蘑菇与散落的东西；兔子洞与柴郡猫在树篱边上的哪里；所有挡路的障碍
 */
export interface WonderPlan {
  readonly seed: number
  readonly hw: number
  readonly hh: number
  readonly corner: number
  readonly wobble: number
  readonly wave: number
  readonly start: Point
  readonly tile: Point
  readonly table: Table
  readonly items: readonly TableItem[]
  readonly chairs: readonly Chair[]
  readonly teapot: Teapot
  readonly cups: readonly Cup[]
  readonly saucers: readonly Cup[]
  readonly rows: readonly CardRow[]
  readonly beds: readonly Bed[]
  readonly hoops: readonly Hoop[]
  readonly mushrooms: readonly Mushroom[]
  readonly decals: readonly Decal[]
  readonly hole: Rim
  readonly cat: Rim
  readonly obstacles: readonly Obstacle[]
}

const between = (rng: Rng, r: readonly [number, number]): number => r[0] + rng.next() * (r[1] - r[0])
const count = (rng: Rng, r: readonly [number, number]): number => rng.int(r[0], r[1])

/** (x, y) 离草坪边多远，格：草坪里为负，树篱里为正 */
export function lawnSdf(p: Pick<WonderPlan, 'hw' | 'hh' | 'corner' | 'wobble' | 'wave' | 'seed'>, x: number, y: number): number {
  const qx = Math.abs(x - MID) - (p.hw - p.corner)
  const qy = Math.abs(y - MID) - (p.hh - p.corner)
  const box = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - p.corner
  return box + (fbm(x / p.wave, y / p.wave, (p.seed ^ LAWN_NOISE) >>> 0, 3) - 0.5) * 2 * p.wobble
}

/** 一块要占的地：几个圆盖住它，高的还是矮的 */
interface Claim {
  readonly circles: readonly { readonly x: number; readonly y: number; readonly r: number }[]
  readonly tall: boolean
}

/** 一段线按圆盖住：每隔不到一个半粗放一个 */
function capsuleCircles(ax: number, ay: number, bx: number, by: number, r: number): { x: number; y: number; r: number }[] {
  const len = Math.hypot(bx - ax, by - ay)
  const n = Math.max(1, Math.ceil(len / r))
  const out: { x: number; y: number; r: number }[] = []
  for (let k = 0; k <= n; k++) out.push({ x: ax + ((bx - ax) * k) / n, y: ay + ((by - ay) * k) / n, r })
  return out
}

/** 一块矩形按圆盖住：切成不到一格见方的小块，每块一个外接圆 */
function boxCircles(x: number, y: number, hx: number, hy: number, a: number): { x: number; y: number; r: number }[] {
  const c = Math.cos(a)
  const n = Math.sin(a)
  const nu = Math.max(1, Math.ceil((hx * 2) / 1))
  const nv = Math.max(1, Math.ceil((hy * 2) / 1))
  const du = (hx * 2) / nu
  const dv = (hy * 2) / nv
  const r = Math.hypot(du, dv) / 2
  const out: { x: number; y: number; r: number }[] = []
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const u = -hx + (i + 0.5) * du
      const v = -hy + (j + 0.5) * dv
      out.push({ x: x + u * c - v * n, y: y + u * n + v * c, r })
    }
  }
  return out
}

/** 摆东西的记账：已经占了的地、开局的空地与草坪边，新的一块和它们都空得开才摆得下 */
class Lot {
  private readonly claims: Claim[] = []
  private readonly lawn: (x: number, y: number) => number
  private readonly start: Point
  private readonly plaza: number
  private readonly gap: { readonly tallU: number; readonly lowU: number }

  constructor(lawn: (x: number, y: number) => number, start: Point, plaza: number, gap: { readonly tallU: number; readonly lowU: number }) {
    this.lawn = lawn
    this.start = start
    this.plaza = plaza
    this.gap = gap
  }

  fits(c: Claim): boolean {
    for (const a of c.circles) {
      const g = c.tall ? this.gap.tallU : this.gap.lowU
      if (this.lawn(a.x, a.y) > -(a.r + g + BORDER_EXTRA_U)) return false
      if (Math.hypot(a.x - this.start.x, a.y - this.start.y) < a.r + this.plaza) return false
      for (const o of this.claims) {
        const gg = c.tall && o.tall ? this.gap.tallU : this.gap.lowU
        for (const b of o.circles) if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r + gg) return false
      }
    }
    return true
  }

  take(c: Claim): void {
    this.claims.push(c)
  }

  /** 离已占的地多远，格：散落的东西摆在空处 */
  clearance(x: number, y: number): number {
    let d = Infinity
    for (const o of this.claims) for (const b of o.circles) d = Math.min(d, Math.hypot(x - b.x, y - b.y) - b.r)
    return d
  }
}

/** 草坪边上朝 a 方向的那一点：从中心往外走到边 */
function rimAt(p: Pick<WonderPlan, 'hw' | 'hh' | 'corner' | 'wobble' | 'wave' | 'seed'>, a: number): Rim {
  const dx = Math.cos(a)
  const dy = Math.sin(a)
  let r = 0
  while (r < FRAME_U && lawnSdf(p, MID + dx * r, MID + dy * r) < 0) r += 0.05
  const x = MID + dx * r
  const y = MID + dy * r
  const h = 0.1
  const gx = lawnSdf(p, x + h, y) - lawnSdf(p, x - h, y)
  const gy = lawnSdf(p, x, y + h) - lawnSdf(p, x, y - h)
  const len = Math.hypot(gx, gy) || 1
  return { x, y, nx: -gx / len, ny: -gy / len }
}

/** 草坪上随便一点：在中心周围 hw × hh 的范围里 */
function anywhere(rng: Rng, hw: number, hh: number): Point {
  return { x: MID + (rng.next() * 2 - 1) * hw, y: MID + (rng.next() * 2 - 1) * hh }
}

/** 草坪分成 3×3 块：每样东西先往摆得最少的那几块里试，摆得匀 */
class Zones {
  private readonly used = new Array<number>(9).fill(0)
  private order: number[] = []
  private tries = 0
  private readonly hw: number
  private readonly hh: number

  constructor(hw: number, hh: number) {
    this.hw = hw
    this.hh = hh
  }

  /** 摆一样新东西之前：按摆得多少排一遍，一样多的随机 */
  begin(rng: Rng): void {
    this.order = this.used.map((n, k) => ({ k, key: n + rng.next() * 0.5 })).sort((a, b) => a.key - b.key).map((o) => o.k)
    this.tries = 0
  }

  /** 再试一点：每块试 ZONE_TRIES 次再换下一块 */
  next(rng: Rng, margin: number): Point {
    const z = this.order[Math.floor(this.tries++ / ZONE_TRIES) % 9]!
    const w = ((this.hw - margin) * 2) / 3
    const h = ((this.hh - margin) * 2) / 3
    return { x: MID - this.hw + margin + ((z % 3) + rng.next()) * w, y: MID - this.hh + margin + (Math.floor(z / 3) + rng.next()) * h }
  }

  /** 在 p 摆下了一样：记进那一块，下一样重新排 */
  took(rng: Rng, p: Point): void {
    const zx = Math.min(2, Math.max(0, Math.floor(((p.x - MID + this.hw) / (this.hw * 2)) * 3)))
    const zy = Math.min(2, Math.max(0, Math.floor(((p.y - MID + this.hh) / (this.hh * 2)) * 3)))
    this.used[zy * 3 + zx]!++
    this.begin(rng)
  }
}

/** 桌上的茶具：两头各一把茶壶，中间茶杯、点心盘、点心架、烛台、果酱罐，疯帽子的帽子撂在桌头 */
function tableItems(rng: Rng, len: number, wid: number): TableItem[] {
  const out: TableItem[] = []
  const half = len / 2 - 0.7
  const put = (kind: TableItem['kind'], u: number, v: number, r: number): void => {
    out.push({ kind, u, v, r, hue: rng.next(), k: rng.next() })
  }
  put('hat', -half + 0.3, (rng.next() - 0.5) * 0.6, 0.62)
  put('pot', -half + 2.1, -wid * 0.18, 0.62)
  put('pot', half - 1.6, wid * 0.16, 0.56)
  put('stand', (rng.next() - 0.5) * 2, 0, 0.6)
  const candles = [-len * 0.22, len * 0.24]
  for (const u of candles) put('candle', u, (rng.next() - 0.5) * 0.3, 0.3)
  for (let u = -half + 1.1; u < half; u += 1.05 + rng.next() * 0.5) {
    for (const side of [-1, 1]) {
      const v = side * (wid / 2 - 0.55)
      if (out.some((o) => Math.hypot(o.u - u, o.v - v) < o.r + 0.5)) continue
      put(rng.next() < 0.68 ? 'cup' : 'plate', u + (rng.next() - 0.5) * 0.3, v + (rng.next() - 0.5) * 0.12, 0.38)
    }
  }
  for (let k = 0; k < 2; k++) {
    const u = (rng.next() - 0.5) * (len - 3)
    const v = (rng.next() - 0.5) * 0.4
    if (!out.some((o) => Math.hypot(o.u - u, o.v - v) < o.r + 0.4)) put('jar', u, v, 0.26)
  }
  return out
}

/** 一局花园最多重摆几回：摆出来的花坛、牌篱或茶杯少于下限就换个种子重摆 */
const REPLANS = 12

/** 按种子摆一局奇境：花坛、扑克牌篱与茶杯都不少于下限；重摆了几回还不够就报错 */
export function wonderPlan(cfg: WonderlandConfig, seed: number): WonderPlan {
  for (let k = 0; k < REPLANS; k++) {
    const p = tryPlan(cfg, (seed + Math.imul(k, 0x9e3779b9)) >>> 0)
    if (p && p.beds.length >= cfg.beds.count[0] && p.rows.length >= cfg.cards.rows[0] && p.cups.length >= cfg.cups.count[0]) return p
  }
  throw new Error(`奇境按种子 ${seed} 重摆了 ${REPLANS} 回还摆不下：草坪太小或空当要得太宽`)
}

/**
 * 按种子试摆一局奇境：先定草坪与开局站位，茶桌横在站位的一侧；再依次摆茶壶、蘑菇、茶杯、扑克牌篱、花坛、茶碟与门拱，
 * 每样离开局的空地、草坪边和别的东西都空得开，摆不下就少摆，连茶壶都摆不下就是 null；最后撒上怀表、钥匙与纸牌，定下兔子洞与柴郡猫
 */
function tryPlan(cfg: WonderlandConfig, seed: number): WonderPlan | null {
  const rng = new Rng(seed)
  const hw = between(rng, cfg.lawn.halfU)
  const hh = between(rng, cfg.lawn.halfU)
  const shape = { hw, hh, corner: between(rng, cfg.lawn.cornerU), wobble: cfg.lawn.wobbleU, wave: cfg.lawn.waveU, seed }
  const lawn = (x: number, y: number): number => lawnSdf(shape, x, y)
  const horiz = rng.next() < 0.5
  const side = rng.next() < 0.5 ? -1 : 1
  const nx = horiz ? 0 : side
  const ny = horiz ? side : 0
  const slide = (rng.next() * 2 - 1) * TABLE_SLIDE_U
  const start = { x: MID - nx * 1.5 + (horiz ? -slide * 0.5 : 0), y: MID - ny * 1.5 + (horiz ? 0 : -slide * 0.5) }
  const len = between(rng, cfg.table.lengthU)
  const wid = cfg.table.widthU
  const table: Table = { x: start.x + nx * cfg.table.offU + (horiz ? slide : 0), y: start.y + ny * cfg.table.offU + (horiz ? 0 : slide), len, wid, horiz, nx: -nx, ny: -ny }
  const ta = horiz ? 0 : Math.PI / 2
  const tile = { x: rng.next() * cfg.tileU, y: rng.next() * cfg.tileU }
  const lot = new Lot(lawn, start, cfg.plazaU, cfg.gapU)
  const zones = new Zones(hw, hh)
  const obstacles: Obstacle[] = []
  const add = (kind: ObstacleKind, s: Shape, topM: number, underM: number, material: ObstacleId, owner: number, skirtU?: number): void => {
    obstacles.push({ kind, shape: s, topM, underM, material, owner, skirtU })
  }

  // 茶桌与椅子：桌头一把大扶手椅，桌尾一把，余下的推进桌子两侧
  const tableShape: Shape = { kind: 'box', x: table.x, y: table.y, hx: horiz ? len / 2 : wid / 2, hy: horiz ? wid / 2 : len / 2, a: 0, round: 0.25 }
  add('table', tableShape, cfg.table.heightM, cfg.table.gapM, 'cloth', 0, SKIRT_U)
  const chairs: Chair[] = []
  const ux = horiz ? 1 : 0
  const uy = horiz ? 0 : 1
  const cu = cfg.table.chairU
  const nChairs = count(rng, cfg.table.chairs)
  const head = rng.next() < 0.5 ? -1 : 1
  const spots: { u: number; v: number; a: number; grand: boolean }[] = [
    { u: head * (len / 2 + cu / 2 + CHAIR_TUCK_U), v: 0, a: head > 0 ? 0 : Math.PI, grand: true },
    { u: -head * (len / 2 + cu / 2 + CHAIR_TUCK_U), v: 0, a: head > 0 ? Math.PI : 0, grand: false },
  ]
  const sideU = [-len * 0.28, len * 0.22]
  // 推进桌边的椅子都在背着开局站位的那一侧，站位那一侧空着
  const far = horiz ? -table.ny : table.nx
  for (let k = 2; k < nChairs; k++) {
    const s = far
    spots.push({ u: sideU[(k - 2) % sideU.length]! + (rng.next() - 0.5), v: s * (wid / 2 + cu / 2 + CHAIR_TUCK_U), a: s > 0 ? Math.PI / 2 : -Math.PI / 2, grand: false })
  }
  for (const sp of spots) {
    const x = table.x + ux * sp.u - uy * sp.v
    const y = table.y + uy * sp.u + ux * sp.v
    const a = sp.a + ta
    const size = sp.grand ? cu * 1.25 : cu
    chairs.push({ x, y, a, grand: sp.grand, hue: rng.next() })
    add('chair', { kind: 'box', x, y, hx: size / 2, hy: size / 2, a, round: 0.12 }, cfg.table.chairM, cfg.table.chairGapM, 'wicket', chairs.length - 1)
  }
  const tableHalf = { hx: horiz ? len / 2 + cu * 1.3 : wid / 2 + cu, hy: horiz ? wid / 2 + cu : len / 2 + cu * 1.3 }
  lot.take({ circles: boxCircles(table.x, table.y, tableHalf.hx + TABLE_GAP_U - cfg.gapU.tallU, tableHalf.hy + TABLE_GAP_U - cfg.gapU.tallU, 0), tall: true })

  // 大茶壶：壶身是椭圆，壶嘴与壶把各伸出去一截
  const tp = cfg.teapot
  let teapot: Teapot | null = null
  zones.begin(rng)
  for (let i = 0; i < TRIES && !teapot; i++) {
    const p = zones.next(rng, 3)
    const a = rng.next() * Math.PI * 2
    // 摆不下就一点点缩小，最小到 TEAPOT_MIN 倍
    const k = 1 - (i / TRIES) * (1 - TEAPOT_MIN)
    const rx = (tp.lengthU / 2) * k
    const ry = (tp.widthU / 2) * k
    const c = { circles: [...boxCircles(p.x, p.y, rx + 1.4 * k, ry * 0.85, a)], tall: true }
    if (!lot.fits(c)) continue
    lot.take(c)
    zones.took(rng, p)
    teapot = { x: p.x, y: p.y, a, rx, ry, k }
  }
  if (!teapot) return null
  for (const part of teapotParts(teapot)) add('teapot', part.shape, tp.heightM * part.top, 0, 'china', 0)


  // 立着的大茶杯，垫着茶碟：头一只先摆，余下的等扑克牌篱摆完
  const cups: Cup[] = []
  const nCups = count(rng, cfg.cups.count)
  const placeCups = (n: number): void => {
    zones.begin(rng)
    for (let i = 0; i < TRIES && cups.length < n; i++) {
      const p = zones.next(rng, 2)
      // 试了一半还摆不下就只摆最小的
      const r = i < TRIES / 2 ? between(rng, cfg.cups.radiusU) : cfg.cups.radiusU[0]
      const saucer = r * cfg.cups.saucer
      const c = { circles: [{ x: p.x, y: p.y, r: saucer }], tall: true }
      if (!lot.fits(c)) continue
      lot.take(c)
      zones.took(rng, p)
      cups.push({ x: p.x, y: p.y, r, a: rng.next() * Math.PI * 2, saucer, hue: rng.next() })
      add('saucer', { kind: 'disc', x: p.x, y: p.y, r: saucer }, cfg.cups.saucerM, 0, 'china', cups.length - 1)
      add('cup', { kind: 'disc', x: p.x, y: p.y, r }, cfg.cups.heightM, 0, 'china', cups.length - 1)
    }
  }
  placeCups(1)

  // 矮篱围的花坛：篱上嵌一两个门拱，门拱处篱断开
  const beds: Bed[] = []
  const bd = cfg.beds
  const nBeds = count(rng, bd.count)
  const hp = cfg.hoops
  zones.begin(rng)
  for (let i = 0; i < TRIES && beds.length < nBeds; i++) {
    const p = zones.next(rng, 2)
    const turn = rng.next() < 0.5
    // 摆不下就一点点往短里缩，最短到下限
    const shrink = 1 - (i / TRIES) * (1 - bd.lengthU[0] / bd.lengthU[1])
    const bhx = Math.max(bd.lengthU[0], between(rng, bd.lengthU) * shrink) / 2
    const bhy = Math.max(bd.widthU[0], between(rng, bd.widthU) * shrink) / 2
    const bx = turn ? bhy : bhx
    const by = turn ? bhx : bhy
    const c = { circles: boxCircles(p.x, p.y, bx, by, 0), tall: false }
    if (!lot.fits(c)) continue
    lot.take(c)
    zones.took(rng, p)
    const t = bd.thickU
    // 四条边：上下两条横的，左右两条竖的；门拱挑一两条边
    const sides = [
      { ax: p.x - bx, ay: p.y - by + t / 2, bx: p.x + bx, by: p.y - by + t / 2 },
      { ax: p.x - bx, ay: p.y + by - t / 2, bx: p.x + bx, by: p.y + by - t / 2 },
      { ax: p.x - bx + t / 2, ay: p.y - by + t, bx: p.x - bx + t / 2, by: p.y + by - t },
      { ax: p.x + bx - t / 2, ay: p.y - by + t, bx: p.x + bx - t / 2, by: p.y + by - t },
    ]
    const nHoops = count(rng, bd.hoops)
    const roomy = sides.map((sd, k) => ({ k, len: Math.hypot(sd.bx - sd.ax, sd.by - sd.ay), key: rng.next() })).filter((o) => o.len >= hp.widthU + HOOP_CORNER_U * 2)
    const withHoop = new Set(roomy.sort((a, b) => a.key - b.key).slice(0, nHoops).map((o) => o.k))
    const hoopsAt: Point[] = []
    const owner = beds.length
    sides.forEach((s, k) => {
      const slen = Math.hypot(s.bx - s.ax, s.by - s.ay)
      const ex = (s.bx - s.ax) / slen
      const ey = (s.by - s.ay) / slen
      const a = Math.atan2(ey, ex)
      const seg = (s0: number, s1: number): void => {
        if (s1 - s0 <= 0.01) return
        add('lowHedge', { kind: 'box', x: s.ax + (ex * (s0 + s1)) / 2, y: s.ay + (ey * (s0 + s1)) / 2, hx: (s1 - s0) / 2, hy: t / 2, a, round: 0.12 }, bd.heightM, 0, 'hedge', owner)
      }
      if (!withHoop.has(k)) {
        seg(0, slen)
        return
      }
      const at = HOOP_CORNER_U + hp.widthU / 2 + rng.next() * (slen - 2 * HOOP_CORNER_U - hp.widthU)
      seg(0, at - hp.widthU / 2)
      seg(at + hp.widthU / 2, slen)
      const hx = s.ax + ex * at
      const hy = s.ay + ey * at
      hoopsAt.push({ x: hx, y: hy })
      add('hoop', { kind: 'box', x: hx, y: hy, hx: hp.widthU / 2, hy: t / 2, a, round: 0 }, hp.heightM, hp.gapM, 'wicket', -1)
    })
    beds.push({ x: p.x, y: p.y, hx: bx, hy: by, a: 0, hoops: hoopsAt })
  }

  // 扑克牌士兵的高篱：横平竖直，有的拐一个直角；每排正中附近一个老鼠洞
  const rows: CardRow[] = []
  const cd = cfg.cards
  const nRows = count(rng, cd.rows)
  zones.begin(rng)
  for (let i = 0; i < TRIES * 2 && rows.length < nRows; i++) {
    const p = zones.next(rng, 2)
    const L = between(rng, cd.lengthU)
    const along = rng.next() < 0.5
    const dir = rng.next() < 0.5 ? -1 : 1
    const bent = rng.next() < cd.bend
    const first = bent ? L * (0.5 + rng.next() * 0.2) : L
    const ax = p.x
    const ay = p.y
    const bx = ax + (along ? first * dir : 0)
    const by = ay + (along ? 0 : first * dir)
    const pieces = [{ ax, ay, bx, by }]
    if (bent) {
      const turn = rng.next() < 0.5 ? -1 : 1
      const rest = L - first
      pieces.push({ ax: bx, ay: by, bx: bx + (along ? 0 : rest * turn), by: by + (along ? rest * turn : 0) })
    }
    const circles = pieces.flatMap((q) => capsuleCircles(q.ax, q.ay, q.bx, q.by, cd.thickU / 2 + 0.2))
    const c = { circles, tall: true }
    if (!lot.fits(c)) continue
    lot.take(c)
    zones.took(rng, p)
    const hole = pieces.length > 1 && rng.next() < 0.5 ? 1 : 0
    const q = pieces[hole]!
    const ql = Math.hypot(q.bx - q.ax, q.by - q.ay)
    const t = Math.min(0.75, Math.max(0.25, 0.5 + (rng.next() - 0.5) * 0.4))
    rows.push({ pieces, hole, t, suit: Math.floor(rng.next() * 4) })
    const owner = rows.length - 1
    pieces.forEach((pc, k) => {
      const plen = Math.hypot(pc.bx - pc.ax, pc.by - pc.ay)
      const ex = (pc.bx - pc.ax) / plen
      const ey = (pc.by - pc.ay) / plen
      // 拐角处两段各往外多伸半个厚度，接得严实
      const grow0 = k > 0 ? cd.thickU / 2 : 0
      const grow1 = k < pieces.length - 1 ? cd.thickU / 2 : 0
      const run = (s0: number, s1: number, kind: ObstacleKind): void => {
        const mx = pc.ax + ex * (s0 + s1) / 2
        const my = pc.ay + ey * (s0 + s1) / 2
        add(kind, { kind: 'box', x: mx, y: my, hx: (s1 - s0) / 2, hy: cd.thickU / 2, a: Math.atan2(ey, ex), round: 0 }, cd.heightM, kind === 'hole' ? cd.holeM : 0, 'card', owner)
      }
      if (k !== hole) {
        run(-grow0, plen + grow1, 'card')
        return
      }
      const h0 = ql * t - cd.holeU / 2
      const h1 = ql * t + cd.holeU / 2
      run(-grow0, h0, 'card')
      run(h0, h1, 'hole')
      run(h1, plen + grow1, 'card')
    })
  }

  placeCups(nCups)

  // 大蘑菇
  const mushrooms: Mushroom[] = []
  const nMush = count(rng, cfg.mushrooms.count)
  zones.begin(rng)
  for (let i = 0; i < TRIES && mushrooms.length < nMush; i++) {
    const p = zones.next(rng, 2)
    const c = { circles: [{ x: p.x, y: p.y, r: cfg.mushrooms.stemU }], tall: true }
    if (!lot.fits(c)) continue
    lot.take(c)
    zones.took(rng, p)
    mushrooms.push({ x: p.x, y: p.y, cap: between(rng, cfg.mushrooms.capU), hue: rng.next() })
    add('stem', { kind: 'disc', x: p.x, y: p.y, r: cfg.mushrooms.stemU }, cfg.mushrooms.heightM, 0, 'wood', mushrooms.length - 1)
  }

  // 散落的茶碟
  const saucers: Cup[] = []
  const nSaucers = count(rng, cfg.saucers.count)
  zones.begin(rng)
  for (let i = 0; i < TRIES && saucers.length < nSaucers; i++) {
    const p = zones.next(rng, 2)
    const r = between(rng, cfg.saucers.radiusU)
    const c = { circles: [{ x: p.x, y: p.y, r }], tall: false }
    if (!lot.fits(c)) continue
    lot.take(c)
    zones.took(rng, p)
    saucers.push({ x: p.x, y: p.y, r, a: rng.next() * Math.PI * 2, saucer: r, hue: rng.next() })
    add('saucer', { kind: 'disc', x: p.x, y: p.y, r }, cfg.saucers.heightM, 0, 'china', -1)
  }

  // 草坪上另立的门拱
  const hoops: Hoop[] = []
  const nHoops = count(rng, hp.free)
  zones.begin(rng)
  for (let i = 0; i < TRIES && hoops.length < nHoops; i++) {
    const p = zones.next(rng, 2)
    const a = rng.next() * Math.PI
    const c = { circles: capsuleCircles(p.x - Math.cos(a) * hp.widthU * 0.5, p.y - Math.sin(a) * hp.widthU * 0.5, p.x + Math.cos(a) * hp.widthU * 0.5, p.y + Math.sin(a) * hp.widthU * 0.5, 0.2), tall: false }
    if (!lot.fits(c)) continue
    lot.take(c)
    zones.took(rng, p)
    hoops.push({ x: p.x, y: p.y, a })
    add('hoop', { kind: 'box', x: p.x, y: p.y, hx: hp.widthU / 2, hy: 0.2, a, round: 0 }, hp.heightM, hp.gapM, 'wicket', hoops.length - 1)
  }

  // 躺在草上的怀表、钥匙、纸牌与洒的茶：摆在空处，压不着别的东西
  const decals: Decal[] = []
  const lay = (kind: Decal['kind'], n: number, r: readonly [number, number]): void => {
    for (let i = 0, got = 0; i < TRIES && got < n; i++) {
      const p = anywhere(rng, hw - 1.5, hh - 1.5)
      const rr = between(rng, r)
      if (lawn(p.x, p.y) > -rr - 0.8 || lot.clearance(p.x, p.y) < rr + 0.3) continue
      if (decals.some((d) => Math.hypot(d.x - p.x, d.y - p.y) < d.r + rr + 0.6)) continue
      decals.push({ kind, x: p.x, y: p.y, a: rng.next() * Math.PI * 2, r: rr, k: rng.next() })
      got++
    }
  }
  lay('watch', count(rng, WATCHES), [0.75, 1.05])
  lay('key', count(rng, KEYS), [0.8, 1.1])
  lay('card', count(rng, FALLEN), [0.5, 0.6])
  for (const s of saucers) if (rng.next() < 0.6) decals.push({ kind: 'tea', x: s.x + Math.cos(s.a) * s.r * 1.1, y: s.y + Math.sin(s.a) * s.r * 1.1, a: s.a, r: s.r * 0.9, k: rng.next() })

  // 兔子洞开在上方的树篱脚下：树篱朝下的一面看得见，洞口在那面的底下
  const ha = -Math.PI / 2 + (rng.next() * 2 - 1) * HOLE_SPREAD
  const hole = rimAt(shape, ha)
  const cat = rimAt(shape, ha + HOLE_CAT_APART + rng.next() * (Math.PI * 2 - HOLE_CAT_APART * 2))
  return {
    ...shape,
    start,
    tile,
    table,
    items: tableItems(rng, len, wid),
    chairs,
    teapot,
    cups,
    saucers,
    rows,
    beds,
    hoops,
    mushrooms,
    decals,
    hole,
    cat,
    obstacles,
  }
}
