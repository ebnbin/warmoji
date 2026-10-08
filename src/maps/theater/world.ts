import { UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { MAPS } from '../../data/maps'
import { query, removeEntity } from 'bitecs'
import { Alive, ENEMY_SET, Motion, PICKUP_SET, Radius, Shard, Transform, TRANSIT, VisOff } from '../../ecs/components'
import { pickupDef, pickupSfx } from '../../ecs/store'
import { despawnEnemy } from '../../ecs/systems/shared/combat'
import { displace, endMotion } from '../../ecs/systems/shared/displace'
import { hoverPx } from '../../ecs/utils/ground'
import { inTransit } from '../../ecs/utils/marks'
import { SPAWN } from '../../data/enemies'
import { clockSec } from '../../ecs/fight/clock'
import { fleeSteer } from '../../ecs/systems/shared/steer'
import { leaderPoint } from '../../ecs/utils/team'
import { clearM, passCost, phases, probeZ, topOf } from '../../ecs/utils/pass'
import { bounded, wanderIn } from '../../ecs/worlds/hooks'
import { mapEvent } from '../../ecs/fight/events'
import { alongWall, keepOut, roomAt } from '../basin'
import { roomFor } from '../landmark'
import { BASIN_CELL_U, clockAt, hoisted, lifted, makeStage, actOf, slabOf, slabSd, slid, standing, trapsOf, turnLen } from './model'
import type { Basin } from '../basin'
import type { Landmark } from '../landmark'
import type { Stage, StageClock, Act, Piece, Slab } from './model'
import type { TheaterConfig } from '../../types/maps'
import type { Crossing } from '../../ecs/utils/pass'
import type { Point } from '../../util/vec'
import type { Sim } from '../../ecs/sim'
import type { WorldHooks } from '../../ecs/worlds/hooks'
import { hasTrait } from '../../ecs/utils/traits'

/** 舞台按布景种子打散出自己的种子 */
const STAGE_SEED = 0x5707b0
/** 布景的距离场往外只算这么远，格：再远的地方按台边算 */
const FIELD_REACH_U = 4
/** 寻路的粗格子边长，格；离挡路处至少这么远才算走得过 */
const FLOW_CELL_U = 0.5
const FLOW_CLEAR_U = 0.42
/** 布景后面的出怪口：离背面多远，离布景的一头多远，格 */
const WINGS_BACK_U = 0.75
const WINGS_END_U = 0.55
/** 角色被吊起来在画面上抬多高，格 */
export const HOIST_U = 3
/** 推景时离台左边沿不到这么远（格，算上身体半径）的就算推进了大幕，退场 */
const EXIT_U = 0.3
/** 一件布景落到台上时沿底边扬起几团灰 */
const POP_PUFFS = 3

/** 一档跨步高度的寻路：粗格子上到队长的路程（格），到不了为无穷；按哪一格的队长、哪一版布景、几时算的 */
interface Flow {
  readonly dist: Float32Array
  cell: number
  version: number
  at: number
}

/** 此刻立着、挡路的一件布景：挡人的块与顶离地多高（米，按占满的层算） */
interface Stand {
  readonly slab: Slab
  readonly top: number
  readonly piece: Piece
}

/**
 * 舞台此刻：台面，按幕缓存的布景，演到哪；落在台上的布景（哪一幕、哪几件）与它们挡人的块；
 * 小个子与跨得过矮布景的大个子各按一张距离场与一张寻路走；布景后面的出怪口
 */
export interface TheaterState {
  readonly stage: Stage
  readonly acts: Map<number, Act>
  clock: StageClock
  key: string
  version: number
  stands: Stand[]
  readonly low: Basin
  readonly high: Basin
  readonly flows: (Flow | null)[]
  readonly traps: readonly Landmark[]
  wings: Landmark[]
  wingsKey: string
  /** 吊过的是第几幕的换幕；地布推到哪了（上一帧）；正吊着的角色 */
  hoistAct: number
  slidAt: number
  readonly hung: Set<number>
}

function cfgOf(sim: Sim): TheaterConfig {
  return MAPS[sim.mapId].theater!
}

/** 这一局的书：视图与规则按同一个种子各要一次 */
export function stageFor(cfg: TheaterConfig, decorSeed: number): Stage {
  return makeStage(cfg, (decorSeed ^ STAGE_SEED) >>> 0)
}

/** 第几页：摆过的留着 */
export function actAt(s: Pick<TheaterState, 'acts' | 'stage'>, cfg: TheaterConfig, index: number): Act {
  let p = s.acts.get(index)
  if (!p) {
    p = actOf(cfg, s.stage, index)
    s.acts.set(index, p)
    for (const k of s.acts.keys()) if (k < index - 2) s.acts.delete(k)
  }
  return p
}

/** 书此刻换到哪：按难度时钟走，同一局里接着上一场 */
export function stageClock(sim: Sim, cfg: TheaterConfig, stage: Stage): StageClock {
  return clockAt(cfg, stage, clockSec(sim) * 1000)
}

function copyBasin(b: Basin): Basin {
  return { cols: b.cols, rows: b.rows, cell: b.cell, x0: b.x0, y0: b.y0, room: b.room.slice() }
}

export function theaterOf(sim: Sim): TheaterState {
  let s = sim.worldState.theater
  if (!s) {
    const cfg = cfgOf(sim)
    const stage = stageFor(cfg, sim.run.decorSeed)
    const traps = trapsOf(stage).map((t): Landmark => ({ x: t.x * UNIT, y: t.y * UNIT, r: 0.6 * UNIT, nx: 0, ny: 0 }))
    s = {
      stage,
      acts: new Map(),
      clock: stageClock(sim, cfg, stage),
      key: '',
      version: 0,
      stands: [],
      low: copyBasin(stage.basin),
      high: copyBasin(stage.basin),
      flows: [null, null],
      traps,
      wings: [],
      wingsKey: '',
      hoistAct: -1,
      slidAt: 1,
      hung: new Set(),
    }
    sim.worldState.theater = s
    refresh(s, cfg)
  }
  return s
}

/** 有符号距离场里叠上一件布景：只改它四周 FIELD_REACH_U 格以内 */
function stamp(b: Basin, slab: Slab): void {
  const reach = Math.hypot(slab.hw, slab.hd) + FIELD_REACH_U
  const cu = BASIN_CELL_U
  const ox = b.x0 / UNIT
  const oy = b.y0 / UNIT
  const i0 = Math.max(0, Math.floor((slab.cx - reach - ox) / cu))
  const i1 = Math.min(b.cols - 1, Math.ceil((slab.cx + reach - ox) / cu))
  const j0 = Math.max(0, Math.floor((slab.cy - reach - oy) / cu))
  const j1 = Math.min(b.rows - 1, Math.ceil((slab.cy + reach - oy) / cu))
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const k = j * b.cols + i
      const d = slabSd(slab, ox + (i + 0.5) * cu, oy + (j + 0.5) * cu) * UNIT
      if (d < b.room[k]!) b.room[k] = d
    }
  }
}

/** 此刻落在台上的是哪几件：换幕时旧幕还没吊起来的与新幕已经落下来的都算；变了就重铺距离场、作废寻路、重摆布景后的出怪口；返回刚落下来的 */
function refresh(s: TheaterState, cfg: TheaterConfig): Piece[] {
  const c = s.clock
  const acts = c.phase === 'change' ? [c.act - 1, c.act] : [c.act]
  const up: { act: number; i: number; p: Piece }[] = []
  for (const k of acts) {
    actAt(s, cfg, k).pieces.forEach((p, i) => {
      if (standing(lifted(cfg, c, k, p))) up.push({ act: k, i, p })
    })
  }
  const key = up.map((u) => `${u.act}:${u.i}`).join(',')
  if (key === s.key) return []
  const before = new Set(s.key.split(','))
  s.key = key
  s.version++
  s.stands = up.map((u) => ({ slab: slabOf(u.p), top: topOf(u.p.h), piece: u.p }))
  s.low.room.set(s.stage.basin.room)
  s.high.room.set(s.stage.basin.room)
  for (const st of s.stands) {
    stamp(s.low, st.slab)
    if (!st.piece.low) stamp(s.high, st.slab)
  }
  s.flows[0] = null
  s.flows[1] = null
  return up.filter((u) => !before.has(`${u.act}:${u.i}`)).map((u) => u.p)
}

/** 每件高的布景背后、靠一头的地方一处出怪口：从那里往那一头外面走出来 */
function wingsOf(s: TheaterState): Landmark[] {
  const out: Landmark[] = []
  for (const st of s.stands) {
    const p = st.piece
    if (p.low) continue
    const b = st.slab
    const fx = -b.uy
    const fy = b.ux
    const pick = (p.seed & 1) === 0 ? [1, -1] : [-1, 1]
    for (const side of pick) {
      const along = Math.max(0, b.hw - WINGS_END_U)
      const x = b.cx - fx * (b.hd + WINGS_BACK_U) + b.ux * side * along
      const y = b.cy - fy * (b.hd + WINGS_BACK_U) + b.uy * side * along
      if (roomAt(s.low, x * UNIT, y * UNIT) < 0.5 * UNIT) continue
      out.push({ x: x * UNIT, y: y * UNIT, r: 0.5 * UNIT, nx: b.ux * side, ny: b.uy * side })
      break
    }
  }
  return out
}

/**
 * 换幕时吊角色：一开头每个站着的角色都被吊绳原地吊起来——穿行到原处，整个换幕都吊着，碰不到谁、谁也碰不到他，
 * 不能动、不能打、不受伤、捡不了东西；画面上按吊起的高度往上抬，放下时落回原处，原处被新布景占了就挤到旁边
 */
function hoist(sim: Sim, s: TheaterState, cfg: TheaterConfig): void {
  const c = s.clock
  if (c.phase === 'change' && s.hoistAct !== c.act) {
    s.hoistAct = c.act
    mapEvent(sim, 'act')
    for (const m of sim.characters) {
      if (!Alive.v[m] || inTransit(m)) continue
      if (displace(sim, m, { kind: 'transit', x: Transform.x[m]!, y: Transform.y[m]!, ms: turnLen(cfg) * 2, look: 'hoist', color: 0 }, { self: false, free: true })) s.hung.add(m)
    }
  }
  const k = hoisted(cfg, c)
  for (const m of s.hung) {
    let up = inTransit(m) && Motion.look[m] === TRANSIT.hoist
    // 换幕按难度时钟走，吊着的那段按模拟时间走：换完就放下，不等那段走完
    if (up && c.phase === 'stand') {
      endMotion(m)
      up = false
    }
    VisOff.y[m] = -hoverPx(m) - (up ? k * HOIST_U * UNIT : 0)
    if (!up) s.hung.delete(m)
  }
}

/** 推景：地布从右往左推过去时，地上的东西——敌人（定身的除外）、掉落物、碎屑——都跟着地布一起往左挪，吊着的角色与飞着的不动；推进左边大幕的退场，不算打倒、不掉东西 */
function carry(sim: Sim, s: TheaterState, cfg: TheaterConfig): void {
  const u = slid(cfg, s.clock)
  const du = u - s.slidAt
  s.slidAt = u
  if (s.clock.phase !== 'change' || du <= 0) return
  const dx = -du * (s.stage.x1 - s.stage.x0) * UNIT
  const edge = (s.stage.x0 + EXIT_U) * UNIT
  for (const eid of [...query(sim.world, ENEMY_SET)]) {
    if (!Alive.v[eid] || inTransit(eid) || hasTrait(sim.world, eid, 'anchored') || hasTrait(sim.world, eid, 'flies')) continue
    Transform.x[eid] = Transform.x[eid]! + dx
    if (Transform.x[eid]! - Radius.v[eid]! < edge) despawnEnemy(sim, eid, false)
  }
  for (const eid of [...query(sim.world, PICKUP_SET)]) {
    Transform.x[eid] = Transform.x[eid]! + dx
    if (Transform.x[eid]! >= edge) continue
    pickupDef[eid] = undefined
    pickupSfx[eid] = undefined
    removeEntity(sim.world, eid)
  }
  for (const eid of [...query(sim.world, [Shard, Transform])]) {
    Transform.x[eid] = Transform.x[eid]! + dx
    if (Transform.x[eid]! < edge) removeEntity(sim.world, eid)
  }
}

/** 跨得过矮布景的身体按高的那张距离场 */
function bigOf(sim: Sim, eid: number): boolean {
  return clearM(eid) >= topOf(cfgOf(sim).lowM)
}

function basinOf(sim: Sim, s: TheaterState, eid: number): Basin {
  return bigOf(sim, eid) ? s.high : s.low
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

/** 寻路的粗格子铺满台面 */
function flowGrid(stage: Stage): { cols: number; rows: number } {
  return { cols: Math.ceil((stage.x1 - stage.x0) / FLOW_CELL_U), rows: Math.ceil((stage.y1 - stage.y0) / FLOW_CELL_U) }
}

function flowCell(stage: Stage, x: number, y: number): number {
  const { cols, rows } = flowGrid(stage)
  const i = Math.min(cols - 1, Math.max(0, Math.floor((x / UNIT - stage.x0) / FLOW_CELL_U)))
  const j = Math.min(rows - 1, Math.max(0, Math.floor((y / UNIT - stage.y0) / FLOW_CELL_U)))
  return j * cols + i
}

/** 一档个子到队长的寻路：队长换了粗格子或布景变了，过了 reflowMs 才重算 */
function flowOf(sim: Sim, s: TheaterState, level: number): Flow {
  const stage = s.stage
  const { cols, rows } = flowGrid(stage)
  const lead = leaderPoint(sim)
  const cell = flowCell(stage, lead.x, lead.y)
  let f = s.flows[level]
  if (f && ((f.cell === cell && f.version === s.version) || (f.version === s.version && sim.elapsedMs - f.at < cfgOf(sim).reflowMs))) return f
  if (!f) {
    f = { dist: new Float32Array(cols * rows), cell: -1, version: -1, at: 0 }
    s.flows[level] = f
  }
  const b = level === 1 ? s.high : s.low
  const ok = new Uint8Array(cols * rows)
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) ok[j * cols + i] = roomAt(b, (stage.x0 + (i + 0.5) * FLOW_CELL_U) * UNIT, (stage.y0 + (j + 0.5) * FLOW_CELL_U) * UNIT) >= FLOW_CLEAR_U * UNIT ? 1 : 0
  }
  const dist = f.dist
  dist.fill(Infinity)
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

/** 寻路在 (x, y) 像素处往下走的方向；到不了队长的地方往最近一格到得了的走；都不行返回 null */
function descend(stage: Stage, f: Flow, x: number, y: number): Point | null {
  const { cols, rows } = flowGrid(stage)
  const fx = (x / UNIT - stage.x0) / FLOW_CELL_U
  const fy = (y / UNIT - stage.y0) / FLOW_CELL_U
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
  if (len > 1e-6) return { x: su / len, y: sv / len }
  if (best < here) return { x: bu, y: bv }
  return null
}

/** 从 a 到 b（像素）这一路半径 rad 的身体都走得过：每隔小半格看一次离布景多远 */
function clearPath(b: Basin, ax: number, ay: number, bx: number, by: number, rad: number): boolean {
  const len = Math.hypot(bx - ax, by - ay)
  const n = Math.ceil(len / (0.4 * UNIT))
  for (let k = 1; k <= n; k++) {
    const t = k / n
    if (roomAt(b, ax + (bx - ax) * t, ay + (by - ay) * t) < rad) return false
  }
  return true
}

/** 线段 a→b（像素）穿过一块的那一截，按线段从 0 到 1；不穿过为 null */
function slabSpan(sl: Slab, ax: number, ay: number, bx: number, by: number): [number, number] | null {
  const px = ax / UNIT - sl.cx
  const py = ay / UNIT - sl.cy
  const qx = bx / UNIT - sl.cx
  const qy = by / UNIT - sl.cy
  const u0 = px * sl.ux + py * sl.uy
  const v0 = -px * sl.uy + py * sl.ux
  const du = qx * sl.ux + qy * sl.uy - u0
  const dv = -qx * sl.uy + qy * sl.ux - v0
  let t0 = 0
  let t1 = 1
  for (const [p, d, h] of [[u0, du, sl.hw], [v0, dv, sl.hd]] as const) {
    if (Math.abs(d) < 1e-9) {
      if (Math.abs(p) > h) return null
      continue
    }
    let a = (-h - p) / d
    let c = (h - p) / d
    if (a > c) [a, c] = [c, a]
    t0 = Math.max(t0, a)
    t1 = Math.min(t1, c)
    if (t0 > t1) return null
  }
  return [t0, t1]
}

/** 台上离布景与台边至少 room 像素的一点：从 p 往外一圈圈找，近处找不到就退回开局站位 */
function openNear(s: TheaterState, p: Point, room: number): Point {
  for (let r = 0; r <= 10 * UNIT; r += 0.5 * UNIT) {
    const n = r === 0 ? 1 : Math.ceil((r * Math.PI * 2) / (0.5 * UNIT))
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2
      const q = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r }
      if (roomAt(s.low, q.x, q.y) >= room) return q
    }
  }
  return { x: s.stage.start.x * UNIT, y: s.stage.start.y * UNIT }
}

/**
 * 舞台：能走的是台面，台边是硬边界；地布上画的都能走。台上立着的布景片挡人：齐腰的矮布景跨得过的大个子照走、小个子绕着走，
 * 高的谁都绕着走，也挡子弹和视线（矮的只挡低处飞的）；穿墙的身体穿得过卡纸。按难度时钟换幕：旧布景吊离台面就不再挡路，
 * 新布景落到台上，压着的身体按距离场挤到最近的空处
 */
export const theater: WorldHooks = {
  ...bounded,
  constrainBody(sim, eid, _from, next) {
    const s = theaterOf(sim)
    const r = Radius.v[eid]!
    if (phases(sim.world, eid, 'paper')) return keepOut(s.stage.basin, next.x, next.y, r)
    return keepOut(basinOf(sim, s, eid), next.x, next.y, r)
  },
  basin(sim) {
    return theaterOf(sim).stage.basin
  },
  ground(sim) {
    return theaterOf(sim).stage.basin
  },
  chaseDir(sim, eid, tx, ty) {
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const d = norm(tx - x, ty - y)
    const s = theaterOf(sim)
    if (phases(sim.world, eid, 'paper')) return alongWall(s.stage.basin, x, y, d.x, d.y, Radius.v[eid]! + 0.3 * UNIT)
    const big = bigOf(sim, eid)
    const b = big ? s.high : s.low
    const rad = Radius.v[eid]!
    const lead = leaderPoint(sim)
    if ((tx - lead.x) ** 2 + (ty - lead.y) ** 2 < (3 * UNIT) ** 2 && !clearPath(b, x, y, tx, ty, rad * 0.9)) {
      const dir = descend(s.stage, flowOf(sim, s, big ? 1 : 0), x, y)
      if (dir) return alongWall(b, x, y, dir.x, dir.y, rad + 0.2 * UNIT)
    }
    return alongWall(b, x, y, d.x, d.y, rad + 0.3 * UNIT)
  },
  /** 立着的布景按高矮挡：探测穿过它那一截的最低处低过它的顶就挡下 */
  trace(sim, probe, ax, ay, bx, by) {
    if (passCost(probe, 'paper') <= 0) return null
    let best: Crossing | null = null
    for (const st of theaterOf(sim).stands) {
      const span = slabSpan(st.slab, ax, ay, bx, by)
      if (!span || (best && span[0] >= best.t0)) continue
      if (Math.min(probeZ(probe, span[0]), probeZ(probe, span[1])) >= st.top) continue
      best = { t0: span[0], t1: span[1], material: 'paper' }
    }
    return best
  },
  solidAt(sim, x, y) {
    for (const st of theaterOf(sim).stands) if (slabSd(st.slab, x / UNIT, y / UNIT) < 0) return { topM: st.piece.h, material: 'paper' }
    return null
  },
  impact(sim, x, y, material) {
    if (material === 'paper') sim.out.bursts.push({ x, y, count: 2, kind: 'paper' })
  },
  wanderDir(sim, eid, dx, dy) {
    return wanderIn(basinOf(sim, theaterOf(sim), eid), eid, dx, dy)
  },
  fleeDir(sim, eid, awayX, awayY) {
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const d = fleeSteer(x, y, awayX, awayY, sim.mapW, sim.mapH, 1.5 * UNIT)
    return alongWall(basinOf(sim, theaterOf(sim), eid), x, y, d.x, d.y, Radius.v[eid]! + 1.5 * UNIT)
  },
  /** 刷怪点落在台上、离布景与台边至少一格，离队长够远；头目更远 */
  spawnPoint(sim, boss) {
    const s = theaterOf(sim)
    const stage = s.stage
    const lead = leaderPoint(sim)
    const far = SPAWN.minPlayerDist * UNIT * (boss ? 1.6 : 1)
    let p: Point = { x: stage.start.x * UNIT, y: stage.start.y * UNIT }
    for (let i = 0; i < 48; i++) {
      p = { x: (stage.x0 + (stage.x1 - stage.x0) * sim.rng.next()) * UNIT, y: (stage.y0 + (stage.y1 - stage.y0) * sim.rng.next()) * UNIT }
      if (roomAt(s.low, p.x, p.y) < UNIT) continue
      if ((p.x - lead.x) ** 2 + (p.y - lead.y) ** 2 >= far * far) return p
    }
    return openNear(s, p, UNIT)
  },
  center(sim) {
    const st = theaterOf(sim).stage.start
    return { x: st.x * UNIT, y: st.y * UNIT }
  },
  settle(sim, p) {
    return openNear(theaterOf(sim), p, SPAWN.edgeInset * UNIT)
  },
  canSpawn(sim, x, y, radius) {
    return roomFor(theaterOf(sim).low, x, y, radius)
  },
  landmarks(sim) {
    const s = theaterOf(sim)
    return { trap: s.traps, wings: s.wings }
  },
  onStart(sim) {
    theaterOf(sim)
  },
  /** 按难度时钟换幕：吊起角色、推走台上的一切；台上的布景一变就重铺距离场，换幕时刚落下来的沿底边扬灰 */
  tick(sim) {
    const cfg = cfgOf(sim)
    const s = theaterOf(sim)
    s.clock = stageClock(sim, cfg, s.stage)
    hoist(sim, s, cfg)
    carry(sim, s, cfg)
    const popped = refresh(s, cfg)
    const wings = s.clock.phase === 'stand' ? s.key : ''
    if (wings !== s.wingsKey) {
      s.wingsKey = wings
      s.wings = wings ? wingsOf(s) : []
    }
    if (s.clock.phase !== 'change') return
    for (const p of popped) {
      const sl = slabOf(p)
      for (let k = 0; k < POP_PUFFS; k++) {
        const t = (k + 0.5) / POP_PUFFS - 0.5
        sim.out.bursts.push({ x: (p.x + sl.ux * t * p.w) * UNIT, y: (p.y + sl.uy * t * p.w) * UNIT, count: 3, kind: 'paper' })
      }
    }
  },
}
