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
import { alongWall, keepOut, roomAt } from '../basin'
import { roomFor } from '../landmark'
import { inBox, nextRoom, roomIndexAt, warpPlan } from './layout'
import { clearWalk, flowDir, flowTo, navDist, navGrid } from './nav'
import type { NavField, NavGrid } from './nav'
import type { WarpPlan } from './layout'
import type { Solid, Solids } from '../../ecs/worlds/solids'
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
/** 休眠加给敌人的减速与静止每一拍续多久，毫秒：灯亮回来以后最多晚这么久才松开 */
const HOLD_MARK_MS = 120
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

/** 一座传送台此刻：队长站在上面攒下的充能（毫秒），队伍到这里以后冷却到哪一刻；上一次队伍从这里出发的时刻与跟着走了几只敌人（画面用） */
export interface PadState {
  charge: number
  coolUntil: number
  jumpedAt: number
  carried: number
}

/**
 * 一间房的灯：亮到几成（0 到 1），队伍上一次离开的时刻；clock 是这间房自己的钟（毫秒），灯亮几成就按几成的快慢走，熄了就停。
 * 地砖的余光、地板的律动、标本管里的东西都按它走，所以回来时一切从停下的那一刻接着动
 */
export interface Light {
  power: number
  leftAt: number
  clock: number
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

/** 每块瓷砖最近一次被队伍、敌人踩着的时刻，与这一脚踩上来的时刻；都按那间房自己的钟 */
export interface Tiles {
  readonly team: Float32Array
  readonly foe: Float32Array
  readonly teamFrom: Float32Array
  readonly foeFrom: Float32Array
}

/**
 * 跃迁站此刻：按种子定下的站，挡弹体与视线的力场，队伍在各间时出怪的地标；队伍此刻在哪间；四座传送台与四间房的灯；
 * 寻路的底子、各间到传送台的步数场与到队长的步数场；地砖；画面要的送人与力场受击的记录
 */
export interface WarpState {
  readonly plan: WarpPlan
  readonly solids: Solids
  readonly marks: readonly Readonly<Record<string, readonly Landmark[]>>[]
  teamRoom: number
  readonly pads: PadState[]
  readonly lights: Light[]
  readonly grids: readonly NavGrid[]
  readonly toPad: readonly NavField[]
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

/** 队伍在第 i 间时出怪的地标：只有这一间的出怪板，别的房间暗着；核心柱单独一组 */
function marksOf(cfg: WarpConfig, plan: WarpPlan): Record<string, Landmark[]>[] {
  const core = [{ x: plan.core.x * UNIT, y: plan.core.y * UNIT, r: cfg.core.radiusU * UNIT, nx: 0, ny: 0 }]
  return plan.rooms.map((room) => ({ plate: room.plates.map((p) => ({ x: p.x * UNIT, y: p.y * UNIT, r: cfg.emitters.markU * UNIT, nx: 0, ny: 0 })), core }))
}

export function warpOf(sim: Sim): WarpState {
  let s = sim.worldState.warp
  if (!s) {
    const cfg = cfgOf(sim)
    const plan = warpPlanFor(cfg, sim.run.decorSeed)
    const b = plan.basin
    const grids = plan.basins.map(navGrid)
    const never = (): Float32Array => new Float32Array(FRAME_U * FRAME_U).fill(-1e9)
    const start = roomIndexAt(plan, plan.start.x, plan.start.y)
    s = {
      plan,
      solids: makeSolids((x, y) => (plan.rooms.some((r) => inBox(r.floor, x / UNIT, y / UNIT)) ? null : FIELD), b.x0, b.y0, b.cols, b.rows, b.cell),
      marks: marksOf(cfg, plan),
      teamRoom: start,
      pads: plan.rooms.map(() => ({ charge: 0, coolUntil: 0, jumpedAt: -1e9, carried: 0 })),
      lights: plan.rooms.map((r) => ({ power: r.index === start ? 1 : 0, leftAt: -1e9, clock: 0 })),
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
 * 队长在第 i 座传送台上充满了能：整支队伍连同召唤物不论在房间哪里一起走，站在台上的敌人也跟着走，都送到下一间的传送台上。
 * 身体没有实体地穿过虚空，落地时散在对面的台上；敌人落地后往台外涌。离开的这间记下离开的时刻，灯过一阵才开始暗
 */
function depart(sim: Sim, s: WarpState, cfg: WarpConfig, i: number): void {
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
  let foes = 0
  for (const e of query(sim.world, ENEMY_SET)) {
    if (!Alive.v[e] || inTransit(e) || !onPad(s, cfg, i, Transform.x[e]!, Transform.y[e]!)) continue
    send(e, true)
    foes++
  }
  s.crossing = false
  s.teamRoom = to.index
  s.lights[i]!.leftAt = now
  s.pads[to.index]!.coolUntil = now + ms + cfg.pad.cooldownMs
  s.pads[i]!.jumpedAt = now
  s.pads[i]!.carried = foes
  s.jumps++
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

/** 四座传送台：队长站在队伍所在那间的台上攒能、走开就漏，满了整队出发 */
function stepPads(sim: Sim, s: WarpState, cfg: WarpConfig, delta: number): void {
  const now = sim.elapsedMs
  const lead = sim.leader
  const lx = Transform.x[lead]!
  const ly = Transform.y[lead]!
  const ready = Alive.v[lead] === 1 && !inTransit(lead)
  if (ready) s.teamRoom = roomOf(s, lx, ly)
  s.pads.forEach((p, i) => {
    const standing = ready && i === s.teamRoom && now >= p.coolUntil && onPad(s, cfg, i, lx, ly)
    p.charge = standing ? p.charge + delta : Math.max(0, p.charge - (delta * cfg.pad.chargeMs) / cfg.pad.drainMs)
    if (p.charge >= cfg.pad.chargeMs) {
      p.charge = 0
      depart(sim, s, cfg, i)
    }
  })
}

/**
 * 休眠：队伍所在那间的灯按 wakeMs 亮起来，别的房间在队伍离开 holdMs 以后按 dimMs 暗下去；每间房的钟按灯亮几成走。
 * 灯没全亮的房间里，敌人按灯亮几成减速，暗过 stillBelow 就定格在原地
 */
function stepDormant(sim: Sim, s: WarpState, cfg: WarpConfig, delta: number): void {
  const now = sim.elapsedMs
  const d = cfg.dormant
  s.lights.forEach((l, i) => {
    if (i === s.teamRoom) l.power = Math.min(1, l.power + delta / d.wakeMs)
    else if (now - l.leftAt >= d.holdMs) l.power = Math.max(0, l.power - delta / d.dimMs)
    l.clock += delta * l.power
  })
  const until = now + HOLD_MARK_MS
  for (const e of query(sim.world, ENEMY_SET)) {
    if (!Alive.v[e] || Faction.v[e] !== FACTION.enemy || inTransit(e)) continue
    const p = s.lights[roomOf(s, Transform.x[e]!, Transform.y[e]!)]!.power
    if (p >= 1) continue
    if (p < d.stillBelow) {
      addMark(e, MARK.stasis, TAG.world, until)
      Phys.vx[e] = 0
      Phys.vy[e] = 0
    } else addMark(e, MARK.slow, TAG.world, until, p)
  }
}

/** 活着、脚沾地的身体踩亮脚下的瓷砖，按它所在那间房的钟记 */
function stepTiles(sim: Sim, s: WarpState): void {
  const t = s.tiles
  const mark = (eid: number, at: Float32Array, from: Float32Array): void => {
    const now = s.lights[roomOf(s, Transform.x[eid]!, Transform.y[eid]!)]!.clock
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

/** 第 i 间里随手挑一处离壁至少 clear 像素的地方 */
function randomIn(sim: Sim, s: WarpState, i: number, clear: number): Point {
  const r = s.plan.rooms[i]!
  const b = s.plan.basins[i]!
  let p: Point = { x: r.pad.x * UNIT, y: r.pad.y * UNIT }
  for (let k = 0; k < 32; k++) {
    p = { x: (r.floor.x0 + sim.rng.next() * (r.floor.x1 - r.floor.x0)) * UNIT, y: (r.floor.y0 + sim.rng.next() * (r.floor.y1 - r.floor.y0)) * UNIT }
    if (roomAt(b, p.x, p.y) >= clear) return p
  }
  return p
}

/**
 * 跃迁站：四块悬空的平台，平台之间是虚空，身体只能在自己那块上走；平台四周的力场挡弹体也挡视线。
 * 每块一座传送台：队长站上去充满能，整支队伍连同召唤物、连同台上的敌人穿过虚空到下一块的传送台。
 * 模拟只在队伍所在的那间跑：别的房间熄了灯，敌人定格在原地等队伍绕回来，也不出新的
 */
export const warp: WorldHooks = {
  ...bounded,
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
    return solidsTrace(warpOf(sim).solids, probe, ax, ay, bx, by)
  },
  solidAt(sim, x, y) {
    return solidOf(warpOf(sim).solids, x, y)
  },
  wanderDir(sim, eid, dx, dy) {
    const s = warpOf(sim)
    return wanderIn(s.plan.basins[roomOf(s, Transform.x[eid]!, Transform.y[eid]!)]!, eid, dx, dy)
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
  /** 敌人只落在队伍所在那间：平常的随手落，出怪口再吸到那间的出怪板上；头目落在离队长远、也不在传送台上的地方 */
  spawnPoint(sim, boss) {
    const s = warpOf(sim)
    if (!boss) return randomIn(sim, s, s.teamRoom, UNIT)
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
    return keepOut(s.plan.basins[roomOf(s, p.x, p.y)]!, p.x, p.y, SPAWN.edgeInset * UNIT)
  },
  /** 站得下，也不贴着队长冒出来：出怪板离队长太近的这一回不出 */
  canSpawn(sim, x, y, radius) {
    const lead = leaderPoint(sim)
    return roomFor(warpOf(sim).plan.basin, x, y, radius) && Math.hypot(x - lead.x, y - lead.y) >= cfgOf(sim).emitters.clearU * UNIT
  },
  landmarks(sim) {
    const s = warpOf(sim)
    return s.marks[s.teamRoom]!
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
    stepDormant(sim, s, cfg, delta)
    stepPads(sim, s, cfg, delta)
    spill(sim, s, cfg)
    stepTiles(sim, s)
    stepNav(sim, s)
    const old = sim.elapsedMs - 2000
    while (s.hops.length > 0 && s.hops[0]!.at < old) s.hops.shift()
  },
}
