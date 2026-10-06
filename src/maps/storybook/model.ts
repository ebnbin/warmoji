import { FRAME_U, UNIT } from '../../util/units.ts'
import { Rng } from '../../util/rng.ts'
import { makeBasin } from '../basin.ts'
import type { Basin } from '../basin'
import type { StorybookConfig } from '../../types/maps'
import type { Point } from '../../util/vec'

/** 页边的距离场按这么细的格子算，格；立起来的布景也叠在同一套格子上 */
export const BASIN_CELL_U = 0.125
/** 距离场比书页多铺这么宽，格：最外一圈是页外 */
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
/** 左页左上角印字的那一块，格：离页角多远、多宽多高 */
export const TEXT_BOX = { x: 0, y: 0, w: 9, h: 4.8 } as const
/** 摆在两个景交界那一带的布景离界线最多多远，格 */
const MID_U = 2.6
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
 * 高 h 米，low 的是齐腰的矮布景；同一 group 的几件拼成一组，可以挨着；order 是弹起的先后、fold 是折平的先后，都在 0 到 1 之间；seed 定画法上的变化
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
  readonly order: number
  readonly fold: number
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

/** 一页：第几页（从开局那一页起数），哪一章，左右两页的页码，这一页的种子、两个景的分界与立着的布景 */
export interface Page {
  readonly index: number
  readonly chapter: number
  readonly number: number
  readonly seed: number
  readonly blend: Blend
  readonly pieces: readonly Piece[]
}

/** 摊开的书，格：两页合起来的范围，书脊的横坐标，页边的距离场（像素），开局站位，开局翻到哪一章、左页的页码 */
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
  readonly number0: number
  readonly seed: number
}

/** 书摊在方框正中，书脊竖着；开局翻到哪一章、哪一页按种子定 */
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
  return { x0, x1, y0, y1, gx: c, cy: c, basin, start: { x: c, y: c }, chapter0: rng.int(0, CHAPTERS.length - 1), number0: 2 * rng.int(3, 40), seed }
}

/** (x, y) 格离页边多远，格：页里为正，四角磨圆 */
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

/** 一页能不能放下这件：落在自己那半页里、离页边与书脊够远，离别组的布景留得出路，开局那一页不压着出生的空地 */
function fits(cfg: StorybookConfig, book: Book, p: Piece, placed: readonly Piece[], plaza: boolean): boolean {
  const s = slabOf(p)
  const m = p.low ? cfg.margin.low : cfg.margin.tall
  const cs = corners(s)
  const right = p.x > book.gx
  for (const c of cs) {
    if (c.x < book.x0 + m || c.x > book.x1 - m || c.y < book.y0 + m || c.y > book.y1 - m) return false
    if ((c.x > book.gx) !== right || Math.abs(c.x - book.gx) < cfg.margin.gutter) return false
  }
  if (plaza && slabSd(s, book.start.x, book.start.y) < cfg.plazaU) return false
  // 左页左上角印着章名与故事：布景不压着字
  const tx = book.x0 + TEXT_BOX.x
  const ty = book.y0 + TEXT_BOX.y
  if (cs.some((c) => c.x < tx + TEXT_BOX.w && c.y < ty + TEXT_BOX.h) || (s.cx < tx + TEXT_BOX.w && s.cy < ty + TEXT_BOX.h)) return false
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
  return { kind: spec.kind, x, y, a, w: pw, d: spec.d > 0 ? spec.d : CARD_U, h, low: spec.h === 'low', box: spec.d > 0, group, order: 0, fold: 0, seed: Math.floor(rng.next() * 0x7fffffff) }
}

/** 半页里随机的一点：side 为 -1 是左页、1 是右页 */
function spot(cfg: StorybookConfig, book: Book, rng: Rng, side: number): Point {
  const m = cfg.margin.low
  const lo = side < 0 ? book.x0 + m : book.gx + cfg.margin.gutter
  const hi = side < 0 ? book.gx - cfg.margin.gutter : book.x1 - m
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
  if (!pieces) throw new Error(`立体书第 ${index} 页摆不下 ${cfg.pieces[0]} 件布景`)
  const half = (book.x1 - book.x0) / 2
  const ordered = pieces.map((p): Piece => {
    const s = slabOf(p)
    return { ...p, order: Math.min(1, Math.abs(s.cx - book.gx) / half), fold: Math.min(1, Math.max(0, (book.x1 - s.cx) / (book.x1 - book.x0))) }
  })
  // 远的先摆在后面：画的时候按底边从屏幕里往外排
  ordered.sort((p, q) => p.y - q.y)
  return { index, chapter, number: book.number0 + index * 2, seed: base, blend, pieces: ordered }
}

/** 翻页的一段：stand 立着，warn 预兆，fold 折平，leaf 翻书页，rest 新一页平躺着，pop 弹起来 */
export type Phase = 'stand' | 'warn' | 'fold' | 'leaf' | 'rest' | 'pop'

/** 此刻翻到哪：page 是正立着或正折平的那一页（leaf 以后是新的那一页），phase 是哪一段，在这一段里过了 at 毫秒、这一段长 len；next 是下一次预兆在几时（毫秒） */
export interface BookClock {
  readonly page: number
  readonly phase: Phase
  readonly at: number
  readonly len: number
  readonly next: number
}

function jitter(book: Book, k: number): number {
  const h = Math.imul((book.seed ^ 0x1f2e3d) + Math.imul(k + 7, 0x27d4eb2f), 0x165667b1) >>> 0
  return (h / 4294967296) * 2 - 1
}

/** 一次翻页从预兆到弹完多长，毫秒 */
export function turnLen(cfg: StorybookConfig): number {
  const t = cfg.turn
  return t.warnMs + t.foldMs + t.leafMs + t.restMs + t.popMs
}

/** 难度时钟走到 ms 毫秒时书翻到哪 */
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
  const steps: readonly [Phase, number][] = [['warn', t.warnMs], ['fold', t.foldMs], ['leaf', t.leafMs], ['rest', t.restMs], ['pop', t.popMs]]
  let from = w
  for (const [phase, len] of steps) {
    if (ms < from + len) return { page: phase === 'warn' || phase === 'fold' ? k : k + 1, phase, at: ms - from, len, next: w }
    from += len
  }
  return { page: k + 1, phase: 'stand', at: 0, len: t.intervalMs, next: w + turnLen(cfg) + t.intervalMs }
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
const easeInOut = (v: number): number => v * v * (3 - 2 * v)
/** 弹起来冲过头一点再回正 */
function springUp(v: number): number {
  const c = 2.4
  const u = v - 1
  return 1 + (c + 1) * u * u * u + c * u * u
}

/**
 * 一件布景此刻往后倒了多少，0 是立正、1 是平躺在页面上，冲过头时略小于 0（往前探）：
 * 折平的那一页按 fold 的先后一件件倒下，弹起的那一页按 order 的先后一件件立起来
 */
export function laid(cfg: StorybookConfig, c: BookClock, page: number, p: Piece): number {
  const t = cfg.turn
  if (c.phase === 'stand' || c.phase === 'warn') return page === c.page ? 0 : 1
  if (c.phase === 'fold') {
    if (page !== c.page) return 1
    const s = p.fold * (t.foldMs - t.flipMs)
    return easeInOut(clamp01((c.at - s) / t.flipMs))
  }
  if (c.phase !== 'pop' || page !== c.page) return 1
  const s = p.order * (t.popMs - t.flipMs)
  return 1 - springUp(clamp01((c.at - s) / t.flipMs))
}

/** 倒下不到一半的布景挡路 */
export function standing(lay: number): boolean {
  return lay < 0.5
}

/** 翻页时书页弯起来的截面从书脊到自由边分多少段 */
export const LEAF_SEGS = 32
/** 下页角比上页角先翻起来多少（占翻页那一段的比例），书页斜着卷过去 */
const LEAF_LEAD = 0.35
/** 自由边比书脊先翻多少：自由边先卷起来翻过去，书脊那一头最后才放下 */
const LEAF_CURL = 0.5
/** 右页上脚下的书页抬起多高（格）就算把人掀起来了；左页上翻过来的书页低到多高以下才算压过来 */
const LEAF_LIFT_U = 0.3
const LEAF_LOW_U = 2

/** 书页一行的截面：每段端点的横坐标与离页面的高（格，LEAF_SEGS + 1 个），每段的倾角（LEAF_SEGS 个，0 是平躺在右页，π 是平躺在左页） */
export interface LeafSection {
  readonly x: number[]
  readonly z: number[]
  readonly phi: number[]
}

export function leafBuffer(): LeafSection {
  return { x: new Array<number>(LEAF_SEGS + 1).fill(0), z: new Array<number>(LEAF_SEGS + 1).fill(0), phi: new Array<number>(LEAF_SEGS).fill(0) }
}

/**
 * 翻页时书页上 yn（0 是上页边，1 是下页边）那一行此刻弯成什么样，写进 out；不在翻页时返回 false。
 * 自由边先卷起来翻过书脊，书脊那一头跟着转过去，越往自由边弯得越厉害；下页角领先，整张斜着卷过去
 */
export function leafSection(c: BookClock, book: Book, yn: number, out: LeafSection): boolean {
  if (c.phase !== 'leaf') return false
  const p = clamp01(c.at / c.len)
  const q = clamp01(p * (1 + LEAF_LEAD) - LEAF_LEAD * (1 - yn))
  const tip = Math.PI * easeInOut(clamp01(q * (1 + LEAF_CURL)))
  const root = Math.PI * easeInOut(clamp01(q * (1 + LEAF_CURL) - LEAF_CURL))
  const ds = (book.x1 - book.gx) / LEAF_SEGS
  let x = book.gx
  let z = 0
  out.x[0] = x
  out.z[0] = 0
  for (let i = 0; i < LEAF_SEGS; i++) {
    const u = (i + 0.5) / LEAF_SEGS
    const phi = root + (tip - root) * u * u
    out.phi[i] = phi
    x += Math.cos(phi) * ds
    z += Math.sin(phi) * ds
    out.x[i + 1] = x
    out.z[i + 1] = z
  }
  return true
}

/** 翻页时 (x, y) 格处的身体此刻被书页掀动没有：右页上是脚下那一块书页抬起来了，左页上是翻过来的书页低低地压到了跟前 lead 格 */
export function leafTouch(c: BookClock, book: Book, x: number, y: number, lead: number, buf: LeafSection): boolean {
  if (!leafSection(c, book, clamp01((y - book.y0) / (book.y1 - book.y0)), buf)) return false
  if (x >= book.gx) return buf.z[Math.min(LEAF_SEGS, Math.round(((x - book.gx) / (book.x1 - book.gx)) * LEAF_SEGS))]! > LEAF_LIFT_U
  for (let i = 0; i <= LEAF_SEGS; i++) if (buf.z[i]! < LEAF_LOW_U && buf.x[i]! <= x + lead) return true
  return false
}
