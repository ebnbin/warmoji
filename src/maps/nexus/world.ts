import { hasComponent, query } from 'bitecs'
import { FRAME_U, UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { MAPS } from '../../data/maps'
import { SPAWN } from '../../data/enemies'
import { Alive, Enemy, ENEMY_SET, Radius, Transform } from '../../ecs/components'
import { fleeSteer } from '../../ecs/systems/shared/steer'
import { leaderPoint } from '../../ecs/utils/team'
import { grounded, phases, topOf } from '../../ecs/utils/pass'
import { makeSolids, solidOf, solidsTrace } from '../../ecs/worlds/solids'
import { alongWall, awayFromWall, keepOut, makeBasin, roomAt } from '../basin'
import { roomFor } from '../landmark'
import { hallRoom, nexusPlan, warpApart, warpDist } from './layout'
import { nexusMarks } from './marks'
import { flowNav, makeNav, navCell, navCenter, navDist, navNear, relink } from './nav'
import { warpCross } from './warps'
import type { NexusPlan, WarpSpot } from './layout'
import type { NavGrid } from './nav'
import type { Basin } from '../basin'
import type { Solid, Solids } from '../../ecs/worlds/solids'
import type { Landmark } from '../landmark'
import type { MapId, NexusConfig } from '../../types/maps'
import type { Point } from '../../util/vec'
import type { Sim } from '../../ecs/sim'
import type { PortalHop, Surface, WorldHooks } from '../../ecs/worlds/hooks'

const ZERO: Point = { x: 0, y: 0 }
const NO_GHOSTS: Point[] = []
/** 天枢按布景种子打散出自己的种子 */
const PLAN_SEED = 0x51e7a9
/** 目标离这么近（格）、中间又没挡着时直奔过去，不看寻路 */
const DIRECT_U = 6
/** 沿寻路往前看这么多步，挑最远的一处走直线看得到的 */
const LOOK = 12
/** 寻路要穿门时朝门线那一边多走过去这么远，格：斜着进门也一定越过门线 */
const PAST_U = 0.35
/** 走直线看路时每隔这么远（格）看一眼离障碍多远 */
const PROBE_U = 0.25
/** 门挪去的新位置离队伍里每个人至少这么远、离自己原来的位置至少这么远，格 */
const WARP_SQUAD_U = 2.5
const WARP_MOVE_U = 4
/** 寻路到队长的路最多隔这么久（毫秒）重算一次；队长一下挪得比这（格）远（穿门）就马上重算 */
const NAV_MS = 150
const NAV_JUMP_U = 2
/** 队员的坑位离门线至少这么多格、和队长在门线同一侧：队员刹不住也冲不过门线 */
const SEAT_GAP_U = 0.6
/** 新位置一时挑不出来，过这么久再挑，毫秒 */
const WARP_RETRY_MS = 2000
/** 地砖：身体半径的这么多倍以内的瓷砖算踩着；离开这么久（毫秒）再踩上来算新踩的一脚 */
const FOOT = 0.6
const STEP_GAP_MS = 120
/** 画面最多记这么多次穿门 */
export const HOP_CAP = 32

/** 一扇门此刻在哪；正挪着时还有要挪去的地方与开始预警的时刻 */
export interface WarpState {
  spot: WarpSpot
  next: WarpSpot | null
  since: number
}

/** 有东西穿过了一扇门：从哪扇门进去，出来时在哪（像素），是队伍、敌人还是别的东西（弹体、掉落物） */
export interface Hop {
  readonly warp: number
  readonly x: number
  readonly y: number
  readonly who: 'team' | 'foe' | 'thing'
}

/** 地砖：每格最近一次被队伍、被敌人踩着的时刻，与这一脚踩上去的时刻，毫秒；格子铺满方框 */
export interface Tiles {
  readonly team: Float32Array
  readonly foe: Float32Array
  readonly teamFrom: Float32Array
  readonly foeFrom: Float32Array
}

/** 天枢此刻：按种子生成的大厅与地标、挡弹体的实心，每扇门的位置、下一次挪门的时刻、认得门的寻路，地砖被踩的时刻，最近几次穿门 */
export interface NexusState {
  readonly plan: NexusPlan
  /** 幕墙围着的整片大厅，连电梯井、立柱占着的地方也算：出怪口沿它的外边界、从幕墙外翻进来 */
  readonly floor: Basin
  readonly marks: Readonly<Record<string, readonly Landmark[]>>
  readonly solids: Solids
  readonly warps: WarpState[]
  moveAt: number
  /** 门换过位置就加一：寻路按它重铺 */
  version: number
  readonly nav: NavGrid
  navVersion: number
  /** 上一次算到队长的路时队长在哪一格、在哪（格），什么时刻 */
  navCell: number
  navX: number
  navY: number
  navAt: number
  readonly tiles: Tiles
  readonly hops: Hop[]
  hopCount: number
}

function cfgOf(sim: Sim): NexusConfig {
  return MAPS[sim.mapId].nexus!
}

/** 这一局的大厅：视图要它画地面，规则要它定边界与门，两边按同一个种子各要一次 */
export function nexusPlanFor(cfg: NexusConfig, decorSeed: number): NexusPlan {
  return nexusPlan(cfg, (decorSeed ^ PLAN_SEED) >>> 0)
}

const WALL: Solid = { topM: Infinity, material: 'glass' }
const FIXTURE: Solid = { topM: Infinity, material: 'structure' }

/** 幕墙与顶到天花板的立柱、电梯井挡一切；全息台按台高挡低处的弹体 */
function solidsOf(cfg: NexusConfig, plan: NexusPlan): Solids {
  const pedestal: Solid = { topM: topOf(cfg.pedestals.heightM), material: 'structure' }
  const at = (px: number, py: number): Solid | null => {
    const x = px / UNIT
    const y = py / UNIT
    if (plan.cores.some((c) => x > c.x0 && x < c.x1 && y > c.y0 && y < c.y1)) return FIXTURE
    if (plan.pillars.some((q) => Math.hypot(x - q.x, y - q.y) < q.r)) return FIXTURE
    if (plan.pedestals.some((q) => Math.hypot(x - q.x, y - q.y) < q.r)) return pedestal
    return hallRoom(plan.hall, x, y) < 0 ? WALL : null
  }
  const b = plan.basin
  return makeSolids(at, b.x0, b.y0, b.cols, b.rows, b.cell)
}

export function nexusOf(sim: Sim): NexusState {
  let s = sim.worldState.nexus
  if (!s) {
    const cfg = cfgOf(sim)
    const plan = nexusPlanFor(cfg, sim.run.decorSeed)
    const nav = makeNav(plan.hall, plan.basin)
    const n = FRAME_U * FRAME_U
    const b = plan.basin
    const never = (): Float32Array => new Float32Array(n).fill(-1e9)
    s = {
      plan,
      floor: makeBasin((px, py) => hallRoom(plan.hall, px / UNIT, py / UNIT) > 0, b.x0, b.y0, b.cols, b.rows, b.cell, { x: plan.start.x * UNIT, y: plan.start.y * UNIT }, cfg.neckU * UNIT),
      marks: nexusMarks(cfg, plan),
      solids: solidsOf(cfg, plan),
      warps: plan.warps.map((spot) => ({ spot, next: null, since: 0 })),
      moveAt: sim.elapsedMs + between(sim, cfg.warps.everyMs),
      version: 0,
      nav,
      navVersion: -1,
      navCell: -1,
      navX: 0,
      navY: 0,
      navAt: 0,
      tiles: { team: never(), foe: never(), teamFrom: never(), foeFrom: never() },
      hops: [],
      hopCount: 0,
    }
    sim.worldState.nexus = s
    stepNav(sim, s, cfg)
  }
  return s
}

function between(sim: Sim, r: readonly [number, number]): number {
  return r[0] + (r[1] - r[0]) * sim.rng.next()
}

/** 此刻的门在哪：按对排，第 k 扇的另一扇是 k ^ 1 */
export function warpSpots(s: NexusState): WarpSpot[] {
  return s.warps.map((w) => w.spot)
}

/** 门挪过就重铺寻路；队长换了一格就重算到队长的路，最多隔 NAV_MS 算一次，队长一下挪远了（穿门）就马上算 */
function stepNav(sim: Sim, s: NexusState, cfg: NexusConfig): void {
  if (s.navVersion !== s.version) {
    relink(s.nav, warpSpots(s), cfg.warps.lenU)
    s.navVersion = s.version
    s.navCell = -2
  }
  const lead = leaderPoint(sim)
  const x = lead.x / UNIT
  const y = lead.y / UNIT
  const c = navCell(s.nav, x, y)
  if (c === s.navCell) return
  if (s.navCell !== -2 && sim.elapsedMs - s.navAt < NAV_MS && Math.hypot(x - s.navX, y - s.navY) < NAV_JUMP_U) return
  flowNav(s.nav, x, y)
  s.navCell = c
  s.navX = x
  s.navY = y
  s.navAt = sim.elapsedMs
}

/** 门到时候挪：没在挪的门到点挑一扇、挑个新位置开始预警；预警满了就换过去 */
function stepWarps(sim: Sim, s: NexusState, cfg: NexusConfig): void {
  const now = sim.elapsedMs
  const moving = s.warps.find((w) => w.next !== null)
  if (moving) {
    if (now - moving.since < cfg.warps.warnMs) return
    moving.spot = moving.next!
    moving.next = null
    s.version++
    s.moveAt = now + between(sim, cfg.warps.everyMs)
    return
  }
  if (now < s.moveAt) return
  const k = Math.floor(sim.rng.next() * s.warps.length)
  const spot = newSpot(sim, s, cfg, k)
  if (!spot) {
    s.moveAt = now + WARP_RETRY_MS
    return
  }
  s.warps[k]!.next = spot
  s.warps[k]!.since = now
}

/** 第 k 扇门挪去哪：朝向不变，离另一扇门够远，离别的门、队伍里的人和它原来的位置都够远 */
function newSpot(sim: Sim, s: NexusState, cfg: NexusConfig, k: number): WarpSpot | null {
  const w = cfg.warps
  const cur = s.warps[k]!.spot
  const other = s.warps[k ^ 1]!.spot
  const squad = sim.characters.filter((m) => Alive.v[m] === 1).map((m) => ({ x: Transform.x[m]! / UNIT, y: Transform.y[m]! / UNIT }))
  const list = s.plan.spots.filter(
    (sp) =>
      sp.axis === cur.axis &&
      warpApart(sp, cur, w.lenU) >= WARP_MOVE_U &&
      warpApart(sp, other, w.lenU) >= w.pairU &&
      s.warps.every((o, j) => j === k || j === (k ^ 1) || warpApart(sp, o.spot, w.lenU) >= w.apartU) &&
      squad.every((p) => warpDist(sp, w.lenU, p.x, p.y) >= WARP_SQUAD_U),
  )
  return list[Math.floor(sim.rng.next() * list.length)] ?? null
}

/** 活着、脚沾地的身体踩亮脚下的瓷砖：半径的 FOOT 倍以内碰到的都算，离开过一阵再踩上来记为新的一脚 */
function stepTiles(sim: Sim, s: NexusState): void {
  const now = sim.elapsedMs
  const t = s.tiles
  const mark = (eid: number, at: Float32Array, from: Float32Array): void => {
    const x = Transform.x[eid]! / UNIT
    const y = Transform.y[eid]! / UNIT
    const r = (Radius.v[eid]! / UNIT) * FOOT
    for (let j = Math.max(0, Math.floor(y - r)); j <= Math.min(FRAME_U - 1, Math.floor(y + r)); j++) {
      for (let i = Math.max(0, Math.floor(x - r)); i <= Math.min(FRAME_U - 1, Math.floor(x + r)); i++) {
        if (Math.hypot(Math.max(i - x, 0, x - i - 1), Math.max(j - y, 0, y - j - 1)) > r) continue
        const k = j * FRAME_U + i
        if (now - at[k]! > STEP_GAP_MS) from[k] = now
        at[k] = now
      }
    }
  }
  for (const m of sim.characters) if (Alive.v[m] === 1 && grounded(sim.world, m)) mark(m, t.team, t.teamFrom)
  for (const e of query(sim.world, ENEMY_SET)) if (Alive.v[e] === 1 && grounded(sim.world, e)) mark(e, t.foe, t.foeFrom)
}

/** 线段 a→b（像素）最先越过的那扇门，与走到那里的比例；一扇都没越过为 null */
function firstCross(s: NexusState, cfg: NexusConfig, ax: number, ay: number, bx: number, by: number): { readonly warp: number; readonly t: number } | null {
  const len = cfg.warps.lenU
  let best: { warp: number; t: number } | null = null
  for (let i = 0; i < s.warps.length; i++) {
    const t = warpCross(s.warps[i]!.spot, len, ax / UNIT, ay / UNIT, bx / UNIT, by / UNIT)
    if (t >= 0 && (!best || t < best.t)) best = { warp: i, t }
  }
  return best
}

/** 走直线从 a 到 b（像素）通不通：中途离障碍够远，不越过任何门线；allow 不为 −1 时这一段正是要穿过那扇门，必须越过它的门线 */
function clearLine(s: NexusState, cfg: NexusConfig, ax: number, ay: number, bx: number, by: number, r: number, allow: number): boolean {
  const len = cfg.warps.lenU
  for (let i = 0; i < s.warps.length; i++) {
    const t = warpCross(s.warps[i]!.spot, len, ax / UNIT, ay / UNIT, bx / UNIT, by / UNIT)
    if (i === allow ? t < 0 : t >= 0) return false
  }
  const need = Math.min(r, 0.45 * UNIT) * 0.85
  const dx = bx - ax
  const dy = by - ay
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (PROBE_U * UNIT)))
  for (let k = 1; k <= n; k++) if (roomAt(s.plan.basin, ax + (dx * k) / n, ay + (dy * k) / n) < need) return false
  return true
}

/**
 * 追向 (tx, ty) 的方向：离得近、中间又没挡着就直奔；否则沿认得门的寻路往前看几步，挑走直线看得到的最远一处；
 * 寻路要穿门时最远看到门线那边一点，越过门线就到了另一扇门那边，接着按那边的寻路走。到不了的返回 null
 */
function steer(s: NexusState, cfg: NexusConfig, x: number, y: number, tx: number, ty: number, r: number): Point | null {
  const dx = tx - x
  const dy = ty - y
  const d = Math.hypot(dx, dy)
  if (d < 1e-6) return null
  if (d < DIRECT_U * UNIT && clearLine(s, cfg, x, y, tx, ty, r, -1)) return { x: dx / d, y: dy / d }
  const nav = s.nav
  let cur = navNear(nav, x / UNIT, y / UNIT)
  if (cur < 0 || nav.dist[cur] === Infinity) return null
  const way: { x: number; y: number; warp: number }[] = []
  for (let k = 0; k < LOOK; k++) {
    const nx = nav.next[cur]!
    if (nx < 0) break
    const warp = nav.hop[cur]!
    if (warp >= 0) {
      const at = navCenter(nav, cur)
      const sp = s.warps[warp]!.spot
      const p = sp.axis === 0 ? { x: sp.x + (at.x < sp.x ? PAST_U : -PAST_U), y: at.y } : { x: at.x, y: sp.y + (at.y < sp.y ? PAST_U : -PAST_U) }
      way.push({ x: p.x * UNIT, y: p.y * UNIT, warp })
      break
    }
    cur = nx
    const p = navCenter(nav, cur)
    way.push({ x: p.x * UNIT, y: p.y * UNIT, warp: -1 })
  }
  if (way.length === 0) return null
  for (let k = way.length - 1; k >= 0; k--) {
    const p = way[k]!
    if (k > 0 && !clearLine(s, cfg, x, y, p.x, p.y, r, p.warp)) continue
    return norm(p.x - x, p.y - y)
  }
  return null
}

/** 能站的地面上离边至少 room 像素、不挨着门的一点：从 p 往外一圈圈找，近处找不到就退回开局站位 */
function openNear(s: NexusState, cfg: NexusConfig, p: Point, room: number): Point {
  for (let r = 0; r <= 8 * UNIT; r += 0.5 * UNIT) {
    const n = r === 0 ? 1 : Math.ceil((r * Math.PI * 2) / (0.5 * UNIT))
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2
      const q = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r }
      if (roomAt(s.plan.basin, q.x, q.y) >= room && clearOfWarps(s, cfg, q.x, q.y, room)) return q
    }
  }
  return { x: s.plan.start.x * UNIT, y: s.plan.start.y * UNIT }
}

/** 半径 rad 像素的身体在 (x, y) 不挨着任何一扇门（连正要挪去的地方）：离门线再空出半格 */
function clearOfWarps(s: NexusState, cfg: NexusConfig, x: number, y: number, rad: number): boolean {
  const min = rad / UNIT + 0.5
  return s.warps.every((w) => warpDist(w.spot, cfg.warps.lenU, x / UNIT, y / UNIT) >= min && (!w.next || warpDist(w.next, cfg.warps.lenU, x / UNIT, y / UNIT) >= min))
}

/** 穿门记给画面：最近 HOP_CAP 次 */
function record(sim: Sim, s: NexusState, eid: number, warp: number, x: number, y: number): void {
  const who = sim.characters.includes(eid) ? 'team' : hasComponent(sim.world, eid, Enemy) ? 'foe' : 'thing'
  s.hops[s.hopCount % HOP_CAP] = { warp, x, y, who }
  s.hopCount++
}

const GROUNDS = new Map<MapId, Surface>()

/** 瓷砖地面：费力与回复来自地图，其余同平地 */
function groundOf(sim: Sim): Surface {
  let g = GROUNDS.get(sim.mapId)
  if (!g) {
    const { exertion, regen } = MAPS[sim.mapId].stamina
    g = { traction: 1, viscosity: 1, exertion, regen }
    GROUNDS.set(sim.mapId, g)
  }
  return g
}

/**
 * 天枢：能走的是幕墙围着的大厅，幕墙、立柱与电梯井是硬边界，走到跟前就停住（穿墙的身体只被幕墙挡住）；全息台齐腰，挡人，子弹从上面飞过去。
 * 传送门：任何东西的中心越过门线，就平移到另一扇门同一侧接着走，速度不变；寻路认得门，穿门近就穿。
 * 门隔一阵挪一扇，预警过后一下换过去；地砖记着谁什么时候踩过
 */
export const nexus: WorldHooks = {
  torus: false,
  worldDelta(_sim, fromX, fromY, toX, toY) {
    return { x: toX - fromX, y: toY - fromY }
  },
  ghosts() {
    return NO_GHOSTS
  },
  wrap(_sim, x, y) {
    return { x, y }
  },
  projectileLifeMs() {
    return 0
  },
  mediumVelocity() {
    return ZERO
  },
  pull() {
    return ZERO
  },
  sink() {
    return false
  },
  surface(sim) {
    return groundOf(sim)
  },
  effort() {
    return 1
  },
  contact() {
    return false
  },
  /** 穿墙的身体穿得过厅里的建筑，出不了幕墙 */
  constrainBody(sim, eid, _from, next) {
    const s = nexusOf(sim)
    return keepOut(phases(sim.world, eid, 'structure') ? s.floor : s.plan.basin, next.x, next.y, Radius.v[eid]!)
  },
  basin(sim) {
    return nexusOf(sim).plan.basin
  },
  /** 穿墙的身体直奔目标，直线要越过门线时才按寻路走 */
  chaseDir(sim, eid, tx, ty) {
    const s = nexusOf(sim)
    const cfg = cfgOf(sim)
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const r = Radius.v[eid]!
    if (phases(sim.world, eid, 'structure') && !firstCross(s, cfg, x, y, tx, ty)) return norm(tx - x, ty - y)
    const way = steer(s, cfg, x, y, tx, ty, r)
    if (way) return way
    const d = norm(tx - x, ty - y)
    return alongWall(s.plan.basin, x, y, d.x, d.y, r + 0.3 * UNIT)
  },
  trace(sim, probe, ax, ay, bx, by) {
    return solidsTrace(nexusOf(sim).solids, probe, ax, ay, bx, by)
  },
  solidAt(sim, x, y) {
    return solidOf(nexusOf(sim).solids, x, y)
  },
  smashWall() {},
  wanderDir(sim, eid, dx, dy) {
    const b = nexusOf(sim).plan.basin
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    if (roomAt(b, x, y) > Radius.v[eid]! + 0.6 * UNIT) return { x: dx, y: dy }
    const n = awayFromWall(b, x, y)
    const dot = dx * n.x + dy * n.y
    return dot >= 0 ? { x: dx, y: dy } : { x: dx - 2 * dot * n.x, y: dy - 2 * dot * n.y }
  },
  fleeDir(sim, eid, awayX, awayY) {
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const d = fleeSteer(x, y, awayX, awayY, sim.mapW, sim.mapH, 1.5 * UNIT)
    return alongWall(nexusOf(sim).plan.basin, x, y, d.x, d.y, Radius.v[eid]! + 1.5 * UNIT)
  },
  outside(sim, x, y) {
    return x < -UNIT || x > sim.mapW + UNIT || y < -UNIT || y > sim.mapH + UNIT
  },
  /** 刷怪点落在厅里、离边至少一格、不挨着门；头目离队长更远 */
  spawnPoint(sim, boss) {
    const s = nexusOf(sim)
    const cfg = cfgOf(sim)
    const lead = leaderPoint(sim)
    const far = SPAWN.minPlayerDist * UNIT * (boss ? 1.6 : 1)
    let p: Point = { x: s.plan.start.x * UNIT, y: s.plan.start.y * UNIT }
    for (let i = 0; i < 48; i++) {
      p = { x: sim.rng.next() * sim.mapW, y: sim.rng.next() * sim.mapH }
      if (roomAt(s.plan.basin, p.x, p.y) < UNIT || !clearOfWarps(s, cfg, p.x, p.y, 0.5 * UNIT)) continue
      if ((p.x - lead.x) ** 2 + (p.y - lead.y) ** 2 >= far * far) return p
    }
    return openNear(s, cfg, p, UNIT)
  },
  center(sim) {
    const st = nexusOf(sim).plan.start
    return { x: st.x * UNIT, y: st.y * UNIT }
  },
  settle(sim, p) {
    return openNear(nexusOf(sim), cfgOf(sim), p, SPAWN.edgeInset * UNIT)
  },
  ground(sim) {
    return nexusOf(sim).floor
  },
  canSpawn(sim, x, y, radius) {
    const s = nexusOf(sim)
    const cfg = cfgOf(sim)
    return roomFor(s.plan.basin, x, y, radius) && clearOfWarps(s, cfg, x, y, radius)
  },
  landmarks(sim) {
    return nexusOf(sim).marks
  },
  lean() {
    return ZERO
  },
  /** 坑位贴着或隔着门线（连两头外 SEAT_GAP_U 格）就横着挪回队长那一侧、离门线 SEAT_GAP_U 格 */
  seat(sim, from, at) {
    const len = cfgOf(sim).warps.lenU
    let x = at.x / UNIT
    let y = at.y / UNIT
    for (const w of nexusOf(sim).warps) {
      const sp = w.spot
      const v = sp.axis === 0
      const along = v ? y - sp.y : x - sp.x
      if (along <= -SEAT_GAP_U || along >= len + SEAT_GAP_U) continue
      const side = (v ? from.x / UNIT - sp.x : from.y / UNIT - sp.y) < 0 ? -1 : 1
      if ((v ? x - sp.x : y - sp.y) * side >= SEAT_GAP_U) continue
      if (v) x = sp.x + side * SEAT_GAP_U
      else y = sp.y + side * SEAT_GAP_U
    }
    return { x: x * UNIT, y: y * UNIT }
  },
  portal(sim, eid, ax, ay, bx, by) {
    const s = nexusOf(sim)
    const c = firstCross(s, cfgOf(sim), ax, ay, bx, by)
    if (!c) return null
    const a = s.warps[c.warp]!.spot
    const o = s.warps[c.warp ^ 1]!.spot
    const hop: PortalHop = { t: c.t, dx: (o.x - a.x) * UNIT, dy: (o.y - a.y) * UNIT }
    if (eid >= 0) record(sim, s, eid, c.warp, bx + hop.dx, by + hop.dy)
    return hop
  },
  /** 穿过第 i 扇门就平移到另一扇门那边：b 在门这边的像离 a 更近、直线又正好越过这扇门的门线，就朝它飞 */
  towards(sim, ax, ay, bx, by) {
    const s = nexusOf(sim)
    const len = cfgOf(sim).warps.lenU
    let dx = bx - ax
    let dy = by - ay
    let best = Math.hypot(dx, dy)
    for (let i = 0; i < s.warps.length; i++) {
      const a = s.warps[i]!.spot
      const o = s.warps[i ^ 1]!.spot
      const ix = bx + (a.x - o.x) * UNIT
      const iy = by + (a.y - o.y) * UNIT
      const d = Math.hypot(ix - ax, iy - ay)
      if (d >= best || warpCross(a, len, ax / UNIT, ay / UNIT, ix / UNIT, iy / UNIT) < 0) continue
      best = d
      dx = ix - ax
      dy = iy - ay
    }
    return { x: dx, y: dy }
  },
  /** 寻路还没铺到队长、或这里接不上寻路时按直线 */
  toLeader(sim, x, y) {
    const d = navDist(nexusOf(sim).nav, x / UNIT, y / UNIT)
    if (Number.isFinite(d)) return d * UNIT
    const lead = leaderPoint(sim)
    return Math.hypot(x - lead.x, y - lead.y)
  },
  onStart(sim) {
    nexusOf(sim)
  },
  tick(sim) {
    const cfg = cfgOf(sim)
    const s = nexusOf(sim)
    stepWarps(sim, s, cfg)
    stepNav(sim, s, cfg)
    stepTiles(sim, s)
  },
}
