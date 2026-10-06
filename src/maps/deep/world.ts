import { hasComponent } from 'bitecs'
import { UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { MAPS } from '../../data/maps'
import { SPAWN } from '../../data/enemies'
import { OBSTACLES } from '../../data/obstacles'
import { Alive, Hp, Radius, Slot, Transform } from '../../ecs/components'
import { hit } from '../../ecs/systems/shared/damage'
import { fleeSteer } from '../../ecs/systems/shared/steer'
import { staminaLeft } from '../../ecs/systems/shared/stamina'
import { inTransit } from '../../ecs/utils/marks'
import { hazardSource } from '../../ecs/utils/source'
import { leaderPoint } from '../../ecs/utils/team'
import { passCost, phases, probeZ } from '../../ecs/utils/pass'
import { bounded } from '../../ecs/worlds/hooks'
import { makeSolids, solidOf, solidsTrace } from '../../ecs/worlds/solids'
import { alongWall, awayFromWall, keepOut, roomAt } from '../basin'
import { roomFor } from '../landmark'
import { aroundShell, atDoor, bellTarget, breathable, doorMid, fits, fromShell, homePose, innerOf, intoDoor, newBell, offShell, outOfShell, rimOf, shellGap, shellOf, stepBell } from './bell'
import { deepPlan, floorDepth, inBoulder, inSkull, reachOf, toLocal } from './layout'
import type { Bell, BellPhase, Berth, Pose, Shell } from './bell'
import type { Crossing, Probe } from '../../ecs/utils/pass'
import type { DeepPlan, Local, Reach } from './layout'
import type { DeepConfig } from '../../types/maps'
import type { Point } from '../../util/vec'
import type { Sim } from '../../ecs/sim'
import type { Solid, Solids } from '../../ecs/worlds/solids'
import type { WorldHooks } from '../../ecs/worlds/hooks'

/** 暖海按布景种子打散出自己的种子 */
const PLAN_SEED = 0x0de9c5
const DROWN_TINT = 0x4fc3f7

/** 暖海此刻的状态：按种子生成的礁湖与它的实心，钟身的样子与开局坐的地方，潜水钟，上一帧潜水钟在哪一段，下一次结算呛水在几时 */
export interface DeepState extends Berth {
  readonly solids: Solids
  readonly home: Pose
  readonly bell: Bell
  seen: BellPhase
  drownAt: number
}

const ROCK: Solid = { topM: Infinity, material: 'rock' }
/** 沿钟壁一圈取几个点：挑落点、落地扬沙都按它 */
const RIM_POINTS = 48
const L: Local = { a: 0, b: 0 }
const R: Reach = { low: 0, high: 0, rubble: 0, lip: 0 }

/** 礁墙与礁石堆高过一切；珊瑚头与头骨按它们的高；陡坎外是悬空的水，子弹和视线从上面过去 */
function solidsOf(cfg: DeepConfig, plan: DeepPlan): Solids {
  const b = plan.basin
  const at = (x: number, y: number): Solid | null => {
    if (roomAt(b, x, y) >= 0) return null
    const gx = x / UNIT
    const gy = y / UNIT
    for (const s of plan.boulders) if (inBoulder(s, gx, gy) > 0) return { topM: s.h, material: 'rock' }
    if (inSkull(plan.whale, gx, gy)) return { topM: cfg.whale.skullM, material: 'rock' }
    toLocal(plan.frame, gx, gy, L)
    reachOf(plan.edges, L.a, L.b, R)
    if (R.lip < 0.3 && R.low > 0 && R.high > 0 && floorDepth(plan.edges, L.a, L.b) < 0.3) return null
    return ROCK
  }
  return makeSolids(at, b.x0, b.y0, b.cols, b.rows, b.cell)
}

function cfgOf(sim: Sim): DeepConfig {
  return MAPS[sim.mapId].deep!
}

/** 这一局的礁湖：视图与规则按同一个种子各要一次 */
export function deepPlanFor(cfg: DeepConfig, decorSeed: number): DeepPlan {
  return deepPlan(cfg, (decorSeed ^ PLAN_SEED) >>> 0)
}

export function deepOf(sim: Sim): DeepState {
  let s = sim.worldState.deep
  if (!s) {
    const cfg = cfgOf(sim)
    const plan = deepPlanFor(cfg, sim.run.decorSeed)
    const shell = shellOf(cfg.bell)
    const berth: Berth = { plan, shell, rim: rimOf(shell, RIM_POINTS), inner: innerOf(shell, 0.5) }
    const home = homePose(berth, cfg.bell)
    s = { ...berth, solids: solidsOf(cfg, plan), home, bell: newBell(cfg.bell, home), seen: 'down', drownAt: 0 }
    sim.worldState.deep = s
  }
  return s
}

/** (x, y) 此刻换不换得上气：潜水钟坐着、在钟口那一片里 */
export function breathesAt(cfg: DeepConfig, s: DeepState, x: number, y: number): boolean {
  return breathable(s.bell) && atDoor(s.shell, cfg.bell, s.bell, x, y)
}

/** 钟底低过一个身体的高，钟身挡人 */
export function grounded(bell: Bell): boolean {
  return bell.h < OBSTACLES.body.heightM
}

/** 线段 a→b（像素）上穿过钟身的那一截：钟身从钟底往上高 tallM 米，探测在那一截的高度碰得上钟身、又要贯穿才过得去就挡下 */
function shellTrace(h: Shell, bell: Bell, tallM: number, probe: Probe, ax: number, ay: number, bx: number, by: number): Crossing | null {
  if (passCost(probe, 'bronze') <= 0) return null
  const dx = bx - ax
  const dy = by - ay
  const ox = ax - bell.x
  const oy = ay - bell.y
  const R = h.r * UNIT
  const a = dx * dx + dy * dy
  if (a < 1e-9) return null
  const b = ox * dx + oy * dy
  const disc = b * b - a * (ox * ox + oy * oy - R * R)
  if (disc <= 0) return null
  const q = Math.sqrt(disc)
  const t0 = Math.max(0, (-b - q) / a)
  const t1 = Math.min(1, (-b + q) / a)
  if (t1 <= t0) return null
  const z0 = probeZ(probe, t0)
  const z1 = probeZ(probe, t1)
  if (Math.max(z0, z1) < bell.h || Math.min(z0, z1) > bell.h + tallM) return null
  return { t0, t1, material: 'bronze' }
}

/** 沙底上离边与礁石至少 room 像素的一点：从 p 往外一圈圈找，近处找不到就退回开局站位 */
function openNear(plan: DeepPlan, p: Point, room: number): Point {
  const b = plan.basin
  for (let r = 0; r <= 8 * UNIT; r += 0.5 * UNIT) {
    const n = r === 0 ? 1 : Math.ceil((r * Math.PI * 2) / (0.5 * UNIT))
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2
      const q = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r }
      if (roomAt(b, q.x, q.y) >= room) return q
    }
  }
  return { x: plan.start.x * UNIT, y: plan.start.y * UNIT }
}

/** 潜水钟的新落点：离旧的 moveU 格之间、朝向随意，坐得下（钟壁离边与礁石至少 roomU 格）；先不压着队长，挑不到再不管；还挑不到就放回开局坐的地方，已经在那就原地放回去 */
function landing(sim: Sim, cfg: DeepConfig, s: DeepState, from: Pose): Pose {
  const c = cfg.bell
  const room = c.roomU * UNIT
  const lead = leaderPoint(sim)
  const [near, far] = c.moveU
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < 64; i++) {
      const dir = sim.rng.next() * Math.PI * 2
      const d = (near + (far - near) * sim.rng.next()) * UNIT
      const p = { x: from.x + Math.cos(dir) * d, y: from.y + Math.sin(dir) * d, a: sim.rng.next() * Math.PI * 2 }
      if (!fits(s, c, p, room)) continue
      if (pass === 0 && shellGap(s.shell, p, lead.x, lead.y) < UNIT) continue
      return p
    }
  }
  return Math.hypot(s.home.x - from.x, s.home.y - from.y) > UNIT ? { ...s.home } : { ...from }
}

/** 潜水钟离开沙底、落回沙底时沿钟壁扬起一圈细沙 */
function stir(sim: Sim, s: DeepState): void {
  for (let i = 0; i < s.rim.length; i += 3) {
    const q = s.rim[i]!
    const p = fromShell(s.bell, q.u * 1.12, q.v * 1.12)
    sim.out.bursts.push({ x: p.x, y: p.y, count: 4, kind: 'silt' })
  }
}

/** 气见底、又不在钟口的队员呛水掉血：满血的标准身体 drownSec 秒呛死，每 tickMs 结算一次 */
function drown(sim: Sim, s: DeepState, cfg: DeepConfig): void {
  const now = sim.elapsedMs
  if (now < s.drownAt) return
  const c = cfg.bell
  s.drownAt = now + c.tickMs
  const src = hazardSource('drown', DROWN_TINT)
  for (const m of sim.characters) {
    if (!Alive.v[m] || inTransit(m) || staminaLeft(m) > 0 || breathesAt(cfg, s, Transform.x[m]!, Transform.y[m]!)) continue
    hit(sim, src, m, Math.max(1, Math.round((Hp.max[m]! * c.tickMs) / 1000 / c.drownSec)), { tick: true })
  }
}

/**
 * 暖海：能走的是两侧礁墙、上游礁石堆与下游礁坡外缘的陡坎围着的一片沙底，沙底的珊瑚头与鲸鱼的头骨挡路；礁墙和礁石堆挡子弹和视线，珊瑚头和头骨按高矮挡，陡坎外悬空，子弹从上面过去。
 * 一口潜水钟坐在沙底上，钟身挡人、挡子弹也挡视线，敌人贴着钟壁绕过来；只有一侧开着钟口，钟口那一片半圆换得上气。
 * 队员离开钟口只能憋着气：体力不回，一直往下掉，赶路掉得更快；回到钟口走着也补。气见底了呛水掉血。
 * 潜水钟隔一阵被水面上的船吊起来挪到别处放下：吊走的那一阵哪里都换不了气，钟底高过身体就不再挡人，落下来压着谁就把谁挤开。海里的东西不用换气
 */
export const deep: WorldHooks = {
  ...bounded,
  breath(sim, eid) {
    if (!hasComponent(sim.world, eid, Slot)) return 0
    const cfg = cfgOf(sim)
    return breathesAt(cfg, deepOf(sim), Transform.x[eid]!, Transform.y[eid]!) ? cfg.bell.breath : -cfg.bell.hold
  },
  beacon(sim) {
    const s = deepOf(sim)
    return doorMid(s.shell, cfgOf(sim).bell, bellTarget(s.bell))
  },
  /** 队长站在钟口换气时，落在钟口那一片外面的坑位挪进来：跟着的队员也换得上气 */
  seat(sim, from, at) {
    const s = deepOf(sim)
    const cfg = cfgOf(sim)
    if (!breathesAt(cfg, s, from.x, from.y) || atDoor(s.shell, cfg.bell, s.bell, at.x, at.y)) return at
    return intoDoor(s.shell, cfg.bell, s.bell, at, 0.5)
  },
  constrainBody(sim, eid, from, next) {
    if (phases(sim.world, eid, 'rock')) return bounded.constrainBody(sim, eid, from, next)
    const s = deepOf(sim)
    const r = Radius.v[eid]!
    const p = grounded(s.bell) ? outOfShell(s.shell, s.bell, next.x, next.y, r) : next
    return keepOut(s.plan.basin, p.x, p.y, r)
  },
  basin(sim) {
    return deepOf(sim).plan.basin
  },
  ground(sim) {
    return deepOf(sim).plan.basin
  },
  chaseDir(sim, eid, tx, ty) {
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    if (phases(sim.world, eid, 'rock')) return norm(tx - x, ty - y)
    const s = deepOf(sim)
    const r = Radius.v[eid]!
    const w = grounded(s.bell) ? aroundShell(s.shell, s.bell, x, y, tx, ty, r) : norm(tx - x, ty - y)
    return alongWall(s.plan.basin, x, y, w.x, w.y, r + 0.3 * UNIT)
  },
  trace(sim, probe, ax, ay, bx, by) {
    const s = deepOf(sim)
    const rock = solidsTrace(s.solids, probe, ax, ay, bx, by)
    const shell = shellTrace(s.shell, s.bell, cfgOf(sim).bell.heightM, probe, ax, ay, bx, by)
    return shell && (!rock || shell.t0 < rock.t0) ? shell : rock
  },
  solidAt(sim, x, y) {
    const s = deepOf(sim)
    if (grounded(s.bell) && shellGap(s.shell, s.bell, x, y) < 0) return { topM: s.bell.h + cfgOf(sim).bell.heightM, material: 'bronze' }
    return solidOf(s.solids, x, y)
  },
  wanderDir(sim, eid, dx, dy) {
    const s = deepOf(sim)
    const b = s.plan.basin
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const r = Radius.v[eid]!
    const d = grounded(s.bell) ? offShell(s.shell, s.bell, x, y, { x: dx, y: dy }, r + 0.6 * UNIT) : { x: dx, y: dy }
    if (roomAt(b, x, y) > r + 0.6 * UNIT) return d
    const n = awayFromWall(b, x, y)
    const dot = d.x * n.x + d.y * n.y
    return dot >= 0 ? d : { x: d.x - 2 * dot * n.x, y: d.y - 2 * dot * n.y }
  },
  fleeDir(sim, eid, awayX, awayY) {
    const s = deepOf(sim)
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const r = Radius.v[eid]!
    const f = fleeSteer(x, y, awayX, awayY, sim.mapW, sim.mapH, 1.5 * UNIT)
    const d = grounded(s.bell) ? offShell(s.shell, s.bell, x, y, f, r + 0.6 * UNIT) : f
    return alongWall(s.plan.basin, x, y, d.x, d.y, r + 1.5 * UNIT)
  },
  /** 刷怪点落在沙底上、离边与礁石至少一格，不压着潜水钟；头目离队长更远 */
  spawnPoint(sim, boss) {
    const s = deepOf(sim)
    const plan = s.plan
    const lead = leaderPoint(sim)
    const far = SPAWN.minPlayerDist * UNIT * (boss ? 1.6 : 1)
    let p: Point = { x: plan.start.x * UNIT, y: plan.start.y * UNIT }
    for (let i = 0; i < 48; i++) {
      p = { x: sim.rng.next() * sim.mapW, y: sim.rng.next() * sim.mapH }
      if (roomAt(plan.basin, p.x, p.y) < UNIT || shellGap(s.shell, s.bell, p.x, p.y) < UNIT) continue
      if ((p.x - lead.x) ** 2 + (p.y - lead.y) ** 2 >= far * far) return p
    }
    const q = openNear(plan, p, UNIT)
    return outOfShell(s.shell, s.bell, q.x, q.y, UNIT)
  },
  center(sim) {
    const st = deepOf(sim).plan.start
    return { x: st.x * UNIT, y: st.y * UNIT }
  },
  settle(sim, p) {
    const s = deepOf(sim)
    const q = openNear(s.plan, p, SPAWN.edgeInset * UNIT)
    return grounded(s.bell) ? outOfShell(s.shell, s.bell, q.x, q.y, SPAWN.edgeInset * UNIT) : q
  },
  canSpawn(sim, x, y, radius) {
    const s = deepOf(sim)
    return roomFor(s.plan.basin, x, y, radius) && (!grounded(s.bell) || shellGap(s.shell, s.bell, x, y) >= radius + 0.2 * UNIT)
  },
  landmarks(sim) {
    return deepOf(sim).plan.marks
  },
  onStart(sim) {
    deepOf(sim)
  },
  /** 潜水钟按时吊走、放下，离底与落底时扬起一圈细沙；呛水按节拍结算 */
  tick(sim) {
    const cfg = cfgOf(sim)
    const s = deepOf(sim)
    const c = cfg.bell
    stepBell(
      s.bell,
      cfg,
      sim.elapsedMs,
      (from) => landing(sim, cfg, s, from),
      () => c.intervalMs + (sim.rng.next() * 2 - 1) * c.jitterMs,
    )
    if (s.bell.phase !== s.seen) {
      if (s.bell.phase === 'rise' || (s.bell.phase === 'down' && s.seen === 'settle')) stir(sim, s)
      s.seen = s.bell.phase
    }
    drown(sim, s, cfg)
  },
}
