import { hasComponent } from 'bitecs'
import { UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { MAPS } from '../../data/maps'
import { SPAWN } from '../../data/enemies'
import { Alive, Pickup, Radius, Transform } from '../../ecs/components'
import { fleeSteer } from '../../ecs/systems/shared/steer'
import { leaderPoint } from '../../ecs/utils/team'
import { clearM, grounded, passCost, probeZ, topOf } from '../../ecs/utils/pass'
import { makeSolids, solidOf, solidsTrace } from '../../ecs/worlds/solids'
import { bounded, groundOf, wanderIn } from '../../ecs/worlds/hooks'
import { alongWall, keepOut, roomAt } from '../basin'
import { roomFor } from '../landmark'
import { distances, flowGrid, gearAt, nearestPass, outpostMarks, outpostPlan, passNow, segDist } from './layout'
import { emit, fenceHit, fenceOut, live, makeFences, overload, stepFences } from './model'
import type { FlowGrid, OutpostPlan } from './layout'
import type { Fences } from './model'
import type { Solids } from '../../ecs/worlds/solids'
import type { Crossing } from '../../ecs/utils/pass'
import type { OutpostConfig } from '../../types/maps'
import type { Landmark } from '../landmark'
import type { Point } from '../../util/vec'
import type { Sim } from '../../ecs/sim'
import type { WorldHooks } from '../../ecs/worlds/hooks'

/** 前哨按布景种子打散出自己的种子 */
const PLAN_SEED = 0x0b5e7a
/** 寻路按这么宽（格）的身体留余量：比标准身体窄，挤得过的缝照走，挤不过的由碰撞滑开 */
const FLOW_CLEAR_U = 0.32
/** 同一具身体撞在光墙上，至少隔这么久（毫秒）才再泛一圈涟漪 */
const RIPPLE_MS = 420
/** 走得比这（格/帧）还远的一步是跳、瞬移、放置：也不许穿过亮着的光墙 */
const WALK_STEP_U = 1

/**
 * 前哨此刻：按种子定下的台地、围栏与设施，地标；围栏的开关与计时；挡弹体与视线的设施；
 * 寻路的格子、此刻能走的格子与到队长的路程，按哪一版围栏、哪一格的队长、几时算的；每具身体上次撞出涟漪的时刻
 */
export interface OutpostState {
  readonly plan: OutpostPlan
  readonly marks: Readonly<Record<string, readonly Landmark[]>>
  readonly fences: Fences
  readonly solids: Solids
  readonly grid: FlowGrid
  readonly pass: Uint8Array
  readonly dist: Float32Array
  flow: { version: number; cell: number; at: number }
  readonly bumped: Map<number, number>
}

function cfgOf(sim: Sim): OutpostConfig {
  return MAPS[sim.mapId].outpost!
}

/** 这一局的前哨：视图要它画，规则要它定一切，两边按同一个种子各要一次 */
export function outpostPlanFor(cfg: OutpostConfig, decorSeed: number): OutpostPlan {
  return outpostPlan(cfg, (decorSeed ^ PLAN_SEED) >>> 0)
}

export function outpostOf(sim: Sim): OutpostState {
  let s = sim.worldState.outpost
  if (!s) {
    const cfg = cfgOf(sim)
    const plan = outpostPlanFor(cfg, sim.run.decorSeed)
    const b = plan.basin
    const grid = flowGrid(plan, cfg, FLOW_CLEAR_U)
    s = {
      plan,
      marks: outpostMarks(plan),
      fences: makeFences(plan),
      solids: makeSolids((x, y) => gearAt(plan, cfg, x / UNIT, y / UNIT), b.x0, b.y0, b.cols, b.rows, b.cell),
      grid,
      pass: new Uint8Array(grid.base.length),
      dist: new Float32Array(grid.base.length),
      flow: { version: -1, cell: -1, at: -Infinity },
      bumped: new Map(),
    }
    sim.worldState.outpost = s
  }
  return s
}

/** 到队长的路程：围栏变了立刻重算，队长换了格子过了 reflowMs 才重算 */
function flowOf(sim: Sim, s: OutpostState): Float32Array {
  const lead = leaderPoint(sim)
  const f = s.fences
  const now = sim.elapsedMs
  const changed = s.flow.version !== f.version
  if (changed) passNow(s.grid, (seg) => live(f, s.plan, seg, now), s.pass)
  const cell = nearestPass(s.grid, s.pass, lead.x / UNIT, lead.y / UNIT)
  if (!changed && (cell === s.flow.cell || now - s.flow.at < cfgOf(sim).reflowMs)) return s.dist
  distances(s.grid, s.pass, cell, s.dist)
  s.flow = { version: f.version, cell, at: now }
  return s.dist
}

/** 寻路在 (x, y) 格处往下走的方向；到不了队长的地方返回 null */
function descend(s: OutpostState, dist: Float32Array, x: number, y: number): Point | null {
  const g = s.grid
  const fx = x / g.cell
  const fy = y / g.cell
  const ci = Math.floor(fx)
  const cj = Math.floor(fy)
  if (ci < 0 || cj < 0 || ci >= g.cols || cj >= g.rows) return null
  const here = dist[cj * g.cols + ci]!
  let sx = 0
  let sy = 0
  let best = here
  let bx = 0
  let by = 0
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      if (di === 0 && dj === 0) continue
      const i = ci + di
      const j = cj + dj
      if (i < 0 || j < 0 || i >= g.cols || j >= g.rows) continue
      const d = dist[j * g.cols + i]!
      if (!Number.isFinite(d)) continue
      const ox = i + 0.5 - fx
      const oy = j + 0.5 - fy
      const len = Math.hypot(ox, oy) || 1
      if (d < best) {
        best = d
        bx = ox / len
        by = oy / len
      }
      if (Number.isFinite(here) && d < here) {
        const w = (here - d) / Math.hypot(di, dj)
        sx += (w * ox) / len
        sy += (w * oy) / len
      }
    }
  }
  const len = Math.hypot(sx, sy)
  if (len > 1e-6) return { x: sx / len, y: sy / len }
  if (best < here) return { x: bx, y: by }
  return null
}

/** (x, y) 像素离壁、离矮设施与亮着的光墙多远，像素 */
function roomPx(sim: Sim, s: OutpostState, x: number, y: number): number {
  const cfg = cfgOf(sim)
  let r = Math.min(roomAt(s.plan.basin, x, y), roomAt(s.plan.low, x, y))
  const u = x / UNIT
  const v = y / UNIT
  const now = sim.elapsedMs
  s.plan.segments.forEach((g, k) => {
    if (live(s.fences, s.plan, k, now)) r = Math.min(r, (segDist(g.ax, g.ay, g.bx, g.by, u, v) - cfg.fence.thickU / 2) * UNIT)
  })
  return r
}

/** 离壁、离光墙至少 room 像素的一点：从 p 往外一圈圈找，近处找不到就退回站心 */
function openNear(sim: Sim, s: OutpostState, p: Point, room: number): Point {
  for (let r = 0; r <= 8 * UNIT; r += 0.5 * UNIT) {
    const n = r === 0 ? 1 : Math.ceil((r * Math.PI * 2) / (0.5 * UNIT))
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2
      const q = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r }
      if (roomPx(sim, s, q.x, q.y) >= room) return q
    }
  }
  return { x: s.plan.cx * UNIT, y: s.plan.cy * UNIT }
}

/** 离亮着的光墙 reach 像素以内几乎正对着它走时改成顺着它走 */
function alongFence(sim: Sim, s: OutpostState, x: number, y: number, dx: number, dy: number, reach: number): Point {
  const u = x / UNIT
  const v = y / UNIT
  const now = sim.elapsedMs
  const segs = s.plan.segments
  for (let k = 0; k < segs.length; k++) {
    if (!live(s.fences, s.plan, k, now)) continue
    const g = segs[k]!
    if (segDist(g.ax, g.ay, g.bx, g.by, u, v) * UNIT > reach) continue
    const ex = g.bx - g.ax
    const ey = g.by - g.ay
    const len = Math.hypot(ex, ey) || 1
    let nx = -ey / len
    let ny = ex / len
    if ((u - g.ax) * nx + (v - g.ay) * ny < 0) {
      nx = -nx
      ny = -ny
    }
    if (dx * nx + dy * ny > -0.5) continue
    const side = dy * nx - dx * ny >= 0 ? 1 : -1
    return { x: -ny * side, y: nx * side }
  }
  return { x: dx, y: dy }
}

/** 线段 a→b（像素）上第一处亮着的光墙：探测在光墙的顶以下才算碰上 */
function fenceCrossing(sim: Sim, s: OutpostState, probe: Parameters<NonNullable<WorldHooks['trace']>>[1], ax: number, ay: number, bx: number, by: number): Crossing | null {
  if (passCost(probe, 'field') <= 0) return null
  const h = fenceHit(s.fences, s.plan, sim.elapsedMs, ax / UNIT, ay / UNIT, bx / UNIT, by / UNIT)
  if (!h || probeZ(probe, h.t) >= topOf(cfgOf(sim).fence.heightM)) return null
  return { t0: h.t, t1: h.t, material: 'field' }
}

/** 一具身体撞上了光墙：隔一阵记一圈涟漪给画面 */
function bump(sim: Sim, s: OutpostState, eid: number, seg: number, hx: number, hy: number, power: number): void {
  const now = sim.elapsedMs
  const last = s.bumped.get(eid)
  if (last !== undefined && now - last < RIPPLE_MS) return
  s.bumped.set(eid, now)
  if (s.bumped.size > 512) s.bumped.clear()
  emit(s.fences, { kind: 'ripple', seg, x: hx * UNIT, y: hy * UNIT, power, at: now })
}

/** 矮设施（太阳能板、矮晶簇）的顶：跨得过它的身体不受挡 */
function lowTop(cfg: OutpostConfig): number {
  return topOf(Math.max(cfg.gear.panelM, cfg.crystals.lowM))
}

/**
 * 前哨：能走的是岩脊围着的台地，岩脊、圆顶舱、天线、立柱与高的晶簇是硬边界；太阳能板与矮晶簇只挡跨不过它的身体。
 * 亮着的光墙挡一切身体（穿墙的也过不去）、挡弹体与视线；熄了就只剩立柱。队伍里有人站上控制台就切换那一组，过一阵自己复位。
 * 敌人按此刻亮着的围栏寻路，到不了队长就顶着光墙往前挤；破坏力打中亮着的一段，那段过载熄一阵
 */
export const outpost: WorldHooks = {
  ...bounded,
  surface(sim) {
    return groundOf(sim)
  },
  constrainBody(sim, eid, from, next) {
    const s = outpostOf(sim)
    const cfg = cfgOf(sim)
    const r = Radius.v[eid]!
    let p = keepOut(s.plan.basin, next.x, next.y, r)
    if (clearM(eid) < lowTop(cfg)) p = keepOut(s.plan.low, p.x, p.y, r)
    if (hasComponent(sim.world, eid, Pickup)) return p
    const f = fenceOut(s.fences, s.plan, cfg, sim.elapsedMs, { x: from.x / UNIT, y: from.y / UNIT }, { x: p.x / UNIT, y: p.y / UNIT }, r / UNIT)
    if (f.seg < 0) return p
    const step = Math.hypot(next.x - from.x, next.y - from.y) / UNIT
    if (step < WALK_STEP_U) bump(sim, s, eid, f.seg, f.hx, f.hy, Math.min(1, step / Math.max(0.02, (sim.dtMs / 1000) * 6)))
    return keepOut(s.plan.basin, f.x * UNIT, f.y * UNIT, r)
  },
  basin(sim) {
    return outpostOf(sim).plan.basin
  },
  ground(sim) {
    return outpostOf(sim).plan.basin
  },
  chaseDir(sim, eid, tx, ty) {
    const s = outpostOf(sim)
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const rad = Radius.v[eid]!
    let d = norm(tx - x, ty - y)
    const lead = leaderPoint(sim)
    if ((tx - lead.x) ** 2 + (ty - lead.y) ** 2 < (3 * UNIT) ** 2 && (tx - x) ** 2 + (ty - y) ** 2 > (1.2 * UNIT) ** 2) {
      const dir = descend(s, flowOf(sim, s), x / UNIT, y / UNIT)
      if (dir) d = dir
    }
    const w = alongWall(s.plan.basin, x, y, d.x, d.y, rad + 0.3 * UNIT)
    return alongFence(sim, s, x, y, w.x, w.y, rad + 0.3 * UNIT)
  },
  trace(sim, probe, ax, ay, bx, by) {
    const s = outpostOf(sim)
    const a = solidsTrace(s.solids, probe, ax, ay, bx, by)
    const b = fenceCrossing(sim, s, probe, ax, ay, bx, by)
    if (!a) return b
    if (!b) return a
    return b.t0 < a.t0 ? b : a
  },
  /** 亮着的光墙按它的高算，其余按设施 */
  solidAt(sim, x, y) {
    const s = outpostOf(sim)
    const cfg = cfgOf(sim)
    const u = x / UNIT
    const v = y / UNIT
    const now = sim.elapsedMs
    for (let k = 0; k < s.plan.segments.length; k++) {
      const g = s.plan.segments[k]!
      if (live(s.fences, s.plan, k, now) && segDist(g.ax, g.ay, g.bx, g.by, u, v) < cfg.fence.thickU / 2) return { topM: cfg.fence.heightM, material: 'field' }
    }
    return solidOf(s.solids, x, y)
  },
  /** 破坏力打到亮着的光墙：那一段过载熄掉，不耗破坏力 */
  breach(sim, x, y, z, r) {
    const s = outpostOf(sim)
    const cfg = cfgOf(sim)
    if (z >= topOf(cfg.fence.heightM)) return 0
    const u = x / UNIT
    const v = y / UNIT
    const reach = r / UNIT + cfg.fence.thickU / 2
    s.plan.segments.forEach((g, k) => {
      if (segDist(g.ax, g.ay, g.bx, g.by, u, v) < reach) overload(s.fences, s.plan, cfg, k, sim.elapsedMs)
    })
    return 0
  },
  /** 弹体打在光墙上泛起涟漪 */
  impact(sim, x, y, material) {
    if (material !== 'field') return
    const s = outpostOf(sim)
    const h = fenceHit(s.fences, s.plan, sim.elapsedMs, x / UNIT - 0.3, y / UNIT, x / UNIT + 0.3, y / UNIT) ?? fenceHit(s.fences, s.plan, sim.elapsedMs, x / UNIT, y / UNIT - 0.3, x / UNIT, y / UNIT + 0.3)
    emit(s.fences, { kind: 'ripple', seg: h?.seg ?? -1, x, y, power: 0.45, at: sim.elapsedMs })
  },
  wanderDir(sim, eid, dx, dy) {
    const s = outpostOf(sim)
    const w = wanderIn(s.plan.basin, eid, dx, dy)
    return alongFence(sim, s, Transform.x[eid]!, Transform.y[eid]!, w.x, w.y, Radius.v[eid]! + 0.6 * UNIT)
  },
  fleeDir(sim, eid, awayX, awayY) {
    const s = outpostOf(sim)
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const d = fleeSteer(x, y, awayX, awayY, sim.mapW, sim.mapH, 1.5 * UNIT)
    const w = alongWall(s.plan.basin, x, y, d.x, d.y, Radius.v[eid]! + 1.5 * UNIT)
    return alongFence(sim, s, x, y, w.x, w.y, Radius.v[eid]! + 1.5 * UNIT)
  },
  /** 怪多从外圈围栏外的荒野里来：先在荒野里挑离队长够远的一点（出怪口按它吸到岩脊或裂缝上），偶尔挑站里的；头目离队长更远 */
  spawnPoint(sim, boss) {
    const s = outpostOf(sim)
    const cfg = cfgOf(sim)
    const plan = s.plan
    const lead = leaderPoint(sim)
    const far = SPAWN.minPlayerDist * UNIT * (boss ? 1.6 : 1)
    let p: Point = { x: plan.cx * UNIT, y: plan.cy * UNIT }
    for (let i = 0; i < 64; i++) {
      const a = sim.rng.next() * Math.PI * 2
      const wild = sim.rng.next() < 0.85
      const lo = wild ? cfg.frame.ringU[1] + 1 : cfg.frame.hubU + 1
      const hi = wild ? cfg.site.radiusU + cfg.site.wobbleU : cfg.frame.ringU[0]
      const d = (lo + sim.rng.next() * (hi - lo)) * UNIT
      p = { x: plan.cx * UNIT + Math.cos(a) * d, y: plan.cy * UNIT + Math.sin(a) * d }
      if (roomPx(sim, s, p.x, p.y) < 0.6 * UNIT) continue
      if ((p.x - lead.x) ** 2 + (p.y - lead.y) ** 2 >= far * far) return p
    }
    return openNear(sim, s, p, UNIT)
  },
  center(sim) {
    const plan = outpostOf(sim).plan
    return { x: plan.cx * UNIT, y: plan.cy * UNIT }
  },
  settle(sim, p) {
    return openNear(sim, outpostOf(sim), p, SPAWN.edgeInset * UNIT)
  },
  /** 站得下：离壁、离矮设施与亮着的光墙都留得出身体 */
  canSpawn(sim, x, y, radius) {
    const s = outpostOf(sim)
    return roomFor(s.plan.basin, x, y, radius) && roomPx(sim, s, x, y) >= Math.max(0.5 * UNIT, radius)
  },
  landmarks(sim) {
    return outpostOf(sim).marks
  },
  /** 按此刻亮着的围栏寻路的路程；隔着光墙到不了就是 Infinity */
  toLeader(sim, x, y) {
    const s = outpostOf(sim)
    const dist = flowOf(sim, s)
    const k = nearestPass(s.grid, s.pass, x / UNIT, y / UNIT)
    return k < 0 ? Infinity : dist[k]! * s.grid.cell * UNIT
  },
  onStart(sim) {
    outpostOf(sim)
  },
  /** 队伍里活着、脚沾地的人站上哪台控制台；围栏照此推进 */
  tick(sim) {
    const s = outpostOf(sim)
    const plan = s.plan
    stepFences(s.fences, plan, cfgOf(sim), sim.elapsedMs, (c) => {
      const con = plan.consoles[c]!
      for (const m of sim.characters) {
        if (!Alive.v[m] || !grounded(sim.world, m)) continue
        if (Math.hypot(Transform.x[m]! / UNIT - con.x, Transform.y[m]! / UNIT - con.y) < con.r) return true
      }
      return false
    })
  },
}
