import { hasComponent, query, removeEntity } from 'bitecs'
import { UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { MAPS } from '../../data/maps'
import { SPAWN } from '../../data/enemies'
import { ACQUIRE } from '../../data/abilities'
import { Alive, Drive, Faction, FACTION, Grow, Hp, MARK, Motion, MOTION, Phys, Pickup, PICKUP_SET, Radius, Span, TAG, Transform, Uid } from '../../ecs/components'
import { hit } from '../../ecs/systems/shared/damage'
import { endMotion } from '../../ecs/systems/shared/displace'
import { addCc, addMark, clearMarks } from '../../ecs/utils/marks'
import { hazardSource } from '../../ecs/utils/source'
import { moveSpeed } from '../../ecs/utils/stats'
import { leaderPoint } from '../../ecs/utils/team'
import { bounded, groundOf, wanderIn } from '../../ecs/worlds/hooks'
import { alongWall, keepOut, roomAt } from '../basin'
import { FRAME_MID } from '../frame'
import { roomFor } from '../landmark'
import { canyonPlan } from './layout'
import { CLIMBING, deckAt, deckCoord, DOWN, FALLING, inRiver, landingOf, makeBridges, mesaOf, riverCells, sagAt, supported, TOP, towardClimb } from './model'
import type { Bridge, CanyonState, Footing } from './model'
import type { CanyonPlan } from './layout'
import type { Landmark } from '../landmark'
import type { CanyonConfig } from '../../types/maps'
import type { Point } from '../../util/vec'
import type { Sim } from '../../ecs/sim'
import type { WorldHooks } from '../../ecs/worlds/hooks'

/** 峡谷按布景种子打散出自己的种子 */
const PLAN_SEED = 0x5ca17e
/** 谷底是另一个界：掉下去的只碰得到同在谷底的，台上的也碰不到它们；标记里记的界号，与身体的 Uid 错开 */
export const GORGE_REALM = 0xfffffff0
const FALL_TINT = 0xd9a36a
/** 绳梯脚下这么近就抓住绳子往上爬，格 */
const GRAB_U = 0.55
/** 走着的速度超过自己能走的这么多倍，就是被打飞的：AI 不会自己走下台沿，被打飞的拦不住 */
const FLUNG = 1.4
/** 队员与召唤物上桥前看载重：自己加上去会超过上限的这么多就在桥头等 */
const QUEUE_AT = 0.95
/** 桥头：台面上离台沿这么远（格）的一点，从那里顺着桥走上去；走到离台沿这么近、离桥的中线不到桥宽的这么多就上桥 */
const HEAD_IN_U = 1
const BOARD_U = 1.3
const BOARD_LANE = 0.55
/** 队长推的方向离桥的走向不到这么多（余弦）就顺着桥走 */
const RAIL_COS = 0.55

/** 这一局的峡谷：视图要它画，规则要它定边界，两边按同一个种子各要一次 */
export function canyonPlanFor(cfg: CanyonConfig, decorSeed: number): CanyonPlan {
  return canyonPlan(cfg, (decorSeed ^ PLAN_SEED) >>> 0)
}

function cfgOf(sim: Sim): CanyonConfig {
  return MAPS[sim.mapId].canyon!
}

export function canyonOf(sim: Sim): CanyonState {
  let s = sim.worldState.canyon
  if (!s) {
    const cfg = cfgOf(sim)
    const plan = canyonPlanFor(cfg, sim.run.decorSeed)
    s = { plan, bridges: makeBridges(plan, cfg), feet: new Map(), river: riverCells(plan), events: [] }
    sim.worldState.canyon = s
  }
  return s
}

/** 一个身体有多重，公斤：标准身体 bodyKg，别的按质量乘本来的个头（不算队长画大、队员画小）与标准身体之比的立方 */
export function weightKg(cfg: CanyonConfig, eid: number): number {
  return cfg.bridge.bodyKg * Phys.mass[eid]! * ((Grow.r0[eid]! * Grow.v[eid]!) / (cfg.bridge.refRadiusU * UNIT)) ** 3
}

/** 这个身体此刻的处境：认得的接着用，编号换了人的从头算起 */
export function footOf(s: CanyonState, eid: number): Footing {
  let f = s.feet.get(eid)
  if (!f || f.uid !== Uid.v[eid]) {
    f = { uid: Uid.v[eid]!, mode: TOP, at: 0, ms: 0, fx: 0, fy: 0, tx: 0, ty: 0, climb: -1, vx: 0, vy: 0 }
    s.feet.set(eid, f)
  }
  return f
}

/** 这个身体在谷底或正在掉、正在爬 */
export function below(s: CanyonState, eid: number): boolean {
  const f = s.feet.get(eid)
  return f !== undefined && f.uid === Uid.v[eid] && f.mode !== TOP
}

/** 脚踏实地：站着、走着、冲刺着的身体才压桥、才会踩空；飘着的、跳在半空的、穿行的、贴着别人的不算 */
function standing(sim: Sim, eid: number): boolean {
  if (Span.lo[eid]! > 0) return false
  if (!hasComponent(sim.world, eid, Motion)) return true
  const k = Motion.kind[eid]
  return k === MOTION.none || k === MOTION.dash
}

function enterGorge(eid: number): void {
  addMark(eid, MARK.realm, TAG.effect, Infinity, 0, 0, 0, GORGE_REALM)
}

function leaveGorge(eid: number): void {
  clearMarks(eid, [MARK.realm])
}

/** 从 (x, y) 踩空：记下起点、速度与落点，进谷底的界 */
function startFall(sim: Sim, s: CanyonState, f: Footing, eid: number): void {
  const cfg = cfgOf(sim)
  const x = Transform.x[eid]!
  const y = Transform.y[eid]!
  const land = landingOf(s, x, y, Phys.vx[eid]!, Phys.vy[eid]!, Radius.v[eid]!)
  f.mode = FALLING
  f.at = sim.elapsedMs
  f.ms = cfg.fall.ms
  f.fx = x
  f.fy = y
  f.tx = land.x
  f.ty = land.y
  f.vx = Phys.vx[eid]!
  f.vy = Phys.vy[eid]!
  // 冲出台沿的冲刺到此为止
  if (Motion.kind[eid] === MOTION.dash) endMotion(eid)
  enterGorge(eid)
  s.events.push({ kind: 'fall', x, y, r: Radius.v[eid]!, at: sim.elapsedMs })
}

/** 摔到谷底：按生命上限摔掉一截，懵一下 */
function land(sim: Sim, s: CanyonState, f: Footing, eid: number): void {
  const cfg = cfgOf(sim)
  f.mode = DOWN
  Transform.x[eid] = f.tx
  Transform.y[eid] = f.ty
  Phys.vx[eid] = 0
  Phys.vy[eid] = 0
  s.events.push({ kind: 'land', x: f.tx, y: f.ty, r: Radius.v[eid]!, at: sim.elapsedMs })
  const dmg = Math.min(cfg.fall.hurtCap, Hp.max[eid]! * cfg.fall.hurt)
  hit(sim, hazardSource('fall', FALL_TINT), eid, Math.max(1, Math.round(dmg)), { tick: true })
  if (Alive.v[eid]) addCc(sim, eid, MARK.stun, sim.elapsedMs + cfg.fall.stunMs)
}

/** 爬绳梯：重的爬得慢，按重量的立方根 */
function startClimb(sim: Sim, s: CanyonState, f: Footing, eid: number, k: number): void {
  const cfg = cfgOf(sim)
  const c = s.plan.climbs[k]!
  f.mode = CLIMBING
  f.at = sim.elapsedMs
  f.ms = cfg.climb.ms * Math.cbrt(Math.max(0.3, weightKg(cfg, eid) / cfg.bridge.bodyKg))
  f.fx = Transform.x[eid]!
  f.fy = Transform.y[eid]!
  f.tx = c.top.x * UNIT
  f.ty = c.top.y * UNIT
  f.climb = k
}

function climbed(sim: Sim, s: CanyonState, f: Footing, eid: number): void {
  f.mode = TOP
  Transform.x[eid] = f.tx
  Transform.y[eid] = f.ty
  Phys.vx[eid] = 0
  Phys.vy[eid] = 0
  leaveGorge(eid)
  s.events.push({ kind: 'climbed', x: f.tx, y: f.ty, r: Radius.v[eid]!, at: sim.elapsedMs })
}

/** 掉下去的路：横着按开始掉时的速度漂一点，往下按自由落体越掉越快 */
export function fallPoint(f: Footing, p: number): Point {
  return { x: f.fx + (f.tx - f.fx) * p, y: f.fy + (f.ty - f.fy) * p * p }
}

/** 爬绳梯的路：先顺着崖面往上爬到台沿，最后一小段翻上台面 */
export function climbPoint(s: CanyonState, f: Footing, p: number): Point {
  const c = s.plan.climbs[f.climb]!
  const rx = c.x * UNIT
  const ry = c.y * UNIT
  const up = 0.82
  if (p < up) {
    const q = p / up
    return { x: f.fx + (rx - f.fx) * q, y: f.fy + (ry - f.fy) * q }
  }
  const q = (p - up) / (1 - up)
  return { x: rx + (f.tx - rx) * q, y: ry + (f.ty - ry) * q }
}

/** 每个身体：站着的踩空了就掉，掉到时候就落地，谷底的走到绳梯脚下就爬，爬到了就上台；被拉回台上的（复活、归队）直接算回到台上 */
function stepFeet(sim: Sim, s: CanyonState): void {
  const now = sim.elapsedMs
  for (const eid of query(sim.world, [Faction, Phys, Radius, Alive, Transform])) {
    if (!Alive.v[eid] || hasComponent(sim.world, eid, Pickup)) continue
    const f = footOf(s, eid)
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    if (f.mode === TOP) {
      if (standing(sim, eid) && !supported(s, x, y)) startFall(sim, s, f, eid)
    } else if (f.mode === FALLING) {
      if (now - f.at >= f.ms) land(sim, s, f, eid)
    } else if (f.mode === DOWN) {
      if (mesaOf(s, x, y) >= 0) {
        f.mode = TOP
        leaveGorge(eid)
        continue
      }
      const grab = GRAB_U * UNIT + Radius.v[eid]! * 0.3
      const k = s.plan.climbs.findIndex((c) => Math.hypot(c.foot.x * UNIT - x, c.foot.y * UNIT - y) < grab)
      if (k >= 0 && standing(sim, eid)) startClimb(sim, s, f, eid, k)
    } else if (now - f.at >= f.ms) climbed(sim, s, f, eid)
  }
}

/** 每座桥：数站在桥面上的身体压了多重，超过上限一会儿就崩断，断了一阵开始重新拉绳，拉完就能走 */
function stepBridges(sim: Sim, s: CanyonState, delta: number): void {
  const cfg = cfgOf(sim)
  const now = sim.elapsedMs
  for (const b of s.bridges) {
    b.loads.length = 0
    b.kg = 0
    if (b.phase === 'down' && now - b.since >= cfg.bridge.downMs) {
      b.phase = 'rebuild'
      b.since = now
    } else if (b.phase === 'rebuild' && now - b.since >= cfg.bridge.rebuildMs) {
      b.phase = 'up'
      b.since = now
      b.strain = 0
    }
  }
  for (const eid of query(sim.world, [Faction, Phys, Radius, Alive, Transform])) {
    if (!Alive.v[eid] || hasComponent(sim.world, eid, Pickup) || !standing(sim, eid) || below(s, eid)) continue
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    if (mesaOf(s, x, y) >= 0) continue
    const j = deckAt(s, x, y)
    if (j < 0) continue
    const b = s.bridges[j]!
    const kg = weightKg(cfg, eid)
    b.kg += kg
    b.loads.push({ t: deckCoord(b, x, y).t, kg })
  }
  s.bridges.forEach((b, j) => {
    if (b.phase !== 'up') return
    b.strain = b.kg > b.cap ? b.strain + delta : 0
    if (b.strain < cfg.bridge.strainMs) return
    b.phase = 'down'
    b.since = now
    b.breaks++
    // 绳子从压得最狠的地方崩开
    let worst = 0.5
    let most = -1
    for (const l of b.loads) {
      const w = l.kg * l.t * (1 - l.t)
      if (w > most) {
        most = w
        worst = l.t
      }
    }
    b.snapT = Math.min(0.8, Math.max(0.2, worst))
    s.events.push({ kind: 'snap', bridge: j, at: now })
  })
}

/** 掉进峡谷的金币与掉落物：脚下没东西撑着就掉下去不见了 */
function dropLoot(sim: Sim, s: CanyonState): void {
  for (const eid of [...query(sim.world, PICKUP_SET)]) {
    if (Span.lo[eid]! > 0) continue
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    if (supported(s, x, y)) continue
    s.events.push({ kind: 'coin', x, y, r: Radius.v[eid]!, at: sim.elapsedMs })
    removeEntity(sim.world, eid)
  }
}

/** 桥头：从台 mesa 那头上桥 b 的那一点（台面上），和上桥时顺着走的方向 */
function headOf(b: Bridge, mesa: number): { x: number; y: number; dx: number; dy: number; t: number } {
  const fromA = b.span.a === mesa
  const sx = fromA ? b.ax : b.ax + b.ux * b.len
  const sy = fromA ? b.ay : b.ay + b.uy * b.len
  const dx = fromA ? b.ux : -b.ux
  const dy = fromA ? b.uy : -b.uy
  return { x: sx - dx * HEAD_IN_U * UNIT, y: sy - dy * HEAD_IN_U * UNIT, dx, dy, t: fromA ? 0 : 1 }
}

/** 台与台之间走桥最近的路：从 from 出发到 to，返回第一座要走的桥与整条路多长（格）；只走完好的桥，any 为真时断了的也算 */
function route(s: CanyonState, from: number, to: number, any: boolean): { bridge: number; len: number } | null {
  if (from === to) return { bridge: -1, len: 0 }
  const n = s.plan.mesas.length
  const dist = new Array<number>(n).fill(Infinity)
  const first = new Array<number>(n).fill(-1)
  const done = new Array<boolean>(n).fill(false)
  dist[from] = 0
  for (;;) {
    let u = -1
    for (let i = 0; i < n; i++) if (!done[i] && dist[i]! < Infinity && (u < 0 || dist[i]! < dist[u]!)) u = i
    if (u < 0) break
    if (u === to) break
    done[u] = true
    s.bridges.forEach((b, j) => {
      if (!any && b.phase !== 'up') return
      const v = b.span.a === u ? b.span.b : b.span.b === u ? b.span.a : -1
      if (v < 0 || done[v]) return
      const m = s.plan.mesas[u]!
      const w = b.len / UNIT + m.r
      if (dist[u]! + w < dist[v]!) {
        dist[v] = dist[u]! + w
        first[v] = u === from ? j : first[u]!
      }
    })
  }
  return Number.isFinite(dist[to]!) ? { bridge: first[to]!, len: dist[to]! } : null
}

/** 顺着桥面往 toward（0 或 1）那头走：偏离中线就往回带 */
function alongDeck(b: Bridge, x: number, y: number, toward: number): Point {
  const c = deckCoord(b, x, y)
  const sgn = toward > c.t ? 1 : -1
  const k = Math.max(-1.2, Math.min(1.2, (-c.off / b.half) * 1.3))
  return norm(b.ux * sgn + b.nx * k, b.uy * sgn + b.ny * k)
}

/** 在台 mesa 上去桥 b 的桥头再上桥：离台沿够近、对得准中线就顺着桥走，否则先走到桥头 */
function boardDir(s: CanyonState, b: Bridge, mesa: number, x: number, y: number, rad: number): Point {
  const h = headOf(b, mesa)
  const along = (x - h.x) * h.dx + (y - h.y) * h.dy
  const lat = Math.abs((x - h.x) * -h.dy + (y - h.y) * h.dx)
  if (along > -0.4 * UNIT && along < (HEAD_IN_U + BOARD_U) * UNIT && lat < b.half * BOARD_LANE) return alongDeck(b, x, y, 1 - h.t)
  const d = norm(h.x - x, h.y - y)
  return alongWall(s.plan.top, x, y, d.x, d.y, rad + 0.3 * UNIT)
}

/** 台上的身体去 (tx, ty)：同一座台上直走；隔着桥按走桥最近的路，先去第一座桥的桥头；路断了就守在通往那边的断桥头 */
function topDir(s: CanyonState, eid: number, tx: number, ty: number): Point {
  const x = Transform.x[eid]!
  const y = Transform.y[eid]!
  const rad = Radius.v[eid]!
  const onDeck = mesaOf(s, x, y) < 0 ? deckAt(s, x, y) : -1
  const goal = mesaOf(s, tx, ty)
  const goalDeck = goal < 0 ? deckAt(s, tx, ty) : -1
  // 目标所在的台：在桥上的就按两头里离自己近的那头；悬在谷上的（掉下去的、飞着的）按离它最近的台
  const goalMesas = goal >= 0 ? [goal] : goalDeck >= 0 ? [s.bridges[goalDeck]!.span.a, s.bridges[goalDeck]!.span.b] : [nearestMesa(s, tx, ty)]
  if (onDeck >= 0) {
    const b = s.bridges[onDeck]!
    if (goalDeck === onDeck) return alongDeck(b, x, y, deckCoord(b, tx, ty).t)
    const la = Math.min(...goalMesas.map((g) => route(s, b.span.a, g, false)?.len ?? Infinity))
    const lb = Math.min(...goalMesas.map((g) => route(s, b.span.b, g, false)?.len ?? Infinity))
    const ca = deckCoord(b, x, y).t
    return alongDeck(b, x, y, la + ca * b.len / UNIT <= lb + (1 - ca) * b.len / UNIT ? -0.2 : 1.2)
  }
  const here = mesaOf(s, x, y)
  if (here < 0) return norm(tx - x, ty - y)
  if (goalMesas.includes(here)) {
    if (goalDeck >= 0) return boardDir(s, s.bridges[goalDeck]!, here, x, y, rad)
    const d = norm(tx - x, ty - y)
    return alongWall(s.plan.top, x, y, d.x, d.y, rad + 0.3 * UNIT)
  }
  let best: { bridge: number; len: number } | null = null
  for (const g of goalMesas) {
    const r = route(s, here, g, false)
    if (r && (!best || r.len < best.len)) best = r
  }
  if (best && best.bridge >= 0) return boardDir(s, s.bridges[best.bridge]!, here, x, y, rad)
  // 过不去：走到通往那边的断桥头等着
  let wait: { bridge: number; len: number } | null = null
  for (const g of goalMesas) {
    const r = route(s, here, g, true)
    if (r && (!wait || r.len < wait.len)) wait = r
  }
  if (!wait || wait.bridge < 0) return { x: 0, y: 0 }
  const h = headOf(s.bridges[wait.bridge]!, here)
  if (Math.hypot(h.x - x, h.y - y) < 0.4 * UNIT) return { x: 0, y: 0 }
  const d = norm(h.x - x, h.y - y)
  return alongWall(s.plan.top, x, y, d.x, d.y, rad + 0.3 * UNIT)
}

function nearestMesa(s: CanyonState, x: number, y: number): number {
  let best = 0
  let bd = Infinity
  s.plan.mesas.forEach((m, i) => {
    const d = Math.hypot(m.cx * UNIT - x, m.cy * UNIT - y) - m.r * UNIT
    if (d < bd) {
      bd = d
      best = i
    }
  })
  return best
}

/** 台面上离台沿至少 room 像素的一点：从 p 往里推 */
function onTop(s: CanyonState, p: Point, room: number): Point {
  return keepOut(s.plan.top, p.x, p.y, room)
}

/** 谷底的身体要去的绳梯：队长在谷底时队员在那根绳梯的台面一头等 */
function leaderClimb(sim: Sim, s: CanyonState): number {
  if (!below(s, sim.leader)) return -1
  const f = s.feet.get(sim.leader)!
  if (f.mode === CLIMBING) return f.climb
  return towardClimb(s, Transform.x[sim.leader]!, Transform.y[sim.leader]!)?.climb ?? -1
}

/** 出怪口的地标：怪从朝镜头的崖边爬上台（朝台里的方向），头目从崖顶跳到外围石台的中间 */
function marksOf(s: CanyonState): Readonly<Record<string, readonly Landmark[]>> {
  const ledge = s.plan.ledges.map((l) => ({ x: l.x * UNIT, y: l.y * UNIT, r: 1.1 * UNIT, nx: -l.nx, ny: -l.ny }))
  const summit = s.plan.mesas.slice(1).map((m) => ({ x: m.cx * UNIT, y: m.cy * UNIT, r: m.r * 0.35 * UNIT, nx: 0, ny: 0 }))
  return { ledge, summit }
}

const MARKS = new WeakMap<CanyonState, Readonly<Record<string, readonly Landmark[]>>>()

/**
 * 索桥：石台是实地，台与台之间只有吊桥；台外是峡谷，谁站着踩空了就掉下去，摔一下落到谷底（另一个界，只碰得到同在谷底的），
 * 在谷底走到绳梯脚下才爬得回来。桥上站着的身体加起来超过上限就崩断，桥上的全掉下去，过一阵重新搭好。
 * 敌人与队员走桥绕路；AI 不会自己走下台沿，被打飞的拦不住；队员看着载重上桥，压不下了就在桥头等
 */
export const canyon: WorldHooks = {
  ...bounded,
  surface(sim, x, y, body) {
    const s = canyonOf(sim)
    if (body === undefined || !below(s, body) || !inRiver(s, x, y)) return groundOf(sim)
    const g = cfgOf(sim).gorge
    const base = groundOf(sim)
    return { traction: 1, viscosity: g.wade, exertion: base.exertion + g.wadeExertion, regen: base.regen }
  },
  /** 掉的、爬的按时间走那条路；谷底不归玩家管的身体自己找最近的绳梯 */
  contact(sim, eid, _dt, _x, _y, _vx, _vy, out) {
    const s = canyonOf(sim)
    const f = s.feet.get(eid)
    if (!f || f.uid !== Uid.v[eid] || f.mode === TOP) {
      if (eid === sim.leader) alongRail(s, eid)
      return false
    }
    if (f.mode === FALLING || f.mode === CLIMBING) {
      const p = Math.min(1, (sim.elapsedMs - f.at) / f.ms)
      const q = f.mode === FALLING ? fallPoint(f, p) : climbPoint(s, f, p)
      out.x = q.x
      out.y = q.y
      out.vx = 0
      out.vy = 0
      return true
    }
    if (eid !== sim.leader && !hasComponent(sim.world, eid, Pickup)) {
      const d = towardClimb(s, Transform.x[eid]!, Transform.y[eid]!)
      const sp = Math.max(Math.hypot(Drive.x[eid]!, Drive.y[eid]!), moveSpeed(eid))
      Drive.x[eid] = d ? d.x * sp : 0
      Drive.y[eid] = d ? d.y * sp : 0
    }
    return false
  },
  constrainBody(sim, eid, from, next) {
    if (hasComponent(sim.world, eid, Pickup)) return next
    const s = canyonOf(sim)
    const f = s.feet.get(eid)
    if (f && f.uid === Uid.v[eid] && f.mode !== TOP) return f.mode === DOWN ? keepOut(s.plan.floor, next.x, next.y, Math.min(Radius.v[eid]!, 0.4 * UNIT)) : next
    if (!supported(s, from.x, from.y)) return next
    if (queued(sim, s, eid, from, next)) return from
    if (supported(s, next.x, next.y)) return next
    // 被打飞的拦不住；自己冲刺的在台沿刹住
    const charging = Motion.kind[eid] === MOTION.dash && Motion.self[eid] === 1
    if (!charging && Math.hypot(Phys.vx[eid]!, Phys.vy[eid]!) > moveSpeed(eid) * FLUNG) return next
    const j = mesaOf(s, from.x, from.y) < 0 ? deckAt(s, from.x, from.y) : -1
    // 桥两边有扶绳：走着翻不出去，队长也一样；台沿没有，队长走过头就掉下去
    if (eid === sim.leader && j < 0) return next
    if (j >= 0) {
      const b = s.bridges[j]!
      const c = deckCoord(b, next.x, next.y)
      const off = Math.max(-b.half * 0.85, Math.min(b.half * 0.85, c.off))
      return { x: b.ax + b.ux * c.t * b.len + b.nx * off, y: b.ay + b.uy * c.t * b.len + b.ny * off }
    }
    return keepOut(s.plan.top, next.x, next.y, 0.05 * UNIT)
  },
  /** 队长在桥上，队员排在桥面上；队长在台上，坑位收回台面；队长在谷底，队员去他要爬的那根绳梯上头等 */
  seat(sim, from, at) {
    const s = canyonOf(sim)
    const k = leaderClimb(sim, s)
    if (k >= 0) {
      const c = s.plan.climbs[k]!
      return onTop(s, { x: c.top.x * UNIT + (at.x - from.x) * 0.6, y: c.top.y * UNIT + (at.y - from.y) * 0.6 }, 0.4 * UNIT)
    }
    if (supported(s, at.x, at.y)) return at
    const j = mesaOf(s, from.x, from.y) < 0 ? deckAt(s, from.x, from.y) : -1
    if (j >= 0) {
      const b = s.bridges[j]!
      const c = deckCoord(b, at.x, at.y)
      return { x: b.ax + b.ux * c.t * b.len, y: b.ay + b.uy * c.t * b.len }
    }
    return onTop(s, at, 0.4 * UNIT)
  },
  basin(sim) {
    return canyonOf(sim).plan.top
  },
  ground(sim) {
    return canyonOf(sim).plan.top
  },
  chaseDir(sim, eid, tx, ty) {
    const s = canyonOf(sim)
    if (below(s, eid)) {
      const d = towardClimb(s, Transform.x[eid]!, Transform.y[eid]!)
      return d ? { x: d.x, y: d.y } : { x: 0, y: 0 }
    }
    return topDir(s, eid, tx, ty)
  },
  wanderDir(sim, eid, dx, dy) {
    const s = canyonOf(sim)
    if (below(s, eid)) return { x: dx, y: dy }
    return wanderIn(s.plan.top, eid, dx, dy)
  },
  fleeDir(sim, eid, awayX, awayY) {
    const s = canyonOf(sim)
    return alongWall(s.plan.top, Transform.x[eid]!, Transform.y[eid]!, awayX, awayY, Radius.v[eid]! + 1.5 * UNIT)
  },
  outside(_sim, x, y) {
    const m = 2 * UNIT
    return x < -m || y < -m || x > FRAME_MID.x * 2 + m || y > FRAME_MID.y * 2 + m
  },
  /** 刷怪点落在石台上、离台沿至少一格，离队长够远，又在索敌的范围里：隔着桥看得见队伍，才会走桥追过来 */
  spawnPoint(sim, boss) {
    const s = canyonOf(sim)
    const lead = leaderPoint(sim)
    const near = SPAWN.minPlayerDist * UNIT * (boss ? 1.6 : 1)
    const far = ACQUIRE.range * UNIT * 0.9
    let p: Point = FRAME_MID
    let fallback: Point | null = null
    for (let i = 0; i < 64; i++) {
      const m = s.plan.mesas[Math.floor(sim.rng.next() * s.plan.mesas.length)]!
      const a = sim.rng.next() * Math.PI * 2
      const r = Math.sqrt(sim.rng.next()) * m.r
      const q = { x: (m.cx + Math.cos(a) * r) * UNIT, y: (m.cy + Math.sin(a) * r) * UNIT }
      if (roomAt(s.plan.top, q.x, q.y) < UNIT) continue
      const d = Math.hypot(q.x - lead.x, q.y - lead.y)
      if (d < near) continue
      fallback ??= q
      p = q
      if (boss || d <= far) return q
    }
    return fallback ?? p
  },
  center() {
    return FRAME_MID
  },
  settle(sim, p) {
    return onTop(canyonOf(sim), p, SPAWN.edgeInset * UNIT)
  },
  canSpawn(sim, x, y, radius) {
    return roomFor(canyonOf(sim).plan.top, x, y, radius)
  },
  landmarks(sim) {
    const s = canyonOf(sim)
    let m = MARKS.get(s)
    if (!m) {
      m = marksOf(s)
      MARKS.set(s, m)
    }
    return m
  },
  /** 桥面垂下去多少，桥上的身体就跟着画低多少 */
  floorZ(sim, x, y) {
    const s = canyonOf(sim)
    if (mesaOf(s, x, y) >= 0) return 0
    const j = deckAt(s, x, y)
    if (j < 0) return 0
    const b = s.bridges[j]!
    return -sagAt(b, cfgOf(sim), deckCoord(b, x, y).t)
  },
  /** 队长掉在谷底时，箭头指着要爬的那根绳梯脚下 */
  beacon(sim) {
    const s = canyonOf(sim)
    if (!below(s, sim.leader)) return null
    const k = leaderClimb(sim, s)
    if (k < 0) return null
    const c = s.plan.climbs[k]!
    return { x: c.foot.x * UNIT, y: c.foot.y * UNIT }
  },
  died(sim, eid) {
    const s = canyonOf(sim)
    s.feet.delete(eid)
    leaveGorge(eid)
  },
  onStart(sim) {
    canyonOf(sim)
  },
  tick(sim, delta) {
    const s = canyonOf(sim)
    stepFeet(sim, s)
    stepBridges(sim, s, delta)
    dropLoot(sim, s)
    if (s.events.length > 96) s.events.splice(0, s.events.length - 96)
  },
}

/** 队长在桥上大致顺着桥走时，把摇杆的方向顺到桥面上：窄桥上斜着推也不会一直蹭着扶绳 */
function alongRail(s: CanyonState, eid: number): void {
  const x = Transform.x[eid]!
  const y = Transform.y[eid]!
  if (mesaOf(s, x, y) >= 0) return
  const j = deckAt(s, x, y)
  if (j < 0) return
  const b = s.bridges[j]!
  const dx = Drive.x[eid]!
  const dy = Drive.y[eid]!
  const sp = Math.hypot(dx, dy)
  if (sp < 1e-6) return
  const along = (dx * b.ux + dy * b.uy) / sp
  if (Math.abs(along) < RAIL_COS) return
  const d = alongDeck(b, x, y, along > 0 ? 1.2 : -0.2)
  Drive.x[eid] = d.x * sp
  Drive.y[eid] = d.y * sp
}

/** 队员与召唤物从桥外踏上一座桥时，加上自己会压过上限就不上 */
function queued(sim: Sim, s: CanyonState, eid: number, from: Point, next: Point): boolean {
  if (Faction.v[eid] !== FACTION.team || eid === sim.leader) return false
  const j = mesaOf(s, next.x, next.y) < 0 ? deckAt(s, next.x, next.y) : -1
  if (j < 0) return false
  if (mesaOf(s, from.x, from.y) < 0 && deckAt(s, from.x, from.y) === j) return false
  const b = s.bridges[j]!
  return b.kg + weightKg(cfgOf(sim), eid) > b.cap * QUEUE_AT
}

