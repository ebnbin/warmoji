import { FRAME_U, UNIT } from '../../util/units.ts'
import { Rng } from '../../util/rng.ts'
import { makeBasin } from '../basin.ts'
import type { Basin } from '../basin'
import type { StorybookConfig } from '../../types/maps'
import type { Point } from '../../util/vec'

/** 台边的距离场按这么细的格子算，格；台上的布景也叠在同一套格子上 */
export const BASIN_CELL_U = 0.125
/** 距离场比台面多铺这么宽，格：最外一圈是台外 */
const BASIN_PAD_U = 1
/** 页角磨圆的半径，格 */
const CORNER_U = 0.35
/** 卡纸布景挡人的那一层有多厚，格 */
export const CARD_U = 0.2
/** 查连通按这么粗的格子，格 */
const REACH_CELL_U = 0.25
/** 查连通时小个子、头目各按多大的半径，格：配比里最大的小怪、地图的头目都挤得过布景之间的路 */
const SMALL_U = 0.65
const BIG_U = 1.15
/** 摆在两个景交界那一带的布景离界线最多多远，格 */
const MID_U = 2.6
/** 台中线上的活门离台中心多远，格 */
const TRAP_DY = [-11, -6.5, 6.5, 11] as const
/** 一页最多换几次种子重摆 */
const PAGE_TRIES = 12
/** 一件布景最多换几个地方试 */
const PIECE_TRIES = 40

/** 故事的四章：一章一个季节，按这个次序轮下去 */
export const CHAPTERS = [
  { key: 'spring', num: '一', name: '樱花溪', text: ['春天到了，小小的旅人们', '跟着小溪穿过草地，', '溪水流进了开满樱花的院子。'] },
  { key: 'summer', num: '二', name: '沙与海', text: ['他们翻过滚烫的沙丘，', '一直走到大海边。', '海的深处，停着一艘小小的潜艇。'] },
  { key: 'autumn', num: '三', name: '红叶洞', text: ['红叶落满了旧城墙，', '墙后面藏着一个山洞，', '洞里点着一盏盏火把。'] },
  { key: 'winter', num: '四', name: '火与冰', text: ['冬天来了，雪落满了冰原，', '远处的火山还冒着烟。', '旅人们的故事，还在继续。'] },
] as const
export type ChapterKey = (typeof CHAPTERS)[number]['key']

export type PieceKind =
  | 'pine'
  | 'rail'
  | 'sheep'
  | 'bush'
  | 'sakura'
  | 'temple'
  | 'bamboo'
  | 'lantern'
  | 'cactus'
  | 'cairn'
  | 'palm'
  | 'reef'
  | 'sub'
  | 'kelp'
  | 'coral'
  | 'ruin'
  | 'column'
  | 'maple'
  | 'leaves'
  | 'spire'
  | 'pillar'
  | 'shroom'
  | 'torch'
  | 'cone'
  | 'crag'
  | 'berg'
  | 'snowpine'
  | 'drift'

/**
 * 一件立起来的布景，格与米：正面的底边中点 (x, y)，底边朝 a 弧度（0 是横的，正面朝屏幕下方），底边长 w，往后厚 d（卡纸是 CARD_U，盒子按它自己的进深）；
 * 高 h 米，low 的是齐腰的矮布景；同一 group 的几件拼成一组，可以挨着；seed 定画法上的变化
 */
export interface Piece {
  readonly kind: PieceKind
  readonly x: number
  readonly y: number
  readonly a: number
  readonly w: number
  readonly d: number
  readonly h: number
  readonly low: boolean
  readonly box: boolean
  readonly group: number
  readonly seed: number
}

/**
 * 一页上两个景过渡的那条界：line 是一条弯弯曲曲的线，过 (cx, cy)、法线 (nx, ny) 朝第二个景；ring 是围着 (cx, cy)、半径 r 的一圈，圈里是第一个景。
 * 界线按波长 waveU、幅度 amp 起伏，phase 定起伏的相位；离界线 band 格以内是两个景渐变过去的那一带
 */
export interface Blend {
  readonly kind: 'line' | 'ring'
  readonly cx: number
  readonly cy: number
  readonly nx: number
  readonly ny: number
  readonly r: number
  readonly amp: number
  readonly waveU: number
  readonly phase: number
  readonly band: number
}

/** (x, y) 格离界线多远，格：第一个景那边为负，第二个景那边为正 */
export function blendSd(b: Blend, x: number, y: number): number {
  const dx = x - b.cx
  const dy = y - b.cy
  if (b.kind === 'ring') {
    const ang = Math.atan2(dy, dx)
    return Math.hypot(dx, dy) - b.r - b.amp * Math.sin(ang * Math.max(2, Math.round((b.r * 2 * Math.PI) / b.waveU)) + b.phase)
  }
  const along = -dx * b.ny + dy * b.nx
  return dx * b.nx + dy * b.ny + b.amp * Math.sin((along / b.waveU) * Math.PI * 2 + b.phase)
}

/** (x, y) 格离第二个景有多近：0 是纯第一个景，1 是纯第二个景 */
export function blendAt(b: Blend, x: number, y: number): number {
  const t = Math.min(1, Math.max(0, (blendSd(b, x, y) / b.band + 1) / 2))
  return t * t * (3 - 2 * t)
}

/** 一幕（代码里叫一页）：第几幕（从开局那一幕起数），哪一章，这一幕的种子、两个景的分界与台上的布景 */
export interface Page {
  readonly index: number
  readonly chapter: number
  readonly seed: number
  readonly blend: Blend
  readonly pieces: readonly Piece[]
}

/** 台面（代码里叫书），格：台面的范围，台中线的横坐标，台边的距离场（像素），开局站位，开局演到哪一章 */
export interface Book {
  readonly x0: number
  readonly x1: number
  readonly y0: number
  readonly y1: number
  readonly gx: number
  readonly cy: number
  readonly basin: Basin
  readonly start: Point
  readonly chapter0: number
  readonly seed: number
}

/** 台面摆在方框正中，台中线竖着；开局演到哪一章按种子定 */
export function makeBook(cfg: StorybookConfig, seed: number): Book {
  const c = FRAME_U / 2
  const x0 = c - cfg.page.wU
  const x1 = c + cfg.page.wU
  const y0 = c - cfg.page.hU / 2
  const y1 = c + cfg.page.hU / 2
  const pad = BASIN_PAD_U
  const cell = BASIN_CELL_U * UNIT
  const bx0 = (x0 - pad) * UNIT
  const by0 = (y0 - pad) * UNIT
  const cols = Math.round((x1 - x0 + pad * 2) / BASIN_CELL_U)
  const rows = Math.round((y1 - y0 + pad * 2) / BASIN_CELL_U)
  const open = (px: number, py: number): boolean => pageRoom(x0, x1, y0, y1, px / UNIT, py / UNIT) > 0
  const basin = makeBasin(open, bx0, by0, cols, rows, cell, { x: c * UNIT, y: c * UNIT }, 0.05 * UNIT)
  const rng = new Rng(seed ^ 0x5b00c)
  return { x0, x1, y0, y1, gx: c, cy: c, basin, start: { x: c, y: c }, chapter0: rng.int(0, CHAPTERS.length - 1), seed }
}

/** (x, y) 格离台边多远，格：台上为正，四角磨圆 */
export function pageRoom(x0: number, x1: number, y0: number, y1: number, x: number, y: number): number {
  const hx = (x1 - x0) / 2 - CORNER_U
  const hy = (y1 - y0) / 2 - CORNER_U
  const qx = Math.abs(x - (x0 + x1) / 2) - hx
  const qy = Math.abs(y - (y0 + y1) / 2) - hy
  return -(Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - CORNER_U)
}

/** 布景挡人那块的中心、朝向与半长半厚，格：正面的底边往后退半个厚度 */
export interface Slab {
  readonly cx: number
  readonly cy: number
  readonly ux: number
  readonly uy: number
  readonly hw: number
  readonly hd: number
}

export function slabOf(p: Piece): Slab {
  const ux = Math.cos(p.a)
  const uy = Math.sin(p.a)
  return { cx: p.x + uy * (p.d / 2), cy: p.y - ux * (p.d / 2), ux, uy, hw: p.w / 2, hd: p.d / 2 }
}

/** (x, y) 格到这块的有符号距离，格：块里为负 */
export function slabSd(s: Slab, x: number, y: number): number {
  const dx = x - s.cx
  const dy = y - s.cy
  const qx = Math.abs(dx * s.ux + dy * s.uy) - s.hw
  const qy = Math.abs(-dx * s.uy + dy * s.ux) - s.hd
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0)
}

/** 块的四个角，格：左后、右后、右前、左前 */
export function corners(s: Slab): Point[] {
  const out: Point[] = []
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    out.push({ x: s.cx + s.ux * s.hw * a - s.uy * s.hd * b, y: s.cy + s.uy * s.hw * a + s.ux * s.hd * b })
  }
  return out
}

function segDist(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  const dx = bx - ax
  const dy = by - ay
  const l2 = dx * dx + dy * dy
  const t = l2 > 0 ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0
  return Math.hypot(px - ax - dx * t, py - ay - dy * t)
}

/** 两块之间最近处隔多远，格：挨着或压着为 0 */
export function slabGap(a: Slab, b: Slab): number {
  const ca = corners(a)
  const cb = corners(b)
  if (ca.some((p) => slabSd(b, p.x, p.y) <= 0) || cb.some((p) => slabSd(a, p.x, p.y) <= 0)) return 0
  let best = Infinity
  for (let i = 0; i < 4; i++) {
    const p = ca[i]!
    const q = ca[(i + 1) % 4]!
    for (let j = 0; j < 4; j++) {
      const r = cb[j]!
      const s = cb[(j + 1) % 4]!
      best = Math.min(best, segDist(p.x, p.y, q.x, q.y, r.x, r.y), segDist(p.x, p.y, q.x, q.y, s.x, s.y), segDist(r.x, r.y, s.x, s.y, p.x, p.y), segDist(r.x, r.y, s.x, s.y, q.x, q.y))
    }
  }
  return best
}

/** 一件布景的样子：种类、底边长、进深（0 是卡纸）、高（米，矮的按地图给的高）、底边转多大的角 */
interface Spec {
  readonly kind: PieceKind
  readonly w: readonly [number, number]
  readonly d: number
  readonly h: readonly [number, number] | 'low'
  readonly tilt: number
}

const S = (kind: PieceKind, w: readonly [number, number], d: number, h: readonly [number, number] | 'low', tilt: number): Spec => ({ kind, w, d, h, tilt })

const PINE = S('pine', [1.2, 1.6], 0, [3.6, 4.2], 0.4)
const RAIL = S('rail', [3, 5], 0, 'low', 0.3)
const SHEEP = S('sheep', [1.3, 1.6], 0, 'low', 0.35)
const BUSH = S('bush', [1.8, 3.2], 0, 'low', 0.5)
const SAKURA = S('sakura', [1.7, 2.4], 0, [3.2, 3.8], 0.4)
const TEMPLE = S('temple', [3.6, 5.2], 0.8, [2.6, 2.9], 0.12)
const BAMBOO = S('bamboo', [2.6, 4.2], 0, 'low', 0.3)
const LANTERN = S('lantern', [0.9, 1.1], 0, 'low', 0.2)
const CACTUS = S('cactus', [1.2, 1.7], 0, [2.6, 3.2], 0.3)
const CAIRN = S('cairn', [1, 1.4], 0, 'low', 0.3)
const PALM = S('palm', [1.8, 2.4], 0, [3.4, 4], 0.4)
const REEF = S('reef', [2, 3.2], 0, [2.6, 3], 0.4)
const SUB = S('sub', [4.6, 5.4], 0, [2.4, 2.7], 0.15)
const KELP = S('kelp', [1, 1.4], 0, [3, 3.8], 0.3)
const CORAL = S('coral', [1.6, 2.6], 0, 'low', 0.4)
const RUIN = S('ruin', [3.4, 5], 0.9, [2.6, 3.2], 0.15)
const COLUMN = S('column', [0.9, 1.1], 0, [2.8, 3.6], 0.1)
const MAPLE = S('maple', [1.7, 2.4], 0, [3.2, 3.8], 0.4)
const LEAVES = S('leaves', [1.6, 2.6], 0, 'low', 0.4)
const SPIRE = S('spire', [0.9, 1.3], 0, [2.7, 3.2], 0.3)
const PILLAR = S('pillar', [2.2, 3.2], 0, [2.8, 3.4], 0.4)
const SHROOM = S('shroom', [1.2, 1.8], 0, 'low', 0.4)
const TORCH = S('torch', [0.7, 0.9], 0, 'low', 0.2)
const CONE = S('cone', [6, 7], 0, [4, 4.6], 0.1)
const CRAG = S('crag', [2, 3], 0, [2.8, 3.4], 0.4)
const BERG = S('berg', [2.2, 3.4], 0, [2.8, 3.6], 0.4)
const SNOWPINE = S('snowpine', [1.3, 1.7], 0, [3.6, 4.2], 0.4)
const DRIFT = S('drift', [1.8, 3], 0, 'low', 0.4)

/** 一项摆在哪个景里：a 是第一个景，b 是第二个，mid 是两个景交界的那一带，any 哪都行 */
type Where = 'a' | 'b' | 'mid' | 'any'

/** 一章怎么摆：先摆的是大件，每一项是几件、可能的样子、摆在哪个景里 */
type Item = { readonly n: readonly [number, number]; readonly specs: readonly Spec[]; readonly at: Where }

/** 四章：春是草甸流进樱庭，夏是沙漠走到深海，秋是页角的溶洞通到外面的残垣，冬是页角的火山烧到冰原 */
const LAYOUTS: Record<ChapterKey, readonly Item[]> = {
  spring: [
    { n: [1, 2], specs: [TEMPLE], at: 'b' },
    { n: [3, 4], specs: [SAKURA], at: 'b' },
    { n: [3, 4], specs: [PINE], at: 'a' },
    { n: [2, 3], specs: [RAIL], at: 'a' },
    { n: [1, 2], specs: [SHEEP], at: 'a' },
    { n: [1, 2], specs: [BAMBOO], at: 'b' },
    { n: [1, 2], specs: [LANTERN], at: 'b' },
    { n: [1, 2], specs: [BUSH], at: 'mid' },
  ],
  summer: [
    { n: [1, 1], specs: [SUB], at: 'b' },
    { n: [3, 4], specs: [CACTUS], at: 'a' },
    { n: [2, 3], specs: [PALM], at: 'mid' },
    { n: [1, 2], specs: [REEF], at: 'b' },
    { n: [2, 3], specs: [KELP], at: 'b' },
    { n: [2, 3], specs: [CAIRN], at: 'a' },
    { n: [2, 3], specs: [CORAL], at: 'b' },
  ],
  autumn: [
    { n: [2, 3], specs: [PILLAR], at: 'a' },
    { n: [2, 3], specs: [SPIRE], at: 'a' },
    { n: [2, 3], specs: [SHROOM], at: 'a' },
    { n: [2, 3], specs: [RUIN], at: 'b' },
    { n: [2, 3], specs: [COLUMN], at: 'b' },
    { n: [2, 3], specs: [MAPLE], at: 'b' },
    { n: [1, 2], specs: [LEAVES], at: 'b' },
    { n: [1, 2], specs: [TORCH], at: 'mid' },
  ],
  winter: [
    { n: [1, 1], specs: [CONE], at: 'a' },
    { n: [2, 3], specs: [CRAG], at: 'a' },
    { n: [3, 4], specs: [BERG], at: 'b' },
    { n: [2, 3], specs: [SNOWPINE], at: 'b' },
    { n: [3, 4], specs: [DRIFT], at: 'b' },
  ],
}

/** 摆不满下限时拿来补的小件，哪都能摆 */
const FILLER: Record<ChapterKey, Spec> = { spring: BUSH, summer: CORAL, autumn: LEAVES, winter: DRIFT }

/** 这一章的两个景怎么分：春、夏是一道弯弯的线（小溪、海岸线）斜着穿过两页，秋、冬是围着页边一处的一圈（洞里、火山脚下） */
function blendOf(book: Book, chapter: number, rng: Rng): Blend {
  const key = CHAPTERS[chapter]!.key
  const w = book.x1 - book.x0
  const h = book.y1 - book.y0
  if (key === 'spring' || key === 'summer') {
    const a = rng.next() * Math.PI * 2
    return {
      kind: 'line',
      cx: book.gx + (rng.next() - 0.5) * w * 0.3,
      cy: book.cy + (rng.next() - 0.5) * h * 0.3,
      nx: Math.cos(a),
      ny: Math.sin(a),
      r: 0,
      amp: key === 'summer' ? 1.6 : 1.2,
      waveU: 9 + rng.next() * 6,
      phase: rng.next() * Math.PI * 2,
      band: key === 'summer' ? 1.6 : 3.2,
    }
  }
  // 圈心落在四个角或四条边的中段附近，圈不碰出生的地方
  const spots: Point[] = [
    { x: book.x0 + 2, y: book.y0 + 2 }, { x: book.x1 - 2, y: book.y0 + 2 }, { x: book.x0 + 2, y: book.y1 - 2 }, { x: book.x1 - 2, y: book.y1 - 2 },
    { x: book.x0 + 1, y: book.cy }, { x: book.x1 - 1, y: book.cy }, { x: book.gx + w * 0.22, y: book.y0 }, { x: book.gx - w * 0.22, y: book.y1 },
  ]
  const at = spots[Math.floor(rng.next() * spots.length)]!
  return { kind: 'ring', cx: at.x, cy: at.y, nx: 0, ny: 0, r: key === 'winter' ? 10 + rng.next() * 2.5 : 11 + rng.next() * 3, amp: 1, waveU: 6, phase: rng.next() * Math.PI * 2, band: key === 'winter' ? 1.8 : 3 }
}

/** 一件布景落在这一处合不合它的景 */
function inWhere(b: Blend, where: Where, x: number, y: number): boolean {
  if (where === 'any') return true
  if (where === 'mid') return Math.abs(blendSd(b, x, y)) < Math.max(b.band, MID_U)
  const t = blendAt(b, x, y)
  return where === 'a' ? t < 0.25 : t > 0.75
}

/** 第几页是哪一章、种子是多少 */
export function chapterOf(book: Book, index: number): number {
  return (book.chapter0 + index) % CHAPTERS.length
}

function pageSeed(book: Book, index: number): number {
  return (Math.imul(book.seed ^ 0x2c1b3c6d, 0x9e3779b1) + Math.imul(index + 1, 0x85ebca6b)) >>> 0
}

/** 查连通用的格子：页里每格能不能站下一个小个子、一个头目 */
class Reach {
  readonly cols: number
  readonly rows: number
  readonly small: Uint8Array
  readonly big: Uint8Array
  private readonly book: Book
  constructor(book: Book) {
    this.book = book
    this.cols = Math.ceil((book.x1 - book.x0) / REACH_CELL_U)
    this.rows = Math.ceil((book.y1 - book.y0) / REACH_CELL_U)
    this.small = new Uint8Array(this.cols * this.rows)
    this.big = new Uint8Array(this.cols * this.rows)
    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        const r = pageRoom(book.x0, book.x1, book.y0, book.y1, book.x0 + (i + 0.5) * REACH_CELL_U, book.y0 + (j + 0.5) * REACH_CELL_U)
        const k = j * this.cols + i
        this.small[k] = r < SMALL_U ? 1 : 0
        this.big[k] = r < BIG_U ? 1 : 0
      }
    }
  }

  copy(): { small: Uint8Array; big: Uint8Array } {
    return { small: this.small.slice(), big: this.big.slice() }
  }

  restore(s: { small: Uint8Array; big: Uint8Array }): void {
    this.small.set(s.small)
    this.big.set(s.big)
  }

  /** 把一件布景挡住的格子记上：矮的只挡小个子 */
  add(p: Piece): void {
    const s = slabOf(p)
    const reach = Math.hypot(s.hw, s.hd) + BIG_U + REACH_CELL_U
    const b = this.book
    const i0 = Math.max(0, Math.floor((s.cx - reach - b.x0) / REACH_CELL_U))
    const i1 = Math.min(this.cols - 1, Math.ceil((s.cx + reach - b.x0) / REACH_CELL_U))
    const j0 = Math.max(0, Math.floor((s.cy - reach - b.y0) / REACH_CELL_U))
    const j1 = Math.min(this.rows - 1, Math.ceil((s.cy + reach - b.y0) / REACH_CELL_U))
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = slabSd(s, b.x0 + (i + 0.5) * REACH_CELL_U, b.y0 + (j + 0.5) * REACH_CELL_U)
        const k = j * this.cols + i
        if (d < SMALL_U) this.small[k] = 1
        if (!p.low && d < BIG_U) this.big[k] = 1
      }
    }
  }

  /** 每一种个子能站的格子都连成一片 */
  connected(): boolean {
    return this.one(this.small) && this.one(this.big)
  }

  private one(blocked: Uint8Array): boolean {
    const n = blocked.length
    let free = 0
    let start = -1
    for (let k = 0; k < n; k++) {
      if (blocked[k]) continue
      free++
      if (start < 0) start = k
    }
    if (start < 0) return false
    const seen = new Uint8Array(n)
    const stack = [start]
    seen[start] = 1
    let count = 0
    while (stack.length > 0) {
      const k = stack.pop()!
      count++
      const i = k % this.cols
      const near = [i > 0 ? k - 1 : -1, i < this.cols - 1 ? k + 1 : -1, k - this.cols, k + this.cols]
      for (const m of near) {
        if (m < 0 || m >= n || seen[m] || blocked[m]) continue
        seen[m] = 1
        stack.push(m)
      }
    }
    return count === free
  }
}

/** 一幕能不能放下这件：落在自己那半边台上、离台边与台中线（一溜活门）够远，离别组的布景留得出路，开局那一幕不压着出生的空地 */
function fits(cfg: StorybookConfig, book: Book, p: Piece, placed: readonly Piece[], plaza: boolean): boolean {
  const s = slabOf(p)
  const m = p.low ? cfg.margin.low : cfg.margin.tall
  const cs = corners(s)
  const right = p.x > book.gx
  for (const c of cs) {
    if (c.x < book.x0 + m || c.x > book.x1 - m || c.y < book.y0 + m || c.y > book.y1 - m) return false
    if ((c.x > book.gx) !== right || Math.abs(c.x - book.gx) < cfg.margin.aisle) return false
  }
  if (plaza && slabSd(s, book.start.x, book.start.y) < cfg.plazaU) return false
  for (const q of placed) {
    if (q.group === p.group) continue
    const gap = p.low || q.low ? cfg.gapU.low : cfg.gapU.tall
    if (slabGap(s, slabOf(q)) < gap) return false
  }
  return true
}

function piece(spec: Spec, cfg: StorybookConfig, rng: Rng, x: number, y: number, a: number, group: number, w?: number): Piece {
  const pw = w ?? spec.w[0] + (spec.w[1] - spec.w[0]) * rng.next()
  const h = spec.h === 'low' ? cfg.lowM : spec.h[0] + (spec.h[1] - spec.h[0]) * rng.next()
  return { kind: spec.kind, x, y, a, w: pw, d: spec.d > 0 ? spec.d : CARD_U, h, low: spec.h === 'low', box: spec.d > 0, group, seed: Math.floor(rng.next() * 0x7fffffff) }
}

/** 半页里随机的一点：side 为 -1 是左页、1 是右页 */
function spot(cfg: StorybookConfig, book: Book, rng: Rng, side: number): Point {
  const m = cfg.margin.low
  const lo = side < 0 ? book.x0 + m : book.gx + cfg.margin.aisle
  const hi = side < 0 ? book.gx - cfg.margin.aisle : book.x1 - m
  return { x: lo + (hi - lo) * rng.next(), y: book.y0 + m + (book.y1 - book.y0 - 2 * m) * rng.next() }
}

/** 按一章的摆法摆一页：一件一件试，摆在它自己的景里，每摆下一件各种个子能站的地方都还连成一片；摆不到下限就换种子重来 */
function arrange(cfg: StorybookConfig, book: Book, chapter: number, blend: Blend, seed: number, plaza: boolean): Piece[] | null {
  const key = CHAPTERS[chapter]!.key
  const rng = new Rng(seed)
  const reach = new Reach(book)
  const placed: Piece[] = []
  let group = 0
  let side = rng.next() < 0.5 ? -1 : 1
  const tryOne = (spec: Spec, where: Where): boolean => {
    for (let t = 0; t < PIECE_TRIES; t++) {
      if (placed.length >= cfg.pieces[1]) return false
      const at = spot(cfg, book, rng, side)
      if (!inWhere(blend, where, at.x, at.y)) {
        side = -side
        continue
      }
      const p = piece(spec, cfg, rng, at.x, at.y, (rng.next() * 2 - 1) * spec.tilt, group)
      if (!fits(cfg, book, p, placed, plaza)) continue
      const keep = reach.copy()
      reach.add(p)
      if (!reach.connected()) {
        reach.restore(keep)
        continue
      }
      placed.push(p)
      group++
      side = -side
      return true
    }
    return false
  }
  for (const item of LAYOUTS[key]) {
    const n = rng.int(item.n[0], item.n[1])
    for (let i = 0; i < n; i++) tryOne(item.specs[Math.floor(rng.next() * item.specs.length)]!, item.at)
  }
  for (let t = 0; t < 8 && placed.length < cfg.pieces[0]; t++) tryOne(FILLER[key], 'any')
  return placed.length >= cfg.pieces[0] ? placed : null
}

/** 第几页：按种子摆好布景，排好弹起与折平的先后；开局那一页（index 0）不压着出生的空地 */
export function pageOf(cfg: StorybookConfig, book: Book, index: number): Page {
  const chapter = chapterOf(book, index)
  const base = pageSeed(book, index)
  const blend = blendOf(book, chapter, new Rng(base ^ 0x3b1e9d))
  let pieces: Piece[] | null = null
  for (let t = 0; t < PAGE_TRIES && !pieces; t++) pieces = arrange(cfg, book, chapter, blend, (base + Math.imul(t, 0x632be5ab)) >>> 0, index === 0)
  if (!pieces) throw new Error(`纸剧场第 ${index} 幕摆不下 ${cfg.pieces[0]} 件布景`)
  // 远的先摆在后面：画的时候按底边从屏幕里往外排
  const ordered = [...pieces].sort((p, q) => p.y - q.y)
  return { index, chapter, seed: base, blend, pieces: ordered }
}

/** 换幕的一段：stand 演着，change 换幕——灯暗下去，旧布景依次吊上去，暗转里换地布与天幕，新布景依次吊下来，灯亮起来 */
export type Phase = 'stand' | 'change'

/** 此刻演到哪：page 是正演着或正换上的那一幕（change 时旧的是 page - 1），phase 是哪一段，在这一段里过了 at 毫秒、这一段长 len；next 是下一次换幕在几时（毫秒） */
export interface BookClock {
  readonly page: number
  readonly phase: Phase
  readonly at: number
  readonly len: number
  readonly next: number
}

function hash01(seed: number, k: number, salt: number): number {
  let h = Math.imul((seed ^ salt) + Math.imul(k + 7, 0x27d4eb2f), 0x165667b1) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296
}

function jitter(book: Book, k: number): number {
  return hash01(book.seed, k, 0x1f2e3d) * 2 - 1
}

/** 布景依次吊上去（或吊下来）那一段多长，毫秒 */
export function flyLen(cfg: StorybookConfig): number {
  return cfg.turn.staggerMs + cfg.turn.flyMs
}

/** 一次换幕多长，毫秒：吊上去、暗转、吊下来 */
export function turnLen(cfg: StorybookConfig): number {
  return flyLen(cfg) * 2 + cfg.turn.darkMs
}

/** 难度时钟走到 ms 毫秒时演到哪 */
export function clockAt(cfg: StorybookConfig, book: Book, ms: number): BookClock {
  const t = cfg.turn
  let k = 0
  let w = t.firstMs
  for (;;) {
    const end = w + turnLen(cfg)
    if (ms < end) break
    const nw = end + t.intervalMs + jitter(book, k) * t.jitterMs
    if (ms < nw) return { page: k + 1, phase: 'stand', at: ms - end, len: nw - end, next: nw }
    w = nw
    k++
  }
  if (ms < w) return { page: 0, phase: 'stand', at: ms, len: w, next: w }
  return { page: k + 1, phase: 'change', at: ms - w, len: turnLen(cfg), next: w }
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
const easeInOut = (v: number): number => v * v * (3 - 2 * v)

/**
 * 一件布景此刻吊起来多高：0 是落在台上，1 是吊出了视线。旧幕的按各自的先后吊上去，
 * 新幕的在暗转以后按各自的先后吊下来，快落地时放慢
 */
export function lifted(cfg: StorybookConfig, c: BookClock, page: number, p: Piece): number {
  if (c.phase === 'stand') return page === c.page ? 0 : 1
  const t = cfg.turn
  const start = hash01(p.seed, page, 0x3f1) * t.staggerMs
  if (page === c.page - 1) return easeInOut(clamp01((c.at - start) / t.flyMs))
  if (page !== c.page) return 1
  const u = clamp01((c.at - flyLen(cfg) - t.darkMs - start) / t.flyMs)
  return (1 - u) ** 3
}

/** 吊着的布景离台面不到这么高（占吊起来的比例）还挡路：落下来的一碰台面就挡，吊上去的离了台面就不挡 */
const LIFT_BLOCK = 0.04

/** 落在台上的布景挡路 */
export function standing(lift: number): boolean {
  return lift < LIFT_BLOCK
}

/** 暗转里地布、天幕与幕牌换过去了多少：0 是旧幕，1 是新幕 */
export function swapped(cfg: StorybookConfig, c: BookClock): number {
  if (c.phase === 'stand') return 1
  return easeInOut(clamp01((c.at - flyLen(cfg)) / cfg.turn.darkMs))
}

/** 台上此刻多暗：0 是灯全亮，1 是全黑；换幕开头暗下去一半，暗转时全黑，新布景落完再亮回来 */
export function darkness(cfg: StorybookConfig, c: BookClock): number {
  if (c.phase === 'stand') return 0
  const t = cfg.turn
  const up = flyLen(cfg)
  const half = 0.55
  if (c.at < t.dimMs) return half * easeInOut(c.at / t.dimMs)
  if (c.at < up - t.dimMs) return half
  if (c.at < up) return half + (1 - half) * easeInOut((c.at - (up - t.dimMs)) / t.dimMs)
  if (c.at < up + t.darkMs) return 1
  const back = up + t.darkMs
  if (c.at < back + t.dimMs) return 1 - (1 - half) * easeInOut((c.at - back) / t.dimMs)
  const end = turnLen(cfg)
  if (c.at < end - t.dimMs) return half
  return half * (1 - easeInOut((c.at - (end - t.dimMs)) / t.dimMs))
}

/** 台中线上的几扇活门，格：怪从这里升上台 */
export function trapsOf(book: Book): Point[] {
  return TRAP_DY.map((dy) => ({ x: book.gx, y: book.cy + dy }))
}
