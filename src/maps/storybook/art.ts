import { Rng } from '../../util/rng'
import type { Piece, PieceKind } from './model'

/** 布景的画每格多少像素 */
export const FACE_PPU = 80
/** 立起来时每米高在画面上占几格：和身体抬起的一样 */
export const STAND_U_PER_M = 0.5
/** 平躺在页面上时每米高铺多长，格 */
export const FLAT_U_PER_M = 0.8
/** 刀模在剪影外留的那一圈白边，像素 */
const CUT_PX = 3
/** 网点的格距，像素 */
const DOT_PX = 5

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
type Pt = readonly [number, number]

/** 印刷的油墨：同一套颜色画布景也画页面 */
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

/** 一棵阔叶树：树干，几团叠着的树冠，偶尔挂几个果子 */
function drawTree(ctx: Ctx, W: number, H: number, rng: Rng, x0 = 0, w = W, top = 0): void {
  const cx = x0 + w / 2
  const tw = w * 0.16
  const trunk: Pt[] = [[cx - tw * 0.6, H], [cx - tw * 0.4, H * 0.55], [cx - tw, H * 0.42], [cx, H * 0.5], [cx + tw, H * 0.4], [cx + tw * 0.4, H * 0.55], [cx + tw * 0.65, H]]
  ink(ctx, poly(trunk), { fill: INK.bark, lo: INK.barkLo, line: LW }, w, H)
  const crownTop = top + 4
  const ch = (H - top) * 0.62
  const cy = crownTop + ch / 2
  const main = lumpy(rng, cx, cy, w * 0.44, ch / 2 - 2, 5 + Math.floor(rng.next() * 3), 0.1)
  ink(ctx, curve(main), { fill: INK.leaf, hi: INK.leafHi, lo: INK.leafLo, line: LW }, w, H - top)
  ctx.save()
  ctx.beginPath()
  smoothPath(ctx, main)
  ctx.clip()
  strokes(
    ctx,
    Array.from({ length: 4 }, () => {
      const x = cx + (rng.next() - 0.5) * w * 0.55
      const y = cy + (rng.next() - 0.3) * ch * 0.5
      return [[x - w * 0.06, y], [x, y + ch * 0.07], [x + w * 0.06, y]] as Pt[]
    }),
    1.4,
    INK.leafLo,
  )
  if (rng.next() < 0.5) {
    for (let i = 0; i < 5; i++) {
      ctx.beginPath()
      ctx.arc(cx + (rng.next() - 0.5) * w * 0.6, cy + (rng.next() - 0.4) * ch * 0.6, w * 0.035, 0, Math.PI * 2)
      ctx.fillStyle = INK.red
      ctx.fill()
    }
  }
  ctx.restore()
}

/** 一棵松：三层越往上越窄的三角 */
function drawPine(ctx: Ctx, W: number, H: number, rng: Rng, x0 = 0, w = W, top = 0): void {
  const cx = x0 + w / 2
  ink(ctx, rect(cx - w * 0.07, H * 0.8, w * 0.14, H * 0.2), { fill: INK.bark, line: LW }, w, H)
  const tiers = 3
  for (let i = 0; i < tiers; i++) {
    const t0 = top + 3 + ((H - top) * 0.82 * i) / tiers
    const t1 = top + 3 + ((H - top) * 0.82 * (i + 1.35)) / tiers
    const half = w * (0.24 + 0.24 * ((i + 1) / tiers))
    const sag = (rng.next() - 0.5) * w * 0.03
    const tri: Pt[] = [[cx + sag, t0], [cx + half, t1], [cx + half * 0.5, t1 - (t1 - t0) * 0.08], [cx, t1 + (t1 - t0) * 0.04], [cx - half * 0.5, t1 - (t1 - t0) * 0.08], [cx - half, t1]]
    ink(ctx, poly(tri), { fill: INK.pine, lo: INK.pineLo, line: LW }, w, H)
  }
}

const drawGrove: Draw = (ctx, W, H, rng) => {
  const n = Math.max(2, Math.round(W / (FACE_PPU * 1.3)))
  const slots = Array.from({ length: n }, (_, i) => i).sort(() => rng.next() - 0.5)
  for (const i of slots.sort((a, b) => (a % 2) - (b % 2))) {
    const w = (W / n) * 1.45
    const x0 = Math.min(W - w, Math.max(0, (W / n) * i - (w - W / n) / 2))
    const top = (i % 2 === 0 ? 0.0 : 0.16) * H + rng.next() * H * 0.08
    if (rng.next() < 0.4) drawPine(ctx, W, H, rng, x0, w * 0.85, top)
    else drawTree(ctx, W, H, rng, x0, w, top)
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
  for (let i = 0; i < Math.round(W / 22); i++) {
    const x = 8 + rng.next() * (W - 16)
    const y = H * (0.3 + rng.next() * 0.5)
    const c = [INK.white, INK.gold, '#e98aa6'][Math.floor(rng.next() * 3)]!
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
}

const drawLog: Draw = (ctx, W, H, rng) => {
  const r = H * 0.42
  const body = rect(r, H - 2 * r - 2, W - 2 * r - 6, 2 * r)
  ink(ctx, body, { fill: INK.wood, lo: INK.woodLo, line: LW }, W, H)
  strokes(
    ctx,
    Array.from({ length: Math.round(W / 26) }, () => {
      const x = r + rng.next() * (W - 3 * r)
      const y = H - r - 2 + (rng.next() - 0.5) * r
      return [[x, y], [x + W * 0.08, y + (rng.next() - 0.5) * 3]] as Pt[]
    }),
    1.3,
    INK.woodLo,
  )
  const ex = W - r - 6
  ink(ctx, ellipse(ex, H - r - 2, r * 0.55, r), { fill: '#e8c78f', line: LW }, W, H)
  ctx.strokeStyle = INK.woodLo
  ctx.lineWidth = 1
  for (const k of [0.35, 0.65]) {
    ctx.beginPath()
    ctx.ellipse(ex, H - r - 2, r * 0.55 * k, r * k, 0, 0, 6.28)
    ctx.stroke()
  }
  ink(ctx, ellipse(r * 1.6, H - 2 * r + 2, r * 0.7, r * 0.3), { fill: INK.leafHi, line: 1.2 }, W, H)
}

/** 带山墙的一座小房子的正面：墙、门、窗，山墙尖顶着上沿 */
function house(ctx: Ctx, W: number, H: number, rng: Rng, wall: Inked, roof: Inked, logs: boolean): void {
  const eave = H * (1 - EAVE)
  const tri: Pt[] = [[-1, eave + 4], [W / 2, 3], [W + 1, eave + 4]]
  ink(ctx, rect(4, eave, W - 8, H - eave), wall, W, H)
  if (logs) {
    const rows = 5
    strokes(ctx, Array.from({ length: rows }, (_, i) => [[6, eave + ((H - eave) * (i + 1)) / (rows + 1)], [W - 6, eave + ((H - eave) * (i + 1)) / (rows + 1)]] as Pt[]), 1.4, INK.woodLo)
  } else {
    strokes(ctx, [[[4, eave + 6], [W - 4, eave + 6]], [[W * 0.33, eave], [W * 0.33, H]], [[W * 0.66, eave], [W * 0.66, H]], [[4, eave + 6], [W * 0.33, H * 0.78]], [[W - 4, eave + 6], [W * 0.66, H * 0.78]]], 3, INK.woodLo)
  }
  ink(ctx, poly(tri), roof, W, eave)
  strokes(ctx, Array.from({ length: 4 }, (_, i) => [[W / 2 - (W / 2) * ((i + 1) / 5), 3 + eave * ((i + 1) / 5)], [W / 2 + (W / 2) * ((i + 1) / 5), 3 + eave * ((i + 1) / 5)]] as Pt[]), 1.2, roof.lo ?? INK.line)
  const dw = W * 0.2
  const doorX = rng.next() < 0.5 ? W * 0.18 : W * 0.62
  ink(ctx, (c) => {
    c.moveTo(doorX, H)
    c.lineTo(doorX, H - (H - eave) * 0.55)
    c.arc(doorX + dw / 2, H - (H - eave) * 0.55, dw / 2, Math.PI, 0)
    c.lineTo(doorX + dw, H)
    c.closePath()
  }, { fill: INK.woodLo, line: LW }, W, H)
  const wx = doorX < W / 2 ? W * 0.6 : W * 0.2
  const wy = eave + (H - eave) * 0.22
  ink(ctx, rect(wx, wy, W * 0.2, (H - eave) * 0.32), { fill: INK.window, line: LW }, W, H)
  strokes(ctx, [[[wx + W * 0.1, wy], [wx + W * 0.1, wy + (H - eave) * 0.32]], [[wx, wy + (H - eave) * 0.16], [wx + W * 0.2, wy + (H - eave) * 0.16]]], 1.6)
  ink(ctx, rect(wx - 3, wy + (H - eave) * 0.32, W * 0.2 + 6, 5), { fill: INK.red, line: 1.2 }, W, H)
}

const drawHut: Draw = (ctx, W, H, rng) => {
  ink(ctx, rect(W * 0.7, H * 0.06, W * 0.1, H * 0.25), { fill: INK.stone, line: LW }, W, H)
  house(ctx, W, H, rng, { fill: INK.wood, lo: INK.woodLo, line: LW }, { fill: INK.hay, lo: INK.hayLo, line: LW }, true)
}

const drawCottage: Draw = (ctx, W, H, rng) => {
  house(ctx, W, H, rng, { fill: INK.plaster, lo: INK.stone, line: LW }, { fill: INK.tile, lo: INK.tileLo, line: LW }, false)
}

const drawWindmill: Draw = (ctx, W, H, rng) => {
  const top = H * 0.16
  const tower: Pt[] = [[W * 0.06, H], [W * 0.24, top + 6], [W * 0.76, top + 6], [W * 0.94, H]]
  ink(ctx, poly(tower), { fill: INK.plaster, lo: INK.stone, line: LW }, W, H)
  strokes(ctx, [0.35, 0.55, 0.75].map((k) => [[W * (0.06 + 0.18 * (1 - k)), top + (H - top) * k], [W * (0.94 - 0.18 * (1 - k)), top + (H - top) * k]] as Pt[]), 1.2, INK.stoneLo)
  ink(ctx, (c) => {
    c.moveTo(W * 0.16, top + 10)
    c.quadraticCurveTo(W * 0.5, -top * 0.4, W * 0.84, top + 10)
    c.closePath()
  }, { fill: INK.tile, lo: INK.tileLo, line: LW }, W, H)
  const dw = W * 0.22
  ink(ctx, (c) => {
    c.moveTo(W / 2 - dw / 2, H)
    c.lineTo(W / 2 - dw / 2, H * 0.82)
    c.arc(W / 2, H * 0.82, dw / 2, Math.PI, 0)
    c.lineTo(W / 2 + dw / 2, H)
    c.closePath()
  }, { fill: INK.woodLo, line: LW }, W, H)
  ink(ctx, ellipse(W / 2, H * 0.52, W * 0.07, W * 0.07), { fill: INK.window, line: LW }, W, H)
  void rng
}

/** 风车的叶片：四片格栅，红边，画在正方形里，中心是转轴 */
export function drawSails(ctx: Ctx, S: number): void {
  const c = S / 2
  for (let k = 0; k < 4; k++) {
    ctx.save()
    ctx.translate(c, c)
    ctx.rotate((k * Math.PI) / 2)
    const L = c - 4
    const w = S * 0.11
    ink(ctx, rect(S * 0.05, -w * 0.15, L - S * 0.05, w), { fill: INK.cream, line: 2 }, S, S)
    strokes(ctx, Array.from({ length: 5 }, (_, i) => [[S * 0.05 + ((L - S * 0.05) * (i + 1)) / 6, -w * 0.15], [S * 0.05 + ((L - S * 0.05) * (i + 1)) / 6, w * 0.85]] as Pt[]), 1.2, INK.woodLo)
    strokes(ctx, [[[0, 0], [L, 0]]], 3.2, INK.red)
    ctx.restore()
  }
  ink(ctx, ellipse(c, c, S * 0.06, S * 0.06), { fill: INK.woodLo, line: 2 }, S, S)
}

const drawFence: Draw = (ctx, W, H, rng) => {
  const n = Math.max(3, Math.round(W / (FACE_PPU * 0.32)))
  const gap = (W - 6) / n
  ink(ctx, rect(3, H * 0.38, W - 6, H * 0.12), { fill: INK.white, lo: INK.stone, line: 1.6 }, W, H)
  ink(ctx, rect(3, H * 0.7, W - 6, H * 0.12), { fill: INK.white, lo: INK.stone, line: 1.6 }, W, H)
  for (let i = 0; i < n; i++) {
    const x = 3 + gap * i + gap * 0.18
    const pw = gap * 0.64
    const lean = (rng.next() - 0.5) * 2
    const top = 4 + rng.next() * H * 0.06
    ink(ctx, poly([[x + lean, top + pw * 0.5], [x + pw / 2 + lean, top], [x + pw + lean, top + pw * 0.5], [x + pw, H], [x, H]]), { fill: INK.white, lo: INK.stone, line: 1.6 }, W, H)
  }
}

const drawHaystack: Draw = (ctx, W, H, rng) => {
  const pts: Pt[] = [[2, H], [W * 0.08, H * 0.4], [W * 0.3, 6], [W * 0.7, 6], [W * 0.92, H * 0.4], [W - 2, H]]
  ink(ctx, curve(pts), { fill: INK.hay, hi: '#f3d987', lo: INK.hayLo, line: LW }, W, H)
  ctx.save()
  ctx.beginPath()
  smoothPath(ctx, pts)
  ctx.clip()
  strokes(
    ctx,
    Array.from({ length: Math.round(W / 6) }, () => {
      const x = rng.next() * W
      const y = rng.next() * H
      return [[x, y], [x + (rng.next() - 0.5) * 8, y + 8 + rng.next() * 6]] as Pt[]
    }),
    1,
    INK.hayLo,
  )
  ctx.restore()
}

const drawWell: Draw = (ctx, W, H, rng) => {
  ink(ctx, rect(3, H * 0.15, W - 6, H * 0.85), { fill: INK.stone, lo: INK.stoneLo, line: LW }, W, H)
  stones(ctx, 3, H * 0.15, W - 6, H * 0.85, 3, rng)
  ink(ctx, rect(1, 3, W - 2, H * 0.16), { fill: INK.stoneHi, line: LW }, W, H)
}

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

/** 城墙：齿状的垛口，石块，箭窗，偶尔挂一面旗、爬一片常春藤 */
function battlement(ctx: Ctx, W: number, H: number, rng: Rng, merlon: number): void {
  const crenH = H * 0.16
  const pts: Pt[] = [[2, H]]
  const n = Math.max(2, Math.round((W - 4) / merlon))
  const mw = (W - 4) / n
  pts.push([2, 3])
  for (let i = 0; i < n; i++) {
    const x = 2 + i * mw
    pts.push([x + mw * 0.62, 3], [x + mw * 0.62, crenH], [x + mw, crenH])
    if (i < n - 1) pts.push([x + mw, 3])
  }
  pts.push([W - 2, 3], [W - 2, H])
  ink(ctx, poly(pts), { fill: INK.stone, hi: INK.stoneHi, lo: INK.stoneLo, line: LW }, W, H)
  stones(ctx, 3, crenH, W - 6, H - crenH, 5, rng)
}

const drawWall: Draw = (ctx, W, H, rng) => {
  battlement(ctx, W, H, rng, FACE_PPU * 0.55)
  for (let i = 0; i < Math.max(1, Math.round(W / (FACE_PPU * 1.6))); i++) {
    const x = W * (0.15 + 0.7 * rng.next())
    ink(ctx, rect(x, H * 0.4, W * 0.02 + 4, H * 0.2), { fill: INK.dark, line: 1.4 }, W, H)
  }
  if (rng.next() < 0.7) {
    const x = W * (0.25 + 0.5 * rng.next())
    const c = rng.next() < 0.5 ? INK.red : INK.blue
    ink(ctx, poly([[x, H * 0.2], [x + W * 0.08, H * 0.2], [x + W * 0.08, H * 0.7], [x + W * 0.04, H * 0.62], [x, H * 0.7]]), { fill: c, lo: INK.line, line: 1.6 }, W, H)
    ink(ctx, (c2) => c2.arc(x + W * 0.04, H * 0.4, W * 0.018, 0, 6.28), { fill: INK.gold, line: 1 }, W, H)
  }
  if (rng.next() < 0.6) {
    const x = rng.next() < 0.5 ? W * 0.05 : W * 0.75
    for (let i = 0; i < 9; i++) ink(ctx, ellipse(x + rng.next() * W * 0.2, H * (0.5 + rng.next() * 0.45), 5, 4), { fill: i % 2 ? INK.leaf : INK.leafLo, line: 1 }, W, H)
  }
}

const drawTower: Draw = (ctx, W, H, rng) => {
  battlement(ctx, W, H, rng, FACE_PPU * 0.45)
  const ww = W * 0.22
  ink(ctx, (c) => {
    c.moveTo(W / 2 - ww / 2, H * 0.55)
    c.lineTo(W / 2 - ww / 2, H * 0.36)
    c.arc(W / 2, H * 0.36, ww / 2, Math.PI, 0)
    c.lineTo(W / 2 + ww / 2, H * 0.55)
    c.closePath()
  }, { fill: INK.window, line: LW }, W, H)
  strokes(ctx, [[[W / 2, H * 0.3], [W / 2, H * 0.55]]], 1.6)
}

const drawKeep: Draw = (ctx, W, H, rng) => {
  battlement(ctx, W, H, rng, FACE_PPU * 0.5)
  const gw = W * 0.3
  ink(ctx, (c) => {
    c.moveTo(W / 2 - gw / 2, H)
    c.lineTo(W / 2 - gw / 2, H * 0.62)
    c.arc(W / 2, H * 0.62, gw / 2, Math.PI, 0)
    c.lineTo(W / 2 + gw / 2, H)
    c.closePath()
  }, { fill: INK.dark, line: LW }, W, H)
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(W / 2 - gw / 2, H)
  ctx.lineTo(W / 2 - gw / 2, H * 0.62)
  ctx.arc(W / 2, H * 0.62, gw / 2, Math.PI, 0)
  ctx.lineTo(W / 2 + gw / 2, H)
  ctx.clip()
  const bars: Pt[][] = []
  for (let i = 1; i < 6; i++) bars.push([[W / 2 - gw / 2 + (gw * i) / 6, H * 0.4], [W / 2 - gw / 2 + (gw * i) / 6, H]])
  for (let i = 1; i < 6; i++) bars.push([[W / 2 - gw / 2, H * 0.5 + H * 0.1 * i], [W / 2 + gw / 2, H * 0.5 + H * 0.1 * i]])
  strokes(ctx, bars, 2, INK.goldLo)
  ctx.restore()
  for (const x of [0.2, 0.8]) ink(ctx, rect(W * x - 5, H * 0.32, 10, H * 0.16), { fill: INK.window, line: 1.6 }, W, H)
}

const drawTopiary: Draw = (ctx, W, H, rng) => {
  ink(ctx, rect(3, H * 0.3, W - 6, H * 0.7), { fill: INK.pine, lo: INK.pineLo, line: LW }, W, H)
  const n = Math.max(1, Math.round(W / (FACE_PPU * 0.9)))
  for (let i = 0; i < n; i++) {
    const x = ((i + 0.5) / n) * W
    ink(ctx, ellipse(x, H * 0.24, Math.min(H * 0.22, W / n / 2.4), H * 0.2), { fill: INK.pine, hi: INK.leaf, lo: INK.pineLo, line: LW }, W, H)
  }
  strokes(ctx, Array.from({ length: Math.round(W / 14) }, () => {
    const x = 6 + rng.next() * (W - 12)
    const y = H * (0.45 + rng.next() * 0.45)
    return [[x - 3, y], [x, y - 3], [x + 3, y]] as Pt[]
  }), 1, INK.pineLo)
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

const drawPillar: Draw = (ctx, W, H, rng) => {
  rock(ctx, H, rng, 2, W - 4, 3, INK.rock, INK.rockLo)
  if (rng.next() < 0.6) for (let i = 0; i < 6; i++) ink(ctx, ellipse(W * (0.2 + rng.next() * 0.6), H * (0.55 + rng.next() * 0.4), 3, 3), { fill: '#9ee6c9', line: 0.8 }, W, H)
}

const drawSpire: Draw = (ctx, W, H, rng) => {
  const pts: Pt[] = [[2, H], [W * 0.3, H * 0.5], [W * 0.46, 3], [W * 0.6, H * 0.45], [W - 2, H]]
  ink(ctx, poly(pts), { fill: INK.rock, hi: '#b9adb4', lo: INK.rockLo, line: LW }, W, H)
  strokes(ctx, [0.3, 0.55, 0.78].map((k) => [[W * (0.5 - 0.42 * k), H * k + 4], [W * (0.5 + 0.42 * k), H * k]] as Pt[]), 1.2, INK.rockLo)
  void rng
}

const drawCrystal: Draw = (ctx, W, H, rng) => {
  const shards = 4
  for (let i = 0; i < shards; i++) {
    const cx = W * (0.2 + 0.6 * ((i + rng.next() * 0.5) / shards))
    const hw = W * (0.1 + 0.05 * rng.next())
    const top = H * (i === 1 ? 0.02 : 0.15 + 0.35 * rng.next())
    const lean = (cx - W / 2) * 0.3
    const pts: Pt[] = [[cx - hw, H], [cx - hw + lean, top + hw], [cx + lean, top], [cx + hw + lean, top + hw], [cx + hw, H]]
    ink(ctx, poly(pts), { fill: i % 2 ? INK.violet : INK.teal, hi: INK.violetHi, lo: INK.line, line: LW }, W, H)
    strokes(ctx, [[[cx + lean, top], [cx, H]]], 1, '#ffffff')
  }
}

const drawHoard: Draw = (ctx, W, H, rng) => {
  const pts: Pt[] = [[2, H], [W * 0.12, H * 0.4], [W * 0.4, 5], [W * 0.62, H * 0.15], [W * 0.9, H * 0.5], [W - 2, H]]
  ink(ctx, curve(pts), { fill: INK.gold, hi: '#f8dd7b', lo: INK.goldLo, line: LW }, W, H)
  ctx.save()
  ctx.beginPath()
  smoothPath(ctx, pts)
  ctx.clip()
  for (let i = 0; i < W / 4; i++) {
    const x = rng.next() * W
    const y = rng.next() * H
    ctx.beginPath()
    ctx.ellipse(x, y, 4.5, 3, 0, 0, 6.28)
    ctx.strokeStyle = INK.goldLo
    ctx.lineWidth = 1
    ctx.stroke()
  }
  ctx.restore()
  const cx = W * (rng.next() < 0.5 ? 0.25 : 0.62)
  ink(ctx, rect(cx, H * 0.45, W * 0.22, H * 0.55), { fill: INK.wood, lo: INK.woodLo, line: LW }, W, H)
  ink(ctx, rect(cx - 1, H * 0.45, W * 0.22 + 2, H * 0.12), { fill: INK.gold, line: 1.6 }, W, H)
  ink(ctx, rect(cx + W * 0.09, H * 0.6, W * 0.04, H * 0.1), { fill: INK.gold, line: 1.2 }, W, H)
  ink(ctx, poly([[W * 0.8, H * 0.55], [W * 0.84, H * 0.42], [W * 0.88, H * 0.55], [W * 0.84, H * 0.62]]), { fill: INK.red, hi: '#ff9f9f', line: 1.2 }, W, H)
}

/** 睡着的巨龙：盘起来的尾巴在一头，头搁在前爪上在另一头，背上一排尖刺，翅膀收着，鼻孔冒着烟圈 */
const drawDragon: Draw = (ctx, W, H, rng) => {
  const left = rng.next() < 0.5
  ctx.save()
  if (left) {
    ctx.translate(W, 0)
    ctx.scale(-1, 1)
  }
  const back: Pt[] = [
    [W * 0.04, H], [W * 0.03, H * 0.72], [W * 0.1, H * 0.52], [W * 0.2, H * 0.58], [W * 0.18, H * 0.76], [W * 0.12, H * 0.74],
    [W * 0.15, H * 0.66], [W * 0.24, H * 0.5], [W * 0.38, H * 0.3], [W * 0.56, H * 0.26], [W * 0.7, H * 0.4], [W * 0.76, H * 0.56],
    [W * 0.86, H * 0.5], [W * 0.97, H * 0.62], [W * 0.98, H * 0.8], [W * 0.92, H * 0.9], [W * 0.78, H * 0.92], [W * 0.74, H],
  ]
  const spikes: Pt[] = []
  for (let i = 0; i < 9; i++) {
    const t = 0.26 + i * 0.05
    const x = W * t
    const y = H * (0.5 - 0.24 * Math.sin(((t - 0.22) / 0.5) * Math.PI))
    spikes.push([x, y + 6])
    spikes.push([x + W * 0.02, y - H * 0.12])
    spikes.push([x + W * 0.04, y + 6])
  }
  for (let i = 0; i + 2 < spikes.length; i += 3) ink(ctx, poly([spikes[i]!, spikes[i + 1]!, spikes[i + 2]!]), { fill: INK.red, line: 1.6 }, W, H)
  ink(ctx, curve(back), { fill: INK.teal, hi: '#6fc0a8', lo: INK.tealLo, line: LW }, W, H)
  ink(ctx, curve([[W * 0.22, H], [W * 0.3, H * 0.74], [W * 0.5, H * 0.66], [W * 0.68, H * 0.74], [W * 0.72, H]]), { fill: INK.belly, lo: INK.hayLo, line: 1.6 }, W, H)
  strokes(ctx, [0.32, 0.4, 0.48, 0.56, 0.64].map((t) => [[W * t, H * 0.72], [W * (t + 0.01), H]] as Pt[]), 1.2, INK.hayLo)
  ink(ctx, curve([[W * 0.36, H * 0.42], [W * 0.46, H * 0.18], [W * 0.62, H * 0.12], [W * 0.6, H * 0.34], [W * 0.5, H * 0.46]]), { fill: '#2f7a6e', lo: INK.tealLo, line: LW }, W, H)
  strokes(ctx, [[[W * 0.46, H * 0.2], [W * 0.5, H * 0.42]], [[W * 0.54, H * 0.15], [W * 0.55, H * 0.4]]], 1.4, INK.tealLo)
  ink(ctx, curve([[W * 0.84, H * 0.86], [W * 0.82, H * 0.64], [W * 0.9, H * 0.56], [W * 0.97, H * 0.66], [W * 0.95, H * 0.86]]), { fill: INK.teal, lo: INK.tealLo, line: LW }, W, H)
  strokes(ctx, [[[W * 0.885, H * 0.7], [W * 0.92, H * 0.72], [W * 0.95, H * 0.7]]], 2)
  ink(ctx, poly([[W * 0.86, H * 0.6], [W * 0.84, H * 0.44], [W * 0.88, H * 0.57]]), { fill: INK.belly, line: 1.4 }, W, H)
  ink(ctx, poly([[W * 0.92, H * 0.58], [W * 0.93, H * 0.42], [W * 0.95, H * 0.6]]), { fill: INK.belly, line: 1.4 }, W, H)
  ctx.lineWidth = 1.6
  ctx.strokeStyle = '#9b9298'
  for (let i = 0; i < 3; i++) {
    ctx.beginPath()
    ctx.arc(W * (0.96 + i * 0.012), H * (0.62 - i * 0.12), 3 + i * 1.6, 0, 6.28)
    ctx.stroke()
  }
  ctx.save()
  ctx.beginPath()
  smoothPath(ctx, back)
  ctx.clip()
  for (let i = 0; i < W / 9; i++) {
    const x = W * (0.1 + 0.8 * rng.next())
    const y = H * (0.3 + 0.6 * rng.next())
    ctx.beginPath()
    ctx.arc(x, y, 3, Math.PI * 0.1, Math.PI * 0.9)
    ctx.strokeStyle = INK.tealLo
    ctx.lineWidth = 1
    ctx.stroke()
  }
  ctx.restore()
  ctx.restore()
}

const DRAW: Record<PieceKind, Draw> = {
  tree: (ctx, W, H, rng) => drawTree(ctx, W, H, rng),
  pine: (ctx, W, H, rng) => drawPine(ctx, W, H, rng),
  grove: drawGrove,
  bush: drawBush,
  log: drawLog,
  hut: drawHut,
  windmill: drawWindmill,
  cottage: drawCottage,
  fence: drawFence,
  haystack: drawHaystack,
  well: drawWell,
  wall: drawWall,
  tower: drawTower,
  keep: drawKeep,
  topiary: drawTopiary,
  pillar: drawPillar,
  spire: drawSpire,
  crystal: drawCrystal,
  hoard: drawHoard,
  dragon: drawDragon,
}

/** 盒子顶面的颜色与纹样：屋顶、塔顶、草垛顶 */
const ROOF: Partial<Record<PieceKind, (ctx: Ctx, W: number, H: number, rng: Rng) => void>> = {
  hut: (ctx, W, H) => {
    ink(ctx, rect(0, 0, W, H), { fill: INK.hay, line: LW }, W, H)
    strokes(ctx, Array.from({ length: 6 }, (_, i) => [[0, (H * (i + 1)) / 7], [W, (H * (i + 1)) / 7]] as Pt[]), 1.2, INK.hayLo)
    strokes(ctx, [[[0, H / 2], [W, H / 2]]], 3, INK.woodLo)
  },
  cottage: (ctx, W, H) => {
    ink(ctx, rect(0, 0, W, H), { fill: INK.tile, line: LW }, W, H)
    const lines: Pt[][] = []
    for (let i = 1; i < 7; i++) lines.push([[0, (H * i) / 7], [W, (H * i) / 7]])
    for (let x = 6; x < W; x += 10) lines.push([[x, 0], [x, H]])
    strokes(ctx, lines, 1, INK.tileLo)
    strokes(ctx, [[[0, H / 2], [W, H / 2]]], 3, INK.tileLo)
  },
  windmill: (ctx, W, H) => {
    ink(ctx, rect(0, 0, W, H), { fill: INK.plaster, line: LW }, W, H)
    ink(ctx, ellipse(W / 2, H / 2, W * 0.36, H * 0.36), { fill: INK.tile, lo: INK.tileLo, line: LW }, W, H)
  },
  haystack: (ctx, W, H, rng) => {
    ink(ctx, ellipse(W / 2, H / 2, W / 2 - 1, H / 2 - 1), { fill: INK.hay, lo: INK.hayLo, line: LW }, W, H)
    strokes(ctx, Array.from({ length: 30 }, () => {
      const a = rng.next() * 6.28
      const r = rng.next() * W * 0.4
      return [[W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r * (H / W)], [W / 2 + Math.cos(a) * (r + 6), H / 2 + Math.sin(a) * (r + 6) * (H / W)]] as Pt[]
    }), 1, INK.hayLo)
  },
  well: (ctx, W, H) => {
    ink(ctx, rect(0, 0, W, H), { fill: INK.stoneHi, line: LW }, W, H)
    ink(ctx, ellipse(W / 2, H / 2, W * 0.32, H * 0.32), { fill: '#2a4a6e', hi: '#5d87b8', line: LW }, W, H)
  },
  tower: (ctx, W, H, rng) => {
    ink(ctx, rect(0, 0, W, H), { fill: INK.stone, lo: INK.stoneLo, line: LW }, W, H)
    stones(ctx, W * 0.15, H * 0.15, W * 0.7, H * 0.7, 4, rng)
    strokes(ctx, [[[W * 0.15, H * 0.15], [W * 0.85, H * 0.15], [W * 0.85, H * 0.85], [W * 0.15, H * 0.85], [W * 0.15, H * 0.15]]], 1.6)
    strokes(ctx, [[[W / 2, H / 2], [W / 2, H * 0.2]]], 2.4, INK.woodLo)
    ink(ctx, poly([[W / 2, H * 0.2], [W * 0.8, H * 0.26], [W / 2, H * 0.32]]), { fill: INK.red, line: 1.2 }, W, H)
  },
  keep: (ctx, W, H, rng) => {
    ink(ctx, rect(0, 0, W, H), { fill: INK.stone, lo: INK.stoneLo, line: LW }, W, H)
    stones(ctx, W * 0.1, H * 0.15, W * 0.8, H * 0.7, 4, rng)
    strokes(ctx, [[[W * 0.1, H * 0.15], [W * 0.9, H * 0.15], [W * 0.9, H * 0.85], [W * 0.1, H * 0.85], [W * 0.1, H * 0.15]]], 1.6)
  },
  hoard: (ctx, W, H, rng) => {
    ink(ctx, ellipse(W / 2, H / 2, W / 2 - 1, H / 2 - 1), { fill: INK.gold, lo: INK.goldLo, line: LW }, W, H)
    for (let i = 0; i < 24; i++) {
      ctx.beginPath()
      ctx.arc(W * (0.2 + 0.6 * rng.next()), H * (0.2 + 0.6 * rng.next()), 3.5, 0, 6.28)
      ctx.strokeStyle = INK.goldLo
      ctx.lineWidth = 1
      ctx.stroke()
    }
  },
}

/** 带山墙的房子：檐口在正面高的这么多处，顶面画成从檐口坡到屋脊的两片屋顶 */
export const EAVE = 0.58

/** 这一种是带山墙的房子 */
export function gabled(kind: PieceKind): boolean {
  return kind === 'hut' || kind === 'cottage'
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
