import { Rng } from '../../util/rng'

/** 沙漠里的标志物：一棵枯死的金合欢、一根拴着破布的路标杆、一座石堆、一副半埋的驼骨、一块风蚀的岩盘 */
export type MarkerKind = 'tree' | 'post' | 'cairn' | 'bones' | 'rock'
export const LANDMARK_KINDS: readonly MarkerKind[] = ['tree', 'post', 'cairn', 'bones', 'rock']
/** 地上立着的东西：标志物，加上只做点缀的仙人掌（不当刷怪口） */
export type LandmarkKind = MarkerKind | 'cactus'

/** 一段枝干、木杆或骨头：两端相对标志物中心的位置（格）与离地高度（米），两端的半径（格） */
export interface Limb {
  readonly x0: number
  readonly y0: number
  readonly z0: number
  readonly x1: number
  readonly y1: number
  readonly z1: number
  readonly r0: number
  readonly r1: number
}

/** 一块石头：中心相对标志物中心的位置与半径（格），底与顶离地多高（米） */
export interface Stone {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly z0: number
  readonly z1: number
}

/** 风蚀的岩盘：顺着盛行风拉长，迎风的一头钝、背风的一头收尖；长、宽（格），高（米），朝向（弧度） */
export interface Slab {
  readonly length: number
  readonly width: number
  readonly height: number
  readonly angle: number
}

/** 挡人的实心部分：从 (x0, y0) 到 (x1, y1)（相对标志物中心，格）的线段向两边各鼓出 r 格，两头是半圆 */
export interface Solid {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
  readonly r: number
}

/** 一样标志物的形状：同一个种子总是同一个样子，一对标志物一模一样；solids 是它压在地上、挡人的那部分 */
export interface LandmarkShape {
  readonly kind: LandmarkKind
  readonly limbs: readonly Limb[]
  readonly stones: readonly Stone[]
  readonly slab: Slab | null
  readonly solids: readonly Solid[]
  /** 本身伸出中心多远，格 */
  readonly reach: number
  /** 最高处离地多高，米 */
  readonly top: number
}

const TAU = Math.PI * 2

/** 把一堆石头圈成一个圆：圆心在标志物中心，刚好盖住最外面那块 */
function around(stones: readonly Stone[]): Solid {
  let r = 0
  for (const s of stones) r = Math.max(r, Math.hypot(s.x, s.y) + s.r)
  return { x0: 0, y0: 0, x1: 0, y1: 0, r }
}

function tree(rng: Rng): LandmarkShape {
  const limbs: Limb[] = []
  const trunk = 0.95 + 0.35 * rng.next()
  const lean = rng.next() * TAU
  const tx = Math.cos(lean) * (0.06 + 0.08 * rng.next())
  const ty = Math.sin(lean) * (0.06 + 0.08 * rng.next())
  limbs.push({ x0: 0, y0: 0, z0: 0, x1: tx, y1: ty, z1: trunk, r0: 0.11, r1: 0.075 })
  const n = 4 + Math.floor(rng.next() * 3)
  const turn = rng.next() * TAU
  let reach = 0
  let top = trunk
  for (let k = 0; k < n; k++) {
    let a = turn + (k / n) * TAU + (rng.next() * 2 - 1) * 0.45
    const len = 0.95 + 0.75 * rng.next()
    const rise = 0.55 + 0.6 * rng.next()
    let x = tx
    let y = ty
    let z = trunk
    let r = 0.068
    const parts = 3
    for (let s = 0; s < parts; s++) {
      const f = (s + 1) / parts
      a += (rng.next() * 2 - 1) * 0.22
      const step = len / parts
      const nx = x + Math.cos(a) * step
      const ny = y + Math.sin(a) * step
      // 金合欢的伞形：先往上蹿，越往外越平
      const nz = trunk + rise * (1 - (1 - f) * (1 - f))
      const nr = 0.068 - 0.044 * f
      limbs.push({ x0: x, y0: y, z0: z, x1: nx, y1: ny, z1: nz, r0: r, r1: nr })
      if (s > 0 || rng.next() < 0.5) {
        const side = rng.next() < 0.5 ? -1 : 1
        const b = a + side * (0.45 + 0.4 * rng.next())
        const bl = 0.32 + 0.3 * rng.next()
        const bx = nx + Math.cos(b) * bl
        const by = ny + Math.sin(b) * bl
        limbs.push({ x0: nx, y0: ny, z0: nz, x1: bx, y1: by, z1: nz + 0.12 + 0.12 * rng.next(), r0: nr * 0.75, r1: 0.011 })
        reach = Math.max(reach, Math.hypot(bx, by))
      }
      x = nx
      y = ny
      z = nz
      r = nr
      reach = Math.max(reach, Math.hypot(x, y))
      top = Math.max(top, z + 0.24)
    }
  }
  return { kind: 'tree', limbs, stones: [], slab: null, solids: [{ x0: 0, y0: 0, x1: tx, y1: ty, r: 0.12 }], reach: reach + 0.1, top }
}

function post(rng: Rng): LandmarkShape {
  const height = 1.55 + 0.3 * rng.next()
  const lean = rng.next() * TAU
  const tip = 0.03 + 0.05 * rng.next()
  const limbs: Limb[] = [{ x0: 0, y0: 0, z0: 0, x1: Math.cos(lean) * tip, y1: Math.sin(lean) * tip, z1: height, r0: 0.05, r1: 0.04 }]
  const stones: Stone[] = []
  const n = 4 + Math.floor(rng.next() * 2)
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU + rng.next() * 0.8
    const d = 0.13 + 0.07 * rng.next()
    stones.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: 0.07 + 0.04 * rng.next(), z0: 0, z1: 0.07 + 0.06 * rng.next() })
  }
  return { kind: 'post', limbs, stones, slab: null, solids: [around(stones)], reach: 0.35, top: height }
}

function cairn(rng: Rng): LandmarkShape {
  const stones: Stone[] = []
  const layers = [
    { n: 6, ring: 0.27, r: 0.16, z0: 0, z1: 0.24 },
    { n: 4, ring: 0.16, r: 0.14, z0: 0.18, z1: 0.42 },
    { n: 3, ring: 0.08, r: 0.115, z0: 0.37, z1: 0.6 },
    { n: 1, ring: 0, r: 0.095, z0: 0.56, z1: 0.76 },
  ]
  for (const l of layers) {
    const turn = rng.next() * TAU
    for (let k = 0; k < l.n; k++) {
      const a = turn + (k / l.n) * TAU + (rng.next() * 2 - 1) * 0.3
      const d = l.ring * (0.85 + 0.3 * rng.next())
      stones.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: l.r * (0.85 + 0.3 * rng.next()), z0: l.z0, z1: l.z1 * (0.92 + 0.12 * rng.next()) })
    }
  }
  return { kind: 'cairn', limbs: [], stones, slab: null, solids: [around(stones)], reach: 0.5, top: 0.8 }
}

/** 驼骨：一条微弯的脊椎，一头是头骨，中段两侧的肋骨往外弯、一半埋在沙里 */
function bones(rng: Rng): LandmarkShape {
  const limbs: Limb[] = []
  const stones: Stone[] = []
  const a = rng.next() * TAU
  const bend = (rng.next() * 2 - 1) * 0.35
  const len = 1.35 + 0.25 * rng.next()
  const n = 11
  const spine: { x: number; y: number; dx: number; dy: number }[] = []
  for (let k = 0; k <= n; k++) {
    const t = k / n - 0.5
    const h = a + bend * t * 2
    spine.push({ x: Math.cos(a) * t * len - Math.sin(a) * bend * t * t * len, y: Math.sin(a) * t * len + Math.cos(a) * bend * t * t * len, dx: Math.cos(h), dy: Math.sin(h) })
  }
  for (let k = 0; k < n; k++) {
    const p = spine[k]!
    const q = spine[k + 1]!
    limbs.push({ x0: p.x, y0: p.y, z0: 0.05, x1: q.x, y1: q.y, z1: 0.05, r0: 0.035, r1: 0.035 })
  }
  const head = spine[n]!
  stones.push({ x: head.x + head.dx * 0.16, y: head.y + head.dy * 0.16, r: 0.13, z0: 0, z1: 0.13 })
  stones.push({ x: head.x + head.dx * 0.33, y: head.y + head.dy * 0.33, r: 0.08, z0: 0, z1: 0.08 })
  for (let k = 3; k <= 8; k++) {
    const p = spine[k]!
    for (const side of [-1, 1]) {
      const nx = -p.dy * side
      const ny = p.dx * side
      const out = 0.3 + 0.12 * Math.sin((k / n) * Math.PI)
      const lift = 0.12 + 0.12 * rng.next()
      // 肋骨弯成弧：先往外翘起，再朝后落回沙里
      const mx = p.x + nx * out * 0.55 - p.dx * 0.05
      const my = p.y + ny * out * 0.55 - p.dy * 0.05
      const ex = p.x + nx * out - p.dx * 0.16
      const ey = p.y + ny * out - p.dy * 0.16
      limbs.push({ x0: p.x, y0: p.y, z0: 0.06, x1: mx, y1: my, z1: lift, r0: 0.026, r1: 0.022 })
      limbs.push({ x0: mx, y0: my, z0: lift, x1: ex, y1: ey, z1: 0.01, r0: 0.022, r1: 0.016 })
    }
  }
  // 尾巴一段细，带肋骨的一段宽，脖子连头骨一段
  const snout = { x: head.x + head.dx * 0.33, y: head.y + head.dy * 0.33 }
  const solids: Solid[] = [
    { x0: spine[0]!.x, y0: spine[0]!.y, x1: spine[3]!.x, y1: spine[3]!.y, r: 0.08 },
    { x0: spine[3]!.x, y0: spine[3]!.y, x1: spine[8]!.x, y1: spine[8]!.y, r: 0.4 },
    { x0: spine[8]!.x, y0: spine[8]!.y, x1: snout.x, y1: snout.y, r: 0.15 },
  ]
  return { kind: 'bones', limbs, stones, slab: null, solids, reach: 1.25, top: 0.26 }
}

function rock(rng: Rng, windAngle: number): LandmarkShape {
  const slab: Slab = { length: 1.9 + 0.6 * rng.next(), width: 0.85 + 0.3 * rng.next(), height: 0.36 + 0.2 * rng.next(), angle: windAngle + (rng.next() * 2 - 1) * 0.2 }
  // 迎风钝、背风收尖：顺着长轴分三段，一段比一段细
  const half = slab.length / 2
  const r0 = slab.width / 2
  const along = (u0: number, u1: number, r: number): Solid => ({ x0: Math.cos(slab.angle) * u0, y0: Math.sin(slab.angle) * u0, x1: Math.cos(slab.angle) * u1, y1: Math.sin(slab.angle) * u1, r })
  const solids = [along(-half + r0, 0, r0), along(0, half * 0.5, r0 * 0.72), along(half * 0.5, half * 0.86, r0 * 0.36)]
  return { kind: 'rock', limbs: [], stones: [], slab, solids, reach: slab.length * 0.85, top: slab.height }
}

/** 柱形仙人掌：一根粗干，带一到两条先横伸再朝上翘的侧臂，影子落在地上是仙人掌的剪影；只有脚下的主干挡人 */
function cactus(rng: Rng): LandmarkShape {
  const height = 1.3 + 0.7 * rng.next()
  const lean = rng.next() * TAU
  const tip = 0.02 + 0.03 * rng.next()
  const tx = Math.cos(lean) * tip
  const ty = Math.sin(lean) * tip
  const limbs: Limb[] = [{ x0: 0, y0: 0, z0: 0, x1: tx, y1: ty, z1: height, r0: 0.45, r1: 0.42 }]
  const arms = 1 + Math.floor(rng.next() * 2)
  const turn = rng.next() * TAU
  let reach = 0.45
  for (let k = 0; k < arms; k++) {
    const a = turn + k * Math.PI + (rng.next() * 2 - 1) * 0.5
    const z = height * (0.35 + 0.2 * rng.next())
    const out = 0.85 + 0.25 * rng.next()
    const up = Math.min(z + 0.35 + 0.4 * rng.next(), height - 0.05)
    const ex = Math.cos(a) * out
    const ey = Math.sin(a) * out
    limbs.push({ x0: 0, y0: 0, z0: z, x1: ex, y1: ey, z1: z + 0.1, r0: 0.26, r1: 0.26 })
    limbs.push({ x0: ex, y0: ey, z0: z + 0.1, x1: ex * 1.06, y1: ey * 1.06, z1: up, r0: 0.26, r1: 0.24 })
    reach = Math.max(reach, out * 1.06 + 0.26)
  }
  return { kind: 'cactus', limbs, stones: [], slab: null, solids: [{ x0: 0, y0: 0, x1: 0, y1: 0, r: 0.45 }], reach: reach + 0.05, top: height }
}

/** 按种类与种子生成一样标志物；岩盘顺着盛行风拉长 */
export function landmarkShape(kind: LandmarkKind, seed: number, windAngle: number): LandmarkShape {
  const rng = new Rng(seed)
  if (kind === 'tree') return tree(rng)
  if (kind === 'post') return post(rng)
  if (kind === 'cairn') return cairn(rng)
  if (kind === 'bones') return bones(rng)
  if (kind === 'cactus') return cactus(rng)
  return rock(rng, windAngle)
}

/** 岩盘的边磨圆的宽度（格）与圆肩的指数：离边 SLAB_EDGE 以内按它升到顶面 */
const SLAB_EDGE = 0.16
const SLAB_ROUND = 0.6

/** 岩盘在自己的坐标里 (u 沿长、v 沿宽，格) 离边多远（格，里面为正）与顶面的高（米） */
export function slabAt(s: Slab, u: number, v: number): { inside: number; z: number } {
  const half = s.length / 2
  const t = u / half
  if (t <= -1 || t >= 1) return { inside: -(Math.abs(u) - half) - Math.max(0, Math.abs(v) - s.width / 2), z: 0 }
  const taper = t > 0 ? 1 - 0.45 * t : 1
  const w = (s.width / 2) * Math.pow(1 - t * t, 0.45) * taper
  const inside = Math.min(w - Math.abs(v), (1 - Math.abs(t)) * half)
  const z = s.height * Math.min(1, Math.max(0, inside / SLAB_EDGE)) ** SLAB_ROUND
  return { inside, z }
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

/** 点 (px, py) 到线段 (ax, ay)–(bx, by) 的距离平方与最近点的参数 */
function nearSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number, out: { d2: number; t: number }): void {
  const ex = bx - ax
  const ey = by - ay
  const l2 = ex * ex + ey * ey
  const t = l2 > 1e-12 ? clamp01(((px - ax) * ex + (py - ay) * ey) / l2) : 0
  const qx = ax + ex * t - px
  const qy = ay + ey * t - py
  out.d2 = qx * qx + qy * qy
  out.t = t
}

const NEAR = { d2: 0, t: 0 }

/**
 * 标志物投在地上的影子盖住 (qx, qy)（相对中心，格）的程度：off 是离地每高一米影子往外挪多少（格，背着太阳），soft 是影子边糊开多宽（格）。
 * 枝干与木杆按两端投下去的胶囊，石头按从底到顶拖出的胶囊，岩盘按从底到顶平移的轮廓
 */
export function shadowCover(sh: LandmarkShape, offX: number, offY: number, qx: number, qy: number, soft: number): number {
  let cover = 0
  for (const l of sh.limbs) {
    nearSeg(qx, qy, l.x0 + offX * l.z0, l.y0 + offY * l.z0, l.x1 + offX * l.z1, l.y1 + offY * l.z1, NEAR)
    const r = l.r0 + (l.r1 - l.r0) * NEAR.t
    const d = Math.sqrt(NEAR.d2)
    if (d < r + soft) cover = Math.max(cover, clamp01((r + soft - d) / (2 * soft)))
    if (cover >= 1) return 1
  }
  for (const s of sh.stones) {
    nearSeg(qx, qy, s.x, s.y, s.x + offX * s.z1, s.y + offY * s.z1, NEAR)
    const d = Math.sqrt(NEAR.d2)
    const r = s.r * (1 - 0.25 * NEAR.t)
    if (d < r + soft) cover = Math.max(cover, clamp01((r + soft - d) / (2 * soft)))
    if (cover >= 1) return 1
  }
  const sl = sh.slab
  if (sl) {
    const c = Math.cos(sl.angle)
    const s = Math.sin(sl.angle)
    // 地上这一点在影子里：顺着光往回找，有一个高度 z 处岩盘的顶高过 z
    for (let k = 1; k <= 4; k++) {
      const z = (sl.height * k) / 4
      const px = qx - offX * z
      const py = qy - offY * z
      const at = slabAt(sl, px * c + py * s, -px * s + py * c)
      const need = SLAB_EDGE * (z / sl.height) ** (1 / SLAB_ROUND)
      cover = Math.max(cover, clamp01((at.inside - need + soft) / (2 * soft)))
    }
  }
  return cover
}

/** 影子连同标志物本身占的范围，格（相对中心）：画影子、算背阴时只看这个框里 */
export function shadowBox(sh: LandmarkShape, offX: number, offY: number): { x0: number; y0: number; x1: number; y1: number } {
  const r = sh.reach + 0.2
  const sx = offX * sh.top
  const sy = offY * sh.top
  return { x0: Math.min(-r, sx - r), y0: Math.min(-r, sy - r), x1: Math.max(r, sx + r), y1: Math.max(r, sy + r) }
}
