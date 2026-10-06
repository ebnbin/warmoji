import { UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { MAPS } from '../../data/maps'
import { SPAWN } from '../../data/enemies'
import { query } from 'bitecs'
import { Alive, Phys, Radius, Transform, Uid } from '../../ecs/components'
import { displace } from '../../ecs/systems/shared/displace'
import { clockSec } from '../../ecs/fight/clock'
import { fleeSteer } from '../../ecs/systems/shared/steer'
import { leaderPoint } from '../../ecs/utils/team'
import { clearM, passCost, phases, probeZ, topOf } from '../../ecs/utils/pass'
import { bounded, wanderIn } from '../../ecs/worlds/hooks'
import { alongWall, keepOut, roomAt } from '../basin'
import { roomFor } from '../landmark'
import { BASIN_CELL_U, clockAt, laid, leafEdge, makeBook, pageOf, slabOf, slabSd, standing } from './model'
import type { Basin } from '../basin'
import type { Landmark } from '../landmark'
import type { Book, BookClock, Page, Piece, Slab } from './model'
import type { StorybookConfig } from '../../types/maps'
import type { Crossing } from '../../ecs/utils/pass'
import type { Point } from '../../util/vec'
import type { Sim } from '../../ecs/sim'
import type { WorldHooks } from '../../ecs/worlds/hooks'

/** 立体书按布景种子打散出自己的种子 */
const BOOK_SEED = 0x5707b0
/** 布景的距离场往外只算这么远，格：再远的地方按页边算 */
const FIELD_REACH_U = 4
/** 寻路的粗格子边长，格；离挡路处至少这么远才算走得过 */
const FLOW_CELL_U = 0.5
const FLOW_CLEAR_U = 0.42
/** 书脊中缝上每隔这么远（格）一处出怪的口子，离上下页边至少这么远（格） */
const GUTTER_STEP_U = 2.4
const GUTTER_END_U = 1.6
/** 布景后面的出怪口：离背面多远，离布景的一头多远，格 */
const WINGS_BACK_U = 0.75
const WINGS_END_U = 0.55
/**
 * 翻页时被书页扬起来的身体：书页的自由边扫到它前 TOSS_LEAD 格就抛起来，腾空 TOSS_MS 毫秒、最高 TOSS_U 格，
 * 落回原地附近，顺着书页翻的方向被风带出 TOSS_DRIFT_U 格之间
 */
const TOSS_LEAD_U = 0.5
const TOSS_MS = 900
const TOSS_U = 1.4
const TOSS_DRIFT_U = [0.3, 0.9] as const
/** 一件布景弹起来时沿底边冒几团碎纸 */
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
 * 立体书此刻：摊开的书，按页缓存的布景，翻到哪；立着的布景（哪一页、哪几件）与它们挡人的块；
 * 小个子与跨得过矮布景的大个子各按一张距离场与一张寻路走；布景后面的出怪口
 */
export interface StorybookState {
  readonly book: Book
  readonly pages: Map<number, Page>
  clock: BookClock
  key: string
  version: number
  stands: Stand[]
  readonly low: Basin
  readonly high: Basin
  readonly flows: (Flow | null)[]
  readonly gutter: readonly Landmark[]
  wings: Landmark[]
  wingsKey: string
  /** 这一次翻页已经扬起来的身体：翻到第几页时记的，记的是实体与它的编号 */
  tossPage: number
  readonly tossed: Set<string>
}

function cfgOf(sim: Sim): StorybookConfig {
  return MAPS[sim.mapId].storybook!
}

/** 这一局的书：视图与规则按同一个种子各要一次 */
export function bookFor(cfg: StorybookConfig, decorSeed: number): Book {
  return makeBook(cfg, (decorSeed ^ BOOK_SEED) >>> 0)
}

/** 第几页：摆过的留着 */
export function pageAt(s: Pick<StorybookState, 'pages' | 'book'>, cfg: StorybookConfig, index: number): Page {
  let p = s.pages.get(index)
  if (!p) {
    p = pageOf(cfg, s.book, index)
    s.pages.set(index, p)
    for (const k of s.pages.keys()) if (k < index - 2) s.pages.delete(k)
  }
  return p
}

/** 书此刻翻到哪：按难度时钟走，同一局里接着上一场 */
export function bookClock(sim: Sim, cfg: StorybookConfig, book: Book): BookClock {
  return clockAt(cfg, book, clockSec(sim) * 1000)
}

function copyBasin(b: Basin): Basin {
  return { cols: b.cols, rows: b.rows, cell: b.cell, x0: b.x0, y0: b.y0, room: b.room.slice() }
}

export function storybookOf(sim: Sim): StorybookState {
  let s = sim.worldState.storybook
  if (!s) {
    const cfg = cfgOf(sim)
    const book = bookFor(cfg, sim.run.decorSeed)
    const gutter: Landmark[] = []
    for (let y = book.y0 + GUTTER_END_U; y <= book.y1 - GUTTER_END_U + 1e-6; y += GUTTER_STEP_U) gutter.push({ x: book.gx * UNIT, y: y * UNIT, r: 0.6 * UNIT, nx: 0, ny: 0 })
    s = {
      book,
      pages: new Map(),
      clock: bookClock(sim, cfg, book),
      key: '',
      version: 0,
      stands: [],
      low: copyBasin(book.basin),
      high: copyBasin(book.basin),
      flows: [null, null],
      gutter,
      wings: [],
      wingsKey: '',
      tossPage: -1,
      tossed: new Set(),
    }
    sim.worldState.storybook = s
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

/** 此刻立着的是哪一页的哪几件：变了就重铺距离场、作废寻路、重摆布景后的出怪口 */
function refresh(s: StorybookState, cfg: StorybookConfig): Piece[] {
  const c = s.clock
  const page = pageAt(s, cfg, c.page)
  const up: number[] = []
  page.pieces.forEach((p, i) => {
    if (standing(laid(cfg, c, c.page, p))) up.push(i)
  })
  const key = `${c.page}:${up.join(',')}`
  if (key === s.key) return []
  const before = new Set(s.key.startsWith(`${c.page}:`) ? s.key.slice(s.key.indexOf(':') + 1).split(',').filter(Boolean).map(Number) : [])
  s.key = key
  s.version++
  s.stands = up.map((i) => {
    const p = page.pieces[i]!
    return { slab: slabOf(p), top: topOf(p.h), piece: p }
  })
  s.low.room.set(s.book.basin.room)
  s.high.room.set(s.book.basin.room)
  for (const st of s.stands) {
    stamp(s.low, st.slab)
    if (!st.piece.low) stamp(s.high, st.slab)
  }
  s.flows[0] = null
  s.flows[1] = null
  return up.filter((i) => !before.has(i)).map((i) => page.pieces[i]!)
}

/** 每件高的布景背后、靠一头的地方一处出怪口：从那里往那一头外面走出来 */
function wingsOf(s: StorybookState): Landmark[] {
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
 * 书页翻过去时不会盖在谁身上：书页从右往左扫，自由边快扫到谁，谁就被托起、扇起来抛到半空，
 * 书页从他脚下翻过去，他落在新的一页上。敌我、掉落物一样，锚定的、霸体的也一样
 */
function toss(sim: Sim, s: StorybookState): void {
  const edge = leafEdge(s.clock, s.book)
  if (edge === null) return
  if (s.tossPage !== s.clock.page) {
    s.tossPage = s.clock.page
    s.tossed.clear()
  }
  for (const eid of query(sim.world, [Phys, Transform, Radius])) {
    if (!Alive.v[eid]) continue
    const x = Transform.x[eid]!
    if (edge > x / UNIT + TOSS_LEAD_U) continue
    const key = `${eid}:${Uid.v[eid]}`
    if (s.tossed.has(key)) continue
    s.tossed.add(key)
    const drift = (TOSS_DRIFT_U[0] + (TOSS_DRIFT_U[1] - TOSS_DRIFT_U[0]) * sim.rng.next()) * UNIT
    const y = Transform.y[eid]!
    displace(sim, eid, { kind: 'arc', x: x - drift, y: y + (sim.rng.next() - 0.5) * 0.4 * UNIT, ms: TOSS_MS, height: TOSS_U * UNIT }, { self: false, free: true })
  }
}

/** 跨得过矮布景的身体按高的那张距离场 */
function bigOf(sim: Sim, eid: number): boolean {
  return clearM(eid) >= topOf(cfgOf(sim).lowM)
}

function basinOf(sim: Sim, s: StorybookState, eid: number): Basin {
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

/** 寻路的粗格子铺满书页 */
function flowGrid(book: Book): { cols: number; rows: number } {
  return { cols: Math.ceil((book.x1 - book.x0) / FLOW_CELL_U), rows: Math.ceil((book.y1 - book.y0) / FLOW_CELL_U) }
}

function flowCell(book: Book, x: number, y: number): number {
  const { cols, rows } = flowGrid(book)
  const i = Math.min(cols - 1, Math.max(0, Math.floor((x / UNIT - book.x0) / FLOW_CELL_U)))
  const j = Math.min(rows - 1, Math.max(0, Math.floor((y / UNIT - book.y0) / FLOW_CELL_U)))
  return j * cols + i
}

/** 一档个子到队长的寻路：队长换了粗格子或布景变了，过了 reflowMs 才重算 */
function flowOf(sim: Sim, s: StorybookState, level: number): Flow {
  const book = s.book
  const { cols, rows } = flowGrid(book)
  const lead = leaderPoint(sim)
  const cell = flowCell(book, lead.x, lead.y)
  let f = s.flows[level]
  if (f && ((f.cell === cell && f.version === s.version) || (f.version === s.version && sim.elapsedMs - f.at < cfgOf(sim).reflowMs))) return f
  if (!f) {
    f = { dist: new Float32Array(cols * rows), cell: -1, version: -1, at: 0 }
    s.flows[level] = f
  }
  const b = level === 1 ? s.high : s.low
  const ok = new Uint8Array(cols * rows)
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) ok[j * cols + i] = roomAt(b, (book.x0 + (i + 0.5) * FLOW_CELL_U) * UNIT, (book.y0 + (j + 0.5) * FLOW_CELL_U) * UNIT) >= FLOW_CLEAR_U * UNIT ? 1 : 0
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
function descend(book: Book, f: Flow, x: number, y: number): Point | null {
  const { cols, rows } = flowGrid(book)
  const fx = (x / UNIT - book.x0) / FLOW_CELL_U
  const fy = (y / UNIT - book.y0) / FLOW_CELL_U
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

/** 页面上离布景与页边至少 room 像素的一点：从 p 往外一圈圈找，近处找不到就退回开局站位 */
function openNear(s: StorybookState, p: Point, room: number): Point {
  for (let r = 0; r <= 10 * UNIT; r += 0.5 * UNIT) {
    const n = r === 0 ? 1 : Math.ceil((r * Math.PI * 2) / (0.5 * UNIT))
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2
      const q = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r }
      if (roomAt(s.low, q.x, q.y) >= room) return q
    }
  }
  return { x: s.book.start.x * UNIT, y: s.book.start.y * UNIT }
}

/**
 * 立体书：能走的是摊开的两页，页边是硬边界；页面上印的都能走。立起来的剪纸布景挡人：齐腰的矮布景跨得过的大个子照走、小个子绕着走，
 * 高的谁都绕着走，也挡子弹和视线（矮的只挡低处飞的）；穿墙的身体穿得过卡纸。书按难度时钟翻页：这一页的布景依次折平就不再挡路，
 * 新一页的布景依次弹起来，弹起处站着的身体按距离场挤到最近的空处
 */
export const storybook: WorldHooks = {
  ...bounded,
  constrainBody(sim, eid, _from, next) {
    const s = storybookOf(sim)
    const r = Radius.v[eid]!
    if (phases(sim.world, eid, 'paper')) return keepOut(s.book.basin, next.x, next.y, r)
    return keepOut(basinOf(sim, s, eid), next.x, next.y, r)
  },
  basin(sim) {
    return storybookOf(sim).book.basin
  },
  ground(sim) {
    return storybookOf(sim).book.basin
  },
  chaseDir(sim, eid, tx, ty) {
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const d = norm(tx - x, ty - y)
    const s = storybookOf(sim)
    if (phases(sim.world, eid, 'paper')) return alongWall(s.book.basin, x, y, d.x, d.y, Radius.v[eid]! + 0.3 * UNIT)
    const big = bigOf(sim, eid)
    const b = big ? s.high : s.low
    const rad = Radius.v[eid]!
    const lead = leaderPoint(sim)
    if ((tx - lead.x) ** 2 + (ty - lead.y) ** 2 < (3 * UNIT) ** 2 && !clearPath(b, x, y, tx, ty, rad * 0.9)) {
      const dir = descend(s.book, flowOf(sim, s, big ? 1 : 0), x, y)
      if (dir) return alongWall(b, x, y, dir.x, dir.y, rad + 0.2 * UNIT)
    }
    return alongWall(b, x, y, d.x, d.y, rad + 0.3 * UNIT)
  },
  /** 立着的布景按高矮挡：探测穿过它那一截的最低处低过它的顶就挡下 */
  trace(sim, probe, ax, ay, bx, by) {
    if (passCost(probe, 'paper') <= 0) return null
    let best: Crossing | null = null
    for (const st of storybookOf(sim).stands) {
      const span = slabSpan(st.slab, ax, ay, bx, by)
      if (!span || (best && span[0] >= best.t0)) continue
      if (Math.min(probeZ(probe, span[0]), probeZ(probe, span[1])) >= st.top) continue
      best = { t0: span[0], t1: span[1], material: 'paper' }
    }
    return best
  },
  solidAt(sim, x, y) {
    for (const st of storybookOf(sim).stands) if (slabSd(st.slab, x / UNIT, y / UNIT) < 0) return { topM: st.piece.h, material: 'paper' }
    return null
  },
  impact(sim, x, y, material) {
    if (material === 'paper') sim.out.bursts.push({ x, y, count: 2, kind: 'paper' })
  },
  wanderDir(sim, eid, dx, dy) {
    return wanderIn(basinOf(sim, storybookOf(sim), eid), eid, dx, dy)
  },
  fleeDir(sim, eid, awayX, awayY) {
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const d = fleeSteer(x, y, awayX, awayY, sim.mapW, sim.mapH, 1.5 * UNIT)
    return alongWall(basinOf(sim, storybookOf(sim), eid), x, y, d.x, d.y, Radius.v[eid]! + 1.5 * UNIT)
  },
  /** 刷怪点落在页面上、离布景与页边至少一格，离队长够远；头目更远 */
  spawnPoint(sim, boss) {
    const s = storybookOf(sim)
    const book = s.book
    const lead = leaderPoint(sim)
    const far = SPAWN.minPlayerDist * UNIT * (boss ? 1.6 : 1)
    let p: Point = { x: book.start.x * UNIT, y: book.start.y * UNIT }
    for (let i = 0; i < 48; i++) {
      p = { x: (book.x0 + (book.x1 - book.x0) * sim.rng.next()) * UNIT, y: (book.y0 + (book.y1 - book.y0) * sim.rng.next()) * UNIT }
      if (roomAt(s.low, p.x, p.y) < UNIT) continue
      if ((p.x - lead.x) ** 2 + (p.y - lead.y) ** 2 >= far * far) return p
    }
    return openNear(s, p, UNIT)
  },
  center(sim) {
    const st = storybookOf(sim).book.start
    return { x: st.x * UNIT, y: st.y * UNIT }
  },
  settle(sim, p) {
    return openNear(storybookOf(sim), p, SPAWN.edgeInset * UNIT)
  },
  canSpawn(sim, x, y, radius) {
    return roomFor(storybookOf(sim).low, x, y, radius)
  },
  landmarks(sim) {
    const s = storybookOf(sim)
    return { gutter: s.gutter, wings: s.wings }
  },
  onStart(sim) {
    storybookOf(sim)
  },
  /** 按难度时钟翻页；书页扫过的身体扬起来落到新的一页上；立着的布景一变就重铺距离场，刚弹起来的沿底边冒碎纸 */
  tick(sim) {
    const cfg = cfgOf(sim)
    const s = storybookOf(sim)
    s.clock = bookClock(sim, cfg, s.book)
    toss(sim, s)
    const popped = refresh(s, cfg)
    const wings = s.clock.phase === 'stand' ? s.key : ''
    if (wings !== s.wingsKey) {
      s.wingsKey = wings
      s.wings = wings ? wingsOf(s) : []
    }
    if (s.clock.phase !== 'pop') return
    for (const p of popped) {
      const sl = slabOf(p)
      for (let k = 0; k < POP_PUFFS; k++) {
        const t = (k + 0.5) / POP_PUFFS - 0.5
        sim.out.bursts.push({ x: (p.x + sl.ux * t * p.w) * UNIT, y: (p.y + sl.uy * t * p.w) * UNIT, count: 3, kind: 'paper' })
      }
    }
  },
}
