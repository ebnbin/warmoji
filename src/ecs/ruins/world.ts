import { hasComponent, query } from 'bitecs'
import { UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { MAPS } from '../../data/maps'
import { SPAWN } from '../../data/enemies'
import { MATERIALS, OBSTACLES } from '../../data/obstacles'
import { Airborne, Alive, Phys, Pickup, Radius, Shard, Transform } from '../components'
import { hit } from '../systems/shared/damage'
import { fleeSteer } from '../systems/shared/steer'
import { hazardSource } from '../utils/source'
import { leaderPoint } from '../utils/team'
import { canSee, eyeM, phases, stepM } from '../utils/pass'
import { awayFromWall, keepOut, roomAt } from '../worlds/basin'
import { makeMasonry, ruinsPlan, toLocal, toWorld } from './layout'
import { awayOf, bodyField, carve, cellAt, GRAVITY, newDust, pushOut, roomOf, spill, walkStop } from './masonry'
import { traceLocal } from './trace'
import type { RuinsPlan } from './layout'
import type { Dust, Fall, Landing, Masonry, Strength } from './masonry'
import type { MapId, RuinsConfig } from '../../types/maps'
import type { ObstacleId } from '../../types/obstacles'
import type { Point } from '../../util/vec'
import type { Sim } from '../sim'
import type { Landmark } from '../worlds/gates'
import type { Surface, WorldHooks } from '../worlds/hooks'

const ZERO: Point = { x: 0, y: 0 }
const NO_GHOSTS: Point[] = []
const NO_MARKS: Readonly<Record<string, readonly Landmark[]>> = {}
/** 残垣按布景种子打散出自己的种子 */
const PLAN_SEED = 0x5a1e
/** 跨步高度分这么多档（层），各按一张距离场与一张寻路走 */
const LEVELS = 6
/** 寻路的粗格子里离挡路处至少这么远（格）才算走得过 */
const FLOW_CLEAR_U = 0.32
/** 尘雾每隔这么久（毫秒）落一次、扩散一次 */
const DUST_STEP_MS = 100
/** 尘雾每一步往四邻摊出去的比例 */
const DUST_SPREAD = 0.06
const FALL_TINT = 0xb9a888
/** 落石分桶的边长，格：一桶里落下的能量一起砸 */
const FALL_BIN_U = 0.5
/** 一帧走得比这（格）还远的是跳、瞬移、放置这类一次算好的落点：只看落点，不按路径挡 */
const WALK_STEP_U = 1
/** 给画面的事件最多攒这么多条 */
const EVENT_CAP = 64
const STRENGTH: Strength = { masonry: MATERIALS.masonry.strength ?? Infinity, timber: MATERIALS.timber.strength ?? Infinity }

/** 一桶落石：落在世界 (x, y) 像素，带着多少焦耳 */
interface Bin {
  readonly x: number
  readonly y: number
  readonly energy: number
}

/** 一次塌落里的落石：几时落地，落在哪几桶 */
interface Pending {
  readonly at: number
  readonly bins: readonly Bin[]
}

/** 一次塌落：给画面的。塌的那处的世界坐标（像素）、塌下多少立方米、最高从多高塌（米）；落石落在哪（世界像素）与从多高落下 */
export interface Collapse {
  readonly x: number
  readonly y: number
  readonly volume: number
  readonly top: number
  readonly stones: readonly { readonly x0: number; readonly y0: number; readonly x: number; readonly y: number; readonly drop: number; readonly volume: number }[]
  readonly timber: number
}

/** 弹体或出手撞上了障碍：给画面的 */
export interface Impact {
  readonly x: number
  readonly y: number
  readonly material: ObstacleId
}

/** 一档跨步高度的寻路：粗格子上到队长的路程（格），到不了为无穷；按哪一格的队长、哪一版砌体、几时算的 */
interface Flow {
  readonly dist: Float32Array
  cell: number
  version: number
  at: number
}

/**
 * 残垣此刻的状态：按种子生成的地图，开局后会被打坏的砌体、尘雾；各档跨步高度的距离场与寻路（砌体一变就作废，用到时再算）；
 * 还没落地的落石；给画面的改动过的砌体格子、塌落与打击
 */
export interface RuinsState {
  readonly plan: RuinsPlan
  readonly m: Masonry
  readonly dust: Dust
  readonly fields: (Float32Array | null)[]
  readonly flows: (Flow | null)[]
  /** 粗格子在不在台地上 */
  readonly onSite: Uint8Array
  version: number
  dustAt: number
  readonly pending: Pending[]
  readonly changed: number[]
  readonly collapses: Collapse[]
  readonly impacts: Impact[]
}

function cfgOf(sim: Sim): RuinsConfig {
  return MAPS[sim.mapId].ruins!
}

/** 这一局的残垣：视图要它定地图的大小，规则要它定一切，两边按同一个种子各要一次 */
export function ruinsPlanFor(cfg: RuinsConfig, decorSeed: number): RuinsPlan {
  return ruinsPlan(cfg, { strength: STRENGTH, walk: walkLevel(cfg), bodyU: OBSTACLES.body.refRadiusU }, (decorSeed ^ PLAN_SEED) >>> 0)
}

export function ruinsOf(sim: Sim): RuinsState {
  let s = sim.worldState.ruins
  if (!s) {
    const cfg = cfgOf(sim)
    const plan = ruinsPlanFor(cfg, sim.run.decorSeed)
    const m = makeMasonry(cfg, plan.grid, plan.structures, plan.n.slice(), plan.sid, plan.timber.slice(), plan.rubble.slice())
    const dust = newDust(plan.grid)
    const onSite = new Uint8Array(dust.cols * dust.rows)
    for (let j = 0; j < dust.rows; j++) {
      for (let i = 0; i < dust.cols; i++) {
        const w = toWorld(plan.frame, plan.grid.u0 + (i + 0.5) * plan.grid.cell * 2, plan.grid.v0 + (j + 0.5) * plan.grid.cell * 2)
        onSite[j * dust.cols + i] = roomAt(plan.basin, w.x * UNIT, w.y * UNIT) >= FLOW_CLEAR_U * UNIT ? 1 : 0
      }
    }
    s = { plan, m, dust, fields: new Array(LEVELS).fill(null), flows: new Array(LEVELS).fill(null), onSite, version: 0, dustAt: 0, pending: [], changed: [], collapses: [], impacts: [] }
    sim.worldState.ruins = s
  }
  return s
}

/** 跨得过 m 米的身体跨得过几层石块 */
function levelFor(cfg: RuinsConfig, m: number): number {
  return Math.max(0, Math.min(LEVELS - 1, Math.floor(m / cfg.masonry.courseM + 1e-6)))
}

/** 标准身高的身体跨得过几层石块 */
export function walkLevel(cfg: RuinsConfig): number {
  return levelFor(cfg, OBSTACLES.body.heightM * OBSTACLES.body.step)
}

/** 这具身体跨得过几层石块 */
function levelOf(sim: Sim, eid: number): number {
  return levelFor(cfgOf(sim), stepM(sim.world, eid))
}

/** 跨得过 level 层的身体按的距离场（格）：砌体变了就重算 */
export function fieldOf(s: RuinsState, level: number): Float32Array {
  let f = s.fields[level]
  if (!f) {
    f = bodyField(s.m, level)
    s.fields[level] = f
  }
  return f
}

/** 世界像素 → 局部格 */
function local(s: RuinsState, x: number, y: number): { u: number; v: number } {
  return toLocal(s.plan.frame, x / UNIT, y / UNIT)
}

/** 局部的方向 → 世界的方向 */
function worldDir(s: RuinsState, du: number, dv: number): Point {
  const f = s.plan.frame
  return { x: du * f.cos - dv * f.sin, y: du * f.sin + dv * f.cos }
}

/** 最小堆：按路程取出下一格 */
class Heap {
  private readonly ids: number[] = []
  private readonly keys: number[] = []
  get size(): number {
    return this.ids.length
  }
  push(id: number, key: number): void {
    const ids = this.ids
    const keys = this.keys
    let i = ids.length
    ids.push(id)
    keys.push(key)
    while (i > 0) {
      const p = (i - 1) >> 1
      if (keys[p]! <= key) break
      ids[i] = ids[p]!
      keys[i] = keys[p]!
      i = p
    }
    ids[i] = id
    keys[i] = key
  }
  pop(): number {
    const ids = this.ids
    const keys = this.keys
    const top = ids[0]!
    const id = ids.pop()!
    const key = keys.pop()!
    const n = ids.length
    if (n > 0) {
      let i = 0
      for (;;) {
        let c = 2 * i + 1
        if (c >= n) break
        if (c + 1 < n && keys[c + 1]! < keys[c]!) c++
        if (keys[c]! >= key) break
        ids[i] = ids[c]!
        keys[i] = keys[c]!
        i = c
      }
      ids[i] = id
      keys[i] = key
    }
    return top
  }
}

const DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
] as const

/** 粗格子 i 能不能走：在台地上、离跨不过的砌体够远 */
function passable(s: RuinsState, field: Float32Array, i: number): boolean {
  if (!s.onSite[i]) return false
  const g = s.m.grid
  const cols = s.dust.cols
  const ci = i % cols
  return roomOf(g, field, g.u0 + (ci + 0.5) * g.cell * 2, g.v0 + ((i - ci) / cols + 0.5) * g.cell * 2) >= FLOW_CLEAR_U
}

/** 跨得过 level 层的身体到队长的寻路：队长换了粗格子或砌体变了，过了 reflowMs 才重算 */
function flowOf(sim: Sim, s: RuinsState, level: number): Flow {
  const cols = s.dust.cols
  const rows = s.dust.rows
  const g = s.m.grid
  const lead = leaderPoint(sim)
  const l = local(s, lead.x, lead.y)
  const ci = Math.min(cols - 1, Math.max(0, Math.floor((l.u - g.u0) / (g.cell * 2))))
  const cj = Math.min(rows - 1, Math.max(0, Math.floor((l.v - g.v0) / (g.cell * 2))))
  const cell = cj * cols + ci
  let f = s.flows[level]
  if (f && ((f.cell === cell && f.version === s.version) || sim.elapsedMs - f.at < cfgOf(sim).reflowMs)) return f
  if (!f) {
    f = { dist: new Float32Array(cols * rows), cell: -1, version: -1, at: 0 }
    s.flows[level] = f
  }
  const field = fieldOf(s, level)
  const dist = f.dist
  dist.fill(Infinity)
  const ok = new Uint8Array(cols * rows)
  for (let i = 0; i < ok.length; i++) ok[i] = passable(s, field, i) ? 1 : 0
  const heap = new Heap()
  dist[cell] = 0
  heap.push(cell, 0)
  while (heap.size > 0) {
    const i = heap.pop()
    const d = dist[i]!
    const x = i % cols
    const y = (i - x) / cols
    for (const [dx, dy, w] of DIRS) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
      const j = ny * cols + nx
      if (!ok[j]) continue
      if (dx !== 0 && dy !== 0 && (!ok[y * cols + nx] || !ok[ny * cols + x])) continue
      const nd = d + w
      if (nd < dist[j]!) {
        dist[j] = nd
        heap.push(j, nd)
      }
    }
  }
  f.cell = cell
  f.version = s.version
  f.at = sim.elapsedMs
  return f
}

/** 寻路在局部 (u, v) 处往下走的方向（局部单位向量）；到不了队长的地方往最近一格到得了的走；都不行返回 null */
function descend(s: RuinsState, f: Flow, u: number, v: number): { u: number; v: number } | null {
  const cols = s.dust.cols
  const rows = s.dust.rows
  const g = s.m.grid
  const fx = (u - g.u0) / (g.cell * 2)
  const fy = (v - g.v0) / (g.cell * 2)
  const ci = Math.floor(fx)
  const cj = Math.floor(fy)
  if (ci < 0 || cj < 0 || ci >= cols || cj >= rows) return null
  const here = f.dist[cj * cols + ci]!
  let su = 0
  let sv = 0
  let best = here
  let bu = 0
  let bv = 0
  for (const [dx, dy, w] of DIRS) {
    const nx = ci + dx
    const ny = cj + dy
    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
    const d = f.dist[ny * cols + nx]!
    if (!Number.isFinite(d)) continue
    const ox = nx + 0.5 - fx
    const oy = ny + 0.5 - fy
    const len = Math.hypot(ox, oy) || 1
    if (d < best) {
      best = d
      bu = ox / len
      bv = oy / len
    }
    if (Number.isFinite(here) && d < here) {
      su += ((here - d) / w) * (ox / len)
      sv += ((here - d) / w) * (oy / len)
    }
  }
  const len = Math.hypot(su, sv)
  if (len > 1e-6) return { u: su / len, v: sv / len }
  if (best < here) return { u: bu, v: bv }
  return null
}

/** 到得了队长的地方：这一格在寻路里有路程 */
function reachable(s: RuinsState, f: Flow, x: number, y: number): boolean {
  const g = s.m.grid
  const l = local(s, x, y)
  const ci = Math.floor((l.u - g.u0) / (g.cell * 2))
  const cj = Math.floor((l.v - g.v0) / (g.cell * 2))
  if (ci < 0 || cj < 0 || ci >= s.dust.cols || cj >= s.dust.rows) return false
  return Number.isFinite(f.dist[cj * s.dust.cols + ci]!)
}

/** 离砌体与台地边多远（像素）：跨不过一层石块的身体按的 */
function roomPx(s: RuinsState, x: number, y: number): number {
  const l = local(s, x, y)
  return Math.min(roomAt(s.plan.basin, x, y), roomOf(s.m.grid, fieldOf(s, 0), l.u, l.v) * UNIT)
}

/** 离墙或台地边 reach 像素以内几乎正对着它走时改为顺着它走 */
function alongWall(s: RuinsState, level: number, x: number, y: number, dx: number, dy: number, reach: number): Point {
  const b = s.plan.basin
  let n: Point | null = null
  if (roomAt(b, x, y) <= reach) n = awayFromWall(b, x, y)
  else {
    const l = local(s, x, y)
    const field = fieldOf(s, level)
    if (roomOf(s.m.grid, field, l.u, l.v) * UNIT <= reach) {
      const a = awayOf(s.m.grid, field, l.u, l.v)
      n = worldDir(s, a.u, a.v)
    }
  }
  if (!n || dx * n.x + dy * n.y > -0.9) return { x: dx, y: dy }
  const side = dy * n.x - dx * n.y >= 0 ? 1 : -1
  return { x: -n.y * side, y: n.x * side }
}

/** 离墙至少 room 像素、到得了队长的一点：从 p 往外一圈圈找，找不到就原样退回台地里 */
function openNear(sim: Sim, s: RuinsState, p: Point, room: number): Point {
  const f = flowOf(sim, s, 2)
  for (let r = 0; r <= 8 * UNIT; r += 0.5 * UNIT) {
    const n = r === 0 ? 1 : Math.ceil((r * Math.PI * 2) / (0.5 * UNIT))
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2
      const q = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r }
      if (roomPx(s, q.x, q.y) >= room && reachable(s, f, q.x, q.y)) return q
    }
  }
  return keepOut(s.plan.basin, p.x, p.y, room)
}

const GROUNDS = new Map<MapId, Surface[]>()
/** 碎石的深浅分这么多档，每档一份地面 */
const RUBBLE_STEPS = 16

/** 地面：费力与回复来自地图；踩在碎石上按碎石的深浅变慢、多耗体力 */
function groundAt(sim: Sim, depth: number): Surface {
  let list = GROUNDS.get(sim.mapId)
  if (!list) {
    const { exertion, regen } = MAPS[sim.mapId].stamina
    const R = cfgOf(sim).rubble
    list = Array.from({ length: RUBBLE_STEPS + 1 }, (_, k) => {
      const t = k / RUBBLE_STEPS
      return { traction: 1, viscosity: 1 + (R.viscosity - 1) * t, exertion: exertion + R.exertion * t, regen }
    })
    GROUNDS.set(sim.mapId, list)
  }
  return list[Math.round(Math.min(1, depth / cfgOf(sim).rubble.fullM) * RUBBLE_STEPS)]!
}

function capped<T>(list: T[], item: T): void {
  list.push(item)
  if (list.length > EVENT_CAP) list.splice(0, list.length - EVENT_CAP)
}

/**
 * 塌下来以后：石块落到墙脚堆成碎石，落地前的那一下记成待砸的落石（按落下的高度算落地的时刻与能量），扬起尘雾；
 * 记下改动过的格子与这次塌落给画面
 */
function collapsed(sim: Sim, s: RuinsState, falls: readonly Fall[], at: { u: number; v: number }): void {
  const cfg = cfgOf(sim)
  const m = s.m
  const g = m.grid
  const f = s.plan.frame
  const landings: Landing[] = spill(m, falls, at, () => sim.rng.next())
  s.version++
  s.fields.fill(null)
  let stone = 0
  let wood = 0
  let top = 0
  let cu = 0
  let cv = 0
  for (const fl of falls) {
    s.changed.push(fl.i)
    if (fl.timber) {
      wood += fl.volume
      continue
    }
    stone += fl.volume
    top = Math.max(top, fl.z1)
    const ci = fl.i % g.cols
    cu += (g.u0 + (ci + 0.5) * g.cell) * fl.volume
    cv += (g.v0 + ((fl.i - ci) / g.cols + 0.5) * g.cell) * fl.volume
  }
  const bins = new Map<number, { x: number; y: number; energy: number }>()
  let drop = 0
  for (const l of landings) {
    const i = cellAt(g, l.u, l.v)
    if (i >= 0) s.changed.push(i)
    const w = toWorld(f, l.u, l.v)
    const key = Math.floor(w.x / FALL_BIN_U) * 4096 + Math.floor(w.y / FALL_BIN_U)
    const e = m.density * l.volume * GRAVITY * l.drop
    const b = bins.get(key)
    if (b) {
      b.x += w.x * e
      b.y += w.y * e
      b.energy += e
    } else bins.set(key, { x: w.x * e, y: w.y * e, energy: e })
    drop = Math.max(drop, l.drop)
  }
  if (bins.size > 0) {
    const list: Bin[] = []
    for (const b of bins.values()) if (b.energy > 0) list.push({ x: (b.x / b.energy) * UNIT, y: (b.y / b.energy) * UNIT, energy: b.energy })
    s.pending.push({ at: sim.elapsedMs + Math.sqrt((2 * Math.max(drop, 0.3)) / GRAVITY) * 1000, bins: list })
  }
  if (stone > 0) {
    cu /= stone
    cv /= stone
    addDust(cfg, s, cu, cv, stone)
  }
  const c = stone > 0 ? toWorld(f, cu, cv) : toWorld(f, at.u, at.v)
  const stones: Collapse['stones'][number][] = []
  const step = Math.max(1, Math.floor(landings.length / 48))
  for (let k = 0; k < landings.length; k += step) {
    const l = landings[k]!
    const ci = l.i % g.cols
    const src = toWorld(f, g.u0 + (ci + 0.5) * g.cell, g.v0 + ((l.i - ci) / g.cols + 0.5) * g.cell)
    const w = toWorld(f, l.u, l.v)
    stones.push({ x0: src.x * UNIT, y0: src.y * UNIT, x: w.x * UNIT, y: w.y * UNIT, drop: l.drop, volume: l.volume * step })
  }
  capped(s.collapses, { x: c.x * UNIT, y: c.y * UNIT, volume: stone, top, stones, timber: wood })
}

/** 塌下 volume 立方米扬起的尘雾：摊在局部 (u, v) 格附近半径 spreadU 的一团里，中间浓 */
function addDust(cfg: RuinsConfig, s: RuinsState, u: number, v: number, volume: number): void {
  const D = cfg.dust
  const g = s.m.grid
  const d = s.dust
  const cell = g.cell * 2
  const rad = D.spreadU
  const peak = (D.perM3 * volume * 3) / (Math.PI * (rad * cfg.meterPerU) ** 2)
  const ci = (u - g.u0) / cell
  const cj = (v - g.v0) / cell
  const rc = rad / cell
  for (let j = Math.max(0, Math.floor(cj - rc)); j <= Math.min(d.rows - 1, Math.ceil(cj + rc)); j++) {
    for (let i = Math.max(0, Math.floor(ci - rc)); i <= Math.min(d.cols - 1, Math.ceil(ci + rc)); i++) {
      const r = Math.hypot(i + 0.5 - ci, j + 0.5 - cj) / rc
      if (r >= 1) continue
      d.sigma[j * d.cols + i] = d.sigma[j * d.cols + i]! + peak * (1 - r)
    }
  }
}

/** 尘雾落下、往四邻摊开 */
function stepDust(cfg: RuinsConfig, s: RuinsState, dt: number): void {
  const d = s.dust
  const a = d.sigma
  if (!a.some((v) => v >= 1e-4)) return
  const keep = Math.pow(0.5, dt / cfg.dust.halfLifeS)
  const b = new Float32Array(a.length)
  for (let j = 0; j < d.rows; j++) {
    for (let i = 0; i < d.cols; i++) {
      const k = j * d.cols + i
      const v = a[k]!
      if (v < 1e-4) continue
      const out = v * DUST_SPREAD
      b[k] = b[k]! + (v - out * 4) * keep
      if (i > 0) b[k - 1] = b[k - 1]! + out * keep
      if (i < d.cols - 1) b[k + 1] = b[k + 1]! + out * keep
      if (j > 0) b[k - d.cols] = b[k - d.cols]! + out * keep
      if (j < d.rows - 1) b[k + d.cols] = b[k + d.cols]! + out * keep
    }
  }
  a.set(b)
}

/** 到时候的落石砸下来：每具站在地上的身体按落在身边的能量挨打 */
function landFalls(sim: Sim, s: RuinsState): void {
  if (s.pending.length === 0) return
  const cfg = cfgOf(sim)
  const now = sim.elapsedMs
  const due = s.pending.filter((p) => p.at <= now)
  if (due.length === 0) return
  s.pending.splice(0, s.pending.length, ...s.pending.filter((p) => p.at > now))
  const src = hazardSource('collapse', FALL_TINT)
  const reach = cfg.fall.radiusU * UNIT
  for (const eid of [...query(sim.world, [Phys, Transform, Radius])]) {
    if (!Alive.v[eid] || hasComponent(sim.world, eid, Airborne) || hasComponent(sim.world, eid, Pickup) || hasComponent(sim.world, eid, Shard)) continue
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const r = Radius.v[eid]! + reach
    let e = 0
    for (const p of due) for (const b of p.bins) if ((b.x - x) ** 2 + (b.y - y) ** 2 < r * r) e += b.energy
    const dmg = (e / 1000) * cfg.fall.damagePerKJ
    if (dmg >= 1) hit(sim, src, eid, Math.round(dmg))
  }
}

/** 从队长的眼睛看不看得见 (x, y) 处标准身高的身体 */
function seenFromLeader(sim: Sim, x: number, y: number): boolean {
  const lead = leaderPoint(sim)
  const B = OBSTACLES.body
  return canSee(sim, lead.x, lead.y, eyeM(sim.world, sim.leader), x, y, B.heightM * B.eye)
}

/**
 * 残垣：能走的是山顶的一块台地，台地边是硬边界；台地上一座塌了大半的石砌院落，墙按剩下的高度挡人、挡弹、挡视线（见 utils/pass 的探测）。
 * 跨得过的矮墙照走，跨不过的绕着走（各档跨步高度各一张寻路）；穿墙的身体不受砌体与木板阻挡。破坏力把墙打出缺口，
 * 失去支撑的部分塌下来砸人、在墙脚堆成碎石、扬起挡视线的尘雾；碎石上走得慢。怪物刷在队长看不见的地方
 */
export const ruins: WorldHooks = {
  torus: false,
  worldDelta(_sim, fromX, fromY, toX, toY) {
    return { x: toX - fromX, y: toY - fromY }
  },
  ghosts() {
    return NO_GHOSTS
  },
  wrap(_sim, x, y) {
    return { x, y }
  },
  projectileLifeMs() {
    return 0
  },
  mediumVelocity() {
    return ZERO
  },
  pull() {
    return ZERO
  },
  sink() {
    return false
  },
  surface(sim, x, y) {
    const s = ruinsOf(sim)
    const l = local(s, x, y)
    const i = cellAt(s.m.grid, l.u, l.v)
    return groundAt(sim, i >= 0 ? s.m.rubble[i]! : 0)
  },
  effort() {
    return 1
  },
  contact() {
    return false
  },
  constrainBody(sim, eid, from, next) {
    const s = ruinsOf(sim)
    const r = Radius.v[eid]!
    const p = keepOut(s.plan.basin, next.x, next.y, r)
    if (phases(sim.world, eid, 'masonry')) return p
    const level = levelOf(sim, eid)
    const field = fieldOf(s, level)
    const lf = local(s, from.x, from.y)
    let lp = local(s, p.x, p.y)
    const step = Math.hypot(lp.u - lf.u, lp.v - lf.v)
    if (step > s.m.grid.cell && step < WALK_STEP_U) {
      const t = walkStop(s.m, level, lf.u, lf.v, lp.u, lp.v)
      if (t < 1) lp = { u: lf.u + (lp.u - lf.u) * t * 0.9, v: lf.v + (lp.v - lf.v) * t * 0.9 }
    }
    const q = pushOut(s.m.grid, field, lp.u, lp.v, Math.min(r, cfgOf(sim).bodyCapU * UNIT) / UNIT)
    const w = toWorld(s.plan.frame, q.u, q.v)
    return keepOut(s.plan.basin, w.x * UNIT, w.y * UNIT, r)
  },
  basin(sim) {
    return ruinsOf(sim).plan.basin
  },
  chaseDir(sim, eid, tx, ty) {
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const d = norm(tx - x, ty - y)
    const s = ruinsOf(sim)
    if (phases(sim.world, eid, 'masonry')) return d
    const level = levelOf(sim, eid)
    const lead = leaderPoint(sim)
    if ((tx - lead.x) ** 2 + (ty - lead.y) ** 2 < (3 * UNIT) ** 2) {
      const l = local(s, x, y)
      const dir = descend(s, flowOf(sim, s, level), l.u, l.v)
      if (dir && (tx - x) ** 2 + (ty - y) ** 2 > (1.2 * UNIT) ** 2) return worldDir(s, dir.u, dir.v)
    }
    return alongWall(s, level, x, y, d.x, d.y, Radius.v[eid]! + 0.3 * UNIT)
  },
  trace(sim, probe, ax, ay, bx, by) {
    const s = ruinsOf(sim)
    const a = local(s, ax, ay)
    const b = local(s, bx, by)
    const cfg = cfgOf(sim)
    return traceLocal(s.m, s.dust, cfg.dust.opaqueTau, probe, a.u, a.v, b.u, b.v, (Math.hypot(bx - ax, by - ay) / UNIT) * cfg.meterPerU)
  },
  breach(sim, x, y, z, _r, amount) {
    const s = ruinsOf(sim)
    const l = local(s, x, y)
    const falls: Fall[] = []
    const used = carve(s.m, STRENGTH, l.u, l.v, z, amount, falls)
    if (falls.length > 0) collapsed(sim, s, falls, l)
    return used
  },
  impact(sim, x, y, material) {
    capped(ruinsOf(sim).impacts, { x, y, material })
  },
  wanderDir(sim, eid, dx, dy) {
    const s = ruinsOf(sim)
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const reach = Radius.v[eid]! + 0.6 * UNIT
    if (roomPx(s, x, y) > reach) return { x: dx, y: dy }
    const b = s.plan.basin
    let n: Point
    if (roomAt(b, x, y) <= reach) n = awayFromWall(b, x, y)
    else {
      const l = local(s, x, y)
      const a = awayOf(s.m.grid, fieldOf(s, 0), l.u, l.v)
      n = worldDir(s, a.u, a.v)
    }
    const dot = dx * n.x + dy * n.y
    return dot >= 0 ? { x: dx, y: dy } : { x: dx - 2 * dot * n.x, y: dy - 2 * dot * n.y }
  },
  fleeDir(sim, eid, awayX, awayY) {
    const s = ruinsOf(sim)
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const d = fleeSteer(x, y, awayX, awayY, sim.mapW, sim.mapH, 1.5 * UNIT)
    return alongWall(s, levelOf(sim, eid), x, y, d.x, d.y, Radius.v[eid]! + 1.5 * UNIT)
  },
  outside(sim, x, y) {
    return x < -UNIT || x > sim.mapW + UNIT || y < -UNIT || y > sim.mapH + UNIT
  },
  /** 刷怪点在台地上、离墙至少一格、到得了队长，离队长够远；先挑队长看不见的地方，头目离得更远 */
  spawnPoint(sim, boss) {
    const s = ruinsOf(sim)
    const lead = leaderPoint(sim)
    const far = SPAWN.minPlayerDist * UNIT * (boss ? 1.6 : 1)
    const f = flowOf(sim, s, 2)
    let best: Point | null = null
    let bestD = -1
    for (let i = 0; i < 64; i++) {
      const p = { x: sim.rng.next() * sim.mapW, y: sim.rng.next() * sim.mapH }
      if (roomPx(s, p.x, p.y) < UNIT || !reachable(s, f, p.x, p.y)) continue
      const d = Math.hypot(p.x - lead.x, p.y - lead.y)
      if (d < far) continue
      if (!seenFromLeader(sim, p.x, p.y)) return p
      if (d > bestD) {
        bestD = d
        best = p
      }
    }
    return best ?? openNear(sim, s, { x: s.plan.start.x * UNIT, y: s.plan.start.y * UNIT }, UNIT)
  },
  center(sim) {
    const st = ruinsOf(sim).plan.start
    return { x: st.x * UNIT, y: st.y * UNIT }
  },
  settle(sim, p) {
    return openNear(sim, ruinsOf(sim), p, Math.max(SPAWN.edgeInset, 0.6) * UNIT)
  },
  ground(sim) {
    return sim.hooks.basin(sim)
  },
  canSpawn() {
    return true
  },
  landmarks() {
    return NO_MARKS
  },
  lean() {
    return ZERO
  },
  onStart(sim) {
    ruinsOf(sim)
  },
  tick(sim) {
    const s = ruinsOf(sim)
    landFalls(sim, s)
    const now = sim.elapsedMs
    if (now - s.dustAt >= DUST_STEP_MS) {
      stepDust(cfgOf(sim), s, (now - s.dustAt) / 1000)
      s.dustAt = now
    }
  },
}
