import { AWAY, SUN } from '../../data/light'
import { GROUND_PPU } from '../../data/texel'
import { fbm, valueNoise } from '../../util/noise'
import { FRAME_U } from '../../util/units'
import { Rng } from '../../util/rng'
import { ownerAt, pageBox } from './layout'
import type { Box, Owner, Patch, TalePlan } from './layout'
import type { TaleConfig } from '../../types/maps'

/** 两块之间留白的一半宽，格：色块与墨线都画在这条缝以内 */
export const GAP_U = 0.05
/** 墨线：中线离块边多远、多粗，格 */
const LINE_AT_U = 0.095
const LINE_U = 0.085
/** 色块对着墨线错开多少，格：套色没对准，边上偶尔露出一线纸 */
const MISS = { x: 0.035, y: -0.03 } as const
/** 书：每张纸的边隔多远（格）、露出几张；封面比书页多出多宽；封面的圆角 */
const LEAF_U = 0.07
const LEAVES = 4
const BOARD_U = 0.45
const BOARD_ROUND_U = 0.22
/** 书在桌上的影子往背光的方向偏多远、多柔，格 */
const BOOK_SHADOW_U = 0.42
const BOOK_SHADOW_SOFT_U = 0.5
/** 纸、书页的边、封面的布、墨线、铅笔、桌面的颜色 */
const PAPER = [248, 242, 228] as const
const LEAF = [233, 224, 203] as const
const LEAF_LINE = [196, 184, 158] as const
const BOARD = [46, 88, 104] as const
const WOOD = [190, 140, 92] as const
const WOOD_DARK = [158, 108, 66] as const

type Rgb = [number, number, number]
type Ink = readonly [number, number, number]

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
const hex = (c: number): Ink => [(c >> 16) & 255, (c >> 8) & 255, c & 255]

/** 画地面用到的那部分地图：只有数据，能整个发给画画的线程 */
export interface PaintScene {
  readonly cfg: TaleConfig
  readonly plan: TalePlan
}

/** 贴图上以像素计的一块：[x0, x1) × [y0, y1) */
export interface PixelRect {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

/** 两种活：底图（桌面、书与纸，铺满方框）与这一页（每块的编号、墨线、铅笔稿与四季的色块） */
export type Layer = 'base' | 'page'

/** 发给画画的线程：先 setup 一次，再一块一块要 paint */
export type PaintJob = { readonly kind: 'setup'; readonly scene: PaintScene } | { readonly kind: 'paint'; readonly index: number; readonly layer: Layer; readonly rect: PixelRect }

/**
 * 画好的一块：每张图的像素都按 rect 逐行排。底图只有 base；这一页有 id（红是块的编号加一）、line（红是墨线、绿是沿轮廓走到哪、蓝是色块盖了多少）、
 * 四季各一张 pencil（红是铅笔线多深、绿是上色的先后）与 ink（色块的颜色）；透明度都是满的
 */
export interface PaintPiece {
  readonly index: number
  readonly layer: Layer
  readonly rect: PixelRect
  readonly base?: Uint8ClampedArray<ArrayBuffer>
  readonly id?: Uint8ClampedArray<ArrayBuffer>
  readonly line?: Uint8ClampedArray<ArrayBuffer>
  readonly pencil?: readonly Uint8ClampedArray<ArrayBuffer>[]
  readonly ink?: readonly Uint8ClampedArray<ArrayBuffer>[]
}

/** 装得下一块像素的缓冲：按 rect 逐行排 */
export function pixelBuffer(rect: PixelRect): Uint8ClampedArray<ArrayBuffer> {
  return new Uint8ClampedArray((rect.x1 - rect.x0) * (rect.y1 - rect.y0) * 4)
}

/** 底图铺满方框，像素 */
export function baseSize(): { w: number; h: number } {
  return { w: Math.round(FRAME_U * GROUND_PPU), h: Math.round(FRAME_U * GROUND_PPU) }
}

/** 这一页的图的大小，像素：从页面的左上角起 */
export function pageSize(cfg: TaleConfig): { w: number; h: number } {
  return { w: Math.round(cfg.page.wU * GROUND_PPU), h: Math.round(cfg.page.hU * GROUND_PPU) }
}

// ---------------------------------------------------------------- 距离场

function sdSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const l2 = dx * dx + dy * dy
  const t = l2 > 0 ? clamp01(((px - ax) * dx + (py - ay) * dy) / l2) : 0
  return Math.hypot(px - ax - dx * t, py - ay - dy * t)
}

function sdBox(px: number, py: number, hw: number, hh: number, r: number): number {
  const qx = Math.abs(px) - hw + r
  const qy = Math.abs(py) - hh + r
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

/** 两段圆弧夹出的花瓣（透镜形），沿 u 方向半长 l、半宽 w */
function sdLens(u: number, v: number, l: number, w: number): number {
  const r = (l * l + w * w) / (2 * w)
  const d = r - w
  return Math.max(Math.hypot(u, v - d) - r, Math.hypot(u, v + d) - r)
}

/** 凸多边形（逆时针或顺时针都行）的有符号距离 */
function sdPoly(px: number, py: number, pts: readonly (readonly [number, number])[]): number {
  let d = Infinity
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, ay] = pts[j]!
    const [bx, by] = pts[i]!
    d = Math.min(d, sdSeg(px, py, ax, ay, bx, by))
    if (ay > py !== by > py && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) inside = !inside
  }
  return inside ? -d : d
}

// ---------------------------------------------------------------- 四季的图样

/**
 * 一样小图样，格：在 (x, y)、转过 rot、大小 r。flower 一朵小花，tuft 一撮草，petal 一片樱花瓣，dune 一道沙丘的弧，ripple 一道水波，
 * block 一块断墙的方石（w、h 是半宽半高），torch 一点火把的光，crack 一道冰的裂线（pts 是折线），volcano 一团火山
 */
type Motif =
  | { readonly kind: 'flower' | 'tuft' | 'petal' | 'dune' | 'ripple' | 'torch' | 'volcano'; readonly x: number; readonly y: number; readonly r: number; readonly rot: number }
  | { readonly kind: 'block'; readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly rot: number }
  | { readonly kind: 'crack'; readonly pts: readonly (readonly [number, number])[]; readonly x: number; readonly y: number }

/** 一章的画法：底色，与在这一块里撒哪些图样 */
interface Chapter {
  readonly base: Ink
  readonly motifs: (rng: Rng, spot: (r: number) => { x: number; y: number } | null) => Motif[]
}

const between = (rng: Rng, a: number, b: number): number => a + rng.next() * (b - a)

/**
 * 前八章，按季分：春天的草甸（绿底、小花与草）与樱庭（粉底、花瓣），夏天的沙漠（黄底、沙丘的弧）与深海（蓝底、水波），
 * 秋天的残垣（红底、断墙的方石）与溶洞（褐底、一点火把的光），冬天的浮冰（白底、冰的裂线）与火山（橙底、一团火山的红）
 */
const CHAPTERS: readonly (readonly [Chapter, Chapter])[] = [
  [
    {
      base: hex(0xa6d27a),
      motifs: (rng, spot) => {
        const out: Motif[] = []
        for (let k = rng.int(3, 5); k > 0; k--) {
          const p = spot(0.45)
          if (p) out.push({ kind: 'flower', ...p, r: between(rng, 0.26, 0.38), rot: rng.next() * Math.PI })
        }
        for (let k = rng.int(4, 6); k > 0; k--) {
          const p = spot(0.4)
          if (p) out.push({ kind: 'tuft', ...p, r: between(rng, 0.26, 0.36), rot: (rng.next() - 0.5) * 0.5 })
        }
        return out
      },
    },
    {
      base: hex(0xf6bccb),
      motifs: (rng, spot) => {
        const out: Motif[] = []
        for (let k = rng.int(6, 9); k > 0; k--) {
          const p = spot(0.4)
          if (p) out.push({ kind: 'petal', ...p, r: between(rng, 0.22, 0.32), rot: rng.next() * Math.PI * 2 })
        }
        return out
      },
    },
  ],
  [
    {
      base: hex(0xf3cd6c),
      motifs: (rng, spot) => {
        const out: Motif[] = []
        for (let k = rng.int(1, 2); k > 0; k--) {
          const r = between(rng, 1.3, 2)
          const p = spot(r * 0.75)
          if (p) out.push({ kind: 'dune', ...p, r, rot: -Math.PI / 2 + (rng.next() - 0.5) * 0.7 })
        }
        return out
      },
    },
    {
      base: hex(0x74b3e0),
      motifs: (rng, spot) => {
        const out: Motif[] = []
        for (let k = rng.int(3, 5); k > 0; k--) {
          const r = between(rng, 0.45, 0.75)
          const p = spot(r + 0.1)
          if (p) out.push({ kind: 'ripple', ...p, r, rot: -Math.PI / 2 + (rng.next() - 0.5) * 0.4 })
        }
        return out
      },
    },
  ],
  [
    {
      base: hex(0xcb6449),
      motifs: (rng, spot) => {
        const out: Motif[] = []
        const p = spot(1.6)
        if (!p) return out
        const rot = (rng.next() - 0.5) * 0.5
        const c = Math.cos(rot)
        const s = Math.sin(rot)
        // 两层断墙：下层长、上层短，中间缺几块
        for (let row = 0; row < 2; row++) {
          const n = row === 0 ? rng.int(3, 4) : rng.int(1, 3)
          for (let k = 0; k < n; k++) {
            if (rng.next() < 0.15) continue
            const u = (k - (n - 1) / 2) * 0.86 + (row === 1 ? 0.43 * (rng.next() < 0.5 ? -1 : 1) : 0)
            const v = -row * 0.56
            out.push({ kind: 'block', x: p.x + u * c - v * s, y: p.y + u * s + v * c, w: between(rng, 0.36, 0.42), h: between(rng, 0.22, 0.26), rot: rot + (rng.next() - 0.5) * 0.12 })
          }
        }
        return out
      },
    },
    {
      base: hex(0x8f654a),
      motifs: (rng, spot) => {
        const r = between(rng, 1.15, 1.5)
        const p = spot(r * 0.8)
        return p ? [{ kind: 'torch', ...p, r, rot: 0 }] : []
      },
    },
  ],
  [
    {
      base: hex(0xe9f2f8),
      motifs: (rng, spot) => {
        const out: Motif[] = []
        for (let k = rng.int(2, 3); k > 0; k--) {
          const p = spot(1)
          if (!p) continue
          const pts: [number, number][] = [[p.x, p.y]]
          let a = rng.next() * Math.PI * 2
          let x = p.x
          let y = p.y
          for (let j = rng.int(3, 5); j > 0; j--) {
            a += (rng.next() - 0.5) * 1.1
            const l = between(rng, 0.35, 0.6)
            x += Math.cos(a) * l
            y += Math.sin(a) * l
            pts.push([x, y])
          }
          out.push({ kind: 'crack', x: p.x, y: p.y, pts })
          // 从中间岔出一小段
          const m = pts[Math.min(pts.length - 1, 2)]!
          const b = a + (rng.next() < 0.5 ? 1 : -1) * between(rng, 0.7, 1.2)
          out.push({ kind: 'crack', x: m[0], y: m[1], pts: [m, [m[0] + Math.cos(b) * 0.45, m[1] + Math.sin(b) * 0.45]] })
        }
        return out
      },
    },
    {
      base: hex(0xf39b4b),
      motifs: (rng, spot) => {
        const r = between(rng, 1.05, 1.4)
        const p = spot(r * 1.05)
        return p ? [{ kind: 'volcano', ...p, r, rot: 0 }] : []
      },
    },
  ],
]

/** 画一样图样：颜色叠到 col 上；返回铅笔线（图样轮廓或笔画中线）离这点多远，格 */
function paintMotif(m: Motif, x: number, y: number, aa: number, col: Rgb): number {
  const over = (c: Ink, a: number): void => {
    if (a <= 0) return
    for (let i = 0; i < 3; i++) col[i] = col[i]! + (c[i]! - col[i]!) * a
  }
  const fillOf = (d: number): number => 1 - smooth(-aa, aa, d)
  const strokeOf = (d: number, w: number): number => 1 - smooth(w / 2 - aa, w / 2 + aa, d)
  const lx = x - m.x
  const ly = y - m.y
  switch (m.kind) {
    case 'flower': {
      let d = Infinity
      for (let k = 0; k < 5; k++) {
        const a = m.rot + (k / 5) * Math.PI * 2
        const c = Math.cos(a)
        const s = Math.sin(a)
        const u = lx * c + ly * s - m.r * 0.55
        const v = -lx * s + ly * c
        d = Math.min(d, sdLens(u, v, m.r * 0.48, m.r * 0.3))
      }
      over(hex(0xfffaf3), fillOf(d))
      const core = Math.hypot(lx, ly) - m.r * 0.24
      over(hex(0xf2c445), fillOf(core))
      return Math.min(Math.abs(d), Math.abs(core))
    }
    case 'tuft': {
      let d = Infinity
      for (const [a, l] of [[-0.45, 0.75], [0, 1], [0.5, 0.7]] as const) {
        const ang = -Math.PI / 2 + m.rot + a
        d = Math.min(d, sdSeg(lx, ly, 0, 0, Math.cos(ang) * m.r * l, Math.sin(ang) * m.r * l))
      }
      over(hex(0x6fa64f), strokeOf(d, 0.065))
      return d
    }
    case 'petal': {
      const c = Math.cos(m.rot)
      const s = Math.sin(m.rot)
      const u = lx * c + ly * s
      const v = -lx * s + ly * c
      const d = Math.max(sdLens(u, v, m.r, m.r * 0.52), -(Math.hypot(u - m.r * 1.02, v) - m.r * 0.24))
      over(hex(0xfde8ee), fillOf(d))
      over(hex(0xee9ab2), strokeOf(Math.abs(v) + Math.max(0, Math.abs(u) - m.r * 0.55) * 2, 0.03) * fillOf(d) * 0.7)
      return Math.abs(d)
    }
    case 'dune': {
      const span = 1
      const rho = Math.hypot(lx, ly + m.r)
      const th = Math.atan2(ly + m.r, lx) - (m.rot + Math.PI)
      const t = Math.atan2(Math.sin(th), Math.cos(th))
      // 弧心在图样中心正下方 r 处，月牙两头收尖
      const taper = Math.sqrt(Math.max(0, Math.cos((Math.min(Math.abs(t), span) / span) * (Math.PI / 2))))
      const half = 0.17 * taper
      const d = Math.abs(t) <= span ? Math.abs(rho - m.r) - half : Infinity
      over(hex(0xdaa74a), fillOf(d))
      const hi = Math.abs(t) <= span * 0.8 ? Math.abs(rho - (m.r + 0.3)) : Infinity
      over(hex(0xf9e2a0), strokeOf(hi, 0.05 * taper))
      return Math.abs(d)
    }
    case 'ripple': {
      const rho = Math.hypot(lx, ly)
      const th = Math.atan2(ly, lx) - m.rot
      const t = Math.abs(Math.atan2(Math.sin(th), Math.cos(th)))
      let d = Infinity
      for (const [k, span] of [[1, 0.75], [0.62, 0.6]] as const) if (t <= span) d = Math.min(d, Math.abs(rho - m.r * k) + Math.max(0, t - span * 0.7) * m.r)
      over(hex(0xeef8ff), strokeOf(d, 0.06))
      return d
    }
    case 'block': {
      const c = Math.cos(m.rot)
      const s = Math.sin(m.rot)
      const u = lx * c + ly * s
      const v = -lx * s + ly * c
      const d = sdBox(u, v, m.w, m.h, 0.04)
      over(hex(0xe8d1a8), fillOf(d))
      over(hex(0xb88e66), fillOf(d) * smooth(m.h * 0.2, m.h * 0.9, v) * 0.55)
      over(hex(0x553525), strokeOf(Math.abs(d), 0.045))
      return Math.abs(d)
    }
    case 'torch': {
      const rho = Math.hypot(lx, ly + 0.15)
      over(hex(0xf6b04a), fillOf(rho - m.r) * 0.55)
      over(hex(0xf9c860), fillOf(rho - m.r * 0.68) * 0.65)
      over(hex(0xfde089), fillOf(rho - m.r * 0.4) * 0.75)
      const stick = sdSeg(lx, ly, 0, 0.02, 0.06, 0.6) - 0.06
      over(hex(0x4a2e1d), fillOf(stick))
      const flame = Math.min(sdLens(ly + 0.2, lx, 0.24, 0.13), Math.hypot(lx, ly + 0.05) - 0.12)
      over(hex(0xf26a2b), fillOf(flame))
      const core = Math.min(sdLens(ly + 0.14, lx, 0.13, 0.065), Math.hypot(lx, ly + 0.06) - 0.06)
      over(hex(0xffe37a), fillOf(core))
      return Math.min(Math.abs(rho - m.r), Math.abs(stick), Math.abs(flame))
    }
    case 'crack': {
      let d = Infinity
      for (let i = 1; i < m.pts.length; i++) d = Math.min(d, sdSeg(x, y, m.pts[i - 1]![0], m.pts[i - 1]![1], m.pts[i]![0], m.pts[i]![1]))
      over(hex(0x5f7d96), strokeOf(d, 0.045))
      return d
    }
    case 'volcano': {
      const r = m.r
      const body = sdPoly(lx, ly, [[-r, 0.5 * r], [-0.32 * r, -0.55 * r], [0.32 * r, -0.55 * r], [r, 0.5 * r]]) - 0.08
      over(hex(0xd6432d), fillOf(body))
      over(hex(0xb2311f), fillOf(body) * smooth(-0.1, 0.4, lx / r) * 0.5)
      const crater = Math.hypot(lx / (0.3 * r), (ly + 0.55 * r) / (0.09 * r)) - 1
      over(hex(0x6e2015), fillOf(crater * 0.09 * r))
      let lava = Infinity
      for (const s of [-1, 1]) lava = Math.min(lava, sdSeg(lx, ly, s * 0.12 * r, -0.5 * r, s * 0.3 * r, -0.05 * r), sdSeg(lx, ly, s * 0.3 * r, -0.05 * r, s * 0.24 * r, 0.22 * r))
      over(hex(0xffb243), strokeOf(lava, 0.08) * fillOf(body))
      over(hex(0x5c1a10), strokeOf(Math.abs(body), 0.045))
      return Math.min(Math.abs(body), Math.abs(crater * 0.09 * r))
    }
  }
}

// ---------------------------------------------------------------- 准备

/** 画之前一次算好的：页面与能画的区域，每块四季各撒的图样；每个线程按同一个种子各算一遍，算出来一样 */
export interface Prepared {
  readonly page: Box
  readonly motifs: readonly (readonly Motif[][])[]
}

export function prepare(sc: PaintScene): Prepared {
  const plan = sc.plan
  const o: Owner = { id: -1, edge: 0 }
  const seeds = plan.patches.map((p) => p.seed)
  const motifs = plan.patches.map((p: Patch, id) =>
    CHAPTERS.map((pair, season) => {
      const rng = new Rng((plan.seed ^ Math.imul(id + 1, 0x9e3779b1) ^ Math.imul(season + 1, 0x85ebca6b)) >>> 0)
      const taken: { x: number; y: number; r: number }[] = []
      const spot = (r: number): { x: number; y: number } | null => {
        for (let t = 0; t < 30; t++) {
          const a = rng.next() * Math.PI * 2
          const d = Math.sqrt(rng.next()) * Math.max(0, p.inner - r * 0.6)
          const x = p.cx + Math.cos(a) * d
          const y = p.cy + Math.sin(a) * d
          ownerAt(seeds, plan.inner, plan.warpU, plan.warpSeed, x, y, o)
          if (o.id !== id || o.edge < r + LINE_AT_U + 0.12) continue
          if (taken.some((q) => Math.hypot(q.x - x, q.y - y) < q.r + r * 0.9)) continue
          taken.push({ x, y, r })
          return { x, y }
        }
        return null
      }
      return pair[p.chapters[season]!]!.motifs(rng, spot)
    }),
  )
  return { page: pageBox(sc.cfg), motifs }
}

// ---------------------------------------------------------------- 纸、书与桌

/** 纸面的纹理：细细的纤维与零星的纸屑，乘到纸色与印上去的颜色上 */
export function grainAt(x: number, y: number): number {
  const fine = valueNoise(x * 9.5, y * 9.5, 31) - 0.5
  const cloud = fbm(x * 1.1, y * 1.1, 57, 3) - 0.5
  const fiber = valueNoise(x * 2.2 + y * 0.4, y * 26, 83)
  const speck = valueNoise(x * 15, y * 15, 97)
  return 1 + fine * 0.035 + cloud * 0.03 - (fiber > 0.93 ? (fiber - 0.93) * 0.5 : 0) - (speck > 0.986 ? 0.07 : 0)
}

/** 纸页离书脊越近越往下弯、越暗 */
function gutterShade(dx: number): number {
  const d = Math.abs(dx)
  return 1 - 0.26 * Math.exp(-d / 0.45) - 0.08 * Math.exp(-d / 2.2)
}

/** 屋里的灯从左上方照下来：方框里越往左上越亮一点 */
function roomLight(x: number, y: number): number {
  const c = FRAME_U / 2
  const L = Math.hypot(SUN.x, SUN.y)
  return 1 + 0.05 * (((x - c) * SUN.x + (y - c) * SUN.y) / (L * c))
}

/**
 * 底图：桌面是一张浅色的木头桌子，往方框四角暗下去；书的影子往背光的方向落在桌上；封面是蓝灰的布面，比书页多出一圈、圆角；
 * 书页的边露出几张纸的薄边；右页就是这一页，左页是对着的那页，都是暖白的纸，往书脊弯下去变暗，书脊处一道折痕
 */
function paintBase(prep: Prepared, out: Uint8ClampedArray, rect: PixelRect): void {
  const ppu = GROUND_PPU
  const aa = 0.6 / ppu
  const pg = prep.page
  const w = rect.x1 - rect.x0
  const block = LEAF_U * LEAVES
  const bx1 = pg.x1 + block + BOARD_U
  const by0 = pg.y0 - block - BOARD_U
  const by1 = pg.y1 + block + BOARD_U
  const bcx = (FRAME_U * -1 + bx1) / 2
  const bhw = (bx1 + FRAME_U) / 2
  const bcy = (by0 + by1) / 2
  const bhh = (by1 - by0) / 2
  const col: Rgb = [0, 0, 0]
  for (let py = rect.y0; py < rect.y1; py++) {
    for (let px = rect.x0; px < rect.x1; px++) {
      const x = (px + 0.5) / ppu
      const y = (py + 0.5) / ppu
      const o = ((py - rect.y0) * w + px - rect.x0) * 4
      const light = roomLight(x, y)
      // 桌面
      const t = y * 1.7 + (fbm(x * 0.09, y * 0.5, 13, 3) - 0.5) * 7
      const band = 0.5 + 0.5 * Math.sin(t * Math.PI)
      const streak = valueNoise(x * 0.6, y * 14, 41)
      const k = clamp01(band * band * 0.7 + (streak - 0.5) * 0.5)
      const corner = Math.hypot(x - FRAME_U / 2, y - FRAME_U / 2) / (FRAME_U * 0.72)
      const deskLit = light * (1 - 0.28 * corner * corner)
      for (let c = 0; c < 3; c++) col[c] = (WOOD[c]! + (WOOD_DARK[c]! - WOOD[c]!) * k) * deskLit
      // 书在桌上的影子
      const sd = sdBox(x - bcx - AWAY.x * BOOK_SHADOW_U, y - bcy - AWAY.y * BOOK_SHADOW_U, bhw, bhh, BOARD_ROUND_U)
      const shadow = 0.42 * (1 - smooth(-BOOK_SHADOW_SOFT_U, BOOK_SHADOW_SOFT_U, sd))
      for (let c = 0; c < 3; c++) col[c] = col[c]! * (1 - shadow)
      // 封面
      const bd = sdBox(x - bcx, y - bcy, bhw, bhh, BOARD_ROUND_U)
      const onBoard = 1 - smooth(-aa, aa, bd)
      if (onBoard > 0) {
        const weave = 1 + 0.05 * (valueNoise(x * 24, y * 3, 5) - 0.5) + 0.05 * (valueNoise(x * 3, y * 24, 6) - 0.5)
        const rim = 1 - 0.25 * Math.exp(-Math.max(0, -bd) / 0.08) + 0.12 * Math.exp(-(((-bd - 0.12) / 0.05) ** 2))
        for (let c = 0; c < 3; c++) col[c] = col[c]! + (BOARD[c]! * weave * rim * light - col[c]!) * onBoard
      }
      // 书页的边：每张纸一道细线
      const beyond = Math.max(pg.y0 - y, y - pg.y1, x - pg.x1, 0)
      const inBlock = x < pg.x1 + block && y > pg.y0 - block && y < pg.y1 + block
      if (inBlock && beyond > 0) {
        const line = 1 - smooth(0.006, 0.02, Math.abs(((beyond + LEAF_U / 2) % LEAF_U) - LEAF_U / 2))
        const shade = 1 - (beyond / block) * 0.18
        for (let c = 0; c < 3; c++) col[c] = (LEAF[c]! + (LEAF_LINE[c]! - LEAF[c]!) * line) * shade * light
      }
      // 纸页
      const onPage = (1 - smooth(-aa, aa, y - pg.y1)) * (1 - smooth(-aa, aa, pg.y0 - y)) * (1 - smooth(-aa, aa, x - pg.x1))
      if (onPage > 0) {
        const g = grainAt(x, y) * gutterShade(x - pg.x0) * light
        const fold = 1 - 0.5 * (1 - smooth(0, 0.05, Math.abs(x - pg.x0)))
        for (let c = 0; c < 3; c++) col[c] = col[c]! + (PAPER[c]! * g * fold - col[c]!) * onPage
      }
      out[o] = col[0]
      out[o + 1] = col[1]
      out[o + 2] = col[2]
      out[o + 3] = 255
    }
  }
}

// ---------------------------------------------------------------- 这一页

/**
 * 这一页：每个像素属于哪一块。墨线描在块边往里一点、粗细随笔压起伏，绕着块心按方向记下笔尖走到哪；色块对着墨线错开一点、两块之间留一道白；
 * 上色的先后从块边往块心推。四季各画一份：底色印上纸纹、深浅略有起伏，再叠上这一章的图样；铅笔稿是块边描两遍的淡线与图样的轮廓，铅笔的灰随纸纹断断续续
 */
function paintPage(sc: PaintScene, prep: Prepared, rect: PixelRect, id: Uint8ClampedArray, line: Uint8ClampedArray, pencil: readonly Uint8ClampedArray[], ink: readonly Uint8ClampedArray[]): void {
  const plan = sc.plan
  const seeds = plan.patches.map((p) => p.seed)
  const ppu = GROUND_PPU
  const aa = 0.6 / ppu
  const pg = prep.page
  const w = rect.x1 - rect.x0
  const o: Owner = { id: -1, edge: 0 }
  const of: Owner = { id: -1, edge: 0 }
  const col: Rgb = [0, 0, 0]
  for (let py = rect.y0; py < rect.y1; py++) {
    for (let px = rect.x0; px < rect.x1; px++) {
      const x = pg.x0 + (px + 0.5) / ppu
      const y = pg.y0 + (py + 0.5) / ppu
      const q = ((py - rect.y0) * w + px - rect.x0) * 4
      ownerAt(seeds, plan.inner, plan.warpU, plan.warpSeed, x, y, o)
      const g = grainAt(x, y)
      for (const b of [id, line, ...pencil, ...ink]) b[q + 3] = 255
      if (o.id < 0) {
        for (const b of ink) {
          b[q] = PAPER[0] * g
          b[q + 1] = PAPER[1] * g
          b[q + 2] = PAPER[2] * g
        }
        continue
      }
      const p = plan.patches[o.id]!
      id[q] = o.id + 1
      const arc = (((Math.atan2(y - p.cy, x - p.cx) - p.a0) / (Math.PI * 2)) % 1 + 1) % 1
      const wob = (valueNoise(arc * 40, o.id * 7.3, 11) - 0.5) * 0.03
      const lw = LINE_U * (0.8 + 0.45 * valueNoise(arc * 22, o.id * 3.1, 23))
      const ln = 1 - smooth(lw / 2 - aa, lw / 2 + aa, Math.abs(o.edge - LINE_AT_U - wob))
      ownerAt(seeds, plan.inner, plan.warpU, plan.warpSeed, x - MISS.x, y - MISS.y, of)
      const fe = of.id === o.id ? of.edge : -1
      const fill = smooth(GAP_U - aa, GAP_U + aa, fe + (valueNoise(x * 3.3, y * 3.3, 19) - 0.5) * 0.05)
      const order = clamp01((1 - o.edge / Math.max(0.5, p.inner)) * 0.9 + (fbm(x * 1.4, y * 1.4, 71, 2) - 0.5) * 0.2)
      line[q] = ln * 255
      line[q + 1] = arc * 255
      line[q + 2] = fill * 255
      const sk1 = (valueNoise(arc * 17, o.id * 1.7, 61) - 0.5) * 0.08
      const sk2 = 0.03 + (valueNoise(arc * 29, o.id * 2.3, 67) - 0.5) * 0.07
      const graphite = 0.6 + 0.4 * valueNoise(x * 42, y * 42, 73)
      const outline = Math.max(1 - smooth(0.008, 0.026, Math.abs(o.edge - LINE_AT_U + sk1)), 0.5 * (1 - smooth(0.006, 0.02, Math.abs(o.edge - LINE_AT_U + sk2))))
      for (let s = 0; s < 4; s++) {
        const base = CHAPTERS[s]![p.chapters[s]!]!.base
        const tone = 1 + (fbm(x * 0.7, y * 0.7, 200 + s, 2) - 0.5) * 0.09
        for (let c = 0; c < 3; c++) col[c] = base[c]! * tone
        let dm = Infinity
        for (const m of prep.motifs[o.id]![s]!) dm = Math.min(dm, paintMotif(m, x, y, aa, col))
        const sketch = Math.max(outline, 0.85 * (1 - smooth(0.008, 0.024, dm)))
        const pc = pencil[s]!
        pc[q] = sketch * graphite * 255
        pc[q + 1] = order * 255
        const ik = ink[s]!
        ik[q] = col[0] * g
        ik[q + 1] = col[1] * g
        ik[q + 2] = col[2] * g
      }
    }
  }
}

/** 画一块活：底图按方框的像素，这一页按页面的像素 */
export function paint(sc: PaintScene, prep: Prepared, index: number, layer: Layer, rect: PixelRect): PaintPiece {
  if (layer === 'base') {
    const base = pixelBuffer(rect)
    paintBase(prep, base, rect)
    return { index, layer, rect, base }
  }
  const id = pixelBuffer(rect)
  const line = pixelBuffer(rect)
  const pencil = [0, 1, 2, 3].map(() => pixelBuffer(rect))
  const ink = [0, 1, 2, 3].map(() => pixelBuffer(rect))
  paintPage(sc, prep, rect, id, line, pencil, ink)
  return { index, layer, rect, id, line, pencil, ink }
}

/** 一块画好的活里所有的像素缓冲：交回主线程时整块转交 */
export function buffersOf(p: PaintPiece): ArrayBuffer[] {
  return [p.base, p.id, p.line, ...(p.pencil ?? []), ...(p.ink ?? [])].filter((b) => b !== undefined).map((b) => b.buffer)
}
