import { Rng } from '../../util/rng'
import type { Piece, PieceKind } from './model'

/** 布景的画每格多少像素 */
export const FACE_PPU = 80
/** 立起来时每米高在画面上占几格：和身体抬起的一样 */
export const STAND_U_PER_M = 0.5
/** 平躺在台上时每米高铺多长，格 */
export const FLAT_U_PER_M = 0.8
/** 刀模在剪影外留的那一圈白边，像素 */
const CUT_PX = 3
/** 网点的格距，像素 */
const DOT_PX = 5

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
type Pt = readonly [number, number]

/** 颜料：同一套颜色画布景也画地布 */
export const INK = {
  line: '#2b2320',
  cream: '#fbf3df',
  paper: '#f4ead2',
  leaf: '#6aa04c',
  leafHi: '#9cc768',
  leafLo: '#2f5c2e',
  pine: '#3f7a5f',
  pineLo: '#1f4a3a',
  bark: '#8a5a35',
  barkLo: '#4f321d',
  wood: '#b98552',
  woodLo: '#6f4528',
  hay: '#e2b94e',
  hayLo: '#a87a24',
  stone: '#a7a0b8',
  stoneHi: '#cbc6d6',
  stoneLo: '#5f5872',
  plaster: '#f0e6cf',
  tile: '#c4523d',
  tileLo: '#7c2c22',
  red: '#c8433a',
  blue: '#3d6fb0',
  gold: '#e9b632',
  goldLo: '#9a6b14',
  rock: '#8c7f86',
  rockLo: '#4b4048',
  violet: '#8a62c4',
  violetHi: '#c7a6f0',
  teal: '#3e8f84',
  tealLo: '#1d5049',
  belly: '#efd89c',
  window: '#f6d77c',
  dark: '#3a2f3a',
  white: '#fffaf0',
} as const

/** 一张网点纹样：color 的点按 cover（0 到 1）的覆盖率排成 45° 的网 */
const TILES = new Map<string, HTMLCanvasElement | OffscreenCanvas>()
function tile(color: string, cover: number): HTMLCanvasElement | OffscreenCanvas {
  const key = `${color}|${cover.toFixed(2)}`
  let t = TILES.get(key)
  if (t) return t
  const n = DOT_PX * 2
  t = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(n, n) : Object.assign(document.createElement('canvas'), { width: n, height: n })
  const c = t.getContext('2d') as Ctx
  const r = Math.sqrt(cover / Math.PI) * DOT_PX
  c.fillStyle = color
  for (const [x, y] of [[0, 0], [n, 0], [0, n], [n, n], [n / 2, n / 2]] as const) {
    c.beginPath()
    c.arc(x, y, r, 0, Math.PI * 2)
    c.fill()
  }
  TILES.set(key, t)
  return t
}

/** 网点的填充：转 45°，像印刷的网屏 */
export function dots(ctx: Ctx, color: string, cover: number, angle = 45): CanvasPattern {
  const p = ctx.createPattern(tile(color, cover), 'repeat')!
  p.setTransform(new DOMMatrix().rotate(angle))
  return p
}

/** 平滑的闭合曲线：过每个点，按 Catmull-Rom 连 */
export function smoothPath(ctx: Ctx, pts: readonly Pt[], closed = true): void {
  const n = pts.length
  ctx.moveTo(pts[0]![0], pts[0]![1])
  const last = closed ? n : n - 1
  for (let i = 0; i < last; i++) {
    const p0 = pts[(i - 1 + n) % n]!
    const p1 = pts[i]!
    const p2 = pts[(i + 1) % n]!
    const p3 = pts[(i + 2) % n]!
    const a = closed || i > 0 ? p0 : p1
    const d = closed || i < n - 2 ? p3 : p2
    ctx.bezierCurveTo(p1[0] + (p2[0] - a[0]) / 6, p1[1] + (p2[1] - a[1]) / 6, p2[0] - (d[0] - p1[0]) / 6, p2[1] - (d[1] - p1[1]) / 6, p2[0], p2[1])
  }
  if (closed) ctx.closePath()
}

/** 一团起伏的轮廓：lumps 个鼓包绕着椭圆 */
function lumpy(rng: Rng, cx: number, cy: number, rx: number, ry: number, lumps: number, depth: number): Pt[] {
  const pts: Pt[] = []
  const n = lumps * 2
  const ph = rng.next() * Math.PI
  for (let i = 0; i < n; i++) {
    const a = ph + (i / n) * Math.PI * 2
    const k = i % 2 === 0 ? 1 + depth * (0.6 + 0.4 * rng.next()) : 1 - depth * 0.3
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k])
  }
  return pts
}

/** 一块印上去的形：先按套版偏一点平涂，网点压出背光的一侧，亮色压出迎光的一侧，最后描墨线 */
interface Inked {
  readonly fill: string
  readonly hi?: string
  readonly lo?: string
  readonly line?: number
}

function ink(ctx: Ctx, path: (c: Ctx) => void, s: Inked, w: number, h: number): void {
  const off = Math.max(1, w * 0.004)
  ctx.save()
  ctx.translate(off, off * 0.6)
  ctx.beginPath()
  path(ctx)
  ctx.fillStyle = s.fill
  ctx.fill()
  ctx.restore()
  ctx.save()
  ctx.beginPath()
  path(ctx)
  ctx.clip()
  if (s.hi) {
    // 迎光一侧：剪影往右下挪开以后剩下左上那一牙
    ctx.beginPath()
    ctx.rect(-w, -h, w * 3, h * 3)
    ctx.save()
    ctx.translate(w * 0.07, h * 0.09)
    path(ctx)
    ctx.restore()
    ctx.fillStyle = s.hi
    ctx.fill('evenodd')
  }
  if (s.lo) {
    // 背光一侧：剪影往左上挪开以后剩下右下那一牙，压网点
    ctx.beginPath()
    ctx.rect(-w, -h, w * 3, h * 3)
    ctx.save()
    ctx.translate(-w * 0.1, -h * 0.12)
    path(ctx)
    ctx.restore()
    ctx.fillStyle = dots(ctx, s.lo, 0.5)
    ctx.fill('evenodd')
  }
  ctx.restore()
  if (s.line !== undefined) {
    ctx.beginPath()
    path(ctx)
    ctx.lineWidth = s.line
    ctx.lineJoin = 'round'
    ctx.strokeStyle = INK.line
    ctx.stroke()
  }
}

function strokes(ctx: Ctx, lines: readonly (readonly Pt[])[], width: number, color: string = INK.line): void {
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = color
  for (const l of lines) {
    ctx.beginPath()
    ctx.moveTo(l[0]![0], l[0]![1])
    for (let i = 1; i < l.length; i++) ctx.lineTo(l[i]![0], l[i]![1])
    ctx.stroke()
  }
}

function poly(pts: readonly Pt[]): (c: Ctx) => void {
  return (c) => {
    c.moveTo(pts[0]![0], pts[0]![1])
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i]![0], pts[i]![1])
    c.closePath()
  }
}

function curve(pts: readonly Pt[]): (c: Ctx) => void {
  return (c) => smoothPath(c, pts)
}

function ellipse(cx: number, cy: number, rx: number, ry: number): (c: Ctx) => void {
  return (c) => c.ellipse(cx, cy, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2)
}

function rect(x: number, y: number, w: number, h: number): (c: Ctx) => void {
  return (c) => c.rect(x, y, w, h)
}

/** 画在 W×H 像素里的一张，底边贴着下沿 */
type Draw = (ctx: Ctx, W: number, H: number, rng: Rng) => void

const LW = 2.2

/** 一面砌石：按行错缝描出石块的缝 */
function stones(ctx: Ctx, x: number, y: number, w: number, h: number, rows: number, rng: Rng): void {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  const rh = h / rows
  const lines: Pt[][] = []
  for (let r = 1; r < rows; r++) lines.push([[x, y + r * rh], [x + w, y + r * rh]])
  for (let r = 0; r < rows; r++) {
    let cx = x + (r % 2) * rh * 0.8 + rng.next() * rh * 0.4
    while (cx < x + w) {
      lines.push([[cx, y + r * rh], [cx, y + (r + 1) * rh]])
      cx += rh * (1.4 + rng.next() * 0.8)
    }
  }
  strokes(ctx, lines, 1.2, INK.stoneLo)
  ctx.restore()
}

/** 一块嶙峋的岩柱：顶上高低不平，两侧往下微微张开，一层层的岩层，脚下压暗 */
function rock(ctx: Ctx, H: number, rng: Rng, x0: number, w: number, top: number, fill: string, lo: string): void {
  const pts: Pt[] = [[x0, H], [x0 + w * 0.04, H * 0.62], [x0 + w * 0.1, top + (H - top) * 0.28]]
  const n = 6
  for (let i = 0; i <= n; i++) pts.push([x0 + w * (0.14 + (0.72 * i) / n), top + (H - top) * (0.02 + 0.2 * rng.next())])
  pts.push([x0 + w * 0.92, top + (H - top) * 0.32], [x0 + w * 0.97, H * 0.7], [x0 + w, H])
  ink(ctx, poly(pts), { fill, hi: '#b9adb4', lo, line: LW }, w, H - top)
  ctx.save()
  ctx.beginPath()
  poly(pts)(ctx)
  ctx.clip()
  const layers: Pt[][] = []
  for (let k = 1; k < 5; k++) {
    const y = top + ((H - top) * k) / 5
    layers.push(Array.from({ length: 7 }, (_, i) => [x0 + (w * i) / 6, y + (rng.next() - 0.5) * (H - top) * 0.06] as Pt))
  }
  strokes(ctx, layers, 1.1, lo)
  ctx.fillStyle = dots(ctx, lo, 0.45)
  ctx.fillRect(x0, H - (H - top) * 0.18, w, H)
  ctx.restore()
  strokes(ctx, Array.from({ length: 3 }, () => {
    const x = x0 + w * (0.2 + 0.6 * rng.next())
    const y = top + (H - top) * (0.25 + 0.4 * rng.next())
    return [[x, y], [x + w * 0.04, y + (H - top) * 0.12], [x + w * 0.01, y + (H - top) * 0.24]] as Pt[]
  }), 1.4)
}

/** 一棵阔叶树：树干，几团叠着的树冠；樱树、枫树换树冠的颜色，樱树撒花瓣，绿树偶尔挂果 */
interface Crown {
  readonly fill: string
  readonly hi: string
  readonly lo: string
  readonly dots?: string
}

const GREEN: Crown = { fill: INK.leaf, hi: INK.leafHi, lo: INK.leafLo, dots: INK.red }
/** 樱树多是近白的染井吉野，少数是深粉的八重樱 */
const YOSHINO: Crown = { fill: '#fcdae4', hi: '#fff8f8', lo: '#e8a4b8', dots: '#e28092' }
const YAE: Crown = { fill: '#f6b4cc', hi: '#ffe8f0', lo: '#d67a9a', dots: '#ce587c' }
/** 枫树的几种红：朱红、深红、橙红 */
const MAPLES: readonly Crown[] = [
  { fill: '#ee5c24', hi: '#ec842e', lo: '#a8301a', dots: '#e63a20' },
  { fill: '#e2402c', hi: '#ec642e', lo: '#922222', dots: '#da2c2e' },
  { fill: '#f48024', hi: '#f0a238', lo: '#b4481a', dots: '#ee5c1e' },
]

function drawTree(ctx: Ctx, W: number, H: number, rng: Rng, crown: Crown): void {
  const cx = W / 2
  const tw = W * 0.16
  const trunk: Pt[] = [[cx - tw * 0.6, H], [cx - tw * 0.4, H * 0.55], [cx - tw, H * 0.42], [cx, H * 0.5], [cx + tw, H * 0.4], [cx + tw * 0.4, H * 0.55], [cx + tw * 0.65, H]]
  ink(ctx, poly(trunk), { fill: INK.bark, lo: INK.barkLo, line: LW }, W, H)
  const ch = H * 0.62
  const cy = 4 + ch / 2
  const main = lumpy(rng, cx, cy, W * 0.44, ch / 2 - 2, 5 + Math.floor(rng.next() * 3), 0.1)
  ink(ctx, curve(main), { fill: crown.fill, hi: crown.hi, lo: crown.lo, line: LW }, W, H)
  ctx.save()
  ctx.beginPath()
  smoothPath(ctx, main)
  ctx.clip()
  strokes(
    ctx,
    Array.from({ length: 4 }, () => {
      const x = cx + (rng.next() - 0.5) * W * 0.55
      const y = cy + (rng.next() - 0.3) * ch * 0.5
      return [[x - W * 0.06, y], [x, y + ch * 0.07], [x + W * 0.06, y]] as Pt[]
    }),
    1.4,
    crown.lo,
  )
  if (crown === GREEN) {
    if (rng.next() < 0.5) {
      for (let i = 0; i < 5; i++) {
        ctx.beginPath()
        ctx.arc(cx + (rng.next() - 0.5) * W * 0.7, cy + (rng.next() - 0.45) * ch * 0.7, W * 0.035, 0, Math.PI * 2)
        ctx.fillStyle = crown.dots!
        ctx.fill()
      }
    }
  } else if (crown === YOSHINO || crown === YAE) {
    // 满树的五瓣小花，花心深一点
    for (let i = 0; i < 26; i++) {
      const x = cx + (rng.next() - 0.5) * W * 0.78
      const y = cy + (rng.next() - 0.45) * ch * 0.8
      const r = W * (0.018 + rng.next() * 0.01)
      for (let k = 0; k < 5; k++) {
        ctx.beginPath()
        ctx.arc(x + Math.cos((k / 5) * 6.28) * r, y + Math.sin((k / 5) * 6.28) * r, r * 0.8, 0, 6.28)
        ctx.fillStyle = crown.hi
        ctx.fill()
      }
      ctx.beginPath()
      ctx.arc(x, y, r * 0.45, 0, 6.28)
      ctx.fillStyle = crown.dots!
      ctx.fill()
    }
  } else {
    // 一片片掌状的枫叶叠出树冠
    for (let i = 0; i < 30; i++) {
      ctx.save()
      ctx.translate(cx + (rng.next() - 0.5) * W * 0.8, cy + (rng.next() - 0.45) * ch * 0.8)
      ctx.rotate(rng.next() * 6.28)
      mapleLeaf(ctx, W * (0.045 + rng.next() * 0.025), [crown.hi, crown.fill, crown.dots!, '#f2b23a'][i % 4]!)
      ctx.restore()
    }
  }
  ctx.restore()
}

/** 一片掌状的枫叶：五个尖，r 是顶上那个尖离叶心多远 */
export function mapleLeaf(ctx: Ctx, r: number, fill: string, line = 0.8): void {
  const tips = [1, 0.86, 0.58, 0.58, 0.86]
  ctx.beginPath()
  for (let k = 0; k < 5; k++) {
    const a = -Math.PI / 2 + (k / 5) * Math.PI * 2
    const n = a + Math.PI / 5
    const t = r * tips[k]!
    if (k === 0) ctx.moveTo(Math.cos(a) * t, Math.sin(a) * t)
    else ctx.lineTo(Math.cos(a) * t, Math.sin(a) * t)
    ctx.lineTo(Math.cos(a + 0.22) * t * 0.62, Math.sin(a + 0.22) * t * 0.62)
    ctx.lineTo(Math.cos(n) * r * (k === 2 ? 0.2 : 0.36), Math.sin(n) * r * (k === 2 ? 0.2 : 0.36))
    const a2 = a + (Math.PI * 2) / 5
    const t2 = r * tips[(k + 1) % 5]!
    ctx.lineTo(Math.cos(a2 - 0.22) * t2 * 0.62, Math.sin(a2 - 0.22) * t2 * 0.62)
  }
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  if (line > 0) {
    ctx.lineWidth = line
    ctx.strokeStyle = INK.line
    ctx.stroke()
  }
}

function drawPine(ctx: Ctx, W: number, H: number, rng: Rng, snow: boolean): void {
  const cx = W / 2
  ink(ctx, rect(cx - W * 0.07, H * 0.8, W * 0.14, H * 0.2), { fill: INK.bark, line: LW }, W, H)
  const tiers = 3
  for (let i = 0; i < tiers; i++) {
    const t0 = 3 + (H * 0.82 * i) / tiers
    const t1 = 3 + (H * 0.82 * (i + 1.35)) / tiers
    const half = W * (0.24 + 0.24 * ((i + 1) / tiers))
    const sag = (rng.next() - 0.5) * W * 0.03
    const tri: Pt[] = [[cx + sag, t0], [cx + half, t1], [cx + half * 0.5, t1 - (t1 - t0) * 0.08], [cx, t1 + (t1 - t0) * 0.04], [cx - half * 0.5, t1 - (t1 - t0) * 0.08], [cx - half, t1]]
    ink(ctx, poly(tri), { fill: INK.pine, lo: INK.pineLo, line: LW }, W, H)
    if (snow) {
      const k = 0.42
      const cap: Pt[] = [[cx + sag, t0], [cx + half * k, t0 + (t1 - t0) * k], [cx + half * k * 0.5, t0 + (t1 - t0) * k * 0.82], [cx, t0 + (t1 - t0) * k * 1.05], [cx - half * k * 0.5, t0 + (t1 - t0) * k * 0.82], [cx - half * k, t0 + (t1 - t0) * k]]
      ink(ctx, poly(cap), { fill: INK.white, lo: '#a9c4dc', line: 1.4 }, W, H)
    }
  }
}

const drawBush: Draw = (ctx, W, H, rng) => {
  const n = Math.max(2, Math.round(W / (FACE_PPU * 0.7)))
  const pts: Pt[] = [[W - 3, H]]
  for (let i = n; i >= 0; i--) {
    const x = 3 + ((W - 6) * i) / n
    const y = 4 + rng.next() * H * 0.25
    pts.push([x, y])
    if (i > 0) pts.push([x - (W - 6) / n / 2, H * 0.32 + rng.next() * H * 0.1])
  }
  pts.push([3, H])
  ink(ctx, curve(pts), { fill: INK.leaf, hi: INK.leafHi, lo: INK.leafLo, line: LW }, W, H)
  for (let i = 0; i < Math.round(W / 22); i++) flower(ctx, 8 + rng.next() * (W - 16), H * (0.3 + rng.next() * 0.5), [INK.white, INK.gold, '#e98aa6'][Math.floor(rng.next() * 3)]!)
}

/** 五瓣的小花 */
function flower(ctx: Ctx, x: number, y: number, c: string): void {
  for (let k = 0; k < 5; k++) {
    ctx.beginPath()
    ctx.arc(x + Math.cos((k / 5) * 6.28) * 2.6, y + Math.sin((k / 5) * 6.28) * 2.6, 2, 0, 6.28)
    ctx.fillStyle = c
    ctx.fill()
  }
  ctx.beginPath()
  ctx.arc(x, y, 1.4, 0, 6.28)
  ctx.fillStyle = INK.gold
  ctx.fill()
}

/** 牧场的木栅栏：风吹日晒发灰的原木，一根根立柱，两道横杆 */
const drawRail: Draw = (ctx, W, H, rng) => {
  for (const y of [0.22, 0.58]) ink(ctx, rect(3, H * y, W - 6, H * 0.14), { fill: '#c9bba0', lo: '#7d6e58', line: 1.6 }, W, H)
  const n = Math.max(2, Math.round(W / (FACE_PPU * 0.9)))
  for (let i = 0; i <= n; i++) {
    const x = 3 + ((W - 6 - W * 0.06) * i) / n
    ink(ctx, rect(x + (rng.next() - 0.5) * 2, 3 + rng.next() * 3, W * 0.06, H), { fill: '#a8957a', lo: '#5e5040', line: 1.6 }, W, H)
  }
  strokes(ctx, Array.from({ length: Math.round(W / 16) }, () => {
    const x = 6 + rng.next() * (W - 12)
    return [[x - 4, H], [x, H - 5 - rng.next() * 5], [x + 4, H]] as Pt[]
  }), 1.2, INK.leafLo)
}

/** 一只吃草的羊：一团白绒，黑脸黑腿 */
const drawSheep: Draw = (ctx, W, H, rng) => {
  const left = rng.next() < 0.5
  ctx.save()
  if (left) {
    ctx.translate(W, 0)
    ctx.scale(-1, 1)
  }
  for (const x of [0.28, 0.4, 0.62, 0.74]) ink(ctx, rect(W * x, H * 0.72, W * 0.06, H * 0.28), { fill: INK.dark, line: 1.2 }, W, H)
  const body = lumpy(rng, W * 0.48, H * 0.44, W * 0.36, H * 0.34, 7, 0.14)
  ink(ctx, curve(body), { fill: INK.white, lo: '#b7b0a2', line: LW }, W, H)
  ink(ctx, ellipse(W * 0.85, H * 0.52, W * 0.1, H * 0.2), { fill: INK.dark, line: LW }, W, H)
  ink(ctx, ellipse(W * 0.82, H * 0.36, W * 0.06, H * 0.06), { fill: INK.white, line: 1 }, W, H)
  ctx.beginPath()
  ctx.arc(W * 0.88, H * 0.48, 1.6, 0, 6.28)
  ctx.fillStyle = INK.white
  ctx.fill()
  ctx.restore()
}

/** 寺院的一段土墙：白墙，墙头压一溜灰瓦，木柱隔开，开一扇圆窗 */
const drawTemple: Draw = (ctx, W, H, rng) => {
  const cap = H * 0.26
  ink(ctx, rect(3, cap, W - 6, H - cap), { fill: INK.plaster, lo: '#bfb39a', line: LW }, W, H)
  const posts = Math.max(2, Math.round(W / (FACE_PPU * 1.2)))
  for (let i = 0; i <= posts; i++) ink(ctx, rect(3 + ((W - 6 - 8) * i) / posts, cap, 8, H - cap), { fill: '#8a3b2a', line: 1.4 }, W, H)
  strokes(ctx, [[[3, H - H * 0.14], [W - 3, H - H * 0.14]]], 2.4, '#8a3b2a')
  ink(ctx, poly([[0, cap + 4], [W * 0.04, 4], [W * 0.96, 4], [W, cap + 4]]), { fill: '#6d6f78', lo: '#33353b', line: LW }, W, H)
  strokes(ctx, Array.from({ length: Math.round(W / 9) }, (_, i) => [[6 + i * 9, 6], [4 + i * 9, cap]] as Pt[]), 1.1, '#33353b')
  const wx = W * (0.3 + rng.next() * 0.4)
  ink(ctx, ellipse(wx, cap + (H - cap) * 0.45, (H - cap) * 0.22, (H - cap) * 0.22), { fill: '#2e2a2a', line: LW }, W, H)
  strokes(ctx, [-0.12, 0, 0.12].map((k) => [[wx + k * (H - cap), cap + (H - cap) * 0.25], [wx + k * (H - cap), cap + (H - cap) * 0.65]] as Pt[]), 1.6, '#8a3b2a')
}

/** 石灯笼：底座、灯柱、开着暖窗的灯室、宽宽的笠顶 */
const drawLantern: Draw = (ctx, W, H) => {
  ink(ctx, rect(W * 0.2, H * 0.84, W * 0.6, H * 0.16), { fill: INK.stone, lo: INK.stoneLo, line: LW }, W, H)
  ink(ctx, rect(W * 0.38, H * 0.55, W * 0.24, H * 0.3), { fill: INK.stone, lo: INK.stoneLo, line: LW }, W, H)
  ink(ctx, rect(W * 0.26, H * 0.32, W * 0.48, H * 0.24), { fill: INK.stone, line: LW }, W, H)
  ink(ctx, rect(W * 0.38, H * 0.36, W * 0.24, H * 0.16), { fill: INK.window, line: 1.4 }, W, H)
  ink(ctx, poly([[W * 0.04, H * 0.33], [W * 0.5, H * 0.1], [W * 0.96, H * 0.33]]), { fill: INK.stone, lo: INK.stoneLo, line: LW }, W, H)
  ink(ctx, ellipse(W * 0.5, H * 0.08, W * 0.07, H * 0.06), { fill: INK.stone, line: 1.4 }, W, H)
}

/** 仙人掌：一根主干、一两条举起来的胳膊，竖着的棱，零星的刺；顶上偶尔开朵花 */
const drawCactus: Draw = (ctx, W, H, rng) => {
  const cx = W / 2
  const tw = W * 0.18
  const arm = (side: number, y0: number, up: number): void => {
    const x0 = cx + side * tw * 0.8
    const x1 = cx + side * W * 0.38
    ink(ctx, (c) => {
      c.moveTo(x0, y0)
      c.lineTo(x1 - side * W * 0.06, y0)
      c.quadraticCurveTo(x1 + side * W * 0.04, y0, x1 + side * W * 0.04, y0 - H * 0.08)
      c.lineTo(x1 + side * W * 0.04, y0 - up)
      c.arc(x1 - side * W * 0.04, y0 - up, W * 0.08, 0, Math.PI, true)
      c.lineTo(x1 - side * W * 0.12, y0 - H * 0.1)
      c.lineTo(x0, y0 - H * 0.1)
      c.closePath()
    }, { fill: '#5e9a4a', lo: '#2e5a2a', line: LW }, W, H)
  }
  arm(-1, H * (0.55 + rng.next() * 0.1), H * 0.25)
  if (rng.next() < 0.7) arm(1, H * (0.45 + rng.next() * 0.1), H * 0.22)
  ink(ctx, (c) => {
    c.moveTo(cx - tw, H)
    c.lineTo(cx - tw, H * 0.12)
    c.arc(cx, H * 0.12, tw, Math.PI, 0)
    c.lineTo(cx + tw, H)
    c.closePath()
  }, { fill: '#5e9a4a', hi: '#8cc06a', lo: '#2e5a2a', line: LW }, W, H)
  strokes(ctx, [-0.5, 0, 0.5].map((k) => [[cx + k * tw, H * 0.1], [cx + k * tw, H]] as Pt[]), 1.2, '#2e5a2a')
  if (rng.next() < 0.6) flower(ctx, cx, H * 0.04 + 4, '#f26b8a')
}

/** 沙漠里的石堆：一块压一块，越往上越小 */
const drawCairn: Draw = (ctx, W, H, rng) => {
  let y = H
  let w = W * 0.92
  for (let i = 0; i < 4 && y > H * 0.15; i++) {
    const h = H * (0.32 - i * 0.04)
    const x = W / 2 + (rng.next() - 0.5) * W * 0.08
    ink(ctx, ellipse(x, y - h / 2, w / 2, h / 2), { fill: ['#c99a62', '#b58a5a', '#d3ab72', '#a8794e'][i]!, lo: '#6b4a2a', line: LW }, W, H)
    y -= h * 0.88
    w *= 0.72
  }
}

/** 椰子树：一节节弯着的树干，顶上一蓬羽叶，挂着椰子 */
const drawPalm: Draw = (ctx, W, H, rng) => {
  const lean = (rng.next() < 0.5 ? -1 : 1) * W * 0.18
  const top: Pt = [W / 2 + lean, H * 0.24]
  const segs = 7
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs
    const t1 = (i + 1) / segs
    const x0 = W / 2 + lean * t0 * t0
    const x1 = W / 2 + lean * t1 * t1
    const y0 = H - (H - top[1]) * t0
    const y1 = H - (H - top[1]) * t1
    const r = W * (0.07 - 0.02 * t0)
    ink(ctx, poly([[x0 - r, y0], [x1 - r * 0.9, y1], [x1 + r * 0.9, y1], [x0 + r, y0]]), { fill: '#a87a4a', lo: '#6b4a2a', line: 1.4 }, W, H)
  }
  for (let k = 0; k < 6; k++) {
    const a = Math.PI + (k / 5) * Math.PI + (rng.next() - 0.5) * 0.2
    const len = W * (0.38 + rng.next() * 0.1)
    const ex = top[0] + Math.cos(a) * len
    const ey = top[1] + Math.sin(a) * len * 0.5 + H * 0.12 * Math.abs(Math.cos(a))
    const mx = (top[0] + ex) / 2
    const my = Math.min(top[1], ey) - H * 0.08
    ink(ctx, (c) => {
      c.moveTo(top[0], top[1])
      c.quadraticCurveTo(mx, my - H * 0.04, ex, ey)
      c.quadraticCurveTo(mx, my + H * 0.06, top[0], top[1])
      c.closePath()
    }, { fill: '#4f9a52', lo: '#255a2c', line: 1.6 }, W, H)
  }
  for (let k = 0; k < 3; k++) ink(ctx, ellipse(top[0] + (k - 1) * W * 0.05, top[1] + H * 0.05, W * 0.035, W * 0.035), { fill: '#7a4a24', line: 1 }, W, H)
}

/** 一件布景的岩石：岩柱、礁石、黑岩换颜色 */
const drawReef: Draw = (ctx, W, H, rng) => {
  rock(ctx, H, rng, 2, W - 4, 3, '#7d8f99', '#3b4a52')
  for (let i = 0; i < 7; i++) ink(ctx, ellipse(W * (0.15 + rng.next() * 0.7), H * (0.4 + rng.next() * 0.5), 3.2, 2.4), { fill: '#e8e2d2', line: 0.8 }, W, H)
  strokes(ctx, Array.from({ length: 3 }, () => {
    const x = W * (0.1 + rng.next() * 0.8)
    return [[x, H], [x - 4, H * 0.75], [x + 3, H * 0.55], [x - 2, H * 0.4]] as Pt[]
  }), 2.4, '#3f7a52')
}

/** 潜艇的侧影：长圆的艇身、背上的指挥塔与潜望镜、一排舷窗，艇尾一副螺旋桨 */
const drawSub: Draw = (ctx, W, H, rng) => {
  const left = rng.next() < 0.5
  ctx.save()
  if (left) {
    ctx.translate(W, 0)
    ctx.scale(-1, 1)
  }
  const top = H * 0.42
  ink(ctx, rect(W * 0.62, H * 0.06, W * 0.02, H * 0.2), { fill: INK.dark, line: 1.2 }, W, H)
  ink(ctx, (c) => c.roundRect(W * 0.48, H * 0.18, W * 0.2, top - H * 0.16, 6), { fill: '#e2a33a', lo: '#9a6418', line: LW }, W, H)
  ink(ctx, (c) => c.roundRect(W * 0.06, top, W * 0.86, H - top - 3, (H - top) / 2), { fill: '#e8b443', hi: '#f6d585', lo: '#9a6418', line: LW }, W, H)
  ink(ctx, poly([[W * 0.08, top + (H - top) * 0.2], [W * 0.0, top + (H - top) * 0.05], [W * 0.0, H - 3], [W * 0.08, top + (H - top) * 0.8]]), { fill: INK.dark, line: 1.4 }, W, H)
  for (let i = 0; i < 4; i++) ink(ctx, ellipse(W * (0.3 + i * 0.13), top + (H - top) * 0.45, (H - top) * 0.13, (H - top) * 0.13), { fill: '#bfe6f2', lo: '#3c7a96', line: 1.6 }, W, H)
  strokes(ctx, [[[W * 0.1, H - (H - top) * 0.25], [W * 0.9, H - (H - top) * 0.25]]], 1.2, '#9a6418')
  ctx.restore()
}

/** 海带：两三根从底下飘起来的长带子 */
const drawKelp: Draw = (ctx, W, H, rng) => {
  for (let k = 0; k < 3; k++) {
    const x0 = W * (0.25 + k * 0.25)
    const pts: Pt[] = []
    const n = 6
    const ph = rng.next() * 6
    const top = H * (0.02 + rng.next() * 0.25)
    for (let i = 0; i <= n; i++) pts.push([x0 + Math.sin(ph + i * 1.2) * W * 0.1, H - ((H - top) * i) / n])
    const right = pts.map(([x, y]) => [x + W * 0.07, y] as Pt).reverse()
    ink(ctx, poly(pts.concat(right)), { fill: k % 2 ? '#5f8a3a' : '#7a9a3e', lo: '#2f4a1e', line: 1.6 }, W, H)
  }
}

/** 珊瑚：一丛分叉的枝，旁边一面扇子 */
const drawCoral: Draw = (ctx, W, H, rng) => {
  ink(ctx, (c) => {
    c.moveTo(W * 0.55, H)
    c.arc(W * 0.72, H * 0.6, W * 0.22, Math.PI * 0.85, Math.PI * 0.15, false)
    c.closePath()
  }, { fill: '#e8865a', lo: '#9a4a2a', line: LW }, W, H)
  const branch = (x: number, y: number, a: number, len: number, d: number): void => {
    const ex = x + Math.cos(a) * len
    const ey = y + Math.sin(a) * len
    strokes(ctx, [[[x, y], [ex, ey]]], 6 - d, INK.line)
    strokes(ctx, [[[x, y], [ex, ey]]], 4 - d, '#f27a9e')
    if (d < 3) {
      branch(ex, ey, a - 0.45 - rng.next() * 0.2, len * 0.72, d + 1)
      branch(ex, ey, a + 0.45 + rng.next() * 0.2, len * 0.72, d + 1)
    }
  }
  branch(W * 0.3, H, -Math.PI / 2, H * 0.38, 0)
}

/** 塌了一半的石墙：砌石，顶上高低不平地塌下来，墙面爬着藤、落着红叶 */
const drawRuin: Draw = (ctx, W, H, rng) => {
  const pts: Pt[] = [[2, H], [2, H * 0.3]]
  const n = 8
  for (let i = 1; i < n; i++) {
    const x = (W * i) / n
    const k = Math.floor(rng.next() * 3)
    pts.push([x - W * 0.04, H * (0.04 + k * 0.18)], [x + W * 0.02, H * (0.04 + k * 0.18)])
  }
  pts.push([W - 2, H * 0.35], [W - 2, H])
  ink(ctx, poly(pts), { fill: '#b6b8ba', hi: '#d4d6d6', lo: '#5a5e64', line: LW }, W, H)
  ctx.save()
  ctx.beginPath()
  poly(pts)(ctx)
  ctx.clip()
  stones(ctx, 0, 0, W, H, 6, rng)
  // 墙脚返潮发绿，一道地锦从墙脚爬上来
  ctx.fillStyle = dots(ctx, '#46503c', 0.45)
  ctx.fillRect(0, H * 0.86, W, H)
  creeper(ctx, W, H, rng, W * (0.15 + rng.next() * 0.3))
  if (rng.next() < 0.6) creeper(ctx, W, H, rng, W * (0.6 + rng.next() * 0.3))
  ctx.restore()
  for (let i = 0; i < 8; i++) {
    ctx.save()
    ctx.translate(W * (0.05 + rng.next() * 0.9), H * (0.82 + rng.next() * 0.16))
    ctx.rotate(rng.next() * 6.28)
    mapleLeaf(ctx, 6, ['#e63a20', '#ee5c24', '#da2c2e', '#f48024'][i % 4]!)
    ctx.restore()
  }
}

/** 一道从墙脚爬上墙的红地锦：一根弯弯的藤，挂满红叶 */
function creeper(ctx: Ctx, W: number, H: number, rng: Rng, x: number): void {
  const pts: Pt[] = [[x, H]]
  let px = x
  for (let y = H; y > H * (0.25 + rng.next() * 0.3); y -= H * 0.08) {
    px += (rng.next() - 0.5) * W * 0.06
    pts.push([px, y])
  }
  strokes(ctx, [pts], 1.4, '#5a2a1a')
  for (const [vx, vy] of pts) {
    for (let k = 0; k < 3; k++) {
      ctx.save()
      ctx.translate(vx + (rng.next() - 0.5) * W * 0.08, vy + (rng.next() - 0.5) * H * 0.06)
      ctx.rotate(rng.next() * 6.28)
      mapleLeaf(ctx, 4.5, ['#b6301e', '#d24a2a', '#8e2618'][k]!, 0.6)
      ctx.restore()
    }
  }
}

/** 断了头的石柱：灰白的柱础、带凹槽的柱身一节节垒起来，柱头斜着断开，脚下落着枫叶 */
const drawColumn: Draw = (ctx, W, H, rng) => {
  const br = H * (0.04 + rng.next() * 0.12)
  ink(ctx, rect(W * 0.08, H * 0.9, W * 0.84, H * 0.1), { fill: '#a8acae', lo: '#5a5e64', line: LW }, W, H)
  ink(ctx, poly([[W * 0.2, H * 0.9], [W * 0.2, br + H * 0.08], [W * 0.8, br], [W * 0.8, H * 0.9]]), { fill: '#babcbc', hi: '#dcdedd', lo: '#62666a', line: LW }, W, H)
  strokes(ctx, [0.32, 0.44, 0.56, 0.68].map((k) => [[W * k, br + H * 0.1], [W * k, H * 0.88]] as Pt[]), 1.2, '#62666a')
  strokes(ctx, [0.3, 0.52, 0.74].map((k) => [[W * 0.2, br + (H * 0.9 - br) * k], [W * 0.8, br + (H * 0.9 - br) * k - H * 0.01]] as Pt[]), 1, '#7a7e82')
  for (let i = 0; i < 3; i++) {
    ctx.save()
    ctx.translate(W * (0.15 + rng.next() * 0.7), H * (0.93 + rng.next() * 0.05))
    ctx.rotate(rng.next() * 6.28)
    mapleLeaf(ctx, 5.5, ['#e63a20', '#f48024', '#da2c2e'][i]!)
    ctx.restore()
  }
}

/** 一堆扫起来的枫叶：朱红、深红、橙红，夹着几片发黄发褐的 */
const drawLeaves: Draw = (ctx, W, H, rng) => {
  const pts: Pt[] = [[2, H], [W * 0.15, H * 0.4], [W * 0.4, 4], [W * 0.65, H * 0.18], [W * 0.88, H * 0.45], [W - 2, H]]
  ink(ctx, curve(pts), { fill: '#a4562e', hi: '#e6623a', lo: '#5a2414', line: LW }, W, H)
  ctx.save()
  ctx.beginPath()
  smoothPath(ctx, pts)
  ctx.clip()
  for (let i = 0; i < W / 4; i++) {
    ctx.save()
    ctx.translate(rng.next() * W, rng.next() * H)
    ctx.rotate(rng.next() * 6.28)
    mapleLeaf(ctx, 5 + rng.next() * 2, ['#e63a20', '#ee5c24', '#da2c2e', '#f48024', '#ecac36', '#ac5c36'][i % 6]!)
    ctx.restore()
  }
  ctx.restore()
}

/** 火把架：一根木杆，顶上铁盆里烧着火 */
const drawTorch: Draw = (ctx, W, H) => {
  ink(ctx, rect(W * 0.42, H * 0.34, W * 0.16, H * 0.66), { fill: INK.wood, lo: INK.woodLo, line: LW }, W, H)
  ink(ctx, poly([[W * 0.2, H * 0.3], [W * 0.8, H * 0.3], [W * 0.66, H * 0.42], [W * 0.34, H * 0.42]]), { fill: INK.dark, line: LW }, W, H)
  ink(ctx, curve([[W * 0.26, H * 0.3], [W * 0.36, H * 0.1], [W * 0.5, 4], [W * 0.64, H * 0.12], [W * 0.74, H * 0.3]]), { fill: '#f28a2a', hi: '#ffd76a', line: 1.6 }, W, H)
  ink(ctx, curve([[W * 0.4, H * 0.3], [W * 0.5, H * 0.14], [W * 0.6, H * 0.3]]), { fill: '#ffe9a0', line: 0 }, W, H)
}

/** 雪火山：深褐的火山渣山体，一道道碎石棱，山腰往上积着雪；口上透出红光，熔岩从口上淌下来、把雪烧开，顶上一柱灰烟 */
const drawCone: Draw = (ctx, W, H, rng) => {
  const top = H * 0.34
  const lip = W * 0.11
  const pts: Pt[] = [[2, H], [W * 0.14, H * 0.8], [W * 0.3, H * 0.56], [W / 2 - lip, top], [W / 2 + lip, top], [W * 0.7, H * 0.55], [W * 0.86, H * 0.8], [W - 2, H]]
  ink(ctx, poly(pts), { fill: '#56423a', hi: '#7a625c', lo: '#2a1f1d', line: LW }, W, H)
  ctx.save()
  ctx.beginPath()
  poly(pts)(ctx)
  ctx.clip()
  // 碎石棱：从口上往下放射
  const ribs: Pt[][] = []
  for (let k = 0; k < 14; k++) {
    const x0 = W / 2 + (k / 13 - 0.5) * lip * 2
    ribs.push([[x0, top], [x0 + (k / 13 - 0.5) * W * 0.9, H]])
  }
  strokes(ctx, ribs, 1.2, '#2a1f1d')
  // 积雪：山腰以上一片白，下沿一道道舌头往下伸
  const snow: Pt[] = [[W / 2 - lip * 1.2, top - 2]]
  const n = 12
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const x = W * (0.22 + 0.56 * t)
    snow.push([x, H * (0.62 + (i % 2 === 0 ? 0.1 : 0) + rng.next() * 0.06) - Math.abs(t - 0.5) * H * 0.12])
  }
  snow.push([W / 2 + lip * 1.2, top - 2])
  ink(ctx, poly(snow), { fill: '#eef2f8', hi: '#ffffff', lo: '#8a9cc0', line: 1.4 }, W, H)
  // 熔岩从口上顺着沟淌下来
  for (let k = 0; k < 3; k++) {
    let x = W / 2 + (rng.next() - 0.5) * lip * 1.4
    let y = top
    const line: Pt[] = [[x, y]]
    const dir = x < W / 2 ? -1 : 1
    while (y < H) {
      y += H * 0.07
      x += dir * W * (0.015 + rng.next() * 0.03)
      line.push([x, y])
    }
    strokes(ctx, [line], 9, '#1c120f')
    strokes(ctx, [line], 6, '#e6420d')
    strokes(ctx, [line], 2.4, '#ffad33')
  }
  ctx.restore()
  ink(ctx, ellipse(W / 2, top + 1, lip, H * 0.035), { fill: '#ff7814', hi: '#ffe085', line: 1.6 }, W, H)
  // 灰烟一柱，顺风斜过去
  for (let k = 0; k < 5; k++) ink(ctx, ellipse(W / 2 + k * k * W * 0.012, top - H * (0.06 + k * 0.06), W * (0.03 + k * 0.012), H * (0.032 + k * 0.008)), { fill: k < 2 ? '#5f6367' : '#8c9094', lo: '#3e4145', line: 1.4 }, W, H)
}

/** 柱状玄武岩：一根根六棱的石柱挤在一起，顶上高低不平，脚下压着雪 */
const drawBasalt: Draw = (ctx, W, H, rng) => {
  const n = Math.max(3, Math.round(W / (FACE_PPU * 0.38)))
  const cw = (W - 4) / n
  for (let i = 0; i < n; i++) {
    const x = 2 + i * cw
    const top = 4 + rng.next() * H * 0.4
    const pts: Pt[] = [[x, H], [x, top + cw * 0.2], [x + cw * 0.5, top], [x + cw, top + cw * 0.2], [x + cw, H]]
    ink(ctx, poly(pts), { fill: ['#3a3f44', '#2e3236', '#464b50'][i % 3]!, hi: '#5a6066', lo: '#121416', line: 1.6 }, W, H)
    strokes(ctx, [[[x + cw * 0.5, top], [x + cw * 0.5, H]]], 1, '#121416')
    ink(ctx, poly([[x, top + cw * 0.2], [x + cw * 0.5, top], [x + cw, top + cw * 0.2], [x + cw * 0.5, top + cw * 0.36]]), { fill: '#eef2f8', line: 1 }, W, H)
  }
  ink(ctx, curve([[2, H], [W * 0.2, H * 0.84], [W * 0.5, H * 0.9], [W * 0.8, H * 0.83], [W - 2, H]]), { fill: '#eef2f8', lo: '#8a9cc0', line: 1.4 }, W, H)
}

/** 冒汽的硫气孔：一圈黄色的硫斑围着石口，白汽一团团往上冒 */
const drawVent: Draw = (ctx, W, H, rng) => {
  ink(ctx, ellipse(W / 2, H * 0.86, W * 0.42, H * 0.13), { fill: '#c4aa3a', hi: '#e8d070', lo: '#7a6a1a', line: LW }, W, H)
  ink(ctx, poly([[W * 0.26, H], [W * 0.32, H * 0.72], [W * 0.68, H * 0.7], [W * 0.74, H]]), { fill: '#4a4e52', lo: '#1e2022', line: LW }, W, H)
  ink(ctx, ellipse(W / 2, H * 0.71, W * 0.17, H * 0.05), { fill: '#141618', line: 1.2 }, W, H)
  for (let k = 0; k < 4; k++) ink(ctx, ellipse(W / 2 + (rng.next() - 0.5) * W * 0.2 + k * W * 0.04, H * (0.55 - k * 0.14), W * (0.14 + k * 0.03), H * (0.1 + k * 0.01)), { fill: '#f2eee6', lo: '#b8b4aa', line: 1.2 }, W, H)
}

/** 冰山：几个斜面拼成的尖，亮面白、背面青 */
const drawBerg: Draw = (ctx, W, H, rng) => {
  const peaks = 2 + Math.floor(rng.next() * 2)
  const pts: Pt[] = [[2, H]]
  for (let i = 0; i < peaks; i++) {
    const x0 = (W * i) / peaks
    const x1 = (W * (i + 1)) / peaks
    pts.push([x0 + (x1 - x0) * 0.2, H * (0.3 + rng.next() * 0.2)], [x0 + (x1 - x0) * (0.4 + rng.next() * 0.2), 3 + rng.next() * H * 0.25], [x1 - (x1 - x0) * 0.1, H * (0.35 + rng.next() * 0.2)])
  }
  pts.push([W - 2, H])
  ink(ctx, poly(pts), { fill: '#e6f3fb', hi: '#ffffff', lo: '#6fa6c8', line: LW }, W, H)
  ctx.save()
  ctx.beginPath()
  poly(pts)(ctx)
  ctx.clip()
  for (let i = 2; i < pts.length - 1; i += 3) {
    const p = pts[i]!
    ctx.beginPath()
    ctx.moveTo(p[0], p[1])
    ctx.lineTo(p[0] + W * 0.18, H)
    ctx.lineTo(p[0] + W * 0.02, H)
    ctx.closePath()
    ctx.fillStyle = 'rgba(111,166,200,0.45)'
    ctx.fill()
  }
  ctx.restore()
  strokes(ctx, [[[2, H * 0.92], [W - 2, H * 0.92]]], 1.4, '#6fa6c8')
}

/** 雪堆：一道起伏的白，背光处压淡蓝的网点 */
const drawDrift: Draw = (ctx, W, H, rng) => {
  const pts: Pt[] = [[2, H]]
  const n = 4
  for (let i = 0; i <= n; i++) pts.push([3 + ((W - 6) * i) / n, H * (0.15 + rng.next() * 0.3)])
  pts.push([W - 2, H])
  ink(ctx, curve(pts), { fill: INK.white, lo: '#9cc2dc', line: LW }, W, H)
  for (let i = 0; i < W / 30; i++) ink(ctx, ellipse(W * (0.1 + rng.next() * 0.8), H * (0.55 + rng.next() * 0.3), 2, 2), { fill: '#d6eaf6', line: 0 }, W, H)
}

/** 倒下的大树：一截长满青苔的树干横在地上，一头是断开的白茬，一头翻起一盘树根 */
const drawLog: Draw = (ctx, W, H, rng) => {
  const flip = rng.next() < 0.5
  ctx.save()
  if (flip) {
    ctx.translate(W, 0)
    ctx.scale(-1, 1)
  }
  const y0 = H * 0.42
  ink(ctx, (c) => c.roundRect(W * 0.18, y0, W * 0.8, H - y0 - 2, (H - y0) / 2), { fill: '#6f5845', hi: '#8e7460', lo: '#3a2c22', line: LW }, W, H)
  strokes(ctx, Array.from({ length: 4 }, (_, i) => [[W * 0.24, y0 + (H - y0) * (0.22 + i * 0.17)], [W * (0.6 + rng.next() * 0.3), y0 + (H - y0) * (0.22 + i * 0.17)]] as Pt[]), 1.1, '#3a2c22')
  ink(ctx, curve([[W * 0.22, y0 + 3], [W * 0.4, y0 - 2], [W * 0.62, y0 + 2], [W * 0.86, y0 - 1], [W * 0.95, y0 + 4], [W * 0.6, y0 + (H - y0) * 0.3]]), { fill: '#60884a', hi: '#8cb064', line: 1.2 }, W, H)
  ink(ctx, ellipse(W * 0.96, y0 + (H - y0) / 2, W * 0.035, (H - y0) / 2 - 1), { fill: '#c7a579', line: 1.6 }, W, H)
  strokes(ctx, [[[W * 0.94, y0 + 4], [W * 0.99, y0 + (H - y0) * 0.4]], [[W * 0.95, H - 6], [W * 0.99, y0 + (H - y0) * 0.6]]], 1, '#8a6a44')
  // 翻起来的根盘：一圈土，放射的根
  const rc: Pt = [W * 0.13, H * 0.5]
  ink(ctx, curve(lumpy(rng, rc[0], rc[1], W * 0.12, H * 0.46, 7, 0.16)), { fill: '#6a533f', lo: '#3a2c22', line: LW }, W, H)
  strokes(ctx, Array.from({ length: 7 }, (_, i) => {
    const ang = (i / 7) * Math.PI * 2
    return [[rc[0], rc[1]], [rc[0] + Math.cos(ang) * W * 0.11, rc[1] + Math.sin(ang) * H * 0.42]] as Pt[]
  }), 1.6, '#c7a579')
  ctx.restore()
}

/** 沙漠里枯死的金合欢：树干分成几根枝，伞一样撑开，枝梢晒得发白 */
const drawAcacia: Draw = (ctx, W, H, rng) => {
  const base: Pt = [W / 2, H]
  const fork: Pt = [W / 2 + (rng.next() - 0.5) * W * 0.08, H * 0.58]
  const limbs: Pt[][] = [[base, fork]]
  const twigs: Pt[][] = []
  const n = 4 + Math.floor(rng.next() * 3)
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const end: Pt = [W * (0.06 + 0.88 * t), H * (0.12 + rng.next() * 0.12 + Math.abs(t - 0.5) * 0.18)]
    const mid: Pt = [(fork[0] + end[0]) / 2 + (rng.next() - 0.5) * W * 0.06, (fork[1] + end[1]) / 2 + H * 0.04]
    limbs.push([fork, mid, end])
    for (let k = 0; k < 3; k++) twigs.push([end, [end[0] + (rng.next() - 0.5) * W * 0.14, end[1] - H * (0.03 + rng.next() * 0.06)]])
  }
  strokes(ctx, limbs.slice(0, 1), W * 0.09, INK.line)
  strokes(ctx, limbs.slice(0, 1), W * 0.07, '#5a4434')
  strokes(ctx, limbs.slice(1), W * 0.04, INK.line)
  strokes(ctx, limbs.slice(1), W * 0.028, '#6c5544')
  strokes(ctx, twigs, 2.6, INK.line)
  strokes(ctx, twigs, 1.4, '#b8a690')
  ink(ctx, ellipse(W / 2, H - 3, W * 0.2, H * 0.03), { fill: '#e6b77a', line: 1 }, W, H)
}

/** 沙漠里的路标：一根木杆插在一圈石头里，杆头系着一条红布条，顺风飘着 */
const drawPost: Draw = (ctx, W, H, rng) => {
  ink(ctx, rect(W * 0.44, H * 0.06, W * 0.12, H * 0.9), { fill: '#6b5440', lo: '#34281e', line: LW }, W, H)
  ink(ctx, (c) => {
    c.moveTo(W * 0.56, H * 0.1)
    c.quadraticCurveTo(W * 0.78, H * 0.04, W * 0.98, H * 0.16)
    c.quadraticCurveTo(W * 0.8, H * 0.2, W * 0.56, H * 0.22)
    c.closePath()
  }, { fill: '#a8402c', hi: '#d77a5c', line: 1.4 }, W, H)
  for (let i = 0; i < 5; i++) ink(ctx, ellipse(W * (0.12 + i * 0.19), H * 0.92 - (i % 2) * H * 0.04, W * 0.11, H * 0.07), { fill: i % 2 ? '#9e8c78' : '#664f40', line: 1.2 }, W, H)
  void rng
}

/** 院角的塔楼：比别的墙高一截的方塔，灰石砌的，开着一道箭窗，顶上的垛口塌了几个 */
const drawTower: Draw = (ctx, W, H, rng) => {
  const pts: Pt[] = [[2, H], [2, H * 0.1]]
  const n = 5
  for (let i = 0; i < n; i++) {
    const x0 = 2 + ((W - 4) * i) / n
    const x1 = 2 + ((W - 4) * (i + 0.6)) / n
    const up = rng.next() < 0.7 ? 3 : H * (0.06 + rng.next() * 0.08)
    pts.push([x0, i % 2 ? H * 0.1 : up], [x1, i % 2 ? H * 0.1 : up], [x1, H * 0.1])
  }
  pts.push([W - 2, H * 0.1], [W - 2, H])
  ink(ctx, poly(pts), { fill: '#9a9ea4', hi: '#c4c8ca', lo: '#4c5056', line: LW }, W, H)
  ctx.save()
  ctx.beginPath()
  poly(pts)(ctx)
  ctx.clip()
  stones(ctx, 0, 0, W, H, 9, rng)
  ctx.fillStyle = dots(ctx, '#46503c', 0.45)
  ctx.fillRect(0, H * 0.9, W, H)
  creeper(ctx, W, H, rng, W * (0.2 + rng.next() * 0.6))
  ctx.restore()
  ink(ctx, (c) => c.roundRect(W * 0.45, H * 0.32, W * 0.1, H * 0.22, W * 0.05), { fill: '#1e1a1a', line: 1.6 }, W, H)
}

/** 封门的木板：一道石门框，门洞里竖着钉了一排木板，两道横档，钉帽一排 */
const drawBoards: Draw = (ctx, W, H, rng) => {
  ink(ctx, rect(2, 2, W - 4, H - 2), { fill: '#a4a8ac', lo: '#4c5056', line: LW }, W, H)
  ctx.save()
  ctx.beginPath()
  ctx.rect(2, 2, W - 4, H - 2)
  ctx.clip()
  stones(ctx, 0, 0, W, H, 7, rng)
  ctx.restore()
  const x0 = W * 0.18
  const x1 = W * 0.82
  const y0 = H * 0.22
  ink(ctx, (c) => {
    c.moveTo(x0, H)
    c.lineTo(x0, y0 + (x1 - x0) / 2)
    c.arc((x0 + x1) / 2, y0 + (x1 - x0) / 2, (x1 - x0) / 2, Math.PI, 0)
    c.lineTo(x1, H)
    c.closePath()
  }, { fill: '#2a2220', line: LW }, W, H)
  const n = 5
  for (let i = 0; i < n; i++) {
    const x = x0 + ((x1 - x0) * i) / n
    ink(ctx, rect(x + 1, y0 + H * 0.06 + rng.next() * H * 0.04, (x1 - x0) / n - 2, H * 0.72), { fill: ['#7c6040', '#6c5440', '#8a6c4a'][i % 3]!, lo: '#2e2218', line: 1.4 }, W, H)
  }
  for (const y of [0.4, 0.74]) {
    ink(ctx, rect(x0 - 3, H * y, x1 - x0 + 6, H * 0.07), { fill: '#7c6040', lo: '#2e2218', line: 1.4 }, W, H)
    for (let i = 0; i < 6; i++) {
      ctx.beginPath()
      ctx.arc(x0 + ((x1 - x0) * (i + 0.5)) / 6, H * (y + 0.035), 1.4, 0, 6.28)
      ctx.fillStyle = '#28262a'
      ctx.fill()
    }
  }
}

/** 一根紫水晶：底下近白、往上越来越紫的六棱柱，顶上尖，中间一道亮棱 */
function crystal(ctx: Ctx, x: number, y: number, len: number, wid: number, ang: number, deep: number, W: number, H: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(ang)
  const tip = wid * 1.1
  const body: Pt[] = [[-wid / 2, 0], [-wid / 2, -len + tip], [0, -len], [wid / 2, -len + tip], [wid / 2, 0]]
  const g = ctx.createLinearGradient(0, 0, 0, -len)
  const k = deep
  g.addColorStop(0, '#e2d4f4')
  g.addColorStop(0.5, `rgb(${Math.round(226 - 70 * k)},${Math.round(212 - 110 * k)},${Math.round(244 - 26 * k)})`)
  g.addColorStop(1, `rgb(${Math.round(226 - 108 * k)},${Math.round(212 - 158 * k)},${Math.round(244 - 40 * k)})`)
  ink(ctx, poly(body), { fill: '#b088e0', line: 1.6 }, W, H)
  ctx.beginPath()
  poly(body)(ctx)
  ctx.fillStyle = g
  ctx.fill()
  ctx.beginPath()
  poly([[-wid / 2, 0], [-wid / 2, -len + tip], [0, -len], [0, 0]])(ctx)
  ctx.fillStyle = 'rgba(255,255,255,0.22)'
  ctx.fill()
  strokes(ctx, [[[0, -2], [0, -len + 2]]], 1.2, 'rgba(255,255,255,0.75)')
  strokes(ctx, [[[-wid / 2, -len + tip], [0, -len + tip * 0.4], [wid / 2, -len + tip]]], 1, '#5a2a8a')
  ctx.beginPath()
  poly(body)(ctx)
  ctx.lineWidth = 1.6
  ctx.strokeStyle = '#2a1238'
  ctx.stroke()
  ctx.restore()
}

/** 一丛晶簇：中间一两根直立的大晶，四周的往外斜，脚下一块黑玄武岩 */
const drawCluster: Draw = (ctx, W, H, rng) => {
  ink(ctx, curve([[2, H], [W * 0.1, H * 0.84], [W * 0.5, H * 0.78], [W * 0.9, H * 0.84], [W - 2, H]]), { fill: '#3a2a46', lo: '#140c1c', line: LW }, W, H)
  const n = 7
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => Math.abs(b - (n - 1) / 2) - Math.abs(a - (n - 1) / 2))
  for (const i of order) {
    const t = i / (n - 1) - 0.5
    const len = H * (0.95 - Math.abs(t) * 0.9) * (0.85 + rng.next() * 0.15)
    crystal(ctx, W * (0.5 + t * 0.7), H * 0.9, len, W * (0.16 - Math.abs(t) * 0.08), t * 1.1 + (rng.next() - 0.5) * 0.15, 0.6 + rng.next() * 0.4, W, H)
  }
}

/** 一根巨晶：从岩壁里斜伸出来的一根粗大的紫水晶，身上一道道生长纹，根埋在一块玄武岩里 */
const drawBeam: Draw = (ctx, W, H, rng) => {
  const left = rng.next() < 0.5
  ctx.save()
  if (left) {
    ctx.translate(W, 0)
    ctx.scale(-1, 1)
  }
  crystal(ctx, W * 0.24, H * 0.95, Math.hypot(W * 0.72, H * 0.86), W * 0.24, Math.atan2(W * 0.66, H * 0.86), 1, W, H)
  ctx.save()
  ctx.translate(W * 0.24, H * 0.95)
  ctx.rotate(Math.atan2(W * 0.66, H * 0.86))
  const L = Math.hypot(W * 0.72, H * 0.86)
  strokes(ctx, [0.3, 0.45, 0.6].map((k) => [[-W * 0.12, -L * k], [W * 0.12, -L * k - 3]] as Pt[]), 1.2, 'rgba(90,40,140,0.6)')
  ctx.restore()
  ink(ctx, curve([[2, H], [W * 0.04, H * 0.7], [W * 0.2, H * 0.6], [W * 0.42, H * 0.78], [W * 0.5, H]]), { fill: '#3a2a46', hi: '#5a4a68', lo: '#140c1c', line: LW }, W, H)
  ctx.restore()
}

/** 地上的一小丛晶：几根短晶从一个半埋的晶洞里冒出来 */
const drawDruse: Draw = (ctx, W, H, rng) => {
  ink(ctx, ellipse(W / 2, H * 0.88, W * 0.46, H * 0.14), { fill: '#5a4868', lo: '#20162a', line: LW }, W, H)
  ink(ctx, ellipse(W / 2, H * 0.86, W * 0.34, H * 0.08), { fill: '#221034', line: 1.2 }, W, H)
  for (let i = 0; i < 6; i++) {
    const t = i / 5 - 0.5
    crystal(ctx, W * (0.5 + t * 0.6), H * 0.9, H * (0.55 + rng.next() * 0.3) * (1 - Math.abs(t) * 0.6), W * 0.1, t * 1.4, 0.7 + rng.next() * 0.3, W, H)
  }
}

/** 冰脊：浮冰挤在一起拱起来的一道碎冰块，块块斜着，亮面白、背面青，脚下压着雪 */
const drawRidge: Draw = (ctx, W, H, rng) => {
  const n = Math.max(3, Math.round(W / (FACE_PPU * 0.45)))
  for (let i = 0; i < n; i++) {
    const cx = 4 + ((W - 8) * (i + 0.5)) / n + (rng.next() - 0.5) * 6
    const bw = ((W - 8) / n) * (0.9 + rng.next() * 0.4)
    const top = 4 + rng.next() * H * 0.35
    const tilt = (rng.next() - 0.5) * bw * 0.5
    ink(ctx, poly([[cx - bw / 2, H], [cx - bw / 2 + tilt, top + 4], [cx + bw / 2 + tilt, top], [cx + bw / 2, H]]), { fill: '#d6eaf4', hi: '#ffffff', lo: '#6ba8c7', line: 1.6 }, W, H)
    strokes(ctx, [[[cx - bw / 2 + tilt, top + 4], [cx + bw / 2 + tilt, top]]], 2.4, '#ffffff')
  }
  ink(ctx, curve([[2, H], [W * 0.25, H * 0.8], [W * 0.55, H * 0.86], [W * 0.8, H * 0.78], [W - 2, H]]), { fill: '#f7f9fc', lo: '#9cc2dc', line: 1.4 }, W, H)
}

/** 竹篱：两道横着的竹竿，一根根竹桩隔开，桩头切口朝上，绑着黑绳 */
const drawBamboo: Draw = (ctx, W, H, rng) => {
  for (const y of [0.3, 0.62]) {
    ink(ctx, rect(2, H * y, W - 4, H * 0.1), { fill: '#b0a46a', hi: '#c0b478', lo: '#6a6038', line: 1.4 }, W, H)
    strokes(ctx, Array.from({ length: Math.round(W / 30) }, (_, i) => [[6 + i * 30, H * y], [6 + i * 30, H * (y + 0.1)]] as Pt[]), 1.2, '#6a6038')
  }
  const n = Math.max(3, Math.round(W / (FACE_PPU * 0.42)))
  for (let i = 0; i <= n; i++) {
    const x = 4 + ((W - 8 - W * 0.05) * i) / n
    const top = 4 + rng.next() * H * 0.1
    const w = Math.max(5, W * 0.05)
    ink(ctx, poly([[x, top + w * 0.5], [x + w, top], [x + w, H], [x, H]]), { fill: '#a89a5a', hi: '#d4c68a', lo: '#5e5430', line: 1.4 }, w, H)
    ink(ctx, ellipse(x + w / 2, top + w * 0.25, w / 2, w * 0.22), { fill: '#e4d69c', line: 1 }, w, H)
    for (const y of [0.35, 0.67]) ink(ctx, rect(x - 1, H * y, w + 2, H * 0.04), { fill: '#3a2c22', line: 0 }, w, H)
  }
}

const DRAW: Record<PieceKind, Draw> = {
  pine: (ctx, W, H, rng) => drawPine(ctx, W, H, rng, false),
  rail: drawRail,
  sheep: drawSheep,
  log: drawLog,
  bush: drawBush,
  sakura: (ctx, W, H, rng) => drawTree(ctx, W, H, rng, rng.next() < 0.75 ? YOSHINO : YAE),
  temple: drawTemple,
  bamboo: drawBamboo,
  lantern: drawLantern,
  cactus: drawCactus,
  acacia: drawAcacia,
  cairn: drawCairn,
  post: drawPost,
  palm: drawPalm,
  reef: drawReef,
  sub: drawSub,
  kelp: drawKelp,
  coral: drawCoral,
  ruin: drawRuin,
  tower: drawTower,
  column: drawColumn,
  boards: drawBoards,
  maple: (ctx, W, H, rng) => drawTree(ctx, W, H, rng, MAPLES[Math.floor(rng.next() * MAPLES.length)]!),
  leaves: drawLeaves,
  cluster: drawCluster,
  beam: drawBeam,
  druse: drawDruse,
  torch: drawTorch,
  cone: drawCone,
  basalt: drawBasalt,
  vent: drawVent,
  berg: drawBerg,
  ridge: drawRidge,
  drift: drawDrift,
}

/** 盒子的顶面：寺墙顶上的灰瓦，残墙顶上的乱石 */
const ROOF: Partial<Record<PieceKind, (ctx: Ctx, W: number, H: number, rng: Rng) => void>> = {
  temple: (ctx, W, H) => {
    ink(ctx, rect(0, 0, W, H), { fill: '#6d6f78', line: LW }, W, H)
    const lines: Pt[][] = []
    for (let x = 5; x < W; x += 9) lines.push([[x, 0], [x, H]])
    strokes(ctx, lines, 1.1, '#33353b')
    strokes(ctx, [[[0, H / 2], [W, H / 2]]], 3.2, '#33353b')
  },
  ruin: (ctx, W, H, rng) => {
    ink(ctx, rect(0, 0, W, H), { fill: '#b6b8ba', lo: '#5a5e64', line: LW }, W, H)
    stones(ctx, 0, 0, W, H, 2, rng)
    ctx.fillStyle = dots(ctx, '#a8966a', 0.3)
    ctx.fillRect(0, 0, W, H)
    for (let i = 0; i < W / 9; i++) {
      ctx.save()
      ctx.translate(rng.next() * W, rng.next() * H)
      ctx.rotate(rng.next() * 6.28)
      mapleLeaf(ctx, 5, ['#e63a20', '#ee5c24', '#da2c2e', '#f48024'][i % 4]!)
      ctx.restore()
    }
  },
  tower: (ctx, W, H, rng) => {
    ink(ctx, rect(0, 0, W, H), { fill: '#9a9ea4', lo: '#4c5056', line: LW }, W, H)
    stones(ctx, 0, 0, W, H, 4, rng)
    ink(ctx, rect(W * 0.12, H * 0.14, W * 0.76, H * 0.72), { fill: '#7a6a5a', lo: '#3a3028', line: 1.6 }, W, H)
    for (let i = 0; i < W / 12; i++) {
      ctx.save()
      ctx.translate(W * (0.15 + rng.next() * 0.7), H * (0.18 + rng.next() * 0.64))
      ctx.rotate(rng.next() * 6.28)
      mapleLeaf(ctx, 5, ['#e63a20', '#ee5c24', '#f48024'][i % 3]!)
      ctx.restore()
    }
  },
}

/** 一张布景的正面画多大，像素：宽是底边长，高是立起来时画面上的高 */
export function faceSize(p: Piece): { w: number; h: number } {
  return { w: Math.max(8, Math.round(p.w * FACE_PPU)), h: Math.max(8, Math.round(p.h * STAND_U_PER_M * FACE_PPU)) }
}

/** 盒子的顶面画多大，像素 */
export function roofSize(p: Piece): { w: number; h: number } {
  return { w: Math.max(8, Math.round(p.w * FACE_PPU)), h: Math.max(8, Math.round(p.d * FACE_PPU)) }
}

/** 画一件布景的正面到 (x, y) 起的 W×H：先画剪影外刀模留下的白边，再画正面 */
export function drawFace(ctx: Ctx, p: Piece, x: number, y: number, W: number, H: number, scratch: OffscreenCanvas | HTMLCanvasElement): void {
  scratch.width = W + CUT_PX * 2
  scratch.height = H + CUT_PX * 2
  const s = scratch.getContext('2d') as Ctx
  s.save()
  s.translate(CUT_PX, CUT_PX)
  DRAW[p.kind](s, W, H, new Rng(p.seed))
  s.restore()
  // 刀模：剪影往四周扩一圈，铺卡纸的本色
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, W, H)
  ctx.clip()
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    ctx.drawImage(scratch, x - CUT_PX + Math.cos(a) * CUT_PX, y - CUT_PX + Math.sin(a) * CUT_PX)
  }
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = INK.cream
  ctx.fillRect(x, y, W, H)
  ctx.globalCompositeOperation = 'source-over'
  ctx.drawImage(scratch, x - CUT_PX, y - CUT_PX)
  ctx.restore()
}

/** 画一只盒子的顶面；不是盒子的不画 */
export function drawRoof(ctx: Ctx, p: Piece, x: number, y: number, W: number, H: number): void {
  const r = ROOF[p.kind]
  if (!r) return
  ctx.save()
  ctx.translate(x, y)
  ctx.beginPath()
  ctx.rect(0, 0, W, H)
  ctx.clip()
  r(ctx, W, H, new Rng(p.seed ^ 0x700f))
  ctx.restore()
}
