import { hasComponent, query } from 'bitecs'
import { FRAME_U, UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { MAPS } from '../../data/maps'
import { SPAWN } from '../../data/enemies'
import { Alive, ENEMY_SET, FACTION, Faction, Minion, Mounted, Pet, Phys, Pickup, Radius, Transform, Uid } from '../../ecs/components'
import { displace } from '../../ecs/systems/shared/displace'
import type { Mover } from '../../ecs/systems/shared/displace'
import { fleeSteer } from '../../ecs/systems/shared/steer'
import { inTransit } from '../../ecs/utils/marks'
import { grounded } from '../../ecs/utils/pass'
import { leaderPoint } from '../../ecs/utils/team'
import { makeSolids, solidOf, solidsTrace } from '../../ecs/worlds/solids'
import { bounded, wanderIn, ZERO } from '../../ecs/worlds/hooks'
import { alongWall, keepOut, roomAt } from '../basin'
import { roomFor } from '../landmark'
import { inBox, nextRoom, platesIn, pressBox, pressedStrips, roomIndexAt, warpPlan } from './layout'
import { clearWalk, flowDir, flowTo, navDist, navGrid } from './nav'
import type { NavField, NavGrid } from './nav'
import type { Box, WarpPlan } from './layout'
import type { Solid, Solids } from '../../ecs/worlds/solids'
import type { Crossing } from '../../ecs/utils/pass'
import type { Landmark } from '../landmark'
import type { WarpConfig } from '../../types/maps'
import type { Point } from '../../util/vec'
import type { Sim } from '../../ecs/sim'
import type { WorldHooks } from '../../ecs/worlds/hooks'

/** 跃迁站按布景种子打散出自己的种子 */
const PLAN_SEED = 0x7a3e51
/** 身体半径的这么多倍以内的瓷砖算踩着；离开过这么久再踩上来记为新的一脚，毫秒 */
const FOOT = 0.7
const STEP_GAP_MS = 140
/** 到队长的步数场最多隔多久重铺一次，毫秒 */
const NAV_MS = 250
/** 离目标这么近（格）、中间又没挡着就直奔 */
const DIRECT_U = 6
/** 画面要的记录各留多少条 */
const HOP_CAP = 256
const IMPACT_CAP = 48
/** 送到的队员在台上排成几圈：每圈离台心多远（格）、排几个 */
const RINGS = [
  [0, 1],
  [0.75, 6],
  [1.3, 10],
] as const

/** 传送是被摆布：锚定的、霸体的、头目也照送 */
const SHIPPED: Mover = { self: false, free: true }

const FIELD: Solid = { topM: Infinity, material: 'field' }

/**
 * 一座传送台此刻：队长站在上面攒下的充能（毫秒），队伍到这里以后冷却到哪一刻，下一趟发车的时刻；
 * 上一次队伍从这里出发、上一趟发车的时刻与那一趟送走了几只（画面用）
 */
export interface PadState {
  charge: number
  coolUntil: number
  shuttleAt: number
  jumpedAt: number
  shuttledAt: number
  shuttled: number
}

/** 一个身体被送走：从哪到哪（像素）、哪一刻出发（对局时钟）、多大、是不是敌人 */
export interface Hop {
  readonly fx: number
  readonly fy: number
  readonly tx: number
  readonly ty: number
  readonly at: number
  readonly r: number
  readonly foe: boolean
}

/** 子弹打在平台边的力场上：在哪（像素）、哪一刻 */
export interface Impact {
  readonly x: number
  readonly y: number
  readonly at: number
}

/** 到了对面要往台外涌的敌人：到点还是它（uid 对得上）才推 */
interface Arrival {
  readonly eid: number
  readonly uid: number
  readonly at: number
  readonly pad: number
}

/** 每块瓷砖最近一次被队伍、敌人踩着的时刻，与这一脚踩上来的时刻 */
export interface Tiles {
  readonly team: Float32Array
  readonly foe: Float32Array
  readonly teamFrom: Float32Array
  readonly foeFrom: Float32Array
}

/**
 * 跃迁站此刻：按种子定下的站，挡弹体与视线的力场，出怪的地标（跟着墙走）；队伍此刻在哪间；四座传送台；
 * 各间的墙压到几成与此刻能走的方块；寻路的底子、各间到传送台的步数场与到队长的步数场（墙每推进半格重铺一次）；地砖；画面要的送人、发车与力场受击的记录
 */
export interface WarpState {
  readonly plan: WarpPlan
  readonly solids: Solids
  marks: Readonly<Record<string, readonly Landmark[]>>
  teamRoom: number
  readonly pads: PadState[]
  readonly press: Float32Array
  readonly boxes: Box[]
  readonly navKeys: number[]
  readonly grids: NavGrid[]
  readonly toPad: NavField[]
  toLeader: NavField | null
  navAt: number
  navCell: number
  navRoom: number
  /** 正在把身体送过虚空：这时的落点不按出发的那间约束 */
  crossing: boolean
  readonly tiles: Tiles
  readonly hops: Hop[]
  readonly impacts: Impact[]
  readonly arrivals: Arrival[]
  /** 队伍一共跃迁过几次：画面按它认出新的一次 */
  jumps: number
}

function cfgOf(sim: Sim): WarpConfig {
  return MAPS[sim.mapId].warp!
}

/** 这一局的跃迁站：视图要它画，规则要它定边界与传送台，两边按同一个种子各要一次 */
export function warpPlanFor(cfg: WarpConfig, decorSeed: number): WarpPlan {
  return warpPlan(cfg, (decorSeed ^ PLAN_SEED) >>> 0)
}

/** 出怪的地标：每间房的出怪板（嵌在此刻的墙上）归到那间配方的名下；核心柱单独一组 */
function marksOf(cfg: WarpConfig, plan: WarpPlan, boxes: readonly Box[]): Record<string, Landmark[]> {
  const out: Record<string, Landmark[]> = {}
  for (const name of cfg.recipes) out[name] = []
  for (const room of plan.rooms) {
    const list = out[cfg.recipes[room.recipe]!]!
    for (const p of platesIn(room, boxes[room.index]!)) list.push({ x: p.x * UNIT, y: p.y * UNIT, r: cfg.emitters.markU * UNIT, nx: 0, ny: 0 })
  }
  out.core = [{ x: plan.core.x * UNIT, y: plan.core.y * UNIT, r: cfg.core.radiusU * UNIT, nx: 0, ny: 0 }]
  return out
}

export function warpOf(sim: Sim): WarpState {
  let s = sim.worldState.warp
  if (!s) {
    const cfg = cfgOf(sim)
    const plan = warpPlanFor(cfg, sim.run.decorSeed)
    const b = plan.basin
    const boxes = plan.rooms.map((r) => pressBox(r, 0, cfg.press.minU))
    const grids = plan.basins.map((basin, i) => navGrid(basin, boxes[i]!))
    const never = (): Float32Array => new Float32Array(FRAME_U * FRAME_U).fill(-1e9)
    s = {
      plan,
      solids: makeSolids((x, y) => (plan.rooms.some((r) => inBox(r.floor, x / UNIT, y / UNIT)) ? null : FIELD), b.x0, b.y0, b.cols, b.rows, b.cell),
      marks: marksOf(cfg, plan, boxes),
      teamRoom: roomIndexAt(plan, plan.start.x, plan.start.y),
      pads: plan.rooms.map((_, i) => ({
        charge: 0,
        coolUntil: 0,
        shuttleAt: cfg.pad.shuttleMs * (0.7 + i * 0.25),
        jumpedAt: -1e9,
        shuttledAt: -1e9,
        shuttled: 0,
      })),
      press: new Float32Array(plan.rooms.length),
      boxes,
      navKeys: boxes.map(navKey),
      grids,
      toPad: plan.rooms.map((r, i) => flowTo(grids[i]!, r.pad.x * UNIT, r.pad.y * UNIT)),
      toLeader: null,
      navAt: -1e9,
      navCell: -1,
      navRoom: -1,
      crossing: false,
      tiles: { team: never(), foe: never(), teamFrom: never(), foeFrom: never() },
      hops: [],
      impacts: [],
      arrivals: [],
      jumps: 0,
    }
    sim.worldState.warp = s
  }
  return s
}

/** 墙的位置按半格取整：变了才重铺这间的寻路 */
function navKey(b: Box): number {
  return Math.round(b.x0 * 2) * 1e6 + Math.round(b.x1 * 2) * 1e4 + Math.round(b.y0 * 2) * 100 + Math.round(b.y1 * 2)
}

/** 半径 r 像素的身体收进 box（格）里；box 比身体还窄就站在正中 */
function inside(b: Box, x: number, y: number, r: number): Point {
  const rx = Math.min(r, ((b.x1 - b.x0) / 2) * UNIT)
  const ry = Math.min(r, ((b.y1 - b.y0) / 2) * UNIT)
  return { x: Math.min(b.x1 * UNIT - rx, Math.max(b.x0 * UNIT + rx, x)), y: Math.min(b.y1 * UNIT - ry, Math.max(b.y0 * UNIT + ry, y)) }
}

/** (x, y) 像素落在哪间房 */
function roomOf(s: WarpState, x: number, y: number): number {
  return roomIndexAt(s.plan, x / UNIT, y / UNIT)
}

/** 半径 r 的身体站在第 i 座传送台上：身体中心落在台面里 */
function onPad(s: WarpState, cfg: WarpConfig, i: number, x: number, y: number): boolean {
  const p = s.plan.rooms[i]!.pad
  return Math.hypot(x / UNIT - p.x, y / UNIT - p.y) <= cfg.pad.radiusU
}

/** 第 k 个送到的身体落在台上哪（相对台心，格）：先排满台心与两圈，再往外随手撒 */
function slot(sim: Sim, cfg: WarpConfig, k: number): Point {
  let i = k
  for (const [r, n] of RINGS) {
    if (i < n) {
      const a = (i / n) * Math.PI * 2 + r
      return { x: Math.cos(a) * r, y: Math.sin(a) * r }
    }
    i -= n
  }
  const a = sim.rng.next() * Math.PI * 2
  const r = cfg.pad.radiusU * (0.4 + 0.5 * Math.sqrt(sim.rng.next()))
  return { x: Math.cos(a) * r, y: Math.sin(a) * r }
}

/** 队伍一方要一起走的：队员（倒着的也带上），召唤出的身体、装置与绕着宿主的物件；子弹、掉落物不算 */
function teamCargo(sim: Sim): { bodies: number[]; things: number[] } {
  const bodies: number[] = [...sim.characters]
  const seen = new Set(bodies)
  for (const e of query(sim.world, [Phys, Transform, Radius])) {
    if (seen.has(e) || Faction.v[e] !== FACTION.team || hasComponent(sim.world, e, Pickup) || !Alive.v[e]) continue
    seen.add(e)
    bodies.push(e)
  }
  const things: number[] = []
  for (const e of query(sim.world, [Minion, Transform])) {
    if (seen.has(e) || Faction.v[e] !== FACTION.team) continue
    seen.add(e)
    things.push(e)
  }
  for (const e of query(sim.world, [Pet, Transform])) {
    if (seen.has(e) || !seen.has(Mounted.host[e]!)) continue
    seen.add(e)
    things.push(e)
  }
  return { bodies, things }
}

/** 记一个被送走的身体给画面 */
function logHop(s: WarpState, h: Hop): void {
  s.hops.push(h)
  if (s.hops.length > HOP_CAP) s.hops.splice(0, s.hops.length - HOP_CAP)
}

/**
 * 第 i 座传送台发车：台上的敌人都送到下一间的传送台上；team 为真时是队长充满了能，整支队伍连同召唤物不论在房间哪里一起走。
 * 身体没有实体地穿过虚空，落地时散在对面的台上；敌人落地后往台外涌
 */
function depart(sim: Sim, s: WarpState, cfg: WarpConfig, i: number, team: boolean): number {
  const from = s.plan.rooms[i]!
  const to = nextRoom(s.plan, i)
  const now = sim.elapsedMs
  const ms = cfg.pad.transitMs
  let k = 0
  s.crossing = true
  const send = (eid: number, foe: boolean): void => {
    const o = slot(sim, cfg, k++)
    const tx = (to.pad.x + o.x) * UNIT
    const ty = (to.pad.y + o.y) * UNIT
    const fx = Transform.x[eid]!
    const fy = Transform.y[eid]!
    const r = Radius.v[eid]!
    if (Alive.v[eid] && hasComponent(sim.world, eid, Phys) && displace(sim, eid, { kind: 'transit', x: tx, y: ty, ms, look: 'hidden', color: foe ? 0xff4058 : 0x4c8dff }, SHIPPED)) {
      logHop(s, { fx, fy, tx, ty, at: now, r, foe })
      if (foe) s.arrivals.push({ eid, uid: Uid.v[eid]!, at: now + ms, pad: to.index })
      return
    }
    Transform.x[eid] = tx
    Transform.y[eid] = ty
  }
  if (team) {
    const cargo = teamCargo(sim)
    const lead = sim.leader
    send(lead, false)
    for (const e of cargo.bodies) if (e !== lead) send(e, false)
    const dx = (to.pad.x - from.pad.x) * UNIT
    const dy = (to.pad.y - from.pad.y) * UNIT
    for (const e of cargo.things) {
      Transform.x[e] = Transform.x[e]! + dx
      Transform.y[e] = Transform.y[e]! + dy
    }
    s.teamRoom = to.index
    s.pads[to.index]!.coolUntil = now + ms + cfg.pad.cooldownMs
    s.pads[i]!.jumpedAt = now
    s.jumps++
  }
  let foes = 0
  for (const e of query(sim.world, ENEMY_SET)) {
    if (!Alive.v[e] || inTransit(e) || !onPad(s, cfg, i, Transform.x[e]!, Transform.y[e]!)) continue
    send(e, true)
    foes++
  }
  s.crossing = false
  return foes
}

/** 送到的敌人到点往台外涌：从台心往外推，锚定的不推 */
function spill(sim: Sim, s: WarpState, cfg: WarpConfig): void {
  const now = sim.elapsedMs
  for (let k = s.arrivals.length - 1; k >= 0; k--) {
    const a = s.arrivals[k]!
    if (now < a.at) continue
    s.arrivals.splice(k, 1)
    if (Uid.v[a.eid] !== a.uid || !Alive.v[a.eid] || inTransit(a.eid)) continue
    const p = s.plan.rooms[a.pad]!.pad
    let dx = Transform.x[a.eid]! - p.x * UNIT
    let dy = Transform.y[a.eid]! - p.y * UNIT
    if (Math.hypot(dx, dy) < 0.1 * UNIT) {
      const ang = sim.rng.next() * Math.PI * 2
      dx = Math.cos(ang)
      dy = Math.sin(ang)
    }
    const d = norm(dx, dy)
    displace(sim, a.eid, { kind: 'push', x: d.x * cfg.pad.spillU * UNIT * Phys.mass[a.eid]!, y: d.y * cfg.pad.spillU * UNIT * Phys.mass[a.eid]! }, SHIPPED)
  }
}

/** 四座传送台：队长站在队伍所在那间的台上攒能、走开就漏，满了整队出发；那间压到底时台子不管队长在哪自己充能；每座台到点发一趟车 */
function stepPads(sim: Sim, s: WarpState, cfg: WarpConfig, delta: number): void {
  const now = sim.elapsedMs
  const lead = sim.leader
  const lx = Transform.x[lead]!
  const ly = Transform.y[lead]!
  const ready = Alive.v[lead] === 1 && !inTransit(lead)
  if (ready) s.teamRoom = roomOf(s, lx, ly)
  s.pads.forEach((p, i) => {
    const standing = ready && i === s.teamRoom && now >= p.coolUntil && onPad(s, cfg, i, lx, ly)
    const forced = ready && i === s.teamRoom && s.press[i]! >= 1
    const gain = Math.max(standing ? delta : 0, forced ? (delta * cfg.pad.chargeMs) / cfg.press.ejectMs : 0)
    p.charge = gain > 0 ? p.charge + gain : Math.max(0, p.charge - (delta * cfg.pad.chargeMs) / cfg.pad.drainMs)
    if (p.charge >= cfg.pad.chargeMs) {
      p.charge = 0
      depart(sim, s, cfg, i, true)
    }
    if (now >= p.shuttleAt) {
      p.shuttleAt += cfg.pad.shuttleMs
      p.shuttled = depart(sim, s, cfg, i, false)
      p.shuttledAt = now
    }
  })
}

/**
 * 墙：队伍所在那间往里推、别的几间往外退；墙每推进半格，那间的寻路重铺一遍；出怪板跟着墙走
 */
function stepPress(s: WarpState, cfg: WarpConfig, delta: number): void {
  const pc = cfg.press
  s.plan.rooms.forEach((room, i) => {
    const c = s.press[i]! + (i === s.teamRoom ? delta / pc.closeMs : -delta / pc.openMs)
    s.press[i] = Math.min(1, Math.max(0, c))
    const box = pressBox(room, s.press[i]!, pc.minU)
    s.boxes[i] = box
    const key = navKey(box)
    if (key === s.navKeys[i]) return
    s.navKeys[i] = key
    s.grids[i] = navGrid(s.plan.basins[i]!, box)
    s.toPad[i] = flowTo(s.grids[i]!, room.pad.x * UNIT, room.pad.y * UNIT, s.toPad[i])
    if (i === s.navRoom) s.navRoom = -1
  })
  s.marks = marksOf(cfg, s.plan, s.boxes)
}

/** 墙推着身体、掉落物与召唤出的装置往里挤：在墙里的都推回墙面上；正被送过虚空的不管 */
function squeeze(sim: Sim, s: WarpState): void {
  for (const e of query(sim.world, [Phys, Transform, Radius])) {
    if (!Alive.v[e] || inTransit(e)) continue
    const x = Transform.x[e]!
    const y = Transform.y[e]!
    const p = inside(s.boxes[roomOf(s, x, y)]!, x, y, Radius.v[e]!)
    if (p.x === x && p.y === y) continue
    Transform.x[e] = p.x
    Transform.y[e] = p.y
  }
  for (const e of query(sim.world, [Pickup, Transform])) {
    const x = Transform.x[e]!
    const y = Transform.y[e]!
    const p = inside(s.boxes[roomOf(s, x, y)]!, x, y, 0.3 * UNIT)
    Transform.x[e] = p.x
    Transform.y[e] = p.y
  }
  for (const e of query(sim.world, [Minion, Transform])) {
    if (hasComponent(sim.world, e, Phys)) continue
    const x = Transform.x[e]!
    const y = Transform.y[e]!
    const p = inside(s.boxes[roomOf(s, x, y)]!, x, y, 0.3 * UNIT)
    Transform.x[e] = p.x
    Transform.y[e] = p.y
  }
}

/** 线段 a→b（像素）先撞上哪一间推进来的墙：墙是力场，进了就挡 */
function pressTrace(s: WarpState, ax: number, ay: number, bx: number, by: number): Crossing | null {
  let best: Crossing | null = null
  const dx = bx - ax
  const dy = by - ay
  const hit = (b: Box): void => {
    let t0 = 0
    let t1 = 1
    for (const [a, d, lo, hi] of [
      [ax, dx, b.x0 * UNIT, b.x1 * UNIT],
      [ay, dy, b.y0 * UNIT, b.y1 * UNIT],
    ] as const) {
      if (Math.abs(d) < 1e-9) {
        if (a < lo || a >= hi) return
        continue
      }
      const u = (lo - a) / d
      const v = (hi - a) / d
      t0 = Math.max(t0, Math.min(u, v))
      t1 = Math.min(t1, Math.max(u, v))
    }
    if (t0 < t1 && (!best || t0 < best.t0)) best = { t0, t1, material: 'field' }
  }
  s.plan.rooms.forEach((room, i) => {
    if (s.press[i]! <= 0) return
    const st = pressedStrips(room, s.boxes[i]!)
    if (st.x) hit(st.x)
    if (st.y) hit(st.y)
  })
  return best
}

/** (x, y) 像素在不在哪一间推进来的墙里 */
function inPress(s: WarpState, x: number, y: number): boolean {
  const i = roomOf(s, x, y)
  const f = s.plan.rooms[i]!.floor
  const u = x / UNIT
  const v = y / UNIT
  return inBox(f, u, v) && !inBox(s.boxes[i]!, u, v)
}

/** 活着、脚沾地的身体踩亮脚下的瓷砖 */
function stepTiles(sim: Sim, s: WarpState): void {
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
  for (const e of query(sim.world, ENEMY_SET)) if (Alive.v[e] === 1 && grounded(sim.world, e) && Faction.v[e] === FACTION.enemy) mark(e, t.foe, t.foeFrom)
}

/** 到队长的步数场：队长换了一格或换了一间就重铺，最多隔 NAV_MS 铺一次 */
function stepNav(sim: Sim, s: WarpState): void {
  const lead = leaderPoint(sim)
  const room = s.teamRoom
  const cell = Math.floor(lead.y / UNIT / 0.5) * 1000 + Math.floor(lead.x / UNIT / 0.5)
  if (room === s.navRoom && (cell === s.navCell || sim.elapsedMs - s.navAt < NAV_MS)) return
  s.toLeader = flowTo(s.grids[room]!, lead.x, lead.y, s.toLeader ?? undefined)
  s.navRoom = room
  s.navCell = cell
  s.navAt = sim.elapsedMs
}

/** 第 room 间里朝 (tx, ty) 走：近了、中间没挡着就直奔，否则顺着步数场 */
function steer(s: WarpState, room: number, field: NavField | null, x: number, y: number, tx: number, ty: number, r: number): Point {
  const b = s.plan.basins[room]!
  const d = norm(tx - x, ty - y)
  if (Math.hypot(tx - x, ty - y) < DIRECT_U * UNIT && clearWalk(b, x, y, tx, ty, r)) return alongWall(b, x, y, d.x, d.y, r + 0.3 * UNIT)
  const f = field ? flowDir(s.grids[room]!, field, x, y) : null
  const w = f ?? d
  return alongWall(b, x, y, w.x, w.y, r + 0.3 * UNIT)
}

/** 第 room 间的身体往那间的传送台去：到了台上就在台面里打转 */
function towardPad(s: WarpState, cfg: WarpConfig, room: number, eid: number, dx: number, dy: number): Point {
  const x = Transform.x[eid]!
  const y = Transform.y[eid]!
  const p = s.plan.rooms[room]!.pad
  const px = p.x * UNIT
  const py = p.y * UNIT
  if (Math.hypot(px - x, py - y) < cfg.pad.radiusU * 0.75 * UNIT) return { x: dx, y: dy }
  return steer(s, room, s.toPad[room]!, x, y, px, py, Radius.v[eid]!)
}

/** 第 i 间此刻墙里面随手挑一处离壁至少 clear 像素的地方 */
function randomIn(sim: Sim, s: WarpState, i: number, clear: number): Point {
  const r = s.plan.rooms[i]!
  const b = s.plan.basins[i]!
  const f = s.boxes[i]!
  let p: Point = { x: r.pad.x * UNIT, y: r.pad.y * UNIT }
  for (let k = 0; k < 32; k++) {
    p = { x: (f.x0 + sim.rng.next() * (f.x1 - f.x0)) * UNIT, y: (f.y0 + sim.rng.next() * (f.y1 - f.y0)) * UNIT }
    const q = inside(f, p.x, p.y, clear)
    if (roomAt(b, p.x, p.y) >= clear && q.x === p.x && q.y === p.y) return p
  }
  return p
}

/**
 * 跃迁站：四块悬空的平台，平台之间是虚空，身体只能在自己那块上走；平台四周的力场挡弹体也挡视线。
 * 每块一座传送台：队长站上去充满能，整支队伍连同召唤物穿过虚空到下一块的传送台；每座台定期发车，台上的敌人一起送走。
 * 队伍在哪间，那间背对核心柱的两面墙就往传送台推，把里面的身体、掉落物和出怪板都挤过去，推到底就把队伍送走；队伍走了墙再退回去。
 * 队伍不在的那几间，敌人一边刷一边往传送台聚
 */
export const warp: WorldHooks = {
  ...bounded,
  /** 挡在自己那间的地面里，也挡在此刻推进来的墙里面 */
  constrainBody(sim, eid, from, next) {
    const s = warpOf(sim)
    const room = s.crossing ? roomOf(s, next.x, next.y) : roomOf(s, from.x, from.y)
    const r = Radius.v[eid]!
    const box = s.boxes[room]!
    const a = inside(box, next.x, next.y, r)
    const b = keepOut(s.plan.basins[room]!, a.x, a.y, r)
    return inside(box, b.x, b.y, r)
  },
  basin(sim) {
    return warpOf(sim).plan.basin
  },
  ground(sim) {
    return warpOf(sim).plan.basin
  },
  /** 目标在别的房间就先去这间的传送台；同一间里追向队伍按到队长的步数场绕开立柱与凹槽 */
  chaseDir(sim, eid, tx, ty) {
    const s = warpOf(sim)
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const room = roomOf(s, x, y)
    if (room !== roomOf(s, tx, ty)) return towardPad(s, cfgOf(sim), room, eid, 0, 0)
    return steer(s, room, room === s.navRoom ? s.toLeader : null, x, y, tx, ty, Radius.v[eid]!)
  },
  trace(sim, probe, ax, ay, bx, by) {
    const s = warpOf(sim)
    const fixed = solidsTrace(s.solids, probe, ax, ay, bx, by)
    const wall = pressTrace(s, ax, ay, bx, by)
    return !wall || (fixed && fixed.t0 <= wall.t0) ? fixed : wall
  },
  solidAt(sim, x, y) {
    const s = warpOf(sim)
    return solidOf(s.solids, x, y) ?? (inPress(s, x, y) ? FIELD : null)
  },
  /** 队伍不在的房间里，没事做的敌人往传送台聚 */
  wanderDir(sim, eid, dx, dy) {
    const s = warpOf(sim)
    const room = roomOf(s, Transform.x[eid]!, Transform.y[eid]!)
    if (Faction.v[eid] === FACTION.enemy && room !== s.teamRoom) return towardPad(s, cfgOf(sim), room, eid, dx, dy)
    return wanderIn(s.plan.basins[room]!, eid, dx, dy)
  },
  fleeDir(sim, eid, awayX, awayY) {
    const s = warpOf(sim)
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const d = fleeSteer(x, y, awayX, awayY, sim.mapW, sim.mapH, 1.5 * UNIT)
    return alongWall(s.plan.basins[roomOf(s, x, y)]!, x, y, d.x, d.y, Radius.v[eid]! + 1.5 * UNIT)
  },
  outside(_sim, x, y) {
    const m = 2 * UNIT
    const w = FRAME_U * UNIT
    return x < -m || x > w + m || y < -m || y > w + m
  },
  /** 平常的敌人随手落在四间房里，出怪口再按种类把它送到配方接它的那间；头目落在队伍所在那间、离队长远、也不落在传送台上的地方 */
  spawnPoint(sim, boss) {
    const s = warpOf(sim)
    if (!boss) return randomIn(sim, s, Math.floor(sim.rng.next() * s.plan.rooms.length), UNIT)
    const lead = leaderPoint(sim)
    const far = SPAWN.minPlayerDist * UNIT * 1.6
    const pad = s.plan.rooms[s.teamRoom]!.pad
    const clear = (cfgOf(sim).pad.radiusU + 2.5) * UNIT
    let p = randomIn(sim, s, s.teamRoom, 1.5 * UNIT)
    for (let k = 0; k < 32 && (Math.hypot(p.x - lead.x, p.y - lead.y) < far || Math.hypot(p.x - pad.x * UNIT, p.y - pad.y * UNIT) < clear); k++) p = randomIn(sim, s, s.teamRoom, 1.5 * UNIT)
    return p
  },
  center(sim) {
    const s = warpOf(sim)
    const c = s.plan.rooms[s.teamRoom]!.center
    return { x: c.x * UNIT, y: c.y * UNIT }
  },
  settle(sim, p) {
    const s = warpOf(sim)
    const i = roomOf(s, p.x, p.y)
    const q = keepOut(s.plan.basins[i]!, p.x, p.y, SPAWN.edgeInset * UNIT)
    return inside(s.boxes[i]!, q.x, q.y, SPAWN.edgeInset * UNIT)
  },
  /** 站得下、不在推进来的墙里，也不贴着队长冒出来：出怪板离队长太近的这一回不出 */
  canSpawn(sim, x, y, radius) {
    const s = warpOf(sim)
    const lead = leaderPoint(sim)
    const box = s.boxes[roomOf(s, x, y)]!
    const fits = x - radius >= box.x0 * UNIT && x + radius <= box.x1 * UNIT && y - radius >= box.y0 * UNIT && y + radius <= box.y1 * UNIT
    return fits && roomFor(s.plan.basin, x, y, radius) && Math.hypot(x - lead.x, y - lead.y) >= cfgOf(sim).emitters.clearU * UNIT
  },
  landmarks(sim) {
    return warpOf(sim).marks
  },
  lean() {
    return ZERO
  },
  /**
   * 走到队长的路：传送台一下就到，下一间的台子又正是那一间的出口，所以别的房间里只算走到自己那间传送台的路，再加上队伍那间从传送台走到队长的路
   */
  toLeader(sim, x, y) {
    const s = warpOf(sim)
    const lead = leaderPoint(sim)
    const room = roomOf(s, x, y)
    if (room === s.teamRoom) return Math.hypot(lead.x - x, lead.y - y)
    const pad = s.plan.rooms[s.teamRoom]!.pad
    const there = s.toLeader && s.navRoom === s.teamRoom ? navDist(s.grids[s.teamRoom]!, s.toLeader, pad.x * UNIT, pad.y * UNIT) : Infinity
    return (navDist(s.grids[room]!, s.toPad[room]!, x, y) + there) * UNIT
  },
  /** 打在力场上的弹体：力场在那里泛一圈涟漪 */
  impact(sim, x, y, material) {
    if (material !== 'field') return
    const s = warpOf(sim)
    s.impacts.push({ x, y, at: sim.elapsedMs })
    if (s.impacts.length > IMPACT_CAP) s.impacts.shift()
  },
  onStart(sim) {
    warpOf(sim)
  },
  tick(sim, delta) {
    const cfg = cfgOf(sim)
    const s = warpOf(sim)
    stepPress(s, cfg, delta)
    stepPads(sim, s, cfg, delta)
    squeeze(sim, s)
    spill(sim, s, cfg)
    stepTiles(sim, s)
    stepNav(sim, s)
    const old = sim.elapsedMs - 2000
    while (s.hops.length > 0 && s.hops[0]!.at < old) s.hops.shift()
  },
}
