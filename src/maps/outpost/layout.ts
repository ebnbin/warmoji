import { FRAME_U, UNIT } from '../../util/units.ts'
import { Rng } from '../../util/rng.ts'
import { SUN } from '../../data/light.ts'
import { makeBasin, roomAt } from '../basin.ts'
import type { Basin } from '../basin'
import type { Landmark } from '../landmark'
import type { OutpostConfig } from '../../types/maps'
import type { Point } from '../../util/vec'

/** 台地边沿按方位取多少个半径 */
const RIM_SAMPLES = 720
/** 能走的地面与矮设施的距离场格子边长，格；窄过两倍 NECK_U 的缝填掉 */
const BASIN_CELL_U = 0.1
const NECK_U = 0.12
/** 设施离围栏至少留出这么宽（格）的过道，离站心的空场至少这么远（格），设施之间至少隔这么远（格） */
const AISLE_U = 0.9
const HUB_GAP_U = 0.7
const GEAR_GAP_U = 0.9
/** 荒野：离外圈围栏至少这么远（格）、离台地边至少这么远（格）才摆晶簇与裂缝 */
const WILD_IN_U = 1.6
const WILD_OUT_U = 1.3
/** 寻路的格子边长，格 */
export const FLOW_CELL_U = 0.5
/** 连着两座圆顶舱的走廊多高，米 */
export const TUBE_M = 2
/** 圆顶舱朝站心伸出的气闸：从几倍半径处起，伸出多长、多宽（格），多高（米） */
export const AIRLOCK = { from: 0.82, len: 0.75, wid: 0.62, m: 1.4 } as const

/** (x, y) 格在不在圆顶舱 d 的气闸里，往外放宽 pad 格；气闸朝着站心 (cx, cy) */
export function inAirlock(d: Disc, cx: number, cy: number, x: number, y: number, pad: number): { u: number; v: number } | null {
  const a = Math.atan2(cy - d.y, cx - d.x)
  const ca = Math.cos(a)
  const sa = Math.sin(a)
  const dx = x - d.x
  const dy = y - d.y
  const u = dx * ca + dy * sa - d.r * AIRLOCK.from
  const v = -dx * sa + dy * ca
  return u >= -pad && u <= AIRLOCK.len + pad && Math.abs(v) <= AIRLOCK.wid / 2 + pad ? { u, v } : null
}

/** 一根立柱，格 */
export interface Pylon {
  readonly x: number
  readonly y: number
}

/** 一段围栏：两头立柱的序号与坐标（格），归哪一组；spoke 是辐条上的，yard 是外圈那段围着的院子（辐条为 -1） */
export interface Segment {
  readonly a: number
  readonly b: number
  readonly ax: number
  readonly ay: number
  readonly bx: number
  readonly by: number
  readonly group: number
  readonly spoke: boolean
  readonly yard: number
}

/** 一个院子：两道辐条之间从 a0 到 a1 的方位（弧度，a1 > a0），外墙归哪一组，摆着什么设施 */
export interface Yard {
  readonly a0: number
  readonly a1: number
  readonly group: number
  readonly role: YardRole
}

/** 院子里摆什么：着陆平台，两座连着的居住舱，一座实验舱与天线，一片太阳能板 */
export type YardRole = 'pad' | 'habitat' | 'lab' | 'power'

/** 圆心与半径，格 */
export interface Disc {
  readonly x: number
  readonly y: number
  readonly r: number
}

export interface Console extends Disc {
  readonly group: number
}

/** 连着两座圆顶舱的走廊：两头圆心（格）与宽（格） */
export interface Tube {
  readonly ax: number
  readonly ay: number
  readonly bx: number
  readonly by: number
  readonly w: number
}

/** 一块太阳能板：中心（格），沿长边 len、横着 wid 格，长边朝 a 弧度 */
export interface Panel {
  readonly x: number
  readonly y: number
  readonly len: number
  readonly wid: number
  readonly a: number
}

/** 一簇晶体：圆心与占地半径（格），高的挡人挡子弹、矮的只挡贴地的；prisms 是一根根晶柱（相对圆心的格、朝向、长、粗） */
export interface Crystal extends Disc {
  readonly tall: boolean
  readonly prisms: readonly { readonly dx: number; readonly dy: number; readonly a: number; readonly len: number; readonly w: number }[]
}

/** 一道裂缝：折线（格），最宽处多宽（格），中点 */
export interface Rift {
  readonly pts: readonly Point[]
  readonly w: number
  readonly x: number
  readonly y: number
}

/** 一株异星植物：圆心（格）、大小（格）、哪一种、自己的种子 */
export interface Plant extends Disc {
  readonly kind: number
  readonly seed: number
}

/**
 * 一局的前哨：站心（格）、台地边沿各方位的半径（格）；立柱、围栏、院子与各组默认亮不亮；控制台与院子里的设施，荒野的晶簇、裂缝与植物；
 * 挡身体的距离场：basin 是台地与高过一切的设施，low 是矮设施（太阳能板、矮晶簇）
 */
export interface OutpostPlan {
  readonly cx: number
  readonly cy: number
  readonly rim: Float32Array
  readonly ring: readonly Point[]
  readonly pylons: readonly Pylon[]
  readonly segments: readonly Segment[]
  readonly yards: readonly Yard[]
  readonly defaults: readonly boolean[]
  readonly consoles: readonly Console[]
  readonly domes: readonly Disc[]
  readonly tubes: readonly Tube[]
  readonly pad: Disc | null
  readonly mast: Disc | null
  readonly panels: readonly Panel[]
  readonly crystals: readonly Crystal[]
  readonly rifts: readonly Rift[]
  readonly plants: readonly Plant[]
  readonly basin: Basin
  readonly low: Basin
  readonly seed: number
}

const TAU = Math.PI * 2

/** 点到线段的距离 */
export function segDist(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  const dx = bx - ax
  const dy = by - ay
  const l2 = dx * dx + dy * dy
  const t = l2 > 0 ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0
  return Math.hypot(px - ax - dx * t, py - ay - dy * t)
}

/** 台地边沿在方位 a（弧度）处离站心多远，格 */
export function rimAt(plan: Pick<OutpostPlan, 'rim'>, a: number): number {
  const f = ((((a / TAU) % 1) + 1) % 1) * RIM_SAMPLES
  const i = Math.floor(f)
  const t = f - i
  return plan.rim[i % RIM_SAMPLES]! * (1 - t) + plan.rim[(i + 1) % RIM_SAMPLES]! * t
}

/** 点在多边形里（偶奇规则） */
function inPoly(poly: readonly Point[], x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!
    const b = poly[j]!
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** 点在旋转的矩形板里：中心、沿长边与横着的半长，长边的方向 */
function inPanel(p: Panel, x: number, y: number, pad: number): boolean {
  const c = Math.cos(p.a)
  const s = Math.sin(p.a)
  const dx = x - p.x
  const dy = y - p.y
  return Math.abs(dx * c + dy * s) <= p.len / 2 + pad && Math.abs(-dx * s + dy * c) <= p.wid / 2 + pad
}

function shuffle<T>(rng: Rng, list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    const t = list[i]!
    list[i] = list[j]!
    list[j] = t
  }
  return list
}

/** 方位 a 落在从 a0 起往正方向的那一段里，按 a0 起量的角度 */
function sweep(a0: number, a: number): number {
  return (((a - a0) % TAU) + TAU) % TAU
}

/**
 * 按种子生成一局的前哨：台地、围栏的骨架与分组、各组默认亮不亮；每个院子一台控制台、按职能摆设施；荒野里摆晶簇、裂缝与植物。
 * 设施离围栏都留着过道，站心一圈空着给开局站位
 */
export function outpostPlan(cfg: OutpostConfig, seed: number): OutpostPlan {
  const rng = new Rng(seed)
  const cx = FRAME_U / 2
  const cy = FRAME_U / 2
  const G = cfg.groups.length
  const sides = G * 2
  const step = TAU / sides

  const lobes = rng.int(cfg.site.lobes[0], cfg.site.lobes[1])
  const waves = [
    { k: lobes, amp: 1, ph: rng.next() * TAU },
    { k: lobes + 2, amp: 0.45, ph: rng.next() * TAU },
    { k: lobes * 2 + 1, amp: 0.22, ph: rng.next() * TAU },
    { k: 13, amp: 0.1, ph: rng.next() * TAU },
  ]
  const ampSum = waves.reduce((s, w) => s + w.amp, 0)
  const rim = new Float32Array(RIM_SAMPLES)
  for (let i = 0; i < RIM_SAMPLES; i++) {
    const a = (i / RIM_SAMPLES) * TAU
    let v = 0
    for (const w of waves) v += w.amp * Math.sin(w.k * a + w.ph)
    rim[i] = cfg.site.radiusU + (cfg.site.wobbleU * v) / ampSum
  }

  const rot = rng.next() * TAU
  const corners: { x: number; y: number; a: number; r: number }[] = []
  for (let i = 0; i < sides; i++) {
    const a = rot + i * step + (rng.next() - 0.5) * cfg.frame.turn * step
    const r = cfg.frame.ringU[0] + rng.next() * (cfg.frame.ringU[1] - cfg.frame.ringU[0])
    corners.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, a, r })
  }
  const pylons: Pylon[] = corners.map((c) => ({ x: c.x, y: c.y }))
  const ring: Point[] = []
  const mids: number[] = []
  for (let i = 0; i < sides; i++) {
    const p = corners[i]!
    const q = corners[(i + 1) % sides]!
    ring.push({ x: p.x, y: p.y })
    const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }
    ring.push(m)
    mids.push(pylons.push(m) - 1)
  }
  const hubs: number[] = []
  const spokeMids: number[] = []
  for (let k = 0; k < G; k++) {
    const c = corners[k * 2]!
    const h = { x: cx + Math.cos(c.a) * cfg.frame.hubU, y: cy + Math.sin(c.a) * cfg.frame.hubU }
    hubs.push(pylons.push(h) - 1)
    spokeMids.push(pylons.push({ x: (h.x + c.x) / 2, y: (h.y + c.y) / 2 }) - 1)
  }

  const yardGroup = shuffle(rng, Array.from({ length: G }, (_, k) => k))
  const roles = shuffle<YardRole>(rng, ['pad', 'habitat', 'lab', 'power'])
  const yards: Yard[] = Array.from({ length: G }, (_, k) => {
    const a0 = corners[k * 2]!.a
    const a1 = a0 + sweep(a0, corners[((k + 1) % G) * 2]!.a)
    return { a0, a1, group: yardGroup[k]!, role: roles[k % roles.length]! }
  })
  const segments: Segment[] = []
  const seg = (a: number, b: number, group: number, spoke: boolean, yard: number): void => {
    const p = pylons[a]!
    const q = pylons[b]!
    segments.push({ a, b, ax: p.x, ay: p.y, bx: q.x, by: q.y, group, spoke, yard })
  }
  for (let i = 0; i < sides; i++) {
    const yard = Math.floor(i / 2)
    seg(i, mids[i]!, yardGroup[yard]!, false, yard)
    seg(mids[i]!, (i + 1) % sides, yardGroup[yard]!, false, yard)
  }
  for (let k = 0; k < G; k++) {
    const g = rng.next() < 0.5 ? yardGroup[k]! : yardGroup[(k + G - 1) % G]!
    seg(hubs[k]!, spokeMids[k]!, g, true, -1)
    seg(spokeMids[k]!, k * 2, g, true, -1)
  }

  const nLit = rng.int(cfg.lit[0], cfg.lit[1])
  const litOrder = shuffle(rng, Array.from({ length: G }, (_, k) => k))
  const defaults = Array.from({ length: G }, (_, k) => litOrder.indexOf(k) < nLit)

  const fenceRoom = (x: number, y: number): number => {
    let d = Infinity
    for (const s of segments) d = Math.min(d, segDist(s.ax, s.ay, s.bx, s.by, x, y))
    return d
  }
  const placed: Disc[] = []
  const free = (x: number, y: number, r: number, gap: number): boolean => placed.every((p) => Math.hypot(p.x - x, p.y - y) >= p.r + r + gap)
  /** 院子里一点：离围栏、站心与已摆的设施都够远；试不到返回 null */
  const inYard = (y: Yard, r: number, rMin: number, rMax: number, spread: number, tries = 80): Point | null => {
    const span = y.a1 - y.a0
    for (let k = 0; k < tries; k++) {
      const a = y.a0 + span * (0.5 + (rng.next() - 0.5) * spread)
      const d = rMin + rng.next() * (rMax - rMin)
      const x = cx + Math.cos(a) * d
      const yy = cy + Math.sin(a) * d
      if (!inPoly(ring, x, yy) || fenceRoom(x, yy) < r + AISLE_U || Math.hypot(x - cx, yy - cy) < cfg.frame.hubU + r + HUB_GAP_U) continue
      if (!free(x, yy, r, GEAR_GAP_U)) continue
      return { x, y: yy }
    }
    return null
  }

  const ringMax = cfg.frame.ringU[1]
  const domes: Disc[] = []
  const tubes: Tube[] = []
  const panels: Panel[] = []
  let pad: Disc | null = null
  let mast: Disc | null = null
  for (const y of yards) {
    if (y.role === 'pad') {
      const r = 1.7
      const p = inYard(y, r, cfg.frame.hubU + 2.6, ringMax, 0.6, 200)
      if (p) {
        pad = { x: p.x, y: p.y, r }
        placed.push(pad)
      }
    } else if (y.role === 'habitat') {
      const r0 = 1.2 + rng.next() * 0.2
      const p = inYard(y, r0, cfg.frame.hubU + 2, ringMax, 0.8, 200)
      if (!p) continue
      const a = { x: p.x, y: p.y, r: r0 }
      domes.push(a)
      placed.push(a)
      const r1 = 1.05 + rng.next() * 0.2
      for (let k = 0; k < 300; k++) {
        const t = rng.next() * TAU
        const d = r0 + r1 + 1.1 + rng.next() * 1.1
        const x = a.x + Math.cos(t) * d
        const yy = a.y + Math.sin(t) * d
        if (!inPoly(ring, x, yy) || fenceRoom(x, yy) < r1 + AISLE_U || Math.hypot(x - cx, yy - cy) < cfg.frame.hubU + r1 + HUB_GAP_U) continue
        if (!free(x, yy, r1, GEAR_GAP_U)) continue
        const b = { x, y: yy, r: r1 }
        domes.push(b)
        placed.push(b)
        tubes.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, w: 0.62 })
        break
      }
    } else if (y.role === 'lab') {
      const r = 1.75 + rng.next() * 0.3
      const p = inYard(y, r, cfg.frame.hubU + 2.2, ringMax, 0.7, 200)
      if (!p) continue
      const d = { x: p.x, y: p.y, r }
      domes.push(d)
      placed.push(d)
      const m = inYard(y, 0.35, cfg.frame.hubU + 1, ringMax, 0.9, 200)
      if (m) {
        mast = { x: m.x, y: m.y, r: 0.32 }
        placed.push({ x: m.x, y: m.y, r: 0.8 })
      }
    } else {
      const len = 2.2 + rng.next() * 0.4
      const wid = 0.72
      const rows = 3
      const gap = 1.12
      const a = Math.atan2(SUN.y, SUN.x) + Math.PI / 2
      const ext = Math.hypot(len / 2, ((rows - 1) * gap) / 2 + wid / 2)
      const p = inYard(y, ext, cfg.frame.hubU + 1.5, ringMax, 0.7, 300)
      if (!p) continue
      const nx = -Math.sin(a)
      const ny = Math.cos(a)
      for (let k = 0; k < rows; k++) {
        const o = (k - (rows - 1) / 2) * gap
        panels.push({ x: p.x + nx * o, y: p.y + ny * o, len, wid, a })
      }
      placed.push({ x: p.x, y: p.y, r: ext })
    }
  }

  const consoles: Console[] = []
  for (const y of yards) {
    const r = cfg.console.radiusU
    const p = inYard(y, r, cfg.console.atU[0], cfg.console.atU[1], 0.95, 600) ?? inYard(y, r, cfg.frame.hubU + 1, ringMax, 1, 1200)
    if (!p) continue
    consoles.push({ x: p.x, y: p.y, r, group: y.group })
    placed.push({ x: p.x, y: p.y, r: r + 0.4 })
  }

  const wildAt = (a: number, inset: number): { lo: number; hi: number } => {
    let ringR = 0
    for (const s of segments) {
      if (s.spoke) continue
      const t = hitRay(cx, cy, a, s)
      if (t !== null) ringR = Math.max(ringR, t)
    }
    return { lo: ringR + WILD_IN_U + inset, hi: rimAt({ rim }, a) - WILD_OUT_U - inset }
  }
  const wildPoint = (inset: number): Point | null => {
    for (let k = 0; k < 60; k++) {
      const a = rng.next() * TAU
      const w = wildAt(a, inset)
      if (w.hi <= w.lo) continue
      const d = w.lo + rng.next() * (w.hi - w.lo)
      return { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d }
    }
    return null
  }

  const rifts: Rift[] = []
  const rift = (x: number, y: number, len: number, dir: number): Rift => {
    const n = 8
    const pts: Point[] = []
    let a = dir
    let px = x - (Math.cos(dir) * len) / 2
    let py = y - (Math.sin(dir) * len) / 2
    for (let i = 0; i <= n; i++) {
      pts.push({ x: px, y: py })
      a = dir + (rng.next() - 0.5) * 0.9
      px += (Math.cos(a) * len) / n
      py += (Math.sin(a) * len) / n
    }
    return { pts, w: 0.22 + rng.next() * 0.12, x, y }
  }
  const nWild = rng.int(cfg.rifts.wild[0], cfg.rifts.wild[1])
  for (let k = 0, made = 0; k < 600 && made < nWild; k++) {
    const p = wildPoint(0.4)
    if (!p || rifts.some((r) => Math.hypot(r.x - p.x, r.y - p.y) < (k < 300 ? 5 : 3.5))) continue
    const tangent = Math.atan2(p.y - cy, p.x - cx) + Math.PI / 2 + (rng.next() - 0.5) * 0.8
    rifts.push(rift(p.x, p.y, 2.6 + rng.next() * 1.2, tangent))
    made++
  }
  const nYard = rng.int(cfg.rifts.yard[0], cfg.rifts.yard[1])
  let inYards = 0
  for (const y of shuffle(rng, yards.slice())) {
    if (inYards >= nYard) break
    const p = inYard(y, 0.8, cfg.frame.hubU + 1, ringMax, 1, 600)
    if (!p) continue
    inYards++
    rifts.push(rift(p.x, p.y, 2 + rng.next() * 0.6, rng.next() * Math.PI))
    placed.push({ x: p.x, y: p.y, r: 1.2 })
  }

  const crystals: Crystal[] = []
  const nClusters = rng.int(cfg.crystals.clusters[0], cfg.crystals.clusters[1])
  for (let k = 0, made = 0; k < 400 && made < nClusters; k++) {
    const r = 0.45 + rng.next() * 0.45
    const p = wildPoint(r)
    if (!p) continue
    if (rifts.some((v) => Math.hypot(v.x - p.x, v.y - p.y) < 2.4 + r) || crystals.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < c.r + r + 2.2)) continue
    const tall = rng.next() >= cfg.crystals.low
    const n = 3 + Math.floor(rng.next() * 4)
    const lean = rng.next() * TAU
    const prisms = Array.from({ length: n }, () => {
      const a = lean + (rng.next() - 0.5) * 2.2
      const off = rng.next() * r * 0.45
      const o = rng.next() * TAU
      return { dx: Math.cos(o) * off, dy: Math.sin(o) * off, a, len: r * (0.5 + rng.next() * 0.45), w: r * (0.28 + rng.next() * 0.16) }
    })
    crystals.push({ x: p.x, y: p.y, r, tall, prisms })
    made++
  }

  const tall = (x: number, y: number, pad: number): boolean => {
    for (const p of pylons) if (Math.hypot(x - p.x, y - p.y) < cfg.fence.pylonU + pad) return true
    for (const d of domes) if (Math.hypot(x - d.x, y - d.y) < d.r + pad || inAirlock(d, cx, cy, x, y, pad)) return true
    for (const t of tubes) if (segDist(t.ax, t.ay, t.bx, t.by, x, y) < t.w / 2 + pad) return true
    if (mast && Math.hypot(x - mast.x, y - mast.y) < mast.r + pad) return true
    for (const c of crystals) if (c.tall && Math.hypot(x - c.x, y - c.y) < c.r + pad) return true
    return false
  }
  const lowAt = (x: number, y: number, pad: number): boolean => {
    for (const p of panels) if (inPanel(p, x, y, pad)) return true
    for (const c of crystals) if (!c.tall && Math.hypot(x - c.x, y - c.y) < c.r + pad) return true
    return false
  }

  const plants: Plant[] = []
  for (let k = 0; k < 900 && plants.length < 70; k++) {
    const a = rng.next() * TAU
    const d = Math.sqrt(rng.next()) * (rimAt({ rim }, a) - 0.4)
    const x = cx + Math.cos(a) * d
    const y = cy + Math.sin(a) * d
    const inside = inPoly(ring, x, y)
    if (inside && rng.next() < 0.75) continue
    const r = 0.14 + rng.next() * (inside ? 0.16 : 0.3)
    if (Math.hypot(x - cx, y - cy) < cfg.frame.hubU + 0.6 || fenceRoom(x, y) < r + 0.35) continue
    if (tall(x, y, r + 0.15) || lowAt(x, y, r + 0.15) || (pad && Math.hypot(x - pad.x, y - pad.y) < pad.r + r + 0.3)) continue
    if (consoles.some((c) => Math.hypot(x - c.x, y - c.y) < c.r + r + 0.4) || rifts.some((v) => Math.hypot(x - v.x, y - v.y) < 1.6)) continue
    if (plants.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + r + 0.25)) continue
    plants.push({ x, y, r, kind: Math.floor(rng.next() * 3), seed: Math.floor(rng.next() * 1e9) })
  }

  const cell = BASIN_CELL_U * UNIT
  const cols = Math.round(FRAME_U / BASIN_CELL_U)
  const keep = { x: cx * UNIT, y: cy * UNIT }
  const basin = makeBasin(
    (x, y) => {
      const u = x / UNIT
      const v = y / UNIT
      return Math.hypot(u - cx, v - cy) < rimAt({ rim }, Math.atan2(v - cy, u - cx)) && !tall(u, v, 0)
    },
    0,
    0,
    cols,
    cols,
    cell,
    keep,
    NECK_U * UNIT,
  )
  const low = makeBasin((x, y) => !lowAt(x / UNIT, y / UNIT, 0), 0, 0, cols, cols, cell, keep, 0)

  return { cx, cy, rim, ring, pylons, segments, yards, defaults, consoles, domes, tubes, pad, mast, panels, crystals, rifts, plants, basin, low, seed }
}

/** 从站心朝方位 a 射出去碰到线段 s 的距离（格），碰不到为 null */
function hitRay(cx: number, cy: number, a: number, s: Segment): number | null {
  const dx = Math.cos(a)
  const dy = Math.sin(a)
  const ex = s.bx - s.ax
  const ey = s.by - s.ay
  const den = dx * ey - dy * ex
  if (Math.abs(den) < 1e-9) return null
  const wx = s.ax - cx
  const wy = s.ay - cy
  const t = (wx * ey - wy * ex) / den
  const u = (wx * dy - wy * dx) / den
  return t > 0 && u >= 0 && u <= 1 ? t : null
}

/** 地标：地表的裂缝（怪从里面钻出来）与着陆平台（头目从天上降下来），像素 */
export function outpostMarks(plan: OutpostPlan): Readonly<Record<string, readonly Landmark[]>> {
  return {
    rift: plan.rifts.map((r) => ({ x: r.x * UNIT, y: r.y * UNIT, r: 0.7 * UNIT, nx: 0, ny: 0 })),
    pad: plan.pad ? [{ x: plan.pad.x * UNIT, y: plan.pad.y * UNIT, r: plan.pad.r * 0.45 * UNIT, nx: 0, ny: 0 }] : [],
  }
}

/** 寻路的格子：台地与高低设施按 clearU 格的余量算好的静态通行，每段围栏亮着时挡住的格子 */
export interface FlowGrid {
  readonly cols: number
  readonly rows: number
  readonly cell: number
  readonly base: Uint8Array
  readonly blocks: readonly Int32Array[]
}

/** 按半径 clearU 格的身体算寻路的格子：离壁、离矮设施不够远的格子走不了；每段围栏连同立柱挡住离它不到 clearU 格的格子 */
export function flowGrid(plan: OutpostPlan, cfg: OutpostConfig, clearU: number): FlowGrid {
  const cols = Math.round(FRAME_U / FLOW_CELL_U)
  const rows = cols
  const base = new Uint8Array(cols * rows)
  const clear = clearU * UNIT
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = (i + 0.5) * FLOW_CELL_U * UNIT
      const y = (j + 0.5) * FLOW_CELL_U * UNIT
      base[j * cols + i] = roomAt(plan.basin, x, y) >= clear && roomAt(plan.low, x, y) >= clear ? 1 : 0
    }
  }
  const reach = clearU + cfg.fence.thickU / 2
  const blocks = plan.segments.map((s) => {
    const out: number[] = []
    const i0 = Math.max(0, Math.floor((Math.min(s.ax, s.bx) - reach) / FLOW_CELL_U))
    const i1 = Math.min(cols - 1, Math.floor((Math.max(s.ax, s.bx) + reach) / FLOW_CELL_U))
    const j0 = Math.max(0, Math.floor((Math.min(s.ay, s.by) - reach) / FLOW_CELL_U))
    const j1 = Math.min(rows - 1, Math.floor((Math.max(s.ay, s.by) + reach) / FLOW_CELL_U))
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (segDist(s.ax, s.ay, s.bx, s.by, (i + 0.5) * FLOW_CELL_U, (j + 0.5) * FLOW_CELL_U) < reach) out.push(j * cols + i)
      }
    }
    return Int32Array.from(out)
  })
  return { cols, rows, cell: FLOW_CELL_U, base, blocks }
}

/** 此刻能走的格子：静态的通行减去亮着的围栏挡住的 */
export function passNow(g: FlowGrid, live: (seg: number) => boolean, out: Uint8Array): void {
  out.set(g.base)
  g.blocks.forEach((cells, s) => {
    if (!live(s)) return
    for (let k = 0; k < cells.length; k++) out[cells[k]!] = 0
  })
}

const NX = [1, -1, 0, 0, 1, 1, -1, -1]
const NY = [0, 0, 1, -1, 1, -1, 1, -1]
const NW = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2]

/** 离 (x, y) 格最近的一格能走的：(x, y) 自己能走就是它，八格以内都没有为 -1 */
export function nearestPass(g: FlowGrid, pass: Uint8Array, x: number, y: number): number {
  const ci = Math.min(g.cols - 1, Math.max(0, Math.floor(x / g.cell)))
  const cj = Math.min(g.rows - 1, Math.max(0, Math.floor(y / g.cell)))
  if (pass[cj * g.cols + ci]) return cj * g.cols + ci
  let best = -1
  let bd = Infinity
  for (let r = 1; r <= 8 && best < 0; r++) {
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        const i = ci + di
        const j = cj + dj
        if (i < 0 || j < 0 || i >= g.cols || j >= g.rows || !pass[j * g.cols + i]) continue
        if (di * di + dj * dj < bd) {
          bd = di * di + dj * dj
          best = j * g.cols + i
        }
      }
    }
  }
  return best
}

/** 从 start 那一格出发，到每一格能走的格子的路程（格数），到不了为 Infinity；斜着走不切过走不了的角 */
export function distances(g: FlowGrid, pass: Uint8Array, start: number, dist: Float32Array): void {
  dist.fill(Infinity)
  if (start < 0) return
  const heap: number[] = []
  const keys: number[] = []
  const push = (id: number, key: number): void => {
    let i = heap.length
    heap.push(id)
    keys.push(key)
    while (i > 0) {
      const p = (i - 1) >> 1
      if (keys[p]! <= key) break
      heap[i] = heap[p]!
      keys[i] = keys[p]!
      i = p
    }
    heap[i] = id
    keys[i] = key
  }
  const pop = (): number => {
    const top = heap[0]!
    const id = heap.pop()!
    const key = keys.pop()!
    const n = heap.length
    if (n > 0) {
      let i = 0
      for (;;) {
        let c = 2 * i + 1
        if (c >= n) break
        if (c + 1 < n && keys[c + 1]! < keys[c]!) c++
        if (keys[c]! >= key) break
        heap[i] = heap[c]!
        keys[i] = keys[c]!
        i = c
      }
      heap[i] = id
      keys[i] = key
    }
    return top
  }
  dist[start] = 0
  push(start, 0)
  const cols = g.cols
  while (heap.length > 0) {
    const d0 = keys[0]!
    const i = pop()
    if (d0 > dist[i]! + 1e-3) continue
    const x = i % cols
    const y = (i - x) / cols
    for (let k = 0; k < 8; k++) {
      const nx = x + NX[k]!
      const ny = y + NY[k]!
      if (nx < 0 || ny < 0 || nx >= cols || ny >= g.rows) continue
      const j = ny * cols + nx
      if (!pass[j]) continue
      if (k >= 4 && (!pass[y * cols + nx] || !pass[ny * cols + x])) continue
      const nd = d0 + NW[k]!
      if (nd < dist[j]!) {
        dist[j] = nd
        push(j, dist[j]!)
      }
    }
  }
}

/** (x, y) 格处立着的设施：顶多高（米）、什么材质；台地外是一直高上去的岩脊；空地为 null */
export function gearAt(plan: OutpostPlan, cfg: OutpostConfig, x: number, y: number): { readonly topM: number; readonly material: 'rock' | 'structure' | 'steel' } | null {
  for (const p of plan.pylons) if (Math.hypot(x - p.x, y - p.y) < cfg.fence.pylonU) return { topM: cfg.fence.pylonM, material: 'structure' }
  for (const d of plan.domes) if (Math.hypot(x - d.x, y - d.y) < d.r) return { topM: cfg.gear.domeM, material: 'structure' }
  for (const d of plan.domes) if (inAirlock(d, plan.cx, plan.cy, x, y, 0)) return { topM: AIRLOCK.m, material: 'structure' }
  for (const t of plan.tubes) if (segDist(t.ax, t.ay, t.bx, t.by, x, y) < t.w / 2) return { topM: TUBE_M, material: 'structure' }
  const m = plan.mast
  if (m && Math.hypot(x - m.x, y - m.y) < m.r) return { topM: cfg.gear.mastM, material: 'structure' }
  for (const c of plan.crystals) if (Math.hypot(x - c.x, y - c.y) < c.r) return { topM: c.tall ? cfg.crystals.tallM : cfg.crystals.lowM, material: 'rock' }
  for (const p of plan.panels) if (inPanel(p, x, y, 0)) return { topM: cfg.gear.panelM, material: 'steel' }
  if (Math.hypot(x - plan.cx, y - plan.cy) >= rimAt(plan, Math.atan2(y - plan.cy, x - plan.cx))) return { topM: Infinity, material: 'rock' }
  return null
}
