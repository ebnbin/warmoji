import { hasComponent, query } from 'bitecs'
import { FRAME_U, UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { MAPS } from '../../data/maps'
import { SPAWN } from '../../data/enemies'
import { Alive, ENEMY_SET, FACTION, Faction, MARK, Minion, Mounted, Pet, Phys, Pickup, Radius, TAG, Transform, Uid } from '../../ecs/components'
import { displace } from '../../ecs/systems/shared/displace'
import type { Mover } from '../../ecs/systems/shared/displace'
import { fleeSteer } from '../../ecs/systems/shared/steer'
import { addMark, inTransit } from '../../ecs/utils/marks'
import { grounded } from '../../ecs/utils/pass'
import { leaderPoint } from '../../ecs/utils/team'
import { makeSolids, solidOf, solidsTrace } from '../../ecs/worlds/solids'
import { bounded, wanderIn, ZERO } from '../../ecs/worlds/hooks'
import { mapEvent } from '../../ecs/fight/events'
import { torusDelta, wrapPoint } from '../../ecs/worlds/torus'
import { alongWall, keepOut, roomAt } from '../basin'
import { roomFor } from '../landmark'
import { inBox, roomIndexAt, warpPlan } from './layout'
import { clearWalk, flowDir, flowTo, navDist, navGrid } from './nav'
import type { NavField, NavGrid } from './nav'
import type { Door, WarpPlan } from './layout'
import type { Solid, Solids } from '../../ecs/worlds/solids'
import type { Landmark } from '../landmark'
import type { WarpConfig } from '../../types/maps'
import type { Point } from '../../util/vec'
import type { Sim } from '../../ecs/sim'
import type { WorldHooks } from '../../ecs/worlds/hooks'

/** 迷宫按布景种子打散出自己的种子 */
const PLAN_SEED = 0x7a3e51
/** 身体半径的这么多倍以内的瓷砖算踩着；离开过这么久再踩上来记为新的一脚，毫秒 */
const FOOT = 0.7
const STEP_GAP_MS = 140
/** 到队长的步数场最多隔多久重铺一次，毫秒 */
const NAV_MS = 250
/** 离目标这么近（格）、中间又没挡着就直奔 */
const DIRECT_U = 6
/** 画面要的记录各留多少条 */
const FLIGHT_CAP = 256
const IMPACT_CAP = 48
/** 送到的身体在入口上排成几圈：每圈离台心多远（格）、排几个 */
const RINGS = [
  [0, 1],
  [0.75, 6],
  [1.3, 10],
] as const
/** 暗着的舱室里敌人身上的静止每一拍续多久，毫秒：那间亮回来以后最多晚这么久才松开 */
const HOLD_MARK_MS = 120
/** 看守落在队伍那间的中心这么远（格）以内 */
const WARDEN_U = 3

/** 传送是被摆布：锚定的、霸体的、头目也照送 */
const SHIPPED: Mover = { self: false, free: true }

const FIELD: Solid = { topM: Infinity, material: 'field' }

/** 一扇门此刻：队长站在上面攒下的充能（毫秒），下一趟发车的时刻；上一次队伍从这里出发、上一趟发车的时刻与那一趟送走了几只（画面用） */
export interface DoorState {
  charge: number
  shuttleAt: number
  jumpedAt: number
  shuttledAt: number
  shuttled: number
}

/** 一个身体被送走：从哪到哪（像素）、哪一刻出发（对局时钟）、多大、是不是敌人 */
export interface Flight {
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
  readonly room: number
}

/** 每块瓷砖最近一次被队伍、敌人踩着的时刻，与这一脚踩上来的时刻 */
export interface Tiles {
  readonly team: Float32Array
  readonly foe: Float32Array
  readonly teamFrom: Float32Array
  readonly foeFrom: Float32Array
}

/**
 * 迷宫此刻：按种子定下的迷宫，挡弹体与视线的力场，出怪的地标；队伍此刻在哪间、上一次到的那一刻；
 * 亮着的舱室：队伍那间在前，接着是刚走过的几间，最多 cfg.light.levels 那么多间；
 * 每间舱室离队伍要过几道门（走不到为 −1）与该走哪扇门（steps 为 0 或走不到为 −1），按 routeRoom 那间算的；
 * 每扇门；寻路的底子、各扇门所在那间到门的步数场与到队长的步数场；地砖；画面要的送人与力场受击的记录
 */
export interface WarpState {
  readonly plan: WarpPlan
  readonly solids: Solids
  readonly marks: Record<string, Landmark[]>
  teamRoom: number
  arrivedAt: number
  trail: number[]
  readonly steps: Int16Array
  readonly via: Int16Array
  routeRoom: number
  readonly doors: DoorState[]
  readonly grids: readonly NavGrid[]
  readonly toDoor: readonly NavField[]
  toLeader: NavField | null
  navAt: number
  navCell: number
  navRoom: number
  /** 正在把身体送过虚空：这时的落点不按出发的那间约束 */
  crossing: boolean
  readonly tiles: Tiles
  readonly flights: Flight[]
  readonly impacts: Impact[]
  readonly arrivals: Arrival[]
  /** 队伍一共穿过几道门：画面按它认出新的一次 */
  jumps: number
  /** 关卡锁住了所有门：队长站上去也不攒能 */
  locked: boolean
}

function cfgOf(sim: Sim): WarpConfig {
  return MAPS[sim.mapId].warp!
}

/** 这一局的迷宫：视图要它画，规则要它定边界与门，两边按同一个种子各要一次 */
export function warpPlanFor(cfg: WarpConfig, decorSeed: number): WarpPlan {
  return warpPlan(cfg, (decorSeed ^ PLAN_SEED) >>> 0)
}

/** 地标：每间舱室的出怪板归到那间配方的名下；看守单独一组，跟着队伍换舱室；cabin 是每间舱室的入口，关卡拿它当到访的去处 */
function marksOf(cfg: WarpConfig, plan: WarpPlan): Record<string, Landmark[]> {
  const out: Record<string, Landmark[]> = {}
  for (const name of cfg.recipes) out[name] = []
  for (const room of plan.rooms) {
    const list = out[cfg.recipes[room.recipe]!]!
    for (const p of room.plates) list.push({ x: p.x * UNIT, y: p.y * UNIT, r: cfg.emitters.markU * UNIT, nx: 0, ny: 0 })
  }
  const c = plan.rooms[plan.start]!.center
  out.warden = [{ x: c.x * UNIT, y: c.y * UNIT, r: WARDEN_U * UNIT, nx: 0, ny: 0 }]
  out.cabin = plan.rooms.map((room) => ({ x: room.entry.x * UNIT, y: room.entry.y * UNIT, r: 0, nx: 0, ny: 0 }))
  return out
}

export function warpOf(sim: Sim): WarpState {
  let s = sim.worldState.warp
  if (!s) {
    const cfg = cfgOf(sim)
    const plan = warpPlanFor(cfg, sim.run.decorSeed)
    const b = plan.basin
    const grids = plan.basins.map(navGrid)
    const never = (): Float32Array => new Float32Array(FRAME_U * FRAME_U).fill(-1e9)
    const n = plan.rooms.length
    s = {
      plan,
      solids: makeSolids((x, y) => (plan.rooms.some((r) => inBox(r.floor, x / UNIT, y / UNIT)) ? null : FIELD), b.x0, b.y0, b.cols, b.rows, b.cell),
      marks: marksOf(cfg, plan),
      teamRoom: plan.start,
      arrivedAt: 0,
      trail: [plan.start],
      steps: new Int16Array(n),
      via: new Int16Array(n),
      routeRoom: -1,
      doors: plan.doors.map((_, i) => ({
        charge: 0,
        shuttleAt: cfg.pad.shuttleMs * (0.6 + ((i * 0.618) % 1)),
        jumpedAt: -1e9,
        shuttledAt: -1e9,
        shuttled: 0,
      })),
      grids,
      toDoor: plan.doors.map((d) => flowTo(grids[d.room]!, d.x * UNIT, d.y * UNIT)),
      toLeader: null,
      navAt: -1e9,
      navCell: -1,
      navRoom: -1,
      crossing: false,
      tiles: { team: never(), foe: never(), teamFrom: never(), foeFrom: never() },
      flights: [],
      impacts: [],
      arrivals: [],
      jumps: 0,
      locked: false,
    }
    route(s)
    sim.worldState.warp = s
  }
  return s
}

/** 倒着从队伍那间往外数：每间舱室要过几道门才到队伍那里，第一道该走哪扇 */
function route(s: WarpState): void {
  const { steps, via, plan } = s
  steps.fill(-1)
  via.fill(-1)
  const home = s.teamRoom
  steps[home] = 0
  const queue = [home]
  for (let k = 0; k < queue.length; k++) {
    const u = queue[k]!
    for (const d of plan.doors) {
      if (d.to !== u || steps[d.room] !== -1) continue
      steps[d.room] = steps[u]! + 1
      via[d.room] = d.index
      queue.push(d.room)
    }
  }
  s.routeRoom = home
  const c = plan.rooms[home]!.center
  const w = s.marks.warden![0]!
  s.marks.warden![0] = { ...w, x: c.x * UNIT, y: c.y * UNIT }
}

/** (x, y) 像素落在哪间舱室 */
function roomOf(s: WarpState, x: number, y: number): number {
  return roomIndexAt(s.plan, x / UNIT, y / UNIT)
}

/** 身体中心落在这扇门的台面里 */
function onDoor(cfg: WarpConfig, d: Door, x: number, y: number): boolean {
  return Math.hypot(x / UNIT - d.x, y / UNIT - d.y) <= cfg.pad.radiusU
}

/** 第 k 个送到的身体落在入口上哪（相对台心，格）：先排满台心与两圈，再往外随手撒 */
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

function logFlight(s: WarpState, f: Flight): void {
  s.flights.push(f)
  if (s.flights.length > FLIGHT_CAP) s.flights.splice(0, s.flights.length - FLIGHT_CAP)
}

/**
 * 这扇门发车：台上的敌人都送到它通往的那间的入口上；team 为真时是队长充满了能，整支队伍连同召唤物不论在舱室哪里一起走。
 * 身体没有实体地穿过虚空，落地时散在入口上；敌人落地后往台外涌
 */
function depart(sim: Sim, s: WarpState, cfg: WarpConfig, door: Door, team: boolean): number {
  const to = s.plan.rooms[door.to]!
  const now = sim.elapsedMs
  const ms = cfg.pad.transitMs
  let k = 0
  s.crossing = true
  const send = (eid: number, foe: boolean): void => {
    const o = slot(sim, cfg, k++)
    const tx = (to.entry.x + o.x) * UNIT
    const ty = (to.entry.y + o.y) * UNIT
    const fx = Transform.x[eid]!
    const fy = Transform.y[eid]!
    const r = Radius.v[eid]!
    if (Alive.v[eid] && hasComponent(sim.world, eid, Phys) && displace(sim, eid, { kind: 'transit', x: tx, y: ty, ms, look: 'hidden', color: foe ? 0xff4058 : 0x4c8dff }, SHIPPED)) {
      logFlight(s, { fx, fy, tx, ty, at: now, r, foe })
      if (foe) s.arrivals.push({ eid, uid: Uid.v[eid]!, at: now + ms, room: to.index })
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
    const dx = (to.entry.x - door.x) * UNIT
    const dy = (to.entry.y - door.y) * UNIT
    for (const e of cargo.things) {
      Transform.x[e] = Transform.x[e]! + dx
      Transform.y[e] = Transform.y[e]! + dy
    }
    s.teamRoom = to.index
    enter(s, cfg, to.index)
    s.arrivedAt = now + ms
    s.doors[door.index]!.jumpedAt = now
    s.jumps++
    mapEvent(sim, 'jump')
  }
  let foes = 0
  for (const e of query(sim.world, ENEMY_SET)) {
    if (!Alive.v[e] || inTransit(e) || !onDoor(cfg, door, Transform.x[e]!, Transform.y[e]!)) continue
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
    const p = s.plan.rooms[a.room]!.entry
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

/** 队伍进了第 room 间：它排到亮着的舱室最前面，亮着的多出来的那间（最早走过的）熄掉 */
function enter(s: WarpState, cfg: WarpConfig, room: number): void {
  if (s.trail[0] === room) return
  s.trail = [room, ...s.trail.filter((r) => r !== room)].slice(0, cfg.light.levels.length)
}

/** 门：队长站在队伍那间的一扇门上攒能、走开就漏，满了整队出发，门被锁住时不攒；每扇门到点发一趟车，暗着的舱室里的门不发 */
function stepDoors(sim: Sim, s: WarpState, cfg: WarpConfig, delta: number): void {
  const now = sim.elapsedMs
  const lead = sim.leader
  const lx = Transform.x[lead]!
  const ly = Transform.y[lead]!
  const ready = Alive.v[lead] === 1 && !inTransit(lead)
  if (ready) {
    s.teamRoom = roomOf(s, lx, ly)
    enter(s, cfg, s.teamRoom)
  }
  if (s.teamRoom !== s.routeRoom) route(s)
  for (const d of s.plan.doors) {
    const p = s.doors[d.index]!
    const standing = ready && !s.locked && d.room === s.teamRoom && onDoor(cfg, d, lx, ly)
    p.charge = standing ? p.charge + delta : Math.max(0, p.charge - (delta * cfg.pad.chargeMs) / cfg.pad.drainMs)
    if (p.charge >= cfg.pad.chargeMs) {
      p.charge = 0
      depart(sim, s, cfg, d, true)
      route(s)
    }
    if (now >= p.shuttleAt) {
      p.shuttleAt += cfg.pad.shuttleMs
      if (!live(s, d.room)) continue
      p.shuttled = depart(sim, s, cfg, d, false)
      p.shuttledAt = now
    }
  }
}

/** 暗着的舱室里的敌人定在原地：静止一拍一拍地续着，那间亮回来就松开 */
function stepDark(sim: Sim, s: WarpState): void {
  const until = sim.elapsedMs + HOLD_MARK_MS
  for (const e of query(sim.world, ENEMY_SET)) {
    if (!Alive.v[e] || inTransit(e) || live(s, roomOf(s, Transform.x[e]!, Transform.y[e]!))) continue
    addMark(e, MARK.stasis, TAG.world, until)
    Phys.vx[e] = 0
    Phys.vy[e] = 0
  }
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

/** 第 room 间的身体往通向队伍的那扇门去：到了台上就在台面里打转；没有门可走为 null */
function towardDoor(s: WarpState, cfg: WarpConfig, room: number, eid: number, dx: number, dy: number): Point | null {
  const k = s.via[room]!
  if (k < 0) return null
  const d = s.plan.doors[k]!
  const x = Transform.x[eid]!
  const y = Transform.y[eid]!
  const px = d.x * UNIT
  const py = d.y * UNIT
  if (Math.hypot(px - x, py - y) < cfg.pad.radiusU * 0.75 * UNIT) return { x: dx, y: dy }
  return steer(s, room, s.toDoor[k]!, x, y, px, py, Radius.v[eid]!)
}

/** 第 i 间里随手挑一处离壁至少 clear 像素的地方 */
function randomIn(sim: Sim, s: WarpState, i: number, clear: number): Point {
  const r = s.plan.rooms[i]!
  const b = s.plan.basins[i]!
  let p: Point = { x: r.entry.x * UNIT, y: r.entry.y * UNIT }
  for (let k = 0; k < 32; k++) {
    p = { x: (r.floor.x0 + sim.rng.next() * (r.floor.x1 - r.floor.x0)) * UNIT, y: (r.floor.y0 + sim.rng.next() * (r.floor.y1 - r.floor.y0)) * UNIT }
    if (roomAt(b, p.x, p.y) >= clear) return p
  }
  return p
}

/** 这间舱室此刻亮着：队伍那间与刚走过的几间，只有它们出怪、里面的敌人会动 */
function live(s: WarpState, room: number): boolean {
  return s.trail.includes(room)
}

/**
 * 迷宫：一间间悬在虚空里的舱室铺满方框，方框四边首尾相接，舱与舱之间是一道虚空的缝，身体只能在自己那间里走；平台四周的力场挡弹体也挡视线。
 * 舱室之间只靠门来往：队长站上一扇门充满能，整支队伍连同召唤物从最近的那条路穿过虚空，落到它通往的那间的入口上；每扇门定期发车，台上的敌人一起送走。
 * 只有队伍那间与刚走过的几间亮着：敌人只在这几间出，这几间里的敌人顺着门一间间追过来；别的舱室暗着，敌人定在原地
 */
export const warp: WorldHooks = {
  ...bounded,
  /** 两点之间按方框平铺开以后最近的那一份算 */
  worldDelta(sim, fromX, fromY, toX, toY) {
    return torusDelta({ x: fromX, y: fromY }, { x: toX, y: toY }, sim.mapW, sim.mapH)
  },
  /** 穿过虚空的身体从方框的一边出去、从另一边回来 */
  wrap(sim, x, y) {
    return wrapPoint({ x, y }, sim.mapW, sim.mapH)
  },
  constrainBody(sim, eid, from, next) {
    const s = warpOf(sim)
    const room = s.crossing ? roomOf(s, next.x, next.y) : roomOf(s, from.x, from.y)
    return keepOut(s.plan.basins[room]!, next.x, next.y, Radius.v[eid]!)
  },
  basin(sim) {
    return warpOf(sim).plan.basin
  },
  ground(sim) {
    return warpOf(sim).plan.basin
  },
  /** 目标在别的舱室就先去通向队伍的那扇门；同一间里追向队伍按到队长的步数场绕开机柜与凹槽 */
  chaseDir(sim, eid, tx, ty) {
    const s = warpOf(sim)
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const room = roomOf(s, x, y)
    if (room !== roomOf(s, tx, ty)) return towardDoor(s, cfgOf(sim), room, eid, 0, 0) ?? ZERO
    return steer(s, room, room === s.navRoom ? s.toLeader : null, x, y, tx, ty, Radius.v[eid]!)
  },
  trace(sim, probe, ax, ay, bx, by) {
    return solidsTrace(warpOf(sim).solids, probe, ax, ay, bx, by)
  },
  solidAt(sim, x, y) {
    return solidOf(warpOf(sim).solids, x, y)
  },
  /** 亮着的别的舱室里，没事做的敌人往通向队伍的那扇门去 */
  wanderDir(sim, eid, dx, dy) {
    const s = warpOf(sim)
    const room = roomOf(s, Transform.x[eid]!, Transform.y[eid]!)
    if (Faction.v[eid] === FACTION.enemy && room !== s.teamRoom && live(s, room)) {
      const d = towardDoor(s, cfgOf(sim), room, eid, dx, dy)
      if (d) return d
    }
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
  /** 平常的敌人落在亮着的几间里，按各间的亮度分；出怪口再按种类挑那几间里配方接它的出怪板。头目落在队伍那间、离队长远的地方 */
  spawnPoint(sim, boss) {
    const s = warpOf(sim)
    if (!boss) {
      const levels = cfgOf(sim).light.levels
      let left = sim.rng.next() * s.trail.reduce((sum, _, k) => sum + levels[k]!, 0)
      const k = Math.max(0, s.trail.findIndex((_, j) => (left -= levels[j]!) < 0))
      return randomIn(sim, s, s.trail[k]!, UNIT)
    }
    const lead = leaderPoint(sim)
    const far = SPAWN.minPlayerDist * UNIT * 1.6
    let p = randomIn(sim, s, s.teamRoom, 1.5 * UNIT)
    for (let k = 0; k < 32 && Math.hypot(p.x - lead.x, p.y - lead.y) < far; k++) p = randomIn(sim, s, s.teamRoom, 1.5 * UNIT)
    return p
  },
  center(sim) {
    const s = warpOf(sim)
    const c = s.plan.rooms[s.teamRoom]!.center
    return { x: c.x * UNIT, y: c.y * UNIT }
  },
  settle(sim, p) {
    const s = warpOf(sim)
    return keepOut(s.plan.basins[roomOf(s, p.x, p.y)]!, p.x, p.y, SPAWN.edgeInset * UNIT)
  },
  /** 站得下、落在出怪的舱室里，也不贴着队长冒出来 */
  canSpawn(sim, x, y, radius) {
    const s = warpOf(sim)
    const lead = leaderPoint(sim)
    return live(s, roomOf(s, x, y)) && roomFor(s.plan.basin, x, y, radius) && Math.hypot(x - lead.x, y - lead.y) >= cfgOf(sim).emitters.clearU * UNIT
  },
  landmarks(sim) {
    return warpOf(sim).marks
  },
  /** 关卡锁住所有门：队长站上去也不攒能，队伍走不了；门照常发车，台上的敌人照样送走 */
  cue(sim, c) {
    if (c === 'lock') warpOf(sim).locked = true
  },
  lean() {
    return ZERO
  },
  /** 走到队长的路：门一下就到，所以别的舱室里只算走到通向队伍的那扇门，之后每多过一道门折合 hopU 格 */
  toLeader(sim, x, y) {
    const s = warpOf(sim)
    const room = roomOf(s, x, y)
    if (room === s.teamRoom) {
      const lead = leaderPoint(sim)
      return Math.hypot(lead.x - x, lead.y - y)
    }
    const k = s.via[room]!
    if (k < 0) return Infinity
    return (navDist(s.grids[room]!, s.toDoor[k]!, x, y) + (s.steps[room]! - 1) * cfgOf(sim).hopU) * UNIT
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
    stepDoors(sim, s, cfg, delta)
    stepDark(sim, s)
    spill(sim, s, cfg)
    stepTiles(sim, s)
    stepNav(sim, s)
    const old = sim.elapsedMs - 2000
    while (s.flights.length > 0 && s.flights[0]!.at < old) s.flights.shift()
  },
}
