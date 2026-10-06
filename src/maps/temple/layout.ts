import { FRAME_U, UNIT } from '../../util/units.ts'
import { fbm } from '../../util/noise.ts'
import { Rng } from '../../util/rng.ts'
import { makeBasin, roomAt } from '../basin.ts'
import type { Basin } from '../basin'
import type { Landmark } from '../landmark'
import type { TempleConfig } from '../../types/maps'
import type { Point } from '../../util/vec'

/** 能走的前庭按这么细的格子算距离场，格 */
export const BASIN_CELL_U = 0.25
/** 墙脚、台阶脚、祭坛边往里留出这么宽（格）不能走：身子不贴进石头里 */
const EDGE_CLEAR_U = 0.12
/** 机关的占地彼此至少隔这么远（格），压板离别的机关至少这么远 */
const TRAP_GAP_U = 1.2
/** 压板离它管的那片刺阵、陷坑的边这么远（格） */
const PLATE_GAP_U = 0.45
/** 机关离墙脚、丛林边至少这么远（格） */
const TRAP_EDGE_U = 1.6
/** 生成不出合格的前庭就换一组随机数重来，最多这么多次 */
const TRIES = 60
/** 丛林边上每隔这么远（格）一处出怪的地标 */
const JUNGLE_STEP_U = 3
/** 开局站位离石槽的中线至少这么远（格）：滚石滚过时不擦着刚出生的队伍 */
const SAFE_GROOVE_U = 2.5

/** 分形噪声拉开到 [−1, 1]：它大多挤在中间 */
export function swing(x: number, y: number, seed: number, octaves: number): number {
  return Math.max(-1, Math.min(1, (fbm(x, y, seed, octaves) - 0.5) * 2.6))
}

/** 种子打散：相邻的种子也生成很不一样的前庭 */
function scramble(seed: number): number {
  let h = Math.imul((seed ^ 0x7e3b1e51) >>> 0, 0x297a2d39)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

function between(rng: Rng, r: readonly [number, number]): number {
  return r[0] + (r[1] - r[0]) * rng.next()
}

/** 本地坐标：原点在前庭正中，a 从丛林朝金字塔，b 横过前庭，都以格计。地图坐标 = o + a·n + b·t */
export interface Frame {
  readonly ox: number
  readonly oy: number
  readonly nx: number
  readonly ny: number
  readonly tx: number
  readonly ty: number
}

export interface Local {
  a: number
  b: number
}

export function toLocal(f: Frame, x: number, y: number, out: Local): Local {
  const dx = x - f.ox
  const dy = y - f.oy
  out.a = dx * f.nx + dy * f.ny
  out.b = dx * f.tx + dy * f.ty
  return out
}

export function toMap(f: Frame, a: number, b: number): Point {
  return { x: f.ox + f.nx * a + f.tx * b, y: f.oy + f.ny * a + f.ty * b }
}

/** 本地的一块长方形，格：a 从 a0 到 a1，b 从 b0 到 b1 */
export interface Rect {
  readonly a0: number
  readonly a1: number
  readonly b0: number
  readonly b1: number
}

/** 本地 (a, b) 离长方形的边多远，格，里面为负 */
export function rectSd(r: Rect, a: number, b: number): number {
  const da = Math.max(r.a0 - a, a - r.a1)
  const db = Math.max(r.b0 - b, b - r.b1)
  return da > 0 && db > 0 ? Math.hypot(da, db) : Math.max(da, db)
}

function grow(r: Rect, by: number): Rect {
  return { a0: r.a0 - by, a1: r.a1 + by, b0: r.b0 - by, b1: r.b1 + by }
}

function square(a: number, b: number, half: number): Rect {
  return { a0: a - half, a1: a + half, b0: b - half, b1: b + half }
}

/**
 * 前庭的形状，本地坐标，格：金字塔底座在 a = front，两侧墙脚在 b = ±half，丛林边离正中 back 格、按噪声弯出最多 jungle；
 * 墙脚与丛林相接的角磨成半径 corner 的圆角
 */
export interface Court {
  readonly front: number
  readonly back: number
  readonly half: number
  readonly jungle: number
  readonly wave: number
  readonly corner: number
  readonly seed: number
}

/** 丛林边在 b 处离正中多远（格，往丛林那边为正） */
export function jungleEdge(c: Court, b: number): number {
  return c.back + c.jungle * swing(b / c.wave + 5.3, 2.9, c.seed, 3)
}

/** 本地 (a, b) 在前庭里多深，格，前庭里为正：离金字塔底座、两侧墙脚、丛林边的最小，丛林那头的两个角磨圆 */
export function courtDepth(c: Court, a: number, b: number): number {
  const front = c.front - a
  const side = c.half - Math.abs(b)
  const jungle = a + jungleEdge(c, b)
  const r = c.corner
  let corner = Infinity
  if (side < r && jungle < r) corner = r - Math.hypot(r - side, r - jungle)
  return Math.min(front, side, jungle, corner)
}

/** 一块压板：本地坐标的中心（格） */
export interface Plate {
  readonly a: number
  readonly b: number
}

/** 一处石雕兽头：嵌在哪一侧的墙上（side 为 ±1，对着 b 的正负），本地 a；它喷的过道是 a 两侧 laneU 一半的那一条，横过整个前庭 */
export interface DartTrap {
  readonly kind: 'darts'
  readonly plate: Plate
  readonly side: 1 | -1
  readonly a: number
}

export interface SpikeTrap {
  readonly kind: 'spikes'
  readonly plate: Plate
  readonly rect: Rect
}

/** 一条石槽：顺着 a、在本地 b 处；滚石从金字塔第 tier 层台上的斜槽口（本地 a = top）滚下来，一路滚进丛林，到 a = end 为止 */
export interface BoulderTrap {
  readonly kind: 'boulder'
  readonly plate: Plate
  readonly b: number
  readonly top: number
  readonly end: number
}

export interface PitTrap {
  readonly kind: 'pit'
  readonly plate: Plate
  readonly rect: Rect
}

export type Trap = DartTrap | SpikeTrap | BoulderTrap | PitTrap
export type TrapKind = Trap['kind']

/** 台阶脚下翻倒的祭坛：中心（本地，格）、长宽的一半（格）、转了多少（弧度） */
export interface Altar {
  readonly a: number
  readonly b: number
  readonly hl: number
  readonly hw: number
  readonly turn: number
}

/** 拱进前庭的一条大树根：从林缘那棵树的树根处（本地，格）伸出，弯弯地伸到 to；根有多粗（格） */
export interface Root {
  readonly from: Point
  readonly to: Point
  readonly bend: number
  readonly w: number
}

/** 一棵丛林大树：地图坐标的树干位置、树冠半径（格）、树高（米） */
export interface Tree {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly h: number
}

/**
 * 按种子生成的神庙前庭，地图坐标以格计：本地坐标系、前庭的形状、金字塔、墙、祭坛、机关、大树与树根；
 * 能走的地面（像素）、开局站位（格）、出怪口用的地标（像素）
 */
export interface TemplePlan {
  readonly seed: number
  readonly frame: Frame
  readonly court: Court
  readonly altar: Altar
  readonly traps: readonly Trap[]
  readonly trees: readonly Tree[]
  readonly roots: readonly Root[]
  /** 地缝：树根拱裂石板的地方，本地坐标（格） */
  readonly cracks: readonly Plate[]
  readonly basin: Basin
  readonly start: Point
  readonly marks: Readonly<Record<'door' | 'crack' | 'vine' | 'jungle' | 'wall', readonly Landmark[]>>
}

/** 台阶在本地占的那一块：底座往前庭里伸出 stairOutU，一直伸到金字塔顶 */
export function stairRect(cfg: TempleConfig, c: Court): Rect {
  const p = cfg.pyramid
  return { a0: c.front - p.stairOutU, a1: c.front + p.tiers * p.tierU + 4, b0: -p.stairU / 2, b1: p.stairU / 2 }
}

/** (a, b) 在祭坛里多深，格，里面为负 */
export function altarSd(al: Altar, a: number, b: number): number {
  const c = Math.cos(al.turn)
  const s = Math.sin(al.turn)
  const u = (a - al.a) * c + (b - al.b) * s
  const v = -(a - al.a) * s + (b - al.b) * c
  return rectSd({ a0: -al.hl, a1: al.hl, b0: -al.hw, b1: al.hw }, u, v)
}

/** 兽头顺着墙宽多少的一半（格） */
export const HEAD_HALF_U = 1
/** 兽头的嘴伸进前庭的那一小块：贴着墙脚，顺着 a 宽两格 */
export function snoutRect(cfg: TempleConfig, c: Court, t: DartTrap): Rect {
  const s = cfg.walls.snoutU
  const face = c.half * t.side
  return t.side > 0 ? { a0: t.a - HEAD_HALF_U, a1: t.a + HEAD_HALF_U, b0: face - s, b1: face + 1 } : { a0: t.a - HEAD_HALF_U, a1: t.a + HEAD_HALF_U, b0: face - 1, b1: face + s }
}

/** 压板占的那一块 */
export function plateRect(cfg: TempleConfig, p: Plate): Rect {
  return square(p.a, p.b, cfg.plate.sizeU / 2)
}

/** 本地 (a, b) 在不在石槽里：槽宽 grooveU，从金字塔底座一路到丛林里 */
export function inGroove(cfg: TempleConfig, c: Court, t: BoulderTrap, a: number, b: number): boolean {
  return Math.abs(b - t.b) < cfg.boulder.grooveU / 2 && a < c.front
}

const L0: Local = { a: 0, b: 0 }

/** 地图坐标 (x, y)（格）能不能走：在前庭里、不在台阶底下、祭坛里、兽头下 */
function openAt(cfg: TempleConfig, f: Frame, c: Court, altar: Altar, heads: readonly DartTrap[], x: number, y: number): boolean {
  toLocal(f, x, y, L0)
  const a = L0.a
  const b = L0.b
  if (courtDepth(c, a, b) <= EDGE_CLEAR_U) return false
  if (rectSd(stairRect(cfg, c), a, b) <= EDGE_CLEAR_U) return false
  if (altarSd(altar, a, b) <= EDGE_CLEAR_U) return false
  for (const h of heads) if (rectSd(snoutRect(cfg, c, h), a, b) <= EDGE_CLEAR_U) return false
  return true
}

/** 前庭的朝向：金字塔在上、右、下、左哪一边，再整片斜一点；本地原点落在方框正中 */
function frameOf(rng: Rng, skewDeg: number): Frame {
  const ang = rng.int(0, 3) * (Math.PI / 2) - Math.PI / 2 + (rng.next() * 2 - 1) * skewDeg * (Math.PI / 180)
  const nx = Math.cos(ang)
  const ny = Math.sin(ang)
  return { ox: FRAME_U / 2, oy: FRAME_U / 2, nx, ny, tx: -ny, ty: nx }
}

/** 一处占地离已经放下的都够远 */
function clear(r: Rect, taken: readonly Rect[], gap: number): boolean {
  return taken.every((o) => r.a1 + gap <= o.a0 || o.a1 + gap <= r.a0 || r.b1 + gap <= o.b0 || o.b1 + gap <= r.b0)
}

/** 一块长方形整个在前庭里、离边够远，离开局站位也够远 */
function fits(cfg: TempleConfig, c: Court, r: Rect, start: Local, edge: number): boolean {
  for (const a of [r.a0, (r.a0 + r.a1) / 2, r.a1]) for (const b of [r.b0, (r.b0 + r.b1) / 2, r.b1]) if (courtDepth(c, a, b) < edge) return false
  return rectSd(r, start.a, start.b) >= cfg.plazaU && rectSd(stairRect(cfg, c), (r.a0 + r.a1) / 2, (r.b0 + r.b1) / 2) > 3
}

/** 一片刺阵或陷坑旁边的压板：贴着它的一条边、在那条边的中段，压板也得放得下 */
function sidePlate(cfg: TempleConfig, rng: Rng, c: Court, r: Rect, start: Local, taken: readonly Rect[]): Plate | null {
  const h = cfg.plate.sizeU / 2
  const off = PLATE_GAP_U + h
  const order = [0, 1, 2, 3].sort(() => rng.next() - 0.5)
  for (const side of order) {
    const along = 0.25 + 0.5 * rng.next()
    const p: Plate =
      side === 0
        ? { a: r.a0 - off, b: r.b0 + (r.b1 - r.b0) * along }
        : side === 1
          ? { a: r.a1 + off, b: r.b0 + (r.b1 - r.b0) * along }
          : side === 2
            ? { a: r.a0 + (r.a1 - r.a0) * along, b: r.b0 - off }
            : { a: r.a0 + (r.a1 - r.a0) * along, b: r.b1 + off }
    const pr = plateRect(cfg, p)
    if (!fits(cfg, c, pr, start, TRAP_EDGE_U) || !clear(pr, taken, TRAP_GAP_U)) continue
    return p
  }
  return null
}

/** 机关：先放石槽，再放兽头与它的过道，再放陷坑与刺阵；每样的个数抽在范围里，放不下这么多就整个重来 */
function trapsOf(cfg: TempleConfig, rng: Rng, c: Court, start: Local, altar: Altar): Trap[] | null {
  const traps: Trap[] = []
  const taken: Rect[] = [grow({ a0: altar.a - 1.4, a1: altar.a + 1.4, b0: altar.b - 1.4, b1: altar.b + 1.4 }, 0)]
  const p = cfg.pyramid
  // 石槽：避开正中的台阶，从金字塔一路通到丛林
  const nb = rng.int(cfg.boulder.count[0], cfg.boulder.count[1])
  for (let k = 0, tries = 0; k < nb && tries < 60; tries++) {
    const g = cfg.boulder.grooveU
    const lo = p.stairU / 2 + g / 2 + 1.2
    const hi = c.half - g / 2 - 3
    if (hi <= lo) return null
    const b = (lo + (hi - lo) * rng.next()) * (rng.next() < 0.5 ? -1 : 1)
    const band: Rect = { a0: -c.back - c.jungle - 4, a1: c.front, b0: b - g / 2, b1: b + g / 2 }
    if (!clear(band, taken, TRAP_GAP_U)) continue
    if (Math.abs(b - start.b) < g / 2 + SAFE_GROOVE_U) continue
    const side = Math.sign(start.b - b) || 1
    const pa = -c.back * 0.4 + (c.front * 0.7 + c.back * 0.4) * rng.next()
    const plate: Plate = { a: pa, b: b + side * (g / 2 + PLATE_GAP_U + cfg.plate.sizeU / 2) }
    const pr = plateRect(cfg, plate)
    if (!fits(cfg, c, pr, start, TRAP_EDGE_U) || !clear(pr, taken, TRAP_GAP_U)) continue
    traps.push({ kind: 'boulder', plate, b, top: c.front + p.tierU * 2.5, end: -c.back - c.jungle - 3 })
    taken.push(band, pr)
    k++
  }
  if (traps.length < cfg.boulder.count[0]) return null
  // 兽头：过道彼此隔开，压板放在过道里、离两侧墙都有几步
  const nd = rng.int(cfg.darts.count[0], cfg.darts.count[1])
  const lanes: number[] = []
  for (let k = 0, tries = 0; k < nd && tries < 80; tries++) {
    const lo = -c.back + c.corner + 1.5
    const hi = c.front - p.stairOutU - 1.5
    const a = lo + (hi - lo) * rng.next()
    if (lanes.some((o) => Math.abs(o - a) < cfg.darts.laneU + 3.2)) continue
    const side: 1 | -1 = rng.next() < 0.5 ? 1 : -1
    const span = c.half - 3
    const plate: Plate = { a: a + (rng.next() - 0.5) * (cfg.darts.laneU - cfg.plate.sizeU) * 0.6, b: (rng.next() * 2 - 1) * span }
    const pr = plateRect(cfg, plate)
    if (!fits(cfg, c, pr, start, TRAP_EDGE_U) || !clear(pr, taken, TRAP_GAP_U)) continue
    traps.push({ kind: 'darts', plate, side, a })
    lanes.push(a)
    taken.push(pr)
    k++
  }
  if (lanes.length < cfg.darts.count[0]) return null
  const field = (kind: 'pit' | 'spikes', n: number, size: () => { la: number; lb: number }): boolean => {
    for (let k = 0, tries = 0; k < n && tries < 120; tries++) {
      const s = size()
      const a = -c.back + (c.back + c.front) * rng.next()
      const b = (rng.next() * 2 - 1) * c.half
      const r: Rect = { a0: a - s.la / 2, a1: a + s.la / 2, b0: b - s.lb / 2, b1: b + s.lb / 2 }
      if (!fits(cfg, c, r, start, TRAP_EDGE_U) || !clear(r, taken, TRAP_GAP_U)) continue
      const plate = sidePlate(cfg, rng, c, r, start, taken)
      if (!plate) continue
      traps.push(kind === 'pit' ? { kind, plate, rect: r } : { kind, plate, rect: r })
      taken.push(r, plateRect(cfg, plate))
      k++
    }
    return traps.filter((t) => t.kind === kind).length >= cfg[kind].count[0]
  }
  const np = rng.int(cfg.pit.count[0], cfg.pit.count[1])
  if (!field('pit', np, () => ({ la: cfg.pit.sizeU, lb: cfg.pit.sizeU }))) return null
  const ns = rng.int(cfg.spikes.count[0], cfg.spikes.count[1])
  const spikeSize = (): { la: number; lb: number } => {
    const l = between(rng, cfg.spikes.lengthU)
    const w = between(rng, cfg.spikes.widthU)
    return rng.next() < 0.5 ? { la: l, lb: w } : { la: w, lb: l }
  }
  if (!field('spikes', ns, spikeSize)) return null
  return traps
}

/** 丛林：沿林缘与两侧墙外、方框四周种满大树，树干彼此隔开；前庭与金字塔上不种 */
function treesOf(cfg: TempleConfig, rng: Rng, f: Frame, c: Court): Tree[] {
  const j = cfg.jungle
  const out: Tree[] = []
  const pyramidTop = c.front + cfg.pyramid.tiers * cfg.pyramid.tierU
  for (let tries = 0; tries < 2400 && out.length < 90; tries++) {
    const x = -3 + rng.next() * (FRAME_U + 6)
    const y = -3 + rng.next() * (FRAME_U + 6)
    toLocal(f, x, y, L0)
    const r = between(rng, j.crownU)
    const depth = courtDepth(c, L0.a, L0.b)
    const behindWall = Math.abs(L0.b) > c.half + cfg.walls.thickU + 0.6
    const inJungle = L0.a + jungleEdge(c, L0.b) < -0.6
    if (!behindWall && !inJungle) continue
    // 金字塔上不长大树，只有塔顶背后、两侧墙外那一圈
    if (L0.a > c.front - 1 && L0.a < pyramidTop + 2 && Math.abs(L0.b) < c.half + cfg.walls.thickU + 1.5) continue
    if (depth > -r * 0.2 - j.overhangU && depth > -0.6) continue
    if (out.some((t) => Math.hypot(t.x - x, t.y - y) < (t.r + r) * 0.62)) continue
    out.push({ x, y, r, h: between(rng, j.heightM) })
  }
  return out
}

/** 拱进前庭的大树根：从林缘的大树下伸出来，弯弯地爬进石板地 */
function rootsOf(cfg: TempleConfig, rng: Rng, f: Frame, c: Court, start: Local): Root[] {
  const j = cfg.jungle
  const n = rng.int(j.roots[0], j.roots[1])
  const out: Root[] = []
  for (let tries = 0; out.length < n && tries < 80; tries++) {
    const b = (rng.next() * 2 - 1) * (c.half - 1)
    const a = -jungleEdge(c, b) - 0.8
    const len = between(rng, j.rootU)
    const ang = (rng.next() * 2 - 1) * 0.7
    const ta = a + Math.cos(ang) * len
    const tb = b + Math.sin(ang) * len
    if (courtDepth(c, ta, tb) < 0.8) continue
    if (Math.hypot(ta - start.a, tb - start.b) < cfg.plazaU) continue
    if (out.some((r) => Math.abs(toLocalPoint(f, r.from).b - b) < 3)) continue
    out.push({ from: toMap(f, a, b), to: toMap(f, ta, tb), bend: (rng.next() * 2 - 1) * 0.8, w: 0.28 + 0.2 * rng.next() })
  }
  return out
}

function toLocalPoint(f: Frame, p: Point): Local {
  return toLocal(f, p.x, p.y, { a: 0, b: 0 })
}

/** 生成一次：朝向、前庭、祭坛、机关、大树、能走的地面与地标；不合格返回 null */
function attempt(cfg: TempleConfig, seed: number): TemplePlan | null {
  const rng = new Rng(seed)
  const frame = frameOf(rng, cfg.court.skewDeg)
  const depth = between(rng, cfg.court.depthU)
  const width = between(rng, cfg.court.widthU)
  const court: Court = { front: depth / 2, back: depth / 2, half: width / 2, jungle: cfg.court.jungleU, wave: cfg.court.waveU, corner: cfg.court.cornerU, seed }
  const start: Local = { a: -cfg.shiftU, b: 0 }
  const al = cfg.altar
  const altarSide = rng.next() < 0.5 ? -1 : 1
  const altar: Altar = {
    a: court.front - cfg.pyramid.stairOutU - al.gapU - al.widthU / 2,
    b: altarSide * (cfg.pyramid.stairU / 2 + al.lengthU / 2 + 0.6 + rng.next() * 1.2),
    hl: al.lengthU / 2,
    hw: al.widthU / 2,
    turn: altarSide * (0.25 + rng.next() * 0.35),
  }
  const traps = trapsOf(cfg, rng, court, start, altar)
  if (!traps) return null
  const heads = traps.filter((t): t is DartTrap => t.kind === 'darts')
  const startMap = toMap(frame, start.a, start.b)
  const cell = BASIN_CELL_U * UNIT
  const n = Math.round(FRAME_U / BASIN_CELL_U)
  const basin = makeBasin((x, y) => openAt(cfg, frame, court, altar, heads, x / UNIT, y / UNIT), 0, 0, n, n, cell, { x: startMap.x * UNIT, y: startMap.y * UNIT }, cfg.court.neckU * UNIT)
  if (roomAt(basin, startMap.x * UNIT, startMap.y * UNIT) < cfg.plazaU * UNIT * 0.9) return null
  // 每块压板都整个落在能走的地面上
  for (const t of traps) {
    const q = toMap(frame, t.plate.a, t.plate.b)
    if (roomAt(basin, q.x * UNIT, q.y * UNIT) < (cfg.plate.sizeU / 2 + 0.2) * UNIT) return null
  }
  const trees = treesOf(cfg, rng, frame, court)
  const roots = rootsOf(cfg, rng, frame, court, start)
  const busy = (a: number, b: number, pad: number): boolean =>
    traps.some((t) => rectSd(plateRect(cfg, t.plate), a, b) < pad || ((t.kind === 'spikes' || t.kind === 'pit') && rectSd(t.rect, a, b) < pad) || (t.kind === 'boulder' && Math.abs(b - t.b) < cfg.boulder.grooveU / 2 + pad))
  const px = (a: number, b: number, r: number, na: number, nb: number): Landmark => {
    const p = toMap(frame, a, b)
    return { x: p.x * UNIT, y: p.y * UNIT, r: r * UNIT, nx: frame.nx * na + frame.tx * nb, ny: frame.ny * na + frame.ty * nb }
  }
  const door = [px(court.front - cfg.pyramid.stairOutU - 0.2, 0, cfg.pyramid.stairU * 0.35, -1, 0)]
  // 地缝：树根拱裂的石板，离开局站位远一点、不压着机关
  const cracks: Plate[] = []
  for (const r of roots) {
    const q = toLocalPoint(frame, r.to)
    const a = q.a + 0.6
    if (!busy(a, q.b, 1) && courtDepth(court, a, q.b) > 1.2 && Math.hypot(a - start.a, q.b - start.b) > 6) cracks.push({ a, b: q.b })
  }
  for (let tries = 0; cracks.length < 4 && tries < 200; tries++) {
    const a = -court.back + (court.back + court.front) * rng.next()
    const b = (rng.next() * 2 - 1) * court.half
    if (courtDepth(court, a, b) < 2 || busy(a, b, 1.2) || Math.hypot(a - start.a, b - start.b) < 6.5) continue
    if (cracks.some((k) => Math.hypot(k.a - a, k.b - b) < 5)) continue
    cracks.push({ a, b })
  }
  const crack = cracks.map((k) => px(k.a, k.b, 0.7, 0, 0))
  // 藤蔓从墙头与林缘的树上垂下来：贴着墙脚、林缘里面一点
  const vine: Landmark[] = []
  for (let tries = 0; vine.length < 6 && tries < 200; tries++) {
    const onWall = vine.length % 3 !== 2
    const b = onWall ? (rng.next() < 0.5 ? -1 : 1) * (court.half - 1.1) : (rng.next() * 2 - 1) * (court.half - 2)
    const a = onWall ? -court.back + 2 + (court.back + court.front - 5) * rng.next() : -jungleEdge(court, b) + 1.2
    if (courtDepth(court, a, b) < 0.9 || busy(a, b, 0.6)) continue
    if (vine.some((m) => Math.hypot(m.x / UNIT - toMap(frame, a, b).x, m.y / UNIT - toMap(frame, a, b).y) < 3.5)) continue
    vine.push(px(a, b, 0.6, 0, 0))
  }
  const jungle: Landmark[] = []
  for (let b = -court.half + court.corner + 0.5; b <= court.half - court.corner - 0.5; b += JUNGLE_STEP_U) {
    const a = -jungleEdge(court, b)
    const p = toMap(frame, a + 1.2, b)
    if (roomAt(basin, p.x * UNIT, p.y * UNIT) < 0.5 * UNIT) continue
    jungle.push(px(a + 0.1, b, 1, 1, 0))
  }
  const wall: Landmark[] = []
  for (const side of [-1, 1]) {
    for (let a = -court.back + court.corner + 1.5; a < court.front - 2.5; a += 3.5) {
      if (heads.some((h) => h.side === side && Math.abs(h.a - a) < 2.2)) continue
      if (rng.next() < 0.45) continue
      const p = toMap(frame, a, side * (court.half - 1.2))
      if (roomAt(basin, p.x * UNIT, p.y * UNIT) < 0.5 * UNIT) continue
      wall.push(px(a, side * (court.half - 0.1), 0.8, 0, -side))
    }
  }
  if (jungle.length < 3 || wall.length < 2 || vine.length < 3 || crack.length < 2) return null
  return { seed, frame, court, altar, traps, trees, roots, cracks, basin, start: startMap, marks: { door, crack, vine, jungle, wall } }
}

/** 按种子生成前庭：不合格就换一组随机数，一直不合格是参数写错了 */
export function templePlan(cfg: TempleConfig, seed: number): TemplePlan {
  for (let k = 0; k < TRIES; k++) {
    const plan = attempt(cfg, scramble(seed + k * 7919))
    if (plan) return plan
  }
  throw new Error(`神庙的前庭按种子 ${seed} 换了 ${TRIES} 组随机数都生成不出来`)
}

/** 机关在本地坐标里的中心（格）：压板、刺阵与陷坑取占地正中，兽头取嘴，石槽取槽口 */
export function trapCenter(c: Court, t: Trap): Local {
  switch (t.kind) {
    case 'darts':
      return { a: t.a, b: t.side * c.half }
    case 'boulder':
      return { a: c.front, b: t.b }
    default:
      return { a: (t.rect.a0 + t.rect.a1) / 2, b: (t.rect.b0 + t.rect.b1) / 2 }
  }
}

