import { hasComponent, query } from 'bitecs'
import { UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { MAPS } from '../../data/maps'
import { SPAWN } from '../../data/enemies'
import { Alive, Grow, Phys, Pickup, Radius, Span, Transform, Uid } from '../../ecs/components'
import { fleeSteer } from '../../ecs/systems/shared/steer'
import { leaderPoint, leaderX, leaderY } from '../../ecs/utils/team'
import { grounded, LAYER_M, overOf, phases } from '../../ecs/utils/pass'
import { inTransit, isUntargetable } from '../../ecs/utils/marks'
import { foldBody, setStatLayer } from '../../ecs/utils/stats'
import { solidOf, solidsTrace } from '../../ecs/worlds/solids'
import { bounded } from '../../ecs/worlds/hooks'
import { alongWall, awayFromWall, keepOut, roomAt } from '../basin'
import { roomFor } from '../landmark'
import { teapotParts, wonderPlan } from './layout'
import { clearPath, flowDir, flowFrom, passage, wonderField } from './field'
import type { Passage, Reach, WonderField } from './field'
import type { WonderPlan } from './layout'
import type { Basin } from '../basin'
import type { Landmark } from '../landmark'
import type { Span as Layers } from '../../types/obstacles'
import type { WonderlandConfig, WonderSize } from '../../types/maps'
import type { Point } from '../../util/vec'
import type { Sim } from '../../ecs/sim'
import type { WorldHooks } from '../../ecs/worlds/hooks'

/** 奇境按布景种子打散出自己的种子 */
const PLAN_SEED = 0x4a11ce
/** 隔多久按队长重算一次寻路，毫秒；多久没用到的过法就不再算 */
const FLOW_MS = 250
const FLOW_IDLE_MS = 3000
/** 变回原样却挤在新个子站不下的地方（桌子底下、花坛里）时，往外挤的速度，格/秒；站得下要有新半径的几成空 */
const SQUEEZE_U = 6
const FIT = 0.5
/** 茶点离别的茶点至少多远，离队长最好在这个范围里，格 */
const TREAT_APART_U = 3.5
const NEAR_LEADER_U = [3, 15] as const
/** 记下给画面的事最多留几条：没人取就丢掉最早的 */
const EVENTS_MAX = 64

/** 体型：变小、原样、变大 */
export type Size = -1 | 0 | 1

/** 一份茶点：蛋糕还是药水，在哪（像素），从什么时候起摆出来（之前是预警）、到什么时候收走 */
export interface Treat {
  readonly id: number
  readonly kind: 'cake' | 'bottle'
  readonly x: number
  readonly y: number
  readonly shownAt: number
  readonly until: number
}

/**
 * 一个身体的体型：想要的与此刻的，想要的到什么时候为止；本来的身段与质量，此刻按体型改成的身段；
 * squeeze 是变回去时正被挤出站不下的地方
 */
export interface Sizing {
  readonly uid: number
  want: Size
  now: Size
  until: number
  lo0: number
  hi0: number
  mass0: number
  lo: number
  hi: number
  squeeze: boolean
}

/** 给画面的一件事：谁在哪吃了什么、变成了什么体型 */
export interface WonderEvent {
  readonly kind: 'eat' | 'size'
  readonly eid: number
  readonly x: number
  readonly y: number
  readonly treat: Treat['kind'] | null
  readonly size: Size
}

/** 奇境此刻：按种子定下的花园与它的栅格，场上的茶点与下一轮的钟点，各个身体的体型，给画面的事 */
export interface WonderState {
  readonly plan: WonderPlan
  readonly field: WonderField
  readonly marks: Readonly<Record<string, readonly Landmark[]>>
  treats: Treat[]
  serveAt: number
  serial: number
  readonly sizes: Map<number, Sizing>
  flowIn: number
  events: WonderEvent[]
}

function cfgOf(sim: Sim): WonderlandConfig {
  return MAPS[sim.mapId].wonderland!
}

/** 这一局的花园：视图要它画，规则要它定边界，两边按同一个种子各要一次 */
export function wonderPlanFor(cfg: WonderlandConfig, decorSeed: number): WonderPlan {
  return wonderPlan(cfg, (decorSeed ^ PLAN_SEED) >>> 0)
}

/**
 * 出怪口的地标：hole 是树篱脚下的兔子洞，teapot 是大茶壶的壶嘴，mouse 是扑克牌篱的老鼠洞（两边各一处，朝外），
 * cloth 是茶桌两条长边的正中（从桌布底下钻出来）
 */
function marksOf(plan: WonderPlan, cfg: WonderlandConfig): Record<string, Landmark[]> {
  const U = UNIT
  const hole = [{ x: plan.hole.x * U, y: plan.hole.y * U, r: 0.5 * U, nx: plan.hole.nx, ny: plan.hole.ny }]
  const sp = teapotParts(plan.teapot).find((p) => p.part === 'spout')!.shape
  const spout = sp.kind === 'seg' ? [{ x: sp.bx * U, y: sp.by * U, r: 0, nx: 0, ny: 0 }] : []
  const mouse: Landmark[] = []
  for (const row of plan.rows) {
    const q = row.pieces[row.hole]!
    const x = q.ax + (q.bx - q.ax) * row.t
    const y = q.ay + (q.by - q.ay) * row.t
    const len = Math.hypot(q.bx - q.ax, q.by - q.ay) || 1
    const nx = -(q.by - q.ay) / len
    const ny = (q.bx - q.ax) / len
    const off = cfg.cards.thickU / 2 + 0.1
    for (const s of [-1, 1]) mouse.push({ x: (x + nx * off * s) * U, y: (y + ny * off * s) * U, r: 0.2 * U, nx: nx * s, ny: ny * s })
  }
  const tb = plan.table
  const off = (tb.horiz ? tb.wid : tb.wid) / 2 + 0.05
  const cloth: Landmark[] = []
  for (const s of [-1, 1]) {
    const nx = tb.horiz ? 0 : s
    const ny = tb.horiz ? s : 0
    cloth.push({ x: (tb.x + nx * off) * U, y: (tb.y + ny * off) * U, r: 0.3 * U, nx, ny })
  }
  return { hole, teapot: spout, mouse, cloth }
}

export function wonderOf(sim: Sim): WonderState {
  let s = sim.worldState.wonderland
  if (!s) {
    const cfg = cfgOf(sim)
    const plan = wonderPlanFor(cfg, sim.run.decorSeed)
    s = { plan, field: wonderField(plan, LAYER_M), marks: marksOf(plan, cfg), treats: [], serveAt: cfg.serve.firstMs, serial: 0, sizes: new Map(), flowIn: 0, events: [] }
    sim.worldState.wonderland = s
  }
  return s
}

/** 按体型换算的身段：层数乘倍率，变大向上取整、变小向下取整，至少一层；离地的高度一起缩放 */
export function spanFor(lo: number, hi: number, k: number): Layers {
  const n = hi - lo + 1
  const m = Math.max(1, k >= 1 ? Math.ceil(n * k - 1e-9) : Math.floor(n * k + 1e-9))
  const l = Math.round(lo * k)
  return [l, l + m - 1]
}

function sizeDef(cfg: WonderlandConfig, s: Size): WonderSize | null {
  return s > 0 ? cfg.size.grow : s < 0 ? cfg.size.shrink : null
}

/** 体型的倍率：原样是 1 */
function scaleOf(cfg: WonderlandConfig, s: Size): number {
  return sizeDef(cfg, s)?.scale ?? 1
}

/** 占 lo..hi 层的身体过障碍的本事 */
function reachOf(lo: number, hi: number, phase: boolean): Reach {
  return { clearM: overOf(lo, hi) * LAYER_M, topM: (hi + 1) * LAYER_M, phase }
}

/** 这个身体此刻的过法：按身段，穿墙的只受草坪边挡；正被挤出去的也只受草坪边挡 */
function passageOf(sim: Sim, eid: number): Passage {
  const s = wonderOf(sim)
  const squeezing = s.sizes.get(eid)?.squeeze === true && s.sizes.get(eid)!.uid === Uid.v[eid]
  const phase = squeezing || phases(sim.world, eid, 'hedge')
  const p = passage(s.field, hasComponent(sim.world, eid, Span) ? reachOf(Span.lo[eid]!, Span.hi[eid]!, phase) : reachOf(0, 2, phase))
  p.usedAt = sim.elapsedMs
  return p
}

/** 原样的身体能走的地面：出怪、落点与开局都按它 */
function normalBasin(sim: Sim): Basin {
  return passage(wonderOf(sim).field, reachOf(0, 2, false)).basin
}

/** 草坪上离边至少 room 像素的一点：从 p 往外一圈圈找，近处找不到就退回开局站位 */
function openNear(sim: Sim, p: Point, room: number): Point {
  const b = normalBasin(sim)
  for (let r = 0; r <= 8 * UNIT; r += 0.5 * UNIT) {
    const n = r === 0 ? 1 : Math.ceil((r * Math.PI * 2) / (0.5 * UNIT))
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2
      const q = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r }
      if (roomAt(b, q.x, q.y) >= room) return q
    }
  }
  const st = wonderOf(sim).plan.start
  return { x: st.x * UNIT, y: st.y * UNIT }
}

/** 一个身体的体型记录：没有就按它此刻的身段与质量记一份原样的 */
function sizingOf(s: WonderState, eid: number): Sizing {
  let z = s.sizes.get(eid)
  if (!z || z.uid !== Uid.v[eid]) {
    z = { uid: Uid.v[eid]!, want: 0, now: 0, until: 0, lo0: Span.lo[eid]!, hi0: Span.hi[eid]!, mass0: Phys.mass[eid]!, lo: Span.lo[eid]!, hi: Span.hi[eid]!, squeeze: false }
    s.sizes.set(eid, z)
  }
  return z
}

/** 这个身体此刻的体型，没吃过就是原样 */
export function sizeNow(sim: Sim, eid: number): { size: Size; until: number } {
  const z = wonderOf(sim).sizes.get(eid)
  if (!z || z.uid !== Uid.v[eid]) return { size: 0, until: 0 }
  return { size: z.now, until: z.want === z.now ? z.until : 0 }
}

function emit(s: WonderState, e: WonderEvent): void {
  s.events.push(e)
  if (s.events.length > EVENTS_MAX) s.events.shift()
}

/** 按体型改身段、质量、个头与移速，立刻折进属性表 */
function applySize(sim: Sim, cfg: WonderlandConfig, eid: number, z: Sizing, to: Size): void {
  const d = sizeDef(cfg, to)
  const k = d?.scale ?? 1
  const [lo, hi] = to === 0 ? [z.lo0, z.hi0] : spanFor(z.lo0, z.hi0, k)
  Span.lo[eid] = lo
  Span.hi[eid] = hi
  z.lo = lo
  z.hi = hi
  Phys.mass[eid] = z.mass0 * (d?.mass ?? 1)
  setStatLayer(eid, 'size', d ? [{ mul: { scale: d.scale, moveSpeed: d.speed } }] : undefined)
  foldBody(sim.world, sim, eid)
  z.now = to
  z.squeeze = false
  emit(wonderOf(sim), { kind: 'size', eid, x: Transform.x[eid]!, y: Transform.y[eid]!, treat: null, size: to })
}

/** 吃下一份茶点：蛋糕让变小的变回原样、别的变大；药水让变大的变回原样、别的变小；同样的再吃一份续上时长 */
function eat(sim: Sim, cfg: WonderlandConfig, eid: number, t: Treat): void {
  const s = wonderOf(sim)
  const z = sizingOf(s, eid)
  const dir: Size = t.kind === 'cake' ? 1 : -1
  if (z.want === -dir) {
    z.want = 0
    z.until = 0
  } else {
    z.want = dir
    z.until = sim.elapsedMs + sizeDef(cfg, dir)!.ms
  }
  emit(s, { kind: 'eat', eid, x: t.x, y: t.y, treat: t.kind, size: z.want })
}

/** 想要的体型此刻站不站得下：新半径的几成空要有 */
function fits(sim: Sim, cfg: WonderlandConfig, eid: number, z: Sizing, to: Size): { ok: boolean; basin: Basin } {
  const [lo, hi] = to === 0 ? [z.lo0, z.hi0] : spanFor(z.lo0, z.hi0, scaleOf(cfg, to))
  const basin = passage(wonderOf(sim).field, reachOf(lo, hi, phases(sim.world, eid, 'hedge'))).basin
  const r = (Radius.v[eid]! * scaleOf(cfg, to)) / scaleOf(cfg, z.now)
  return { ok: roomAt(basin, Transform.x[eid]!, Transform.y[eid]!) >= r * FIT, basin }
}

/** 各个身体的体型往想要的走：到时的变回原样；站得下就换，站不下就往站得下的地方挤；倒下的立刻变回原样 */
function stepSizes(sim: Sim, cfg: WonderlandConfig, dt: number): void {
  const s = wonderOf(sim)
  const now = sim.elapsedMs
  for (const [eid, z] of s.sizes) {
    if (z.uid !== Uid.v[eid] || !hasComponent(sim.world, eid, Span)) {
      s.sizes.delete(eid)
      continue
    }
    if (Span.lo[eid] !== z.lo || Span.hi[eid] !== z.hi) {
      // 别的规则（换形态）改了身段：当成新的本来身段，再按体型换算
      z.lo0 = Span.lo[eid]!
      z.hi0 = Span.hi[eid]!
      z.lo = z.lo0
      z.hi = z.hi0
      if (z.now !== 0) applySize(sim, cfg, eid, z, z.now)
    }
    if (!Alive.v[eid]) {
      if (z.now !== 0) applySize(sim, cfg, eid, z, 0)
      s.sizes.delete(eid)
      continue
    }
    if (z.want !== 0 && now >= z.until) z.want = 0
    if (z.want === z.now) continue
    const f = fits(sim, cfg, eid, z, z.want)
    if (f.ok) {
      applySize(sim, cfg, eid, z, z.want)
      continue
    }
    z.squeeze = true
    const n = awayFromWall(f.basin, Transform.x[eid]!, Transform.y[eid]!)
    Transform.x[eid] = Transform.x[eid]! + n.x * SQUEEZE_U * UNIT * dt
    Transform.y[eid] = Transform.y[eid]! + n.y * SQUEEZE_U * UNIT * dt
  }
}

/** 挑一处摆茶点：离别的茶点空得开，最好离队长不远不近；蛋糕摆在变大了站得下的地方，药水还能摆进花坛和桌子底下 */
function spotFor(sim: Sim, s: WonderState, kind: Treat['kind']): Point | null {
  const sp = s.field.spots
  const pools: readonly (readonly [readonly Point[], number])[] = kind === 'cake' ? [[sp.open, 0.8], [sp.bed, 0.2]] : [[sp.open, 0.55], [sp.bed, 0.2], [sp.under, 0.25]]
  const lx = leaderX(sim)
  const ly = leaderY(sim)
  let fallback: Point | null = null
  for (let i = 0; i < 40; i++) {
    let roll = sim.rng.next()
    let pool = pools[0]![0]
    for (const [p, w] of pools) {
      if (roll < w) {
        pool = p
        break
      }
      roll -= w
    }
    if (pool.length === 0) continue
    const p = pool[Math.floor(sim.rng.next() * pool.length)]!
    if (s.treats.some((t) => Math.hypot(t.x - p.x, t.y - p.y) < TREAT_APART_U * UNIT)) continue
    fallback ??= p
    const d = Math.hypot(p.x - lx, p.y - ly) / UNIT
    if (d >= NEAR_LEADER_U[0] && d <= NEAR_LEADER_U[1]) return p
  }
  return fallback
}

/** 茶点的钟点：到点了按预警摆出新的一轮；没人吃的到时收走 */
function stepTreats(sim: Sim, cfg: WonderlandConfig): void {
  const s = wonderOf(sim)
  const sv = cfg.serve
  const now = sim.elapsedMs
  s.treats = s.treats.filter((t) => now < t.until)
  if (now < s.serveAt) return
  s.serveAt += sv.intervalMs
  for (const kind of ['cake', 'bottle'] as const) {
    const n = sim.rng.int(sv.each[0], sv.each[1])
    for (let k = 0; k < n; k++) {
      if (s.treats.filter((t) => t.kind === kind).length >= sv.max) break
      const p = spotFor(sim, s, kind)
      if (!p) break
      s.treats.push({ id: ++s.serial, kind, x: p.x, y: p.y, shownAt: now + sv.warnMs, until: now + sv.warnMs + sv.lifeMs })
    }
  }
}

/** 摆出来的茶点被脚沾着地、碰得到的身体碰到就吃掉：敌我通吃 */
function stepEating(sim: Sim, cfg: WonderlandConfig): void {
  const s = wonderOf(sim)
  const now = sim.elapsedMs
  const reach = cfg.serve.radiusU * UNIT
  if (!s.treats.some((t) => now >= t.shownAt)) return
  for (const eid of query(sim.world, [Grow, Transform, Radius, Span, Alive])) {
    if (!Alive.v[eid] || hasComponent(sim.world, eid, Pickup) || !grounded(sim.world, eid) || inTransit(eid) || isUntargetable(sim, eid)) continue
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const r = Radius.v[eid]! + reach
    const i = s.treats.findIndex((t) => now >= t.shownAt && (t.x - x) ** 2 + (t.y - y) ** 2 <= r * r)
    if (i < 0) continue
    const t = s.treats[i]!
    s.treats.splice(i, 1)
    eat(sim, cfg, eid, t)
    if (!s.treats.some((q) => now >= q.shownAt)) return
  }
}

/** 下一轮茶点还有多久、这一轮多长，毫秒 */
export function serveCountdown(sim: Sim): { leftMs: number; intervalMs: number } {
  const s = wonderOf(sim)
  const cfg = cfgOf(sim)
  const first = s.serveAt === cfg.serve.firstMs
  return { leftMs: Math.max(0, s.serveAt - sim.elapsedMs), intervalMs: first ? cfg.serve.firstMs : cfg.serve.intervalMs }
}

/**
 * 奇境：玫瑰树篱围着的黑白格草坪，树篱是硬边界；草坪上的障碍各有顶高与底下的空当：跨得过的从上面过去，矮过空当的从底下钻过去，其余的挡住。
 * 茶点按钟点摆出来，身体碰到就吃：蛋糕变大、药水变小，敌我通吃；体型改的是身段、个头、移速与质量，于是改了谁跨得过、钻得过什么，也改了好不好打中、怕不怕击退
 */
export const wonderland: WorldHooks = {
  ...bounded,
  constrainBody(sim, eid, _from, next) {
    return keepOut(passageOf(sim, eid).basin, next.x, next.y, Radius.v[eid]!)
  },
  basin(sim) {
    return normalBasin(sim)
  },
  ground(sim) {
    return wonderOf(sim).field.lawn
  },
  chaseDir(sim, eid, tx, ty) {
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const p = passageOf(sim, eid)
    const rad = Radius.v[eid]!
    const d = norm(tx - x, ty - y)
    const way = clearPath(p.basin, x, y, tx, ty, rad * 0.9) ? d : (flowDir(p.flow, x, y) ?? d)
    return alongWall(p.basin, x, y, way.x, way.y, rad + 0.3 * UNIT)
  },
  trace(sim, probe, ax, ay, bx, by) {
    return solidsTrace(wonderOf(sim).field.solids, probe, ax, ay, bx, by)
  },
  solidAt(sim, x, y) {
    return solidOf(wonderOf(sim).field.solids, x, y)
  },
  wanderDir(sim, eid, dx, dy) {
    const b = passageOf(sim, eid).basin
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
    return alongWall(passageOf(sim, eid).basin, x, y, d.x, d.y, Radius.v[eid]! + 1.5 * UNIT)
  },
  /** 刷怪点落在原样的身体走得到的草坪上、离边至少一格；头目离队长更远 */
  spawnPoint(sim, boss) {
    const b = normalBasin(sim)
    const lead = leaderPoint(sim)
    const far = SPAWN.minPlayerDist * UNIT * (boss ? 1.6 : 1)
    let p: Point = lead
    for (let i = 0; i < 48; i++) {
      p = { x: sim.rng.next() * sim.mapW, y: sim.rng.next() * sim.mapH }
      if (roomAt(b, p.x, p.y) < UNIT) continue
      if ((p.x - lead.x) ** 2 + (p.y - lead.y) ** 2 >= far * far) return p
    }
    return openNear(sim, p, UNIT)
  },
  center(sim) {
    const st = wonderOf(sim).plan.start
    return { x: st.x * UNIT, y: st.y * UNIT }
  },
  settle(sim, p) {
    return openNear(sim, p, SPAWN.edgeInset * UNIT)
  },
  canSpawn(sim, x, y, radius) {
    return roomFor(normalBasin(sim), x, y, radius)
  },
  landmarks(sim) {
    return wonderOf(sim).marks
  },
  onStart(sim) {
    wonderOf(sim)
  },
  /** 茶点的钟点与吃茶点、体型的变化；隔一阵按队长重算各种过法的寻路 */
  tick(sim, delta) {
    const cfg = cfgOf(sim)
    const s = wonderOf(sim)
    stepTreats(sim, cfg)
    stepEating(sim, cfg)
    stepSizes(sim, cfg, Math.min(delta, 50) / 1000)
    s.flowIn -= delta
    if (s.flowIn > 0) return
    s.flowIn = FLOW_MS
    for (const p of s.field.passages.values()) if (sim.elapsedMs - p.usedAt <= FLOW_IDLE_MS) flowFrom(p.flow, leaderX(sim), leaderY(sim))
  },
}
