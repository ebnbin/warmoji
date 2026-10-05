import { UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { SPAWN } from '../../data/enemies'
import { Rng } from '../../util/rng'
import { MAPS } from '../../data/maps'
import { centered } from '../frame'
import type { CaveConfig, MapId } from '../../types/maps'
import { roomFor } from '../landmark'
import { clearPath, diffuseLux, directLux, flowDir, flowFrom, inPool, makeCaveState, outward, pushOut, rockHit, roomOf, skyAt, stepLight, stepTorch, torchesLux, torchSpot } from './model'
import type { CaveState, Rock, Stalagmite } from './model'
import { clockSec } from '../../ecs/fight/clock'
import { charSize } from '../../ecs/systems/shared/scale'
import { Alive, Radius, Transform, Uid } from '../../ecs/components'
import type { Sim } from '../../ecs/sim'
import type { Point } from '../../util/vec'
import { leaderX, leaderY } from '../../ecs/utils/team'
import { clearM, passCost, phases, probeZ, topOf } from '../../ecs/utils/pass'
import type { Crossing, Probe } from '../../ecs/utils/pass'
import type { Solid } from '../../ecs/worlds/solids'
import { bounded, groundOf } from '../../ecs/worlds/hooks'
import type { Surface, WorldHooks } from '../../ecs/worlds/hooks'

function caveCfg(sim: Sim): CaveConfig {
  return MAPS[sim.mapId].cave!
}

const CAVE_ROCK: Solid = { topM: Infinity, material: 'rock' }

/** 半径 rad 的身体陷进高过 clear 米的矮石笋多深就沿外法线退回多远：只有矮个子跨不过它们 */
function lowOut(list: readonly Stalagmite[], x: number, y: number, rad: number, clear: number): Point {
  let px = x
  let py = y
  for (const st of list) {
    if (st.block || topOf(st.h) <= clear) continue
    const dx = px - st.x
    const dy = py - st.y
    const d = Math.hypot(dx, dy)
    const r = st.r + rad
    if (d >= r) continue
    const nx = d > 1e-6 ? dx / d : 1
    const ny = d > 1e-6 ? dy / d : 0
    px = st.x + nx * r
    py = st.y + ny * r
  }
  return { x: px, y: py }
}

/** 线段 a→b（像素）上第一根探测在它里面的矮石笋：按探测穿过它那一段的最低处比它占到的那一层的顶 */
function lowTrace(list: readonly Stalagmite[], p: Probe, ax: number, ay: number, bx: number, by: number): Crossing | null {
  const dx = bx - ax
  const dy = by - ay
  const l2 = dx * dx + dy * dy
  if (l2 <= 0 || passCost(p, 'rock') <= 0) return null
  let best: Crossing | null = null
  for (const st of list) {
    if (st.block) continue
    const fx = ax - st.x
    const fy = ay - st.y
    const b = fx * dx + fy * dy
    const disc = b * b - l2 * (fx * fx + fy * fy - st.r * st.r)
    if (disc < 0) continue
    const sq = Math.sqrt(disc)
    const t0 = Math.max(0, (-b - sq) / l2)
    const t1 = Math.min(1, (-b + sq) / l2)
    if (t0 > t1 || (best && t0 >= best.t0) || Math.min(probeZ(p, t0), probeZ(p, t1)) >= topOf(st.h)) continue
    best = { t0, t1, material: 'rock' }
  }
  return best
}

/** 溶洞的地形与这一局的月龄由布景种子定下，视图从这里读；光照按难度时钟走，同一局里接着上一场的钟点 */
function caveOf(sim: Sim): CaveState {
  let s = sim.worldState.cave
  if (!s) {
    const size = MAPS[sim.mapId].size!
    s = makeCaveState(caveCfg(sim), centered(size.w, size.h), new Rng(sim.run.decorSeed ^ 0x3c4e), clockSec(sim))
    sim.worldState.cave = s
  }
  return s
}

/** 重算洞里的光、重算绕路的间隔，毫秒 */
const CAVE_LIGHT_MS = 200
const CAVE_FLOW_MS = 250

const WADES = new Map<MapId, Surface>()

/** 水潭里的地面：黏滞与费力来自地图，回复同平地 */
function wadeOf(sim: Sim): Surface {
  let w = WADES.get(sim.mapId)
  if (!w) {
    const p = caveCfg(sim).pools
    w = { ...groundOf(sim), viscosity: p.viscosity, exertion: p.exertion }
    WADES.set(sim.mapId, w)
  }
  return w
}

/** 离岩石 reach 以内、方向扎进岩石时改成顺着壁面走，免得顶在石头上不动 */
function glide(r: Rock, x: number, y: number, dx: number, dy: number, reach: number): Point {
  if (roomOf(r, x, y) > reach) return { x: dx, y: dy }
  const n = outward(r, x, y)
  const dot = dx * n.x + dy * n.y
  if (dot >= -0.2) return { x: dx, y: dy }
  const tx = dx - dot * n.x
  const ty = dy - dot * n.y
  const len = Math.hypot(tx, ty)
  return len > 1e-6 ? { x: tx / len, y: ty / len } : { x: -n.y, y: n.x }
}

/** 队员的火把此刻在哪、多亮 */
function caveTorches(sim: Sim, s: CaveState): { spots: Point[]; lits: number[] } {
  const spots: Point[] = []
  const lits: number[] = []
  for (const m of sim.characters) {
    const t = s.torches.get(m)
    if (!t || t.uid !== Uid.v[m] || t.lit <= 0) continue
    spots.push(torchSpot(Transform.x[m]!, Transform.y[m]!, charSize(m)))
    lits.push(t.lit)
  }
  return { spots, lits }
}

/** 怪物只从照度不到 spawnLux 的地方出来，离队长至少 minPlayerDist 格；挑不到就挑最暗的 */
function caveSpawn(sim: Sim, boss: boolean): Point {
  const s = caveOf(sim)
  const cfg = caveCfg(sim)
  const cells = boss ? s.layout.bossSpawns : s.layout.spawns
  const n = cells.length / 2
  const lx = leaderX(sim)
  const ly = leaderY(sim)
  const near = SPAWN.minPlayerDist * UNIT * (boss ? 1.6 : 1)
  const { spots, lits } = caveTorches(sim, s)
  let best: Point = { x: cells[0]!, y: cells[1]! }
  let bestLux = Infinity
  for (let k = 0; k < 64; k++) {
    const i = Math.floor(sim.rng.next() * n)
    const x = cells[i * 2]!
    const y = cells[i * 2 + 1]!
    if (Math.hypot(x - lx, y - ly) < near) continue
    const e = diffuseLux(s.light, x, y) + directLux(s.layout, s.sky, x, y, 0) + torchesLux(cfg.torch, spots, lits, x, y)
    if (e < cfg.spawnLux) return { x, y }
    if (e < bestLux) {
      bestLux = e
      best = { x, y }
    }
  }
  return best
}

/**
 * 溶洞：能走的是洞厅与支洞，洞壁、石柱与挡路的石笋是硬边界，挡人也挡子弹；绕不过去的按步数场绕。
 * 光照随真实的太阳月亮走，队员天暗了点起火把；怪物只从暗处出来；水潭里蹚水更慢更累
 */
export const cave: WorldHooks = {
  ...bounded,
  surface(sim, x, y) {
    return inPool(caveOf(sim).layout, x, y) ? wadeOf(sim) : groundOf(sim)
  },
  constrainBody(sim, eid, from, next) {
    if (phases(sim.world, eid, 'rock')) return bounded.constrainBody(sim, eid, from, next)
    const L = caveOf(sim).layout
    const p = pushOut(L.rock, next.x, next.y, Radius.v[eid]!)
    return lowOut(L.stalagmites, p.x, p.y, Radius.v[eid]!, clearM(eid))
  },
  basin(sim) {
    return caveOf(sim).layout.rock
  },
  chaseDir(sim, eid, tx, ty) {
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const d = norm(tx - x, ty - y)
    if (phases(sim.world, eid, 'rock')) return d
    const s = caveOf(sim)
    const rock = s.layout.rock
    const rad = Radius.v[eid]!
    if (clearPath(rock, x, y, tx, ty, rad * 0.9)) return glide(rock, x, y, d.x, d.y, rad + 0.3 * UNIT)
    const f = flowDir(s.flow, x, y) ?? d
    return glide(rock, x, y, f.x, f.y, rad + 0.3 * UNIT)
  },
  /** 洞壁、石柱与挡路的石笋高过一切；矮石笋只挡贴地的 */
  trace(sim, probe, ax, ay, bx, by) {
    const L = caveOf(sim).layout
    const low = lowTrace(L.stalagmites, probe, ax, ay, bx, by)
    const hit = rockHit(L.rock, ax, ay, bx, by)
    const len = Math.hypot(bx - ax, by - ay)
    const t = !hit ? Infinity : len > 0 ? Math.hypot(hit.x - ax, hit.y - ay) / len : 0
    if (low && low.t0 <= t) return low
    return hit ? { t0: t, t1: t, material: 'rock' } : null
  },
  solidAt(sim, x, y) {
    const L = caveOf(sim).layout
    if (roomOf(L.rock, x, y) < 0) return CAVE_ROCK
    for (const st of L.stalagmites) if (!st.block && Math.hypot(x - st.x, y - st.y) < st.r) return { topM: st.h, material: 'rock' }
    return null
  },
  wanderDir(sim, eid, dx, dy) {
    const rock = caveOf(sim).layout.rock
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    if (roomOf(rock, x, y) > Radius.v[eid]! + 0.6 * UNIT) return { x: dx, y: dy }
    const n = outward(rock, x, y)
    const dot = dx * n.x + dy * n.y
    return dot >= 0 ? { x: dx, y: dy } : { x: dx - 2 * dot * n.x, y: dy - 2 * dot * n.y }
  },
  fleeDir(sim, eid, awayX, awayY) {
    return glide(caveOf(sim).layout.rock, Transform.x[eid]!, Transform.y[eid]!, awayX, awayY, Radius.v[eid]! + 1.5 * UNIT)
  },
  spawnPoint(sim, boss) {
    return caveSpawn(sim, boss)
  },
  /** 只看站不站得下：暗处由刷怪点挑，白天亮着的地标整组不出 */
  canSpawn(sim, x, y, radius) {
    return roomFor(caveOf(sim).layout.rock, x, y, radius)
  },
  /** 洞里暗到看不清了，水潭、荧光丛与天窗才出怪：白天那里亮堂堂的，怪只从暗处出来 */
  landmarks(sim) {
    const s = caveOf(sim)
    return s.light.hallLux < caveCfg(sim).view.clearLux ? s.marks : s.dayMarks
  },
  settle(sim, p) {
    const rock = caveOf(sim).layout.rock
    const inset = SPAWN.edgeInset * UNIT
    const q = pushOut(rock, p.x, p.y, inset)
    if (roomOf(rock, q.x, q.y) >= inset * 0.9) return q
    const cells = caveOf(sim).layout.spawns
    let best = { x: cells[0]!, y: cells[1]! }
    let bd = Infinity
    for (let i = 0; i < cells.length; i += 2) {
      const d = (cells[i]! - p.x) ** 2 + (cells[i + 1]! - p.y) ** 2
      if (d < bd) {
        bd = d
        best = { x: cells[i]!, y: cells[i + 1]! }
      }
    }
    return best
  },
  onStart(sim) {
    const s = caveOf(sim)
    flowFrom(s.flow, leaderX(sim), leaderY(sim))
  },
  /** 每隔一阵按此刻的天重算洞里的光；火把每帧推进；绕路的步数场跟着队长重算 */
  tick(sim, delta) {
    const cfg = caveCfg(sim)
    const s = caveOf(sim)
    s.lightIn -= delta
    if (s.lightIn <= 0) {
      s.lightIn += CAVE_LIGHT_MS
      skyAt(cfg, clockSec(sim), s.age0, s.sky)
      stepLight(s.light, s.layout, cfg, s.sky)
    }
    sim.characters.forEach((m, slot) => {
      let t = s.torches.get(m)
      if (!t || t.uid !== Uid.v[m]) {
        t = { uid: Uid.v[m]!, on: false, lit: 0, due: 0, want: false }
        s.torches.set(m, t)
      }
      const x = Transform.x[m]!
      const y = Transform.y[m]!
      stepTorch(t, cfg.torch, diffuseLux(s.light, x, y) + directLux(s.layout, s.sky, x, y, 0), Alive.v[m] === 1, slot, sim.elapsedMs, delta)
    })
    s.flowIn -= delta
    if (s.flowIn <= 0) {
      s.flowIn = CAVE_FLOW_MS
      flowFrom(s.flow, leaderX(sim), leaderY(sim))
    }
  },
}
