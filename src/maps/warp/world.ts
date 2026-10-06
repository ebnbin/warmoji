import { hasComponent, query } from 'bitecs'
import { FRAME_U, UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { MAPS } from '../../data/maps'
import { SPAWN } from '../../data/enemies'
import { Alive, ENEMY_SET, FACTION, Faction, Hp, Minion, Mounted, Pet, Phys, Pickup, Radius, Transform, Uid } from '../../ecs/components'
import { spawnCoins } from '../../ecs/entities/pickup'
import { mend } from '../../ecs/systems/shared/heal'
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
import { FEEDER_U, inBox, nextRoom, roomIndexAt, warpPlan, wrapU } from './layout'
import { clearWalk, flowDir, flowTo, navDist, navGrid } from './nav'
import type { NavField, NavGrid } from './nav'
import type { WarpPlan } from './layout'
import type { Solid, Solids } from '../../ecs/worlds/solids'
import type { Landmark } from '../landmark'
import type { WarpConfig } from '../../types/maps'
import type { Point } from '../../util/vec'
import type { Sim } from '../../ecs/sim'
import type { WorldHooks } from '../../ecs/worlds/hooks'

/** 实验台按布景种子打散出自己的种子 */
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
const FEED_CAP = 16
/** 送到的队员在进口上排成几圈：每圈离管口中心多远（格）、排几个 */
const RINGS = [
  [0, 1],
  [0.75, 6],
  [1.3, 10],
] as const

/** 被管子吸走是被摆布：锚定的、霸体的、头目也照送 */
const SHIPPED: Mover = { self: false, free: true }

const FIELD: Solid = { topM: Infinity, material: 'field' }

/**
 * 一只缸的出口此刻：队长站在上面攒下的充能（毫秒），队伍滑进这只缸以后出口关到哪一刻，下一次抽走敌人的时刻；
 * 上一次队伍从这里出发、上一次抽的时刻与那一次送走了几只（画面用）
 */
export interface PadState {
  charge: number
  coolUntil: number
  shuttleAt: number
  jumpedAt: number
  shuttledAt: number
  shuttled: number
}

/** 一个身体被管子送走：从哪到哪（像素，落点按管子往前接，可能在方框外那一份上）、哪一刻出发（对局时钟）、多大、是不是敌人 */
export interface Hop {
  readonly fx: number
  readonly fy: number
  readonly tx: number
  readonly ty: number
  readonly at: number
  readonly r: number
  readonly foe: boolean
  /** 顺着第几根管子 */
  readonly tube: number
}

/** 子弹打在缸壁的玻璃上：在哪（像素）、哪一刻 */
export interface Impact {
  readonly x: number
  readonly y: number
  readonly at: number
}

/** 一次投喂：哪只缸、哪一刻落下、落了几枚、是不是绕完一圈的那一次 */
export interface Feed {
  readonly room: number
  readonly at: number
  readonly coins: number
  readonly lap: boolean
}

/** 到了对面要往进口外涌的敌人：到点还是它（uid 对得上）才推 */
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
 * 实验台此刻：按种子定下的四只缸，挡弹体与视线的玻璃，出怪的地标；队伍此刻在哪只；四个出口；
 * 寻路的底子、各只到出口的步数场与到队长的步数场、各只从进口走到出口要多远；地砖；画面要的送人、投喂与玻璃受击的记录
 */
export interface WarpState {
  readonly plan: WarpPlan
  readonly solids: Solids
  readonly marks: Readonly<Record<string, readonly Landmark[]>>
  teamRoom: number
  readonly pads: PadState[]
  readonly grids: readonly NavGrid[]
  readonly toExit: readonly NavField[]
  readonly cross: readonly number[]
  toLeader: NavField | null
  navAt: number
  navCell: number
  navRoom: number
  /** 正在把身体送进管子：这时的落点不按出发的那只约束 */
  crossing: boolean
  readonly tiles: Tiles
  readonly hops: Hop[]
  readonly impacts: Impact[]
  readonly arrivals: Arrival[]
  /** 队伍一共从管子里逃过几次：画面按它认出新的一次 */
  jumps: number
  /** 每只缸被队伍住进来过几回：缸上的标签按它划正字 */
  readonly visits: number[]
  /** 还没落下的投喂与落下过的投喂（画面用） */
  readonly due: Feed[]
  readonly feeds: Feed[]
}

function cfgOf(sim: Sim): WarpConfig {
  return MAPS[sim.mapId].warp!
}

/** 这一局的实验台：视图要它画，规则要它定边界与管口，两边按同一个种子各要一次 */
export function warpPlanFor(cfg: WarpConfig, decorSeed: number): WarpPlan {
  return warpPlan(cfg, (decorSeed ^ PLAN_SEED) >>> 0)
}

/** 出怪的地标：每只缸的出怪板归到那只配方的名下；给料塔单独一组 */
function marksOf(cfg: WarpConfig, plan: WarpPlan): Record<string, Landmark[]> {
  const out: Record<string, Landmark[]> = {}
  for (const name of cfg.recipes) out[name] = []
  for (const room of plan.rooms) {
    const list = out[cfg.recipes[room.recipe]!]!
    for (const p of room.plates) list.push({ x: p.x * UNIT, y: p.y * UNIT, r: cfg.emitters.markU * UNIT, nx: 0, ny: 0 })
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
    const grids = plan.basins.map(navGrid)
    const toExit = plan.rooms.map((r, i) => flowTo(grids[i]!, r.exit.x * UNIT, r.exit.y * UNIT))
    const never = (): Float32Array => new Float32Array(FRAME_U * FRAME_U).fill(-1e9)
    s = {
      plan,
      solids: makeSolids((x, y) => (plan.rooms.some((r) => inBox(r.floor, x / UNIT, y / UNIT)) ? null : FIELD), b.x0, b.y0, b.cols, b.rows, b.cell),
      marks: marksOf(cfg, plan),
      teamRoom: roomIndexAt(plan, plan.start.x, plan.start.y),
      pads: plan.rooms.map((_, i) => ({
        charge: 0,
        coolUntil: 0,
        shuttleAt: cfg.pad.shuttleMs * (0.7 + i * 0.25),
        jumpedAt: -1e9,
        shuttledAt: -1e9,
        shuttled: 0,
      })),
      grids,
      toExit,
      cross: plan.rooms.map((r, i) => navDist(grids[i]!, toExit[i]!, r.entry.x * UNIT, r.entry.y * UNIT)),
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
      visits: plan.rooms.map((_, i) => (i === 0 ? 1 : 0)),
      due: [],
      feeds: [],
    }
    sim.worldState.warp = s
  }
  return s
}

/** (x, y) 像素落在哪间房 */
function roomOf(s: WarpState, x: number, y: number): number {
  return roomIndexAt(s.plan, x / UNIT, y / UNIT)
}

/** 身体站在第 i 只缸的出口上：身体中心落在管口里 */
function onExit(s: WarpState, cfg: WarpConfig, i: number, x: number, y: number): boolean {
  const p = s.plan.rooms[i]!.exit
  return Math.hypot(x / UNIT - p.x, y / UNIT - p.y) <= cfg.pad.radiusU
}

/** 像素坐标挪回方框里那一份 */
function wrapPx(v: number): number {
  return wrapU(v / UNIT) * UNIT
}

/** 第 k 个送到的身体落在进口哪（相对管口中心，格）：先排满中心与两圈，再往外随手撒 */
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
 * 第 i 只缸的出口抽一次：站在上面的敌人都送到下一只缸的进口；team 为真时是队长充满了能，整支队伍连同召唤物不论在缸里哪里一起走。
 * 身体没有实体地顺着管子往前滑，落点按管子往前接到的那一份算，一路挪回方框里；敌人落地后往进口外涌
 */
function depart(sim: Sim, s: WarpState, cfg: WarpConfig, i: number, team: boolean): number {
  const from = s.plan.rooms[i]!
  const to = nextRoom(s.plan, i)
  const tube = s.plan.tubes[i]!
  const now = sim.elapsedMs
  const ms = cfg.pad.transitMs
  let k = 0
  s.crossing = true
  const send = (eid: number, foe: boolean): void => {
    const o = slot(sim, cfg, k++)
    const tx = (tube.ahead.x + o.x) * UNIT
    const ty = (tube.ahead.y + o.y) * UNIT
    const fx = Transform.x[eid]!
    const fy = Transform.y[eid]!
    const r = Radius.v[eid]!
    if (Alive.v[eid] && hasComponent(sim.world, eid, Phys) && displace(sim, eid, { kind: 'transit', x: tx, y: ty, ms, look: 'hidden', color: foe ? 0xff4058 : 0x4c8dff }, SHIPPED)) {
      logHop(s, { fx, fy, tx, ty, at: now, r, foe, tube: i })
      if (foe) s.arrivals.push({ eid, uid: Uid.v[eid]!, at: now + ms, pad: to.index })
      return
    }
    Transform.x[eid] = wrapPx(tx)
    Transform.y[eid] = wrapPx(ty)
  }
  if (team) {
    const cargo = teamCargo(sim)
    const lead = sim.leader
    send(lead, false)
    for (const e of cargo.bodies) if (e !== lead) send(e, false)
    const dx = (to.entry.x - from.exit.x) * UNIT
    const dy = (to.entry.y - from.exit.y) * UNIT
    for (const e of cargo.things) {
      Transform.x[e] = Transform.x[e]! + dx
      Transform.y[e] = Transform.y[e]! + dy
    }
    s.teamRoom = to.index
    s.pads[to.index]!.coolUntil = now + ms + cfg.pad.cooldownMs
    s.pads[i]!.jumpedAt = now
    s.jumps++
    const f = cfg.feed
    const lap = s.jumps % s.plan.rooms.length === 0
    s.due.push({ room: to.index, at: now + ms, coins: Math.min(f.maxCoins, f.coins + f.perJump * (s.jumps - 1)) + (lap ? f.lapCoins : 0), lap })
  }
  let foes = 0
  for (const e of query(sim.world, ENEMY_SET)) {
    if (!Alive.v[e] || inTransit(e) || !onExit(s, cfg, i, Transform.x[e]!, Transform.y[e]!)) continue
    send(e, true)
    foes++
  }
  s.crossing = false
  return foes
}

/** 送到的敌人到点往进口外涌：背着管子往缸里推，左右散开一点，锚定的不推 */
function spill(sim: Sim, s: WarpState, cfg: WarpConfig): void {
  const now = sim.elapsedMs
  for (let k = s.arrivals.length - 1; k >= 0; k--) {
    const a = s.arrivals[k]!
    if (now < a.at) continue
    s.arrivals.splice(k, 1)
    if (Uid.v[a.eid] !== a.uid || !Alive.v[a.eid] || inTransit(a.eid)) continue
    const room = s.plan.rooms[a.pad]!
    const side = (sim.rng.next() - 0.5) * 1.2
    const d = norm(-room.entryDir.x - room.entryDir.y * side, -room.entryDir.y + room.entryDir.x * side)
    displace(sim, a.eid, { kind: 'push', x: d.x * cfg.pad.spillU * UNIT * Phys.mass[a.eid]!, y: d.y * cfg.pad.spillU * UNIT * Phys.mass[a.eid]! }, SHIPPED)
  }
}

/** 四个出口：队长站在队伍所在那只的出口上攒能、走开就漏，满了整队出发；每个出口到点抽一次 */
function stepPads(sim: Sim, s: WarpState, cfg: WarpConfig, delta: number): void {
  const now = sim.elapsedMs
  const lead = sim.leader
  const lx = Transform.x[lead]!
  const ly = Transform.y[lead]!
  const ready = Alive.v[lead] === 1 && !inTransit(lead)
  if (ready) s.teamRoom = roomOf(s, lx, ly)
  s.pads.forEach((p, i) => {
    const standing = ready && i === s.teamRoom && now >= p.coolUntil && onExit(s, cfg, i, lx, ly)
    p.charge = standing ? p.charge + delta : Math.max(0, p.charge - (delta * cfg.pad.chargeMs) / cfg.pad.drainMs)
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
 * 投喂到点：进口边的投料口落下一把金币，整队回一点血，那只缸的标签添一笔。
 * 逃一次喂一次、越逃喂得越多，绕完一圈喂得最多：逃跑正是这场实验要训练的行为
 */
function stepFeeds(sim: Sim, s: WarpState, cfg: WarpConfig): void {
  const now = sim.elapsedMs
  for (let k = s.due.length - 1; k >= 0; k--) {
    const f = s.due[k]!
    if (now < f.at) continue
    s.due.splice(k, 1)
    const room = s.plan.rooms[f.room]!
    s.visits[f.room] = s.visits[f.room]! + 1
    spawnCoins(sim, (room.entry.x - room.entryDir.x * FEEDER_U) * UNIT, (room.entry.y - room.entryDir.y * FEEDER_U) * UNIT, f.coins)
    for (const m of sim.characters) mend(m, Hp.max[m]! * cfg.feed.healFrac)
    s.feeds.push(f)
    if (s.feeds.length > FEED_CAP) s.feeds.shift()
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

/** 第 room 只缸里的身体往那只的出口去：到了管口上就在管口里打转 */
function towardExit(s: WarpState, cfg: WarpConfig, room: number, eid: number, dx: number, dy: number): Point {
  const x = Transform.x[eid]!
  const y = Transform.y[eid]!
  const p = s.plan.rooms[room]!.exit
  const px = p.x * UNIT
  const py = p.y * UNIT
  if (Math.hypot(px - x, py - y) < cfg.pad.radiusU * 0.75 * UNIT) return { x: dx, y: dy }
  return steer(s, room, s.toExit[room]!, x, y, px, py, Radius.v[eid]!)
}

/** 第 i 只缸里随手挑一处离壁至少 clear 像素的地方 */
function randomIn(sim: Sim, s: WarpState, i: number, clear: number): Point {
  const r = s.plan.rooms[i]!
  const b = s.plan.basins[i]!
  let p: Point = { x: r.center.x * UNIT, y: r.center.y * UNIT }
  for (let k = 0; k < 32; k++) {
    p = { x: (r.floor.x0 + sim.rng.next() * (r.floor.x1 - r.floor.x0)) * UNIT, y: (r.floor.y0 + sim.rng.next() * (r.floor.y1 - r.floor.y0)) * UNIT }
    if (roomAt(b, p.x, p.y) >= clear) return p
  }
  return p
}

/**
 * 跃迁·标本：实验台上四只玻璃饲养缸，缸与缸之间是实验台，身体只能在自己那只缸里走；缸壁的玻璃挡弹体也挡视线。
 * 每只缸一个进口、一个出口，管子总往前接：队长站在出口上充满能，整支队伍连同召唤物顺着管子滑进下一只缸的进口，投料口落下饲料；
 * 四只缸接成一圈，往前走就是绕回来。每个出口定期抽一次，站在上面的敌人一起送走；队伍不在的那几只，敌人一边刷一边往出口聚
 */
export const warp: WorldHooks = {
  ...bounded,
  /** 顺着管子滑到方框外那一份的身体挪回方框里：画面平铺着，挪一整圈看不出来 */
  wrap(_sim, x, y) {
    return { x: wrapPx(x), y: wrapPx(y) }
  },
  constrainBody(sim, eid, from, next) {
    const s = warpOf(sim)
    if (s.crossing) {
      const wx = wrapPx(next.x)
      const wy = wrapPx(next.y)
      const p = keepOut(s.plan.basins[roomOf(s, wx, wy)]!, wx, wy, Radius.v[eid]!)
      return { x: p.x + next.x - wx, y: p.y + next.y - wy }
    }
    return keepOut(s.plan.basins[roomOf(s, from.x, from.y)]!, next.x, next.y, Radius.v[eid]!)
  },
  basin(sim) {
    return warpOf(sim).plan.basin
  },
  ground(sim) {
    return warpOf(sim).plan.basin
  },
  /** 目标在别的缸就先去这只的出口；同一只里追向队伍按到队长的步数场绕开摆件 */
  chaseDir(sim, eid, tx, ty) {
    const s = warpOf(sim)
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const room = roomOf(s, x, y)
    if (room !== roomOf(s, tx, ty)) return towardExit(s, cfgOf(sim), room, eid, 0, 0)
    return steer(s, room, room === s.navRoom ? s.toLeader : null, x, y, tx, ty, Radius.v[eid]!)
  },
  trace(sim, probe, ax, ay, bx, by) {
    return solidsTrace(warpOf(sim).solids, probe, ax, ay, bx, by)
  },
  solidAt(sim, x, y) {
    return solidOf(warpOf(sim).solids, x, y)
  },
  /** 队伍不在的缸里，没事做的敌人往出口聚 */
  wanderDir(sim, eid, dx, dy) {
    const s = warpOf(sim)
    const room = roomOf(s, Transform.x[eid]!, Transform.y[eid]!)
    if (Faction.v[eid] === FACTION.enemy && room !== s.teamRoom) return towardExit(s, cfgOf(sim), room, eid, dx, dy)
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
  /** 平常的敌人随手落在四只缸里，出怪口再按种类把它送到配方接它的那只；头目落在队伍所在那只、离队长远、也不落在管口上的地方 */
  spawnPoint(sim, boss) {
    const s = warpOf(sim)
    if (!boss) return randomIn(sim, s, Math.floor(sim.rng.next() * s.plan.rooms.length), UNIT)
    const lead = leaderPoint(sim)
    const far = SPAWN.minPlayerDist * UNIT * 1.6
    const room = s.plan.rooms[s.teamRoom]!
    const clear = (cfgOf(sim).pad.radiusU + 2.5) * UNIT
    const bad = (p: Point): boolean => Math.hypot(p.x - lead.x, p.y - lead.y) < far || [room.entry, room.exit].some((q) => Math.hypot(p.x - q.x * UNIT, p.y - q.y * UNIT) < clear)
    let p = randomIn(sim, s, s.teamRoom, 1.5 * UNIT)
    for (let k = 0; k < 32 && bad(p); k++) p = randomIn(sim, s, s.teamRoom, 1.5 * UNIT)
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
    return warpOf(sim).marks
  },
  lean() {
    return ZERO
  },
  /**
   * 走到队长的路：管子一下就到，所以别的缸里算走到自己那只出口的路，加上途经的缸从进口走到出口的路，再加上队伍那只从进口走到队长的路
   */
  toLeader(sim, x, y) {
    const s = warpOf(sim)
    const lead = leaderPoint(sim)
    const room = roomOf(s, x, y)
    if (room === s.teamRoom) return Math.hypot(lead.x - x, lead.y - y)
    const n = s.plan.rooms.length
    let via = 0
    for (let j = (room + 1) % n; j !== s.teamRoom; j = (j + 1) % n) via += s.cross[j]!
    const entry = s.plan.rooms[s.teamRoom]!.entry
    const there = s.toLeader && s.navRoom === s.teamRoom ? navDist(s.grids[s.teamRoom]!, s.toLeader, entry.x * UNIT, entry.y * UNIT) : Infinity
    return (navDist(s.grids[room]!, s.toExit[room]!, x, y) + via + there) * UNIT
  },
  /** 打在玻璃上的弹体：玻璃在那里亮一下 */
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
    stepPads(sim, s, cfg, delta)
    spill(sim, s, cfg)
    stepFeeds(sim, s, cfg)
    stepTiles(sim, s)
    stepNav(sim, s)
    const old = sim.elapsedMs - 2000
    while (s.hops.length > 0 && s.hops[0]!.at < old) s.hops.shift()
  },
}
