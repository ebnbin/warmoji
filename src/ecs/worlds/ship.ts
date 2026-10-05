import { SPAWN_CLEAR_U, UNIT } from '../../util/units'
import type { Point } from '../../util/vec'
import type { Rng } from '../../util/rng'
import type { Friction, ShipConfig } from '../../types/maps'
import { approach } from '../systems/shared/body'
import type { BodyStep } from '../systems/shared/body'
import { bulwarkDistance, GRAVITY, halfBeamAt, hatchesOf, hydrostatics, skylightOf, spawnS, stability, stepAxis, waveSlope, waveTerms } from '../../data/ship'
import type { Axis, Hydrostatics, WaveTerm } from '../../data/ship'
import { FRAME, FRAME_MID } from '../frame'
import { awayFromWall, keepOut, makeBasin, roomAt } from './basin'
import type { Basin } from './basin'
import { makeSolids } from './solids'
import type { Solid, Solids } from './solids'
import { topOf } from '../utils/pass'
import type { Landmark } from './gates'

/** 船在地图上的摆法，像素：船尾横板中线（s = 0）的位置，船头与右舷的单位方向；能走的甲板与桅杆；挡弹体与视线的桅杆与齐腰的舷墙 */
export interface Deck {
  readonly ox: number
  readonly oy: number
  readonly bx: number
  readonly by: number
  readonly sx: number
  readonly sy: number
  readonly basin: Basin
  readonly masts: readonly Point[]
  readonly solids: Solids
  /** 给出怪口的地标：格栅舱口与船尾天窗 */
  readonly marks: Readonly<Record<string, readonly Landmark[]>>
}

/** 地图上一点在船上的位置，格：s 沿船长从横板中线往船头，t 横过船宽往右舷为正 */
export function deckLocal(d: Deck, x: number, y: number): { s: number; t: number } {
  const dx = x - d.ox
  const dy = y - d.oy
  return { s: (dx * d.bx + dy * d.by) / UNIT, t: (dx * d.sx + dy * d.sy) / UNIT }
}

/** 船上 (s, t) 格在地图上的位置，像素 */
export function deckPoint(d: Deck, s: number, t: number): Point {
  return { x: d.ox + (d.bx * s + d.sx * t) * UNIT, y: d.oy + (d.by * s + d.sy * t) * UNIT }
}

const CELL_U = 0.25

/** 船长的正中摆在方框正中，横屏（across）船头朝右、竖屏船头朝上；右舷是船头方向顺时针转 90° */
export function makeDeck(cfg: ShipConfig, across: boolean): Deck {
  const h = cfg.hull
  const bx = across ? 1 : 0
  const by = across ? 0 : -1
  const sx = -by
  const sy = bx
  const mid = spawnS(h) * UNIT
  const ox = FRAME_MID.x - bx * mid
  const oy = FRAME_MID.y - by * mid
  const masts = h.masts.map((f) => ({ x: ox + bx * f * h.lengthU * UNIT, y: oy + by * f * h.lengthU * UNIT }))
  const mastPx = h.mastU * UNIT
  const open = (x: number, y: number): boolean => {
    const dx = x - ox
    const dy = y - oy
    const s = (dx * bx + dy * by) / UNIT
    const t = (dx * sx + dy * sy) / UNIT
    if (Math.abs(t) >= halfBeamAt(h, s)) return false
    for (const m of masts) if ((x - m.x) ** 2 + (y - m.y) ** 2 < mastPx * mastPx) return false
    return true
  }
  const cell = CELL_U * UNIT
  const cols = Math.ceil(FRAME.w / cell)
  const rows = Math.ceil(FRAME.h / cell)
  const basin = makeBasin(open, FRAME.x, FRAME.y, cols, rows, cell, FRAME_MID, h.neckU * UNIT)
  const mast: Solid = { topM: Infinity, material: 'wood' }
  const bulwark: Solid = { topM: topOf(h.bulwarkM), material: 'wood' }
  const solid = (x: number, y: number): Solid | null => {
    for (const m of masts) if ((x - m.x) ** 2 + (y - m.y) ** 2 < mastPx * mastPx) return mast
    const dx = x - ox
    const dy = y - oy
    const s = (dx * bx + dy * by) / UNIT
    const t = (dx * sx + dy * sy) / UNIT
    return Math.abs(t) >= halfBeamAt(h, s) && bulwarkDistance(h, s, t) <= 0 ? bulwark : null
  }
  const solids = makeSolids(solid, FRAME.x, FRAME.y, cols, rows, cell)
  const hatch = (g: { s: number; len: number; wid: number }): Landmark => ({ x: ox + bx * g.s * UNIT, y: oy + by * g.s * UNIT, r: (Math.min(g.len, g.wid) / 2) * UNIT, nx: 0, ny: 0 })
  return { ox, oy, bx, by, sx, sy, basin, masts, solids, marks: { hatch: hatchesOf(h).map(hatch), skylight: [hatch(skylightOf(h))] } }
}

/** 甲板上散着的一颗炮弹，像素 */
export interface Ball {
  x: number
  y: number
  vx: number
  vy: number
}

export interface Slip {
  uid: number
  vx: number
  vy: number
}

/**
 * 船此刻的状态：姿态（横摇右舷往下为正、纵摇船头往下为正）、甲板上的载重与它对船中线和漂心的力矩，
 * 以及甲板倾斜后沿甲板的重力分量（地图坐标，像素/秒²）与垂直甲板的分量
 */
export interface ShipState {
  readonly deck: Deck
  readonly hs: Hydrostatics
  readonly waves: readonly WaveTerm[]
  readonly roll: Axis
  readonly pitch: Axis
  readonly balls: Ball[]
  /** 闲着的身体被动滑的速度，按实体记；uid 对不上就是换了实体 */
  readonly slips: Map<number, Slip>
  /** 海浪的时钟，秒 */
  t: number
  load: number
  heelMoment: number
  trimMoment: number
  spreadT: number
  spreadL: number
  gx: number
  gy: number
  gn: number
}

/** 开战前船已经在海上漂了这么久，秒：一开场就在随浪摇 */
const WARM_S = 40

/** 空船在涌浪里漂着，炮弹散在甲板上离舷墙与桅杆至少一格、离出发的地方至少 SPAWN_CLEAR_U 格的地方 */
export function makeShip(cfg: ShipConfig, across: boolean, rng: Rng): ShipState {
  const deck = makeDeck(cfg, across)
  const hs = hydrostatics(cfg)
  const waves = waveTerms(
    cfg,
    cfg.sea.swells.map(() => rng.next() * Math.PI * 2),
  )
  const balls: Ball[] = []
  const r = cfg.balls.radiusU * UNIT
  const h = cfg.hull
  for (let i = 0; i < cfg.balls.count; i++) {
    let p = FRAME_MID
    for (let k = 0; k < 64; k++) {
      p = deckPoint(deck, rng.next() * h.lengthU, (rng.next() - 0.5) * h.beamU)
      if (roomAt(deck.basin, p.x, p.y) > r + UNIT && Math.hypot(p.x - FRAME_MID.x, p.y - FRAME_MID.y) > SPAWN_CLEAR_U * UNIT) break
    }
    balls.push({ x: p.x, y: p.y, vx: 0, vy: 0 })
  }
  const g = (GRAVITY * UNIT) / cfg.meterPerU
  const s: ShipState = { deck, hs, waves, roll: { angle: 0, rate: 0 }, pitch: { angle: 0, rate: 0 }, balls, slips: new Map(), t: 0, load: 0, heelMoment: 0, trimMoment: 0, spreadT: 0, spreadL: 0, gx: 0, gy: 0, gn: g }
  for (let k = 0; k < WARM_S * 30; k++) stepShip(s, cfg, 1 / 30)
  return s
}

/** 一件东西压上甲板：记下它的重量与对船中线（右舷为正）、漂心（船头为正）的力矩，米 */
export function addWeight(s: ShipState, cfg: ShipConfig, kg: number, x: number, y: number): void {
  const p = deckLocal(s.deck, x, y)
  const t = p.t * cfg.meterPerU
  const l = p.s * cfg.meterPerU - s.hs.lcf
  s.load += kg
  s.heelMoment += kg * t
  s.trimMoment += kg * l
  s.spreadT += kg * t * t
  s.spreadL += kg * l * l
}

export function clearWeights(s: ShipState): void {
  s.load = 0
  s.heelMoment = 0
  s.trimMoment = 0
  s.spreadT = 0
  s.spreadL = 0
}

/** 甲板此刻的倾斜：沿甲板往下的方向（地图坐标的单位向量）与倾角（甲板法线离铅垂线的角度，弧度） */
export function deckTilt(s: ShipState): { down: Point; angle: number } {
  const g = Math.hypot(s.gx, s.gy)
  const angle = Math.acos(Math.min(1, Math.cos(s.roll.angle) * Math.cos(s.pitch.angle)))
  return { down: g > 0 ? { x: s.gx / g, y: s.gy / g } : { x: 0, y: 0 }, angle }
}

const MAX_STEP_S = 1 / 60

/**
 * 按甲板上的载重推进船的横摇与纵摇：载重让船平行下沉、重心升高，稳性按静水力学重算；载重本身也加进转动惯量；
 * 阻尼按阻尼比 b = 2ζ·√(I·Δ·g·GM)。推进后按姿态把重力分解到甲板上
 */
export function stepShip(s: ShipState, cfg: ShipConfig, dt: number): void {
  const d = cfg.hydro
  const st = stability(cfg, s.hs, s.load)
  const z = d.depthM + cfg.weight.bodyHeightM - st.kg
  const L = cfg.hull.lengthU * cfg.meterPerU
  const B = cfg.hull.beamU * cfg.meterPerU
  const iRoll = s.hs.mass * (d.rollGyration * B) ** 2 * (1 + d.rollAdded) + s.spreadT + s.load * z * z
  const iPitch = s.hs.mass * (d.pitchGyration * L) ** 2 * (1 + d.pitchAdded) + s.spreadL + s.load * z * z
  const bRoll = 2 * d.rollDamping * Math.sqrt(iRoll * st.mass * GRAVITY * st.gmT)
  const bPitch = 2 * d.pitchDamping * Math.sqrt(iPitch * st.mass * GRAVITY * st.gmL)
  let left = dt
  while (left > 1e-9) {
    const h = Math.min(MAX_STEP_S, left)
    const w = waveSlope(s.waves, s.t + h / 2)
    stepAxis(s.roll, h, iRoll, bRoll, st.mass, st.gmT, st.bmT, GRAVITY * s.heelMoment, w.roll)
    stepAxis(s.pitch, h, iPitch, bPitch, st.mass, st.gmL, st.bmL, GRAVITY * s.trimMoment, w.pitch)
    s.t += h
    left -= h
  }
  const k = (GRAVITY * UNIT) / cfg.meterPerU
  const phi = s.roll.angle
  const theta = s.pitch.angle
  const bow = k * Math.sin(theta)
  const star = k * Math.sin(phi) * Math.cos(theta)
  s.gx = bow * s.deck.bx + star * s.deck.sx
  s.gy = bow * s.deck.by + star * s.deck.sy
  s.gn = k * Math.cos(phi) * Math.cos(theta)
}

/**
 * 库仑摩擦（或滚动摩擦）下的一步：静止时沿甲板的重力不超过最大静摩擦 μs·gn 就不动；
 * 动起来先被重力分量加速、再被动摩擦 μk·gn 逆着速度减速，这一步里能停下就停下。
 * 滚动的东西转动惯量分走一部分：实心球的加速度是滑动时的 inertia = 5/7
 */
export function coulomb(out: BodyStep, x: number, y: number, vx: number, vy: number, gx: number, gy: number, gn: number, us: number, uk: number, inertia: number, dt: number): void {
  if (vx === 0 && vy === 0 && gx * gx + gy * gy <= (us * gn) ** 2) {
    out.x = x
    out.y = y
    out.vx = 0
    out.vy = 0
    return
  }
  let nx = vx + gx * inertia * dt
  let ny = vy + gy * inertia * dt
  const sp = Math.hypot(nx, ny)
  const drop = uk * gn * inertia * dt
  if (sp <= drop) {
    nx = 0
    ny = 0
  } else {
    nx *= 1 - drop / sp
    ny *= 1 - drop / sp
  }
  out.x = x + (vx + nx) * 0.5 * dt
  out.y = y + (vy + ny) * 0.5 * dt
  out.vx = nx
  out.vy = ny
}

/**
 * 恒定功率赶路 P = m·v·(c − g∥)：沿着前进方向的重力分量 g∥（下坡为正）让速度变成平地的 c/(c − g∥) 倍，
 * 上坡总还走得动，下坡最多快到 downhillMax 倍；c 是平地上的阻力，像素/秒²
 */
export function paceOf(gx: number, gy: number, dx: number, dy: number, c: number, max: number): number {
  const len = Math.hypot(dx, dy)
  if (len === 0) return 1
  const along = (gx * dx + gy * dy) / len
  return Math.min(max, c / Math.max(c - along, c / max))
}

const BALL_INERTIA = 5 / 7

/** 炮弹沿甲板滚：滚动摩擦，撞舷墙与桅杆按恢复系数反弹，彼此按等质量的碰撞交换法向速度 */
export function stepBalls(s: ShipState, cfg: ShipConfig, dt: number): void {
  const r = cfg.balls.radiusU * UNIT
  const e = cfg.balls.restitution
  const mu = cfg.friction.ballRolling
  const out: BodyStep = { x: 0, y: 0, vx: 0, vy: 0 }
  for (const b of s.balls) {
    coulomb(out, b.x, b.y, b.vx, b.vy, s.gx, s.gy, s.gn, mu, mu, BALL_INERTIA, dt)
    b.x = out.x
    b.y = out.y
    b.vx = out.vx
    b.vy = out.vy
  }
  for (let i = 0; i < s.balls.length; i++) {
    const a = s.balls[i]!
    for (let j = i + 1; j < s.balls.length; j++) {
      const b = s.balls[j]!
      const dx = b.x - a.x
      const dy = b.y - a.y
      const d = Math.hypot(dx, dy)
      if (d >= 2 * r || d < 1e-6) continue
      const nx = dx / d
      const ny = dy / d
      const push = (2 * r - d) / 2
      a.x -= nx * push
      a.y -= ny * push
      b.x += nx * push
      b.y += ny * push
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny
      if (rel >= 0) continue
      const j2 = ((1 + e) * rel) / 2
      a.vx += j2 * nx
      a.vy += j2 * ny
      b.vx -= j2 * nx
      b.vy -= j2 * ny
    }
    const room = roomAt(s.deck.basin, a.x, a.y)
    if (room < r) {
      const n = awayFromWall(s.deck.basin, a.x, a.y)
      a.x += n.x * (r - room)
      a.y += n.y * (r - room)
      bounce(a, n.x, n.y, 0, 0, e)
    }
  }
}

/** 撞上以 (ux, uy) 运动的重物：法向的相对速度按恢复系数反向 */
function bounce(b: Ball, nx: number, ny: number, ux: number, uy: number, e: number): void {
  const rel = (b.vx - ux) * nx + (b.vy - uy) * ny
  if (rel >= 0) return
  b.vx -= (1 + e) * rel * nx
  b.vy -= (1 + e) * rel * ny
}

/** 炮弹碰到半径 r、速度 (vx, vy) 的身体就被推开弹走；身体比炮弹重得多，不受影响 */
export function bumpBalls(s: ShipState, cfg: ShipConfig, x: number, y: number, r: number, vx: number, vy: number): void {
  const reach = r + cfg.balls.radiusU * UNIT
  for (const a of s.balls) {
    const dx = a.x - x
    const dy = a.y - y
    const d2 = dx * dx + dy * dy
    if (d2 >= reach * reach || d2 < 1e-12) continue
    const d = Math.sqrt(d2)
    a.x = x + (dx / d) * reach
    a.y = y + (dy / d) * reach
    bounce(a, dx / d, dy / d, vx, vy, cfg.balls.restitution)
  }
}

const OWN: BodyStep = { x: 0, y: 0, vx: 0, vy: 0 }
const SLIDE: BodyStep = { x: 0, y: 0, vx: 0, vy: 0 }

/**
 * 甲板上一个身体的一步：自己的运动（赶路、被击退、被磁吸）照常按抓地 k 趋近期望速度 (tx, ty)；
 * 闲着时在这之上叠一份被动的滑动，按库仑摩擦 fr 由沿甲板的重力推着走，一赶路脚下站稳、滑动并进自己的运动。
 * 撞上舷墙或桅杆就停在壁面上，朝里的速度归零
 */
export function stepOnDeck(s: ShipState, out: BodyStep, eid: number, uid: number, x: number, y: number, vx: number, vy: number, rad: number, dt: number, k: number, tx: number, ty: number, walking: boolean, fr: Friction): void {
  let slip = s.slips.get(eid)
  if (slip && slip.uid !== uid) {
    s.slips.delete(eid)
    slip = undefined
  }
  if (walking) {
    if (slip) s.slips.delete(eid)
    approach(out, x, y, vx, vy, tx, ty, k, dt)
  } else {
    const svx = slip?.vx ?? 0
    const svy = slip?.vy ?? 0
    approach(OWN, x, y, vx - svx, vy - svy, tx, ty, k, dt)
    coulomb(SLIDE, 0, 0, svx, svy, s.gx, s.gy, s.gn, fr.static, fr.kinetic, 1, dt)
    out.x = OWN.x + SLIDE.x
    out.y = OWN.y + SLIDE.y
    out.vx = OWN.vx + SLIDE.vx
    out.vy = OWN.vy + SLIDE.vy
    if (SLIDE.vx === 0 && SLIDE.vy === 0) {
      if (slip) s.slips.delete(eid)
    } else if (slip) {
      slip.vx = SLIDE.vx
      slip.vy = SLIDE.vy
    } else s.slips.set(eid, { uid, vx: SLIDE.vx, vy: SLIDE.vy })
  }
  const to = keepOut(s.deck.basin, out.x, out.y, rad)
  if (to.x === out.x && to.y === out.y) return
  const n = awayFromWall(s.deck.basin, to.x, to.y)
  const vn = out.vx * n.x + out.vy * n.y
  if (vn < 0) {
    out.vx -= vn * n.x
    out.vy -= vn * n.y
  }
  const held = s.slips.get(eid)
  if (held) {
    const sn = held.vx * n.x + held.vy * n.y
    if (sn < 0) {
      held.vx -= sn * n.x
      held.vy -= sn * n.y
    }
  }
  out.x = to.x
  out.y = to.y
}
