import { UNIT } from '../../util/units'
import { Rng } from '../../util/rng'
import { ACCRETION_ETA, captureU, holePull, schwarzschildU, shellPull, wallU } from '../../data/nebula'
import type { NebulaConfig } from '../../types/maps'
import type { Point } from '../../util/vec'

/** 地图的半边长，格：镜头往外再看 marginU 格正好到壳层外缘 */
export function nebulaHalfU(cfg: NebulaConfig, marginU: number): number {
  return cfg.shell.outerU - marginU
}

/** 星云在地图上的摆法，像素：球心在地图正中，黑洞与队伍的出发点隔着球心相对；holeU 是黑洞离球心多远，格 */
export interface NebulaLayout {
  readonly cx: number
  readonly cy: number
  readonly hx: number
  readonly hy: number
  readonly sx: number
  readonly sy: number
  readonly holeU: number
}

/** 黑洞的方位与离球心多远由布景种子定下：视图在开战前就要按它摆镜头 */
export function nebulaLayout(cfg: NebulaConfig, seed: number, halfPx: number): NebulaLayout {
  const rng = new Rng(seed ^ 0x6e65)
  const [near, far] = cfg.hole.fromCenterU
  const holeU = near + rng.next() * (far - near)
  const a = rng.next() * Math.PI * 2
  const ux = Math.cos(a)
  const uy = Math.sin(a)
  return {
    cx: halfPx,
    cy: halfPx,
    hx: halfPx + ux * holeU * UNIT,
    hy: halfPx + uy * holeU * UNIT,
    sx: halfPx - ux * cfg.hole.startU * UNIT,
    sy: halfPx - uy * cfg.hole.startU * UNIT,
    holeU,
  }
}

/** 一次吸积闪耀：吞下的时刻，毫秒；放出的光能折成平时吸积多少秒的光 */
export interface Flare {
  readonly at: number
  readonly k: number
}

/** 吞下一样东西：在哪（像素）、折成多少 GM、什么时候；给画面看，画面看完就清掉 */
export interface Swallow {
  readonly x: number
  readonly y: number
  readonly gm: number
  readonly at: number
}

/** 流星：预警时团块在内壁上亮起来，之后带着速度冲进空腔；位置像素、速度像素/秒 */
export interface NebulaMeteor {
  phase: 'warn' | 'fly'
  since: number
  x: number
  y: number
  vx: number
  vy: number
  readonly ux: number
  readonly uy: number
  readonly hit: Set<number>
}

/** 流星的结局：冲进壳层被撕碎、掉进视界、飞到时限散掉；给画面看 */
export interface MeteorEnd {
  readonly kind: 'shatter' | 'swallow' | 'fade'
  readonly x: number
  readonly y: number
  readonly vx: number
  readonly vy: number
  readonly at: number
}

export interface NebulaState {
  readonly layout: NebulaLayout
  /** 黑洞此刻的引力常数乘质量（格³/秒²）与视界（格） */
  gm: number
  rs: number
  readonly flares: Flare[]
  readonly swallows: Swallow[]
  meteor: NebulaMeteor | null
  /** 下一颗流星开始预警的时刻 */
  meteorAt: number
  readonly ends: MeteorEnd[]
}

/** 着色器给光回波留了这么多次闪耀 */
export const MAX_FLARES = 8

export function makeNebula(cfg: NebulaConfig, seed: number, halfPx: number): NebulaState {
  return {
    layout: nebulaLayout(cfg, seed, halfPx),
    gm: cfg.hole.gm,
    rs: schwarzschildU(cfg.hole.gm, cfg.hole.lightU),
    flares: [],
    swallows: [],
    meteor: null,
    meteorAt: cfg.meteor.firstMs,
    ends: [],
  }
}

/** 这一点的引力加速度，像素/秒²：黑洞按 Paczyński–Wiita 势指向黑洞，壳层指向球心；视界里没有定义，由汇接住 */
export function gravityAt(s: NebulaState, cfg: NebulaConfig, x: number, y: number): Point {
  const L = s.layout
  let gx = 0
  let gy = 0
  const hx = (L.hx - x) / UNIT
  const hy = (L.hy - y) / UNIT
  const r = Math.hypot(hx, hy)
  if (r > s.rs) {
    const k = holePull(s.gm, s.rs, r) / r
    gx = hx * k
    gy = hy * k
  }
  const ox = (x - L.cx) / UNIT
  const oy = (y - L.cy) / UNIT
  const rc = Math.hypot(ox, oy)
  if (rc > cfg.shell.innerU) {
    const k = shellPull(cfg.shell, rc) / rc
    gx -= ox * k
    gy -= oy * k
  }
  return { x: gx * UNIT, y: gy * UNIT }
}

export function inHorizon(s: NebulaState, x: number, y: number): boolean {
  const r = s.rs * UNIT
  return (x - s.layout.hx) ** 2 + (y - s.layout.hy) ** 2 < r * r
}

/** 离球心多远，格 */
export function fromCenterU(s: NebulaState, x: number, y: number): number {
  return Math.hypot(x - s.layout.cx, y - s.layout.cy) / UNIT
}

/** 身体走不出来的半径，像素：fall 是质量/阻力，speedU 是它此刻最快能走多快（格/秒） */
export function reachPx(s: NebulaState, fall: number, speedU: number): number {
  return speedU > 0 ? captureU(s.gm, s.rs, fall / speedU) * UNIT : Infinity
}

/** 平时吸积的光度，以开局时为 1：邦迪吸积率随质量的平方涨 */
export function bondiLum(s: NebulaState, cfg: NebulaConfig): number {
  return (s.gm / cfg.hole.gm) ** 2
}

/** 一次闪耀在吞下 t 秒后的光度形状，对时间积分为 1：按 riseMs 亮起、按黏滞时标 viscousMs 衰减 */
export function flareShape(cfg: NebulaConfig, t: number): number {
  if (t <= 0) return 0
  const r = cfg.accretion.riseMs / 1000
  const d = cfg.accretion.viscousMs / 1000
  return ((r + d) / (d * d)) * (1 - Math.exp(-t / r)) * Math.exp(-t / d)
}

/** at 毫秒时吸积盘的光度，以开局时平时的为 1 */
export function luminosity(s: NebulaState, cfg: NebulaConfig, at: number): number {
  let l = bondiLum(s, cfg)
  for (const f of s.flares) l += f.k * flareShape(cfg, (at - f.at) / 1000)
  return l
}

/** 黑洞长大：吞下的质量扣掉化成光的那份（eta）并进黑洞，开局的质量是下限、maxGm 是上限 */
function grow(s: NebulaState, cfg: NebulaConfig, gm: number, eta: number): void {
  s.gm = Math.min(cfg.hole.maxGm, s.gm + (1 - eta) * gm)
  s.rs = schwarzschildU(s.gm, cfg.hole.lightU)
}

/** 平时吸着周围稀薄的气体：邦迪吸积率随质量的平方涨 */
export function accrete(s: NebulaState, cfg: NebulaConfig, dt: number): void {
  grow(s, cfg, cfg.accretion.bondiGm * bondiLum(s, cfg) * dt, ACCRETION_ETA)
}

/** 画面每帧取走的事件最多攒这么多 */
const MAX_EVENTS = 64

/** 吞下一样东西：放出的光能记成一次闪耀，其余的质量并进黑洞；差不多同时吞下的并成一次，记满了就丢掉此刻最暗的那次 */
export function feed(s: NebulaState, cfg: NebulaConfig, gm: number, at: number, x: number, y: number): void {
  if (gm <= 0) return
  const eta = cfg.swallow.lightEta
  grow(s, cfg, gm, eta)
  const k = (eta * gm) / (ACCRETION_ETA * cfg.accretion.bondiGm)
  const last = s.flares[s.flares.length - 1]
  if (last && at - last.at < cfg.accretion.riseMs) s.flares[s.flares.length - 1] = { at: last.at, k: last.k + k }
  else {
    s.flares.push({ at, k })
    if (s.flares.length > MAX_FLARES) {
      const left = (f: Flare): number => f.k * Math.exp(-(at - f.at) / cfg.accretion.viscousMs)
      let faint = 0
      for (let i = 1; i < s.flares.length; i++) if (left(s.flares[i]!) < left(s.flares[faint]!)) faint = i
      s.flares.splice(faint, 1)
    }
  }
  s.swallows.push({ x, y, gm, at })
  if (s.swallows.length > MAX_EVENTS) s.swallows.shift()
}

export function endMeteor(s: NebulaState, end: MeteorEnd): void {
  s.ends.push(end)
  if (s.ends.length > MAX_EVENTS) s.ends.shift()
}

/** 闪耀灭得差不多了就不再记：衰减了这么多个黏滞时标 */
const FLARE_LIFE = 9

export function pruneFlares(s: NebulaState, cfg: NebulaConfig, now: number): void {
  const life = cfg.accretion.viscousMs * FLARE_LIFE
  while (s.flares.length > 0 && now - s.flares[0]!.at > life) s.flares.shift()
}

/** 壳层的湍流甩出一个团块：瞄准队长身旁一点，方向随机，从这条直线与看得见的内壁的交点冲进来 */
export function launchMeteor(s: NebulaState, cfg: NebulaConfig, rng: Rng, lx: number, ly: number, now: number): NebulaMeteor {
  const mc = cfg.meteor
  const L = s.layout
  const a = rng.next() * Math.PI * 2
  const ux = Math.cos(a)
  const uy = Math.sin(a)
  const off = (rng.next() * 2 - 1) * mc.offsetU * UNIT
  let px = lx - uy * off - L.cx
  let py = ly + ux * off - L.cy
  const lim = (cfg.shell.innerU - 1) * UNIT
  const r = Math.hypot(px, py)
  if (r > lim) {
    px *= lim / r
    py *= lim / r
  }
  const wall = wallU(cfg.shell) * UNIT
  const pd = px * ux + py * uy
  const t = pd + Math.sqrt(Math.max(0, pd * pd - (px * px + py * py) + wall * wall))
  const speed = mc.speedU * UNIT * (1 + (rng.next() * 2 - 1) * mc.speedJitter)
  return { phase: 'warn', since: now, x: L.cx + px - ux * t, y: L.cy + py - uy * t, vx: ux * speed, vy: uy * speed, ux, uy, hit: new Set() }
}

/** 流星飞一步：速度韦尔莱积分，按走过的路与转向拆成小步；返回它这一步怎么结束的，还在飞就是 null */
export function flyMeteor(s: NebulaState, cfg: NebulaConfig, m: NebulaMeteor, dt: number): MeteorEnd['kind'] | null {
  let a = gravityAt(s, cfg, m.x, m.y)
  let left = dt
  for (let i = 0; i < 64 && left > 1e-6; i++) {
    const v = Math.hypot(m.vx, m.vy)
    const g = Math.hypot(a.x, a.y)
    let h = Math.min(left, (0.2 * UNIT) / Math.max(v, 1))
    if (g > 0) h = Math.min(h, (0.05 * Math.max(v, UNIT)) / g)
    m.x += m.vx * h + 0.5 * a.x * h * h
    m.y += m.vy * h + 0.5 * a.y * h * h
    if (inHorizon(s, m.x, m.y)) return 'swallow'
    const b = gravityAt(s, cfg, m.x, m.y)
    m.vx += 0.5 * (a.x + b.x) * h
    m.vy += 0.5 * (a.y + b.y) * h
    a = b
    left -= h
    const ox = m.x - s.layout.cx
    const oy = m.y - s.layout.cy
    if (Math.hypot(ox, oy) > (cfg.shell.innerU + cfg.meteor.shatterU) * UNIT && ox * m.vx + oy * m.vy > 0) return 'shatter'
  }
  return null
}

/** 从 (x, y) 朝 (tx, ty) 走、绕开以 (ox, oy) 为心半径 r 的圆：直线穿过圆就改走切线，从离目标近的一侧绕；已经在圆里就径直往外走 */
export function aroundCircle(x: number, y: number, tx: number, ty: number, ox: number, oy: number, r: number): Point {
  const vx = tx - x
  const vy = ty - y
  const len = Math.hypot(vx, vy)
  if (len === 0) return { x: 0, y: 0 }
  const ux = vx / len
  const uy = vy / len
  const cx = ox - x
  const cy = oy - y
  const d = Math.hypot(cx, cy)
  if (d <= r) return d > 0 ? { x: -cx / d, y: -cy / d } : { x: ux, y: uy }
  const along = cx * ux + cy * uy
  const side = cx * uy - cy * ux
  if (along <= 0 || along >= len || Math.hypot(tx - ox, ty - oy) <= r || Math.abs(side) >= r) return { x: ux, y: uy }
  const half = Math.asin(r / d)
  const base = Math.atan2(cy, cx)
  const turn = base + (side > 0 ? half : -half)
  return { x: Math.cos(turn), y: Math.sin(turn) }
}

/** 游荡着走到空腔内壁跟前就像撞上地图边一样折回来 */
export function keepInCavity(s: NebulaState, cfg: NebulaConfig, x: number, y: number, dx: number, dy: number, marginPx: number): Point {
  const ox = x - s.layout.cx
  const oy = y - s.layout.cy
  const d = Math.hypot(ox, oy)
  if (d < cfg.shell.innerU * UNIT - marginPx || ox * dx + oy * dy <= 0) return { x: dx, y: dy }
  const dot = (dx * ox + dy * oy) / d
  return { x: dx - (2 * dot * ox) / d, y: dy - (2 * dot * oy) / d }
}

/** 把一点收进空腔里离内壁 insetPx 以内，再推到离黑洞 clearPx 以外 */
export function settleSpot(s: NebulaState, cfg: NebulaConfig, x: number, y: number, clearPx: number, insetPx: number): Point {
  const L = s.layout
  const lim = cfg.shell.innerU * UNIT - insetPx
  let px = x
  let py = y
  for (let k = 0; k < 3; k++) {
    const ox = px - L.cx
    const oy = py - L.cy
    const d = Math.hypot(ox, oy)
    if (d > lim) {
      px = L.cx + (ox / d) * lim
      py = L.cy + (oy / d) * lim
    }
    const hx = px - L.hx
    const hy = py - L.hy
    const h = Math.hypot(hx, hy)
    if (h >= clearPx) break
    const ux = h > 1e-6 ? hx / h : (L.cx - L.hx) / (L.holeU * UNIT || 1)
    const uy = h > 1e-6 ? hy / h : (L.cy - L.hy) / (L.holeU * UNIT || 1)
    px = L.hx + ux * clearPx
    py = L.hy + uy * clearPx
  }
  return { x: px, y: py }
}

/** 空腔里离内壁 insetPx 以内、离黑洞至少 clearPx、离 (lx, ly) 至少 nearPx 的随机一点；挑不到就取挑过的点里离黑洞最远的 */
export function spawnSpot(s: NebulaState, cfg: NebulaConfig, next: () => number, clearPx: number, insetPx: number, lx: number, ly: number, nearPx: number): Point {
  const L = s.layout
  const lim = cfg.shell.innerU * UNIT - insetPx
  let best: Point = { x: L.sx, y: L.sy }
  let bestD = -1
  for (let i = 0; i < 32; i++) {
    const r = Math.sqrt(next()) * lim
    const a = next() * Math.PI * 2
    const p = { x: L.cx + Math.cos(a) * r, y: L.cy + Math.sin(a) * r }
    const h = Math.hypot(p.x - L.hx, p.y - L.hy)
    if (h >= clearPx && Math.hypot(p.x - lx, p.y - ly) >= nearPx) return p
    if (h > bestD) {
      bestD = h
      best = p
    }
  }
  return best
}

/** 半径 reach（流星加身体）的接触沿 (x0, y0)→(x1, y1) 扫过 (cx, cy)：返回碰上那一刻从流星指向身体的单位法线，没碰上为 null */
export function sweepContact(x0: number, y0: number, x1: number, y1: number, cx: number, cy: number, reach: number): Point | null {
  const dx = x1 - x0
  const dy = y1 - y0
  const fx = x0 - cx
  const fy = y0 - cy
  const a = dx * dx + dy * dy
  const c = fx * fx + fy * fy - reach * reach
  let t = 0
  if (c > 0) {
    if (a < 1e-9) return null
    const b = 2 * (fx * dx + fy * dy)
    const disc = b * b - 4 * a * c
    if (disc < 0) return null
    t = (-b - Math.sqrt(disc)) / (2 * a)
    if (t < 0 || t > 1) return null
  }
  const nx = cx - (x0 + dx * t)
  const ny = cy - (y0 + dy * t)
  const n = Math.hypot(nx, ny)
  if (n > 1e-6) return { x: nx / n, y: ny / n }
  const l = Math.sqrt(a)
  return l > 1e-9 ? { x: dx / l, y: dy / l } : { x: 1, y: 0 }
}
