import { hasComponent, query } from 'bitecs'
import { UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { MAPS } from '../../data/maps'
import { SPAWN } from '../../data/enemies'
import { OBSTACLES } from '../../data/obstacles'
import { Alive, Boss, ENEMY_SET, Hp, Radius, Slot, Transform, Uid } from '../../ecs/components'
import { hit } from '../../ecs/systems/shared/damage'
import { displace, FORCED, movable } from '../../ecs/systems/shared/displace'
import { fleeSteer } from '../../ecs/systems/shared/steer'
import { inTransit } from '../../ecs/utils/marks'
import { hazardSource } from '../../ecs/utils/source'
import { leaderPoint } from '../../ecs/utils/team'
import { bandOf, grounded, phases } from '../../ecs/utils/pass'
import { bounded, groundOf, wanderIn } from '../../ecs/worlds/hooks'
import { makeSolids, solidOf, solidsTrace } from '../../ecs/worlds/solids'
import { alongWall, keepOut, roomAt } from '../basin'
import { roomFor } from '../landmark'
import { altarSd, plateRect, rectSd, snoutRect, templePlan, toLocal, toMap } from './layout'
import type { DartTrap, Local, Rect, TemplePlan, Trap } from './layout'
import type { Hazard, TempleConfig, TrapHarm } from '../../types/maps'
import type { Point } from '../../util/vec'
import type { Sim } from '../../ecs/sim'
import type { Solid, Solids } from '../../ecs/worlds/solids'
import type { WorldHooks } from '../../ecs/worlds/hooks'

/** 神庙按布景种子打散出自己的种子 */
const PLAN_SEED = 0x7e4917
/** 飞镖的半径（格）：镖身碰上身体的边就算钉住 */
const DART_U = 0.08
/** 压板认身体：身子的中心落进压板外扩半径这么多成的方块里，就算踩在上面 */
const FOOT_FRAC = 0.4
/** 刺阵、陷坑认身体：中心离它的边不出半径这么多成 */
const FIELD_FRAC = 0.35
/** 滚石从斜槽口滚下来，前这么多秒按缓起的速度，之后匀速 */
const ROLL_EASE_S = 0.7
/** 掉进陷坑的身体爬上来时落在坑边外多远（格） */
const CLIMB_OUT_U = 0.35

const TINT: Record<Trap['kind'], number> = { darts: 0xd7ccc8, spikes: 0xbcaaa4, boulder: 0x8d6e63, pit: 0x5d4037 }
const HAZARD: Record<Trap['kind'], Hazard> = { darts: 'dart', spikes: 'spike', boulder: 'boulder', pit: 'pit' }

/** 一处机关此刻走到哪一步：复位好了等人踩、踩下去等发动、正在发动、发动完在复位；at 是这一步从几时开始（毫秒），struck 是这一次发动已经伤过的身体 */
export type TrapPhase = 'armed' | 'primed' | 'firing' | 'rearm'

export interface TrapRun {
  phase: TrapPhase
  at: number
  readonly struck: Set<number>
  /** 滚石：滚到本地 a 的哪里了（格） */
  roll: number
  /** 飞镖：已经喷出几排 */
  rows: number
}

/** 一支飞在空中的镖：本地坐标（格），顺着 b 飞的方向；钉在墙上的停在那，until 之后消失 */
export interface Dart {
  a: number
  b: number
  readonly dir: 1 | -1
  readonly trap: number
  stuck: boolean
  until: number
}

/** 一具掉进陷坑的身体：在哪掉的（像素），几时掉的；只给画面用 */
export interface Fall {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly at: number
  readonly trap: number
}

/** 神庙此刻：按种子定下的前庭，挡子弹与视线的实心，每处机关的进度，飞着的镖，刚掉进坑的身体 */
export interface TempleState {
  readonly plan: TemplePlan
  readonly solids: Solids
  readonly runs: readonly TrapRun[]
  readonly darts: Dart[]
  readonly falls: Fall[]
}

function cfgOf(sim: Sim): TempleConfig {
  return MAPS[sim.mapId].temple!
}

/** 这一局的前庭：视图与规则按同一个种子各要一次 */
export function templePlanFor(cfg: TempleConfig, decorSeed: number): TemplePlan {
  return templePlan(cfg, (decorSeed ^ PLAN_SEED) >>> 0)
}

const L: Local = { a: 0, b: 0 }

/** 墙、金字塔高过一切；祭坛按它的高；兽头与墙一样高；丛林里的树干与灌丛挡人也挡子弹 */
function solidsOf(cfg: TempleConfig, plan: TemplePlan): Solids {
  const b = plan.basin
  const altar: Solid = { topM: cfg.altar.heightM, material: 'rock' }
  const rock: Solid = { topM: Infinity, material: 'rock' }
  const wood: Solid = { topM: Infinity, material: 'wood' }
  const at = (x: number, y: number): Solid | null => {
    if (roomAt(b, x, y) >= 0) return null
    toLocal(plan.frame, x / UNIT, y / UNIT, L)
    if (altarSd(plan.altar, L.a, L.b) <= 0.15) return altar
    const c = plan.court
    if (L.a + c.back + c.jungle < 0 && Math.abs(L.b) < c.half) return wood
    return rock
  }
  return makeSolids(at, b.x0, b.y0, b.cols, b.rows, b.cell)
}

export function templeOf(sim: Sim): TempleState {
  let s = sim.worldState.temple
  if (!s) {
    const cfg = cfgOf(sim)
    const plan = templePlanFor(cfg, sim.run.decorSeed)
    s = {
      plan,
      solids: solidsOf(cfg, plan),
      runs: plan.traps.map(() => ({ phase: 'armed', at: 0, struck: new Set<number>(), roll: 0, rows: 0 })),
      darts: [],
      falls: [],
    }
    sim.worldState.temple = s
  }
  return s
}

/** 一处机关这一步要多久（毫秒）：发动那一步由机关自己决定什么时候完，返回 Infinity */
export function trapPhaseMs(cfg: TempleConfig, t: Trap, phase: TrapPhase): number {
  const c = cfg[t.kind === 'darts' ? 'darts' : t.kind === 'spikes' ? 'spikes' : t.kind === 'boulder' ? 'boulder' : 'pit']
  if (phase === 'primed') return c.primeMs
  if (phase === 'rearm') return c.rearmMs
  if (phase === 'firing') return t.kind === 'spikes' ? cfg.spikes.upMs : t.kind === 'pit' ? cfg.pit.openMs : Infinity
  return Infinity
}

/** 站着的身体：活着的队员与敌人，不在穿行里 */
function bodies(sim: Sim): number[] {
  const out: number[] = []
  for (const m of sim.characters) if (Alive.v[m] && !inTransit(m)) out.push(m)
  for (const e of query(sim.world, ENEMY_SET)) if (Alive.v[e] && !inTransit(e)) out.push(e)
  return out
}

/** 一具身体按标准身体折算的分量：半径的三次方 */
function weightOf(eid: number): number {
  return (Radius.v[eid]! / (OBSTACLES.body.refRadiusU * UNIT)) ** 3
}

/** 身体的中心落在本地长方形里，外扩 grow 格 */
function within(plan: TemplePlan, eid: number, r: Rect, grow: number): boolean {
  toLocal(plan.frame, Transform.x[eid]! / UNIT, Transform.y[eid]! / UNIT, L)
  return rectSd(r, L.a, L.b) <= grow
}

/** 一处机关打中一具身体：队员挨固定的点数，头目挨固定的点数，其余按最大生命的比例 */
function strike(sim: Sim, t: Trap, eid: number, h: TrapHarm): boolean {
  const dmg = hasComponent(sim.world, eid, Slot) ? h.team : Boss.v[eid] === 1 ? h.boss : Hp.max[eid]! * h.enemy
  if (dmg <= 0) return false
  return hit(sim, hazardSource(HAZARD[t.kind], TINT[t.kind]), eid, dmg, { tick: true })
}

/** 同一次发动只伤一具身体一回 */
function harm(sim: Sim, run: TrapRun, t: Trap, eid: number, h: TrapHarm): boolean {
  const uid = Uid.v[eid]!
  if (run.struck.has(uid)) return false
  run.struck.add(uid)
  return strike(sim, t, eid, h)
}

/** 压板上有没有压得下去的身体：脚沾着地、够分量 */
function pressed(sim: Sim, cfg: TempleConfig, plan: TemplePlan, t: Trap, list: readonly number[]): boolean {
  const r = plateRect(cfg, t.plate)
  for (const eid of list) {
    if (!grounded(sim.world, eid) || weightOf(eid) < cfg.plate.weight) continue
    if (within(plan, eid, r, Radius.v[eid]! / UNIT * FOOT_FRAC)) return true
  }
  return false
}

/** 转到下一步 */
function enter(run: TrapRun, phase: TrapPhase, now: number): void {
  run.phase = phase
  run.at = now
  if (phase === 'firing') {
    run.struck.clear()
    run.rows = 0
  }
}

/** 兽头的嘴在本地的哪里：伸出墙面的那一截的前端 */
export function mouthOf(cfg: TempleConfig, plan: TemplePlan, t: DartTrap): Local {
  const r = snoutRect(cfg, plan.court, t)
  return { a: t.a, b: t.side > 0 ? r.b0 : r.b1 }
}

/** 兽头喷出一排镖：横着铺开在过道里，朝对面的墙飞 */
function volley(cfg: TempleConfig, plan: TemplePlan, s: TempleState, k: number, t: DartTrap): void {
  const d = cfg.darts
  const m = mouthOf(cfg, plan, t)
  for (let i = 0; i < d.perRow; i++) {
    const off = ((i + 0.5) / d.perRow - 0.5) * d.laneU * 0.86
    s.darts.push({ a: m.a + off, b: m.b, dir: t.side > 0 ? -1 : 1, trap: k, stuck: false, until: 0 })
  }
}

/** 飞镖一路往前飞，钉住它碰上的第一个身体（飞在它那一段高度里的），飞到对面的墙脚就钉在墙上 */
function flyDarts(sim: Sim, cfg: TempleConfig, s: TempleState, list: readonly number[], dt: number): void {
  const plan = s.plan
  const c = plan.court
  const step = cfg.darts.speedU * dt
  const keep: Dart[] = []
  for (const dart of s.darts) {
    if (dart.stuck) {
      if (sim.elapsedMs < dart.until) keep.push(dart)
      continue
    }
    const b0 = dart.b
    let b1 = b0 + dart.dir * step
    const far = dart.dir > 0 ? c.half : -c.half
    if ((b1 - far) * dart.dir >= 0) b1 = far
    const trap = plan.traps[dart.trap]!
    let struck = -1
    let best = Infinity
    for (const eid of list) {
      toLocal(plan.frame, Transform.x[eid]! / UNIT, Transform.y[eid]! / UNIT, L)
      const r = Radius.v[eid]! / UNIT + DART_U
      if (Math.abs(L.a - dart.a) > r) continue
      const lo = Math.min(b0, b1) - r
      const hi = Math.max(b0, b1) + r
      if (L.b < lo || L.b > hi) continue
      const band = bandOf(sim, eid)
      if (cfg.darts.heightM < band[0] || cfg.darts.heightM >= band[1]) continue
      const along = (L.b - b0) * dart.dir
      if (along < best) {
        best = along
        struck = eid
      }
    }
    if (struck >= 0) {
      const p = toMap(plan.frame, dart.a, b0 + dart.dir * Math.max(0, best))
      strike(sim, trap, struck, cfg.darts.harm)
      sim.out.bursts.push({ x: p.x * UNIT, y: p.y * UNIT, count: 2, kind: 'puff' })
      continue
    }
    dart.b = b1
    if (b1 === far) {
      dart.stuck = true
      dart.until = sim.elapsedMs + 2500
    }
    keep.push(dart)
  }
  s.darts.length = 0
  s.darts.push(...keep)
}

/** 刺阵：弹起的那一刻和立着的时候，脚沾着地、身子低过刺尖的都被扎一下 */
function stab(sim: Sim, cfg: TempleConfig, s: TempleState, k: number, list: readonly number[]): void {
  const t = s.plan.traps[k]!
  if (t.kind !== 'spikes') return
  const run = s.runs[k]!
  for (const eid of list) {
    if (bandOf(sim, eid)[0] >= cfg.spikes.heightM) continue
    if (within(s.plan, eid, t.rect, (Radius.v[eid]! / UNIT) * FIELD_FRAC)) harm(sim, run, t, eid, cfg.spikes.harm)
  }
}

/** 滚石此刻滚到本地 a 的哪里：从斜槽口缓缓起步，之后匀速 */
export function rollAt(cfg: TempleConfig, top: number, sec: number): number {
  const v = cfg.boulder.speedU
  const e = ROLL_EASE_S
  const d = sec < e ? (v * sec * sec) / (2 * e) : v * (sec - e / 2)
  return top - d
}

/** 滚石碾过：在它身下、身子低过它顶的都挨一下，被挤到槽外 */
function crush(sim: Sim, cfg: TempleConfig, s: TempleState, k: number, list: readonly number[]): void {
  const t = s.plan.traps[k]!
  if (t.kind !== 'boulder') return
  const run = s.runs[k]!
  const f = s.plan.frame
  const R = cfg.boulder.radiusU
  const top = R * 2 * cfg.meterPerU
  for (const eid of list) {
    toLocal(f, Transform.x[eid]! / UNIT, Transform.y[eid]! / UNIT, L)
    const r = Radius.v[eid]! / UNIT
    if (Math.hypot(L.a - run.roll, L.b - t.b) > R + r * 0.6) continue
    if (bandOf(sim, eid)[0] >= top) continue
    const fresh = !run.struck.has(Uid.v[eid]!)
    harm(sim, run, t, eid, cfg.boulder.harm)
    if (!fresh || !Alive.v[eid] || !movable(sim, eid, FORCED)) continue
    const side = Math.sign(L.b - t.b) || (Uid.v[eid]! % 2 ? 1 : -1)
    const v = cfg.boulder.pushU * UNIT
    displace(sim, eid, { kind: 'push', x: (f.tx * side - f.nx * 0.35) * v, y: (f.ty * side - f.ny * 0.35) * v }, FORCED)
  }
}

/** 陷坑开着：脚沾着地、中心落在坑口里、个子不够大卡在坑口的身体掉下去，挨一下，过一阵从最近的坑边爬上来 */
function swallow(sim: Sim, cfg: TempleConfig, s: TempleState, k: number, list: readonly number[]): void {
  const t = s.plan.traps[k]!
  if (t.kind !== 'pit') return
  const f = s.plan.frame
  const r0 = t.rect
  for (const eid of list) {
    const r = Radius.v[eid]!
    if (r >= cfg.pit.bigU * UNIT || !grounded(sim.world, eid) || !movable(sim, eid, FORCED)) continue
    toLocal(f, Transform.x[eid]! / UNIT, Transform.y[eid]! / UNIT, L)
    if (rectSd(r0, L.a, L.b) > -0.05) continue
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    strike(sim, t, eid, cfg.pit.harm)
    s.falls.push({ x, y, r, at: sim.elapsedMs, trap: k })
    if (!Alive.v[eid]) continue
    const out = rimOut(s.plan, r0, L.a, L.b, r / UNIT + CLIMB_OUT_U)
    const to = keepOut(s.plan.basin, out.x * UNIT, out.y * UNIT, r)
    displace(sim, eid, { kind: 'transit', x: to.x, y: to.y, ms: cfg.pit.climbMs, look: 'hidden', color: 0x5d4037 }, FORCED)
  }
  if (s.falls.length > 24) s.falls.splice(0, s.falls.length - 24)
}

/** 坑里本地 (a, b) 离它最近的那条坑边外 out 格的一点，地图坐标（格） */
function rimOut(plan: TemplePlan, r: Rect, a: number, b: number, out: number): Point {
  const d = [a - r.a0, r.a1 - a, b - r.b0, r.b1 - b]
  const i = d.indexOf(Math.min(...d))
  const q = i === 0 ? { a: r.a0 - out, b } : i === 1 ? { a: r.a1 + out, b } : i === 2 ? { a, b: r.b0 - out } : { a, b: r.b1 + out }
  return toMap(plan.frame, q.a, q.b)
}

/** 推进每处机关：复位好了有人踩就踩下去，踩下去到时候就发动，发动完复位 */
function stepTraps(sim: Sim, cfg: TempleConfig, s: TempleState, dt: number): void {
  const now = sim.elapsedMs
  const list = bodies(sim)
  const plan = s.plan
  plan.traps.forEach((t, k) => {
    const run = s.runs[k]!
    const age = now - run.at
    switch (run.phase) {
      case 'armed':
        if (pressed(sim, cfg, plan, t, list)) enter(run, 'primed', now)
        return
      case 'primed':
        if (age >= trapPhaseMs(cfg, t, 'primed')) {
          enter(run, 'firing', now)
          if (t.kind === 'boulder') run.roll = t.top
        }
        return
      case 'rearm':
        if (age >= trapPhaseMs(cfg, t, 'rearm')) enter(run, 'armed', now)
        return
      case 'firing':
        break
    }
    if (t.kind === 'darts') {
      const d = cfg.darts
      while (run.rows < d.rows && age >= run.rows * d.rowMs) {
        volley(cfg, plan, s, k, t)
        run.rows++
      }
      if (run.rows >= d.rows && !s.darts.some((x) => x.trap === k && !x.stuck)) enter(run, 'rearm', now)
      return
    }
    if (t.kind === 'spikes') {
      stab(sim, cfg, s, k, list)
      if (age >= cfg.spikes.upMs) enter(run, 'rearm', now)
      return
    }
    if (t.kind === 'boulder') {
      run.roll = rollAt(cfg, t.top, age / 1000)
      crush(sim, cfg, s, k, list)
      if (run.roll <= t.end) enter(run, 'rearm', now)
      return
    }
    swallow(sim, cfg, s, k, list)
    if (age >= cfg.pit.openMs) enter(run, 'rearm', now)
  })
  flyDarts(sim, cfg, s, list, dt)
}

/** 本地 (a, b) 此刻危险：开着或要开的陷坑、要弹或立着的刺阵、要滚或滚着的石槽 */
function danger(cfg: TempleConfig, s: TempleState, a: number, b: number, pad: number): boolean {
  const plan = s.plan
  return plan.traps.some((t, k) => {
    const ph = s.runs[k]!.phase
    if (ph !== 'primed' && ph !== 'firing') return false
    if (t.kind === 'pit' || t.kind === 'spikes') return rectSd(t.rect, a, b) < pad
    if (t.kind === 'boulder') return Math.abs(b - t.b) < cfg.boulder.grooveU / 2 + pad && a < plan.court.front
    return Math.abs(a - t.a) < cfg.darts.laneU / 2 + pad
  })
}

/** 立着石刺的刺阵里：慢到 1/viscosity */
function spiky(s: TempleState, a: number, b: number): boolean {
  return s.plan.traps.some((t, k) => t.kind === 'spikes' && s.runs[k]!.phase === 'firing' && rectSd(t.rect, a, b) < 0)
}

/** 开着的陷坑口：盖住掉落物 */
export function pitOpen(s: TempleState, a: number, b: number): boolean {
  return s.plan.traps.some((t, k) => t.kind === 'pit' && s.runs[k]!.phase === 'firing' && rectSd(t.rect, a, b) < 0)
}

/** 前庭里离边与机关都够远的一点：从 p 往外一圈圈找，近处找不到就退回开局站位 */
function openNear(cfg: TempleConfig, s: TempleState, p: Point, room: number): Point {
  const b = s.plan.basin
  for (let r = 0; r <= 8 * UNIT; r += 0.5 * UNIT) {
    const n = r === 0 ? 1 : Math.ceil((r * Math.PI * 2) / (0.5 * UNIT))
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * Math.PI * 2
      const q = { x: p.x + Math.cos(ang) * r, y: p.y + Math.sin(ang) * r }
      if (roomAt(b, q.x, q.y) < room) continue
      toLocal(s.plan.frame, q.x / UNIT, q.y / UNIT, L)
      if (!danger(cfg, s, L.a, L.b, 0.5)) return q
    }
  }
  return { x: s.plan.start.x * UNIT, y: s.plan.start.y * UNIT }
}

/**
 * 神庙：能走的是石板铺的前庭，金字塔底座、台阶、两侧的墙、墙上的兽头与丛林边是硬边界，挡人也挡子弹；台阶脚下翻倒的祭坛挡人，子弹从上面飞过去。
 * 地上的压板被够分量、脚沾着地的身体一踩，片刻后发动它的机关，敌我通吃：兽头喷两排飞镖横扫过道，石刺从带孔的石板里弹起，滚石沿石槽碾过前庭，翻板翻开成陷坑。
 * 发动完要复位，复位前踩了也没用；复位时压板上还压着身体就接着发动
 */
export const temple: WorldHooks = {
  ...bounded,
  surface(sim, x, y) {
    const g = groundOf(sim)
    const s = templeOf(sim)
    toLocal(s.plan.frame, x / UNIT, y / UNIT, L)
    if (!spiky(s, L.a, L.b)) return g
    return { ...g, viscosity: cfgOf(sim).spikes.viscosity }
  },
  constrainBody(sim, eid, from, next) {
    if (phases(sim.world, eid, 'rock')) return bounded.constrainBody(sim, eid, from, next)
    return keepOut(templeOf(sim).plan.basin, next.x, next.y, Radius.v[eid]!)
  },
  basin(sim) {
    return templeOf(sim).plan.basin
  },
  ground(sim) {
    return templeOf(sim).plan.basin
  },
  chaseDir(sim, eid, tx, ty) {
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const d = norm(tx - x, ty - y)
    if (phases(sim.world, eid, 'rock')) return d
    return alongWall(templeOf(sim).plan.basin, x, y, d.x, d.y, Radius.v[eid]! + 0.3 * UNIT)
  },
  trace(sim, probe, ax, ay, bx, by) {
    return solidsTrace(templeOf(sim).solids, probe, ax, ay, bx, by)
  },
  solidAt(sim, x, y) {
    return solidOf(templeOf(sim).solids, x, y)
  },
  wanderDir(sim, eid, dx, dy) {
    return wanderIn(templeOf(sim).plan.basin, eid, dx, dy)
  },
  fleeDir(sim, eid, awayX, awayY) {
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const d = fleeSteer(x, y, awayX, awayY, sim.mapW, sim.mapH, 1.5 * UNIT)
    return alongWall(templeOf(sim).plan.basin, x, y, d.x, d.y, Radius.v[eid]! + 1.5 * UNIT)
  },
  /** 刷怪点落在前庭里、离边一格以上，不在要发动的机关上；头目离队长更远 */
  spawnPoint(sim, boss) {
    const s = templeOf(sim)
    const cfg = cfgOf(sim)
    const lead = leaderPoint(sim)
    const far = SPAWN.minPlayerDist * UNIT * (boss ? 1.6 : 1)
    let p: Point = { x: s.plan.start.x * UNIT, y: s.plan.start.y * UNIT }
    for (let i = 0; i < 48; i++) {
      p = { x: sim.rng.next() * sim.mapW, y: sim.rng.next() * sim.mapH }
      if (roomAt(s.plan.basin, p.x, p.y) < UNIT) continue
      toLocal(s.plan.frame, p.x / UNIT, p.y / UNIT, L)
      if (danger(cfg, s, L.a, L.b, 0.5)) continue
      if ((p.x - lead.x) ** 2 + (p.y - lead.y) ** 2 >= far * far) return p
    }
    return openNear(cfg, s, p, UNIT)
  },
  center(sim) {
    const st = templeOf(sim).plan.start
    return { x: st.x * UNIT, y: st.y * UNIT }
  },
  settle(sim, p) {
    return openNear(cfgOf(sim), templeOf(sim), p, SPAWN.edgeInset * UNIT)
  },
  canSpawn(sim, x, y, radius) {
    const s = templeOf(sim)
    if (!roomFor(s.plan.basin, x, y, radius)) return false
    toLocal(s.plan.frame, x / UNIT, y / UNIT, L)
    return !danger(cfgOf(sim), s, L.a, L.b, radius / UNIT)
  },
  landmarks(sim) {
    return templeOf(sim).plan.marks
  },
  /** 跟着的队员不往开着的陷坑、要弹的刺阵、要滚的石槽里站 */
  seat(sim, _from, at) {
    const s = templeOf(sim)
    const cfg = cfgOf(sim)
    toLocal(s.plan.frame, at.x / UNIT, at.y / UNIT, L)
    if (!danger(cfg, s, L.a, L.b, 0.4)) return at
    return openNear(cfg, s, at, 0.6 * UNIT)
  },
  covers(sim, x, y) {
    const s = templeOf(sim)
    toLocal(s.plan.frame, x / UNIT, y / UNIT, L)
    return pitOpen(s, L.a, L.b)
  },
  onStart(sim) {
    templeOf(sim)
  },
  tick(sim, delta) {
    stepTraps(sim, cfgOf(sim), templeOf(sim), Math.min(delta, 100) / 1000)
  },
}

