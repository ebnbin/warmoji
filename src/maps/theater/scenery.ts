import { cellEdge, fbm, valueNoise } from '../../util/noise'
import { Rng } from '../../util/rng'
import { mapleLeaf, smoothPath } from './art'
import { blendSd, CHAPTERS } from './model'
import type { Blend, Stage, ChapterKey, Act, Piece, PieceKind } from './model'

/** 地布与天幕上的画每格多少像素 */
export const PAINT_PPU = 32
/** 网点的格距，像素 */
const DOT_PX = 4.5

type Ctx = CanvasRenderingContext2D
type Pt = readonly [number, number]

/** 每一季的墨线色 */
const LINE: Record<ChapterKey, string> = { spring: '#2f3a26', summer: '#4a3420', autumn: '#3a2a20', winter: '#2a3040' }

const TILES = new Map<string, HTMLCanvasElement>()
/** 网点纹样：按画布的比例缩回像素大小，转 45° */
function dots(ctx: Ctx, color: string, cover: number, angle = 45): CanvasPattern {
  const key = `${color}|${cover.toFixed(2)}`
  let t = TILES.get(key)
  if (!t) {
    const n = Math.round(DOT_PX * 2)
    t = Object.assign(document.createElement('canvas'), { width: n, height: n })
    const c = t.getContext('2d')!
    const r = Math.sqrt(cover / Math.PI) * (n / 2)
    c.fillStyle = color
    for (const [x, y] of [[0, 0], [n, 0], [0, n], [n, n], [n / 2, n / 2]] as const) {
      c.beginPath()
      c.arc(x, y, r, 0, Math.PI * 2)
      c.fill()
    }
    TILES.set(key, t)
  }
  const p = ctx.createPattern(t, 'repeat')!
  p.setTransform(new DOMMatrix().scale(1 / PAINT_PPU).rotate(angle))
  return p
}

/** 一团起伏的轮廓 */
function blob(rng: Rng, cx: number, cy: number, rx: number, ry: number, n = 8, wob = 0.22): Pt[] {
  const out: Pt[] = []
  const ph = rng.next() * 6.28
  for (let i = 0; i < n; i++) {
    const a = ph + (i / n) * Math.PI * 2
    const k = 1 + (rng.next() * 2 - 1) * wob
    out.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k])
  }
  return out
}

/** 一块印上去的色：平涂偏一点套版，可选网点压暗、描墨线 */
function patch(ctx: Ctx, pts: readonly Pt[], fill: string, opt: { shade?: string; cover?: number; line?: string; lw?: number; alpha?: number } = {}): void {
  ctx.save()
  ctx.globalAlpha = opt.alpha ?? 1
  ctx.translate(0.035, 0.025)
  ctx.beginPath()
  smoothPath(ctx, pts)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.restore()
  if (opt.shade) {
    ctx.save()
    ctx.beginPath()
    smoothPath(ctx, pts)
    ctx.clip()
    ctx.beginPath()
    ctx.rect(-100, -100, 300, 300)
    ctx.save()
    ctx.translate(-0.35, -0.3)
    smoothPath(ctx, pts)
    ctx.restore()
    ctx.fillStyle = dots(ctx, opt.shade, opt.cover ?? 0.35)
    ctx.fill('evenodd')
    ctx.restore()
  }
  if (opt.line) {
    ctx.beginPath()
    smoothPath(ctx, pts)
    ctx.lineWidth = opt.lw ?? 0.05
    ctx.strokeStyle = opt.line
    ctx.lineJoin = 'round'
    ctx.stroke()
  }
}

/** 沿一串点描一道线：可以断成虚线 */
function line(ctx: Ctx, pts: readonly Pt[], color: string, w: number, dash: number[] = [], smooth = true): void {
  ctx.beginPath()
  if (smooth && pts.length > 2) smoothPath(ctx, pts, false)
  else {
    ctx.moveTo(pts[0]![0], pts[0]![1])
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]![0], pts[i]![1])
  }
  ctx.setLineDash(dash)
  ctx.lineWidth = w
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = color
  ctx.stroke()
  ctx.setLineDash([])
}

/** 一条从一边弯到另一边的带子（小路、溪水）的中线 */
function meander(rng: Rng, a: Pt, b: Pt, bends: number, amp: number): Pt[] {
  const out: Pt[] = [a]
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy)
  const nx = -dy / len
  const ny = dx / len
  for (let i = 1; i < bends; i++) {
    const t = i / bends
    const o = (rng.next() * 2 - 1) * amp
    out.push([a[0] + dx * t + nx * o, a[1] + dy * t + ny * o])
  }
  out.push(b)
  return out
}

/** 一条带子：底色描粗线，两边各描一道墨线 */
function band(ctx: Ctx, mid: readonly Pt[], w: number, fill: string, edge: string, opt: { dash?: number[]; shade?: string } = {}): void {
  ctx.save()
  ctx.translate(0.035, 0.025)
  line(ctx, mid, fill, w)
  ctx.restore()
  if (opt.shade) {
    ctx.save()
    ctx.globalAlpha = 0.8
    ctx.beginPath()
    smoothPath(ctx, mid, false)
    ctx.lineWidth = w * 0.45
    ctx.lineCap = 'round'
    ctx.strokeStyle = dots(ctx, opt.shade, 0.4)
    ctx.stroke()
    ctx.restore()
  }
  for (const side of [-1, 1]) {
    const off: Pt[] = mid.map((p, i) => {
      const q = mid[Math.min(mid.length - 1, i + 1)]!
      const r = mid[Math.max(0, i - 1)]!
      const dx = q[0] - r[0]
      const dy = q[1] - r[1]
      const l = Math.hypot(dx, dy) || 1
      return [p[0] - (dy / l) * side * w * 0.5, p[1] + (dx / l) * side * w * 0.5]
    })
    line(ctx, off, edge, 0.045, opt.dash ?? [])
  }
}

/** 随机撒 n 个点，躲开 avoid 返回真的地方 */
function scatter(rng: Rng, n: number, w: number, h: number, each: (x: number, y: number, i: number) => void): void {
  for (let i = 0; i < n; i++) each(0.6 + rng.next() * (w - 1.2), 0.6 + rng.next() * (h - 1.2), i)
}

type Rgba = readonly [number, number, number, number]
/** 一幕地布上的一处离两个景的分界多远，格：第一个景那边为负 */
type Sd = (x: number, y: number) => number
/**
 * 画一个景时知道的：离分界多远、分界本身、地布左上角在台上的位置（格），这一幕的布景（台上的坐标）；
 * 冬天还有从火山脚下淌出来的几道熔岩（地布上的坐标）
 */
interface Env {
  readonly sd: Sd
  readonly blend: Blend
  readonly ox: number
  readonly oy: number
  readonly pieces: readonly Piece[]
  readonly lava: readonly (readonly Pt[])[]
}
type Painter = (ctx: Ctx, w: number, h: number, rng: Rng, env: Env) => void

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
function mix(a: Rgba, b: Rgba, t: number): Rgba {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t]
}
const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng.next() * xs.length)]!

/** 逐像素算出来的一层（每 step 个像素算一次），平铺着叠上去 */
function field(ctx: Ctx, w: number, h: number, step: number, fn: (x: number, y: number) => Rgba | null): void {
  const cw = Math.ceil((w * PAINT_PPU) / step)
  const ch = Math.ceil((h * PAINT_PPU) / step)
  const c = Object.assign(document.createElement('canvas'), { width: cw, height: ch })
  const g = c.getContext('2d')!
  const img = g.createImageData(cw, ch)
  const d = img.data
  for (let j = 0; j < ch; j++) {
    for (let i = 0; i < cw; i++) {
      const v = fn(((i + 0.5) * step) / PAINT_PPU, ((j + 0.5) * step) / PAINT_PPU)
      if (!v) continue
      const o = (j * cw + i) * 4
      d[o] = v[0]
      d[o + 1] = v[1]
      d[o + 2] = v[2]
      d[o + 3] = v[3] * 255
    }
  }
  g.putImageData(img, 0, 0)
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(c, 0, 0, cw * step, ch * step)
  ctx.restore()
}

/** 分界上离界线 off 格的一圈点，按地布切成几段（布外的点丢掉） */
function contour(b: Blend, ox: number, oy: number, w: number, h: number, off: number): Pt[][] {
  const pts: Pt[] = []
  if (b.kind === 'line') {
    const tx = -b.ny
    const ty = b.nx
    for (let s = -70; s <= 70; s += 0.25) {
      const d = off - b.amp * Math.sin((s / b.waveU) * Math.PI * 2 + b.phase)
      pts.push([b.cx + tx * s + b.nx * d - ox, b.cy + ty * s + b.ny * d - oy])
    }
  } else {
    const k = Math.max(2, Math.round((b.r * 2 * Math.PI) / b.waveU))
    const n = Math.ceil(((b.r + off) * Math.PI * 2) / 0.25)
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI
      const r = b.r + off + b.amp * Math.sin(a * k + b.phase)
      pts.push([b.cx + Math.cos(a) * r - ox, b.cy + Math.sin(a) * r - oy])
    }
  }
  const runs: Pt[][] = []
  let run: Pt[] = []
  for (const p of pts) {
    if (p[0] > -1 && p[0] < w + 1 && p[1] > -1 && p[1] < h + 1) run.push(p)
    else if (run.length) {
      runs.push(run)
      run = []
    }
  }
  if (run.length) runs.push(run)
  return runs.filter((r) => r.length > 2)
}

/** 沿一串点每隔 gap 格取一处 */
function along(runs: readonly Pt[][], gap: number, each: (x: number, y: number, ax: number, ay: number) => void): void {
  for (const run of runs) {
    let acc = gap * 0.5
    for (let i = 1; i < run.length; i++) {
      const a = run[i - 1]!
      const b = run[i]!
      const l = Math.hypot(b[0] - a[0], b[1] - a[1])
      acc += l
      if (acc >= gap) {
        acc -= gap
        each(b[0], b[1], (b[0] - a[0]) / (l || 1), (b[1] - a[1]) / (l || 1))
      }
    }
  }
}

/** 在地布上撒点，只留 keep 说留的（keep 给出留下的概率） */
function sow(rng: Rng, n: number, w: number, h: number, keep: (x: number, y: number) => number, each: (x: number, y: number) => void): void {
  for (let i = 0; i < n; i++) {
    const x = 0.6 + rng.next() * (w - 1.2)
    const y = 0.6 + rng.next() * (h - 1.2)
    if (rng.next() < keep(x, y)) each(x, y)
  }
}

function stone(ctx: Ctx, rng: Rng, x: number, y: number, r: number, fill: string, line: string): void {
  patch(ctx, blob(rng, x, y, r, r * 0.75, 7, 0.18), fill, { line, lw: 0.035 })
}

/** 几道顺着风的波纹：沙上的、水里的 */
function ripples(ctx: Ctx, rng: Rng, w: number, h: number, ang: number, gap: number, color: string, lw: number, keep: (x: number, y: number) => boolean): void {
  const ca = Math.cos(ang)
  const sa = Math.sin(ang)
  const span = Math.hypot(w, h)
  ctx.strokeStyle = color
  ctx.lineWidth = lw
  ctx.lineCap = 'round'
  for (let v = -span; v < span; v += gap * (0.8 + rng.next() * 0.4)) {
    let u = -span + rng.next() * 2
    while (u < span) {
      const len = 1 + rng.next() * 3
      ctx.beginPath()
      let started = false
      for (let s = 0; s <= len; s += 0.2) {
        const uu = u + s
        const vv = v + Math.sin(uu * 1.3 + v) * 0.12
        const x = w / 2 + uu * ca - vv * sa
        const y = h / 2 + uu * sa + vv * ca
        if (!keep(x, y)) {
          started = false
          continue
        }
        if (started) ctx.lineTo(x, y)
        else ctx.moveTo(x, y)
        started = true
      }
      ctx.stroke()
      u += len + 0.4 + rng.next() * 1.4
    }
  }
}

/** 这一幕某几种布景落在地布上的位置（地布上的坐标，格）与底边长 */
function spots(env: Env, kinds: readonly PieceKind[]): { x: number; y: number; w: number; a: number }[] {
  return env.pieces.filter((p) => kinds.includes(p.kind)).map((p) => ({ x: p.x - env.ox, y: p.y - env.oy, w: p.w, a: p.a }))
}

/** 灯从左上方照下来：朝着灯的方向 */
const TO_LIGHT: Pt = [-0.6, -0.8]

/** 一片野花：一种花占大头，掺几朵别的 */
const WILDFLOWERS: readonly (readonly [string, string])[] = [
  ['#fffff6', '#ffd448'],
  ['#ffdf40', '#efba36'],
  ['#968ad6', '#7062b6'],
  ['#e4a8c0', '#f4d6e2'],
  ['#d6568a', '#f0a0be'],
]

function wildflower(ctx: Ctx, x: number, y: number, r: number, c: readonly [string, string]): void {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, 6.28)
  ctx.fillStyle = c[0]
  ctx.fill()
  ctx.lineWidth = 0.018
  ctx.strokeStyle = '#3a4a26'
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(x, y, r * 0.4, 0, 6.28)
  ctx.fillStyle = c[1]
  ctx.fill()
}

/** 草叶：被风吹得往一边斜的短道道 */
function blades(ctx: Ctx, rng: Rng, n: number, w: number, h: number, ang: number, colors: readonly string[], keep: (x: number, y: number) => boolean = () => true): void {
  ctx.lineWidth = 0.035
  ctx.lineCap = 'round'
  for (let i = 0; i < n; i++) {
    const x = rng.next() * w
    const y = rng.next() * h
    if (!keep(x, y)) continue
    const l = 0.16 + rng.next() * 0.16
    const a = ang + (rng.next() - 0.5) * 0.5
    ctx.strokeStyle = colors[i % colors.length]!
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.sin(a) * l, y - Math.cos(a) * l)
    ctx.stroke()
  }
}

/**
 * 春的第一个景：草甸。草色按噪声在青绿、浓绿、枯黄之间变，一片片野花各有一种花占大头；
 * 背着樱庭的那条台边是一道陡坡上去的上一层草甸：坡顶干黄发亮，坡面朝灯的亮、背灯的暗，坡脚一道洼下去的暗影
 */
const meadow: Painter = (ctx, w, h, rng, env) => {
  const seed = rng.int(0, 1 << 20)
  field(ctx, w, h, 2, (x, y) => {
    const lush = fbm(x * 0.18, y * 0.18, seed, 3)
    const dry = fbm(x * 0.12 + 40, y * 0.12, seed + 1, 2)
    const base: Rgba = [168, 206, 128, 1]
    const c = mix(mix(base, [128, 186, 110, 1], smooth(0.45, 0.7, lush)), [214, 212, 150, 1], smooth(0.55, 0.75, dry) * 0.7)
    return c
  })
  // 上一层草甸：挑一条离樱庭最远的台边
  const sides = [
    { nx: -1, ny: 0, dist: (x: number) => x, len: h, at: (s: number, d: number): Pt => [d, s] },
    { nx: 1, ny: 0, dist: (x: number) => w - x, len: h, at: (s: number, d: number): Pt => [w - d, s] },
    { nx: 0, ny: -1, dist: (_x: number, y: number) => y, len: w, at: (s: number, d: number): Pt => [s, d] },
    { nx: 0, ny: 1, dist: (_x: number, y: number) => h - y, len: w, at: (s: number, d: number): Pt => [s, h - d] },
  ]
  const side = sides.reduce((a, b) => (b.nx * -env.blend.nx + b.ny * -env.blend.ny > a.nx * -env.blend.nx + a.ny * -env.blend.ny ? b : a))
  const T = 4.6 + rng.next() * 1.4
  const SL = 1.5
  const ph = rng.next() * 6.28
  const wob = (s: number): number => T + 0.9 * Math.sin(s / 3.7 + ph) + 0.4 * Math.sin(s / 1.7 + ph * 2)
  const rim = (off: number): Pt[] => {
    const out: Pt[] = []
    for (let s = -0.5; s <= side.len + 0.5; s += 0.2) out.push(side.at(s, wob(s) + off))
    return out
  }
  const shoulder = rim(-SL / 2)
  const foot = rim(SL / 2)
  const lit = -side.nx * TO_LIGHT[0] - side.ny * TO_LIGHT[1]
  const edge0 = side.at(side.len + 0.5, -1)
  const edge1 = side.at(-0.5, -1)
  // 坡脚洼下去的暗影，背灯时还拖出坡的影子
  const shade = rim(SL / 2 + (lit < 0 ? 1.4 : 0.7))
  patch(ctx, [...foot, ...shade.reverse()], '#1f3a1e', { alpha: 0.3, shade: '#1f3a1e', cover: 0.25 })
  // 坡顶：干一点、亮一点的草，网点压一层浅黄
  const upper: Pt[] = [...shoulder, edge0, edge1]
  patch(ctx, upper, '#eeeaa8', { alpha: 0.5 })
  // 坡面：上亮下暗的一道，朝灯的偏黄、背灯的压暗，竖着一簇簇草
  const face: Pt[] = [...shoulder, ...[...foot].reverse()]
  const fa = side.at(side.len / 2, wob(side.len / 2) - SL / 2)
  const fb = side.at(side.len / 2, wob(side.len / 2) + SL / 2)
  const fg = ctx.createLinearGradient(fa[0], fa[1], fb[0], fb[1])
  fg.addColorStop(0, lit > 0 ? '#d8e09a' : '#8ab868')
  fg.addColorStop(1, lit > 0 ? '#8aae5a' : '#4a7a46')
  ctx.save()
  ctx.beginPath()
  smoothPath(ctx, face)
  ctx.fillStyle = fg
  ctx.fill()
  ctx.clip()
  ctx.fillStyle = dots(ctx, '#1f3a1e', lit > 0 ? 0.12 : 0.22)
  ctx.fill()
  for (let s = 0; s < side.len; s += 0.45) {
    const at = side.at(s + rng.next() * 0.3, wob(s) + (rng.next() - 0.3) * SL * 0.7)
    tuft(ctx, at[0], at[1], 0.22, lit > 0 ? '#6a8a3e' : '#2a4a26')
  }
  ctx.restore()
  line2(ctx, shoulder, '#fbf6c8', 0.16)
  line2(ctx, shoulder, LINE.spring, 0.05)
  line2(ctx, foot, LINE.spring, 0.04)
  // 野花一片一片：一片里一种花占大头
  for (let i = 0; i < 9; i++) {
    const cx = rng.next() * w
    const cy = rng.next() * h
    const r = 1.4 + rng.next() * 1.6
    const main = pick(rng, WILDFLOWERS)
    for (let k = 0; k < 34; k++) {
      const a = rng.next() * 6.28
      const d = Math.sqrt(rng.next()) * r
      wildflower(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, 0.07 + rng.next() * 0.04, rng.next() < 0.72 ? main : pick(rng, WILDFLOWERS))
    }
  }
  blades(ctx, rng, 900, w, h, 0.5, ['#5a8a3e', '#3e6a32', '#7aa452'])
  // 松树脚下一圈褐色的针叶，几颗松果
  for (const p of spots(env, ['pine'])) {
    patch(ctx, blob(rng, p.x, p.y - 0.2, p.w * 0.7, p.w * 0.45, 9, 0.2), '#7a6a52', { alpha: 0.5, shade: '#3a3020', cover: 0.2 })
    for (let k = 0; k < 4; k++) stone(ctx, rng, p.x + (rng.next() - 0.5) * p.w, p.y + (rng.next() - 0.5) * 0.6, 0.07, '#70523a', '#3a2a1a')
  }
  // 羊走出来的小路：一道发白的踩实的土
  const sheep = spots(env, ['sheep', 'rail'])
  if (sheep.length >= 2) {
    const a = sheep[0]!
    const b = sheep[1]!
    band(ctx, meander(rng, [a.x, a.y + 0.3], [b.x, b.y + 0.3], 4, 0.8), 0.32, '#c8bc88', 'rgba(120,100,60,0.4)')
  }
}

/** 一簇草：三根往上岔开的草叶 */
function tuft(ctx: Ctx, x: number, y: number, s: number, color: string): void {
  for (const a of [-0.5, 0, 0.5]) line(ctx, [[x, y], [x + Math.sin(a) * s, y - Math.cos(a) * s]], color, 0.045, [], false)
}

/** 一串点连成的一道线，不平滑 */
function line2(ctx: Ctx, pts: readonly Pt[], color: string, w: number, dash: number[] = []): void {
  line(ctx, pts, color, w, dash, false)
}

/** 一片樱花瓣：带个小缺口的椭圆 */
function sakuraPetal(ctx: Ctx, rng: Rng, x: number, y: number, s: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rng.next() * 6.28)
  ctx.beginPath()
  ctx.moveTo(s, 0)
  ctx.quadraticCurveTo(s * 0.4, -s * 0.75, -s, 0)
  ctx.quadraticCurveTo(s * 0.4, s * 0.75, s, 0)
  ctx.lineTo(s * 0.7, 0)
  ctx.closePath()
  ctx.fillStyle = rng.next() < 0.06 ? '#cc9c98' : pick(rng, ['#fae2ea', '#f6cede', '#f0b8ce', '#e4a0ba'])
  ctx.fill()
  ctx.restore()
}

/**
 * 春的第二个景：樱庭。青灰的草上落满了花瓣：树冠底下厚厚一层铺成粉色的毯子，风把别处的花瓣吹成一溜溜的堆；
 * 寺墙脚下一片耙过的白砂，一串踏脚石
 */
const garden: Painter = (ctx, w, h, rng, env) => {
  const seed = rng.int(0, 1 << 20)
  const trees = spots(env, ['sakura'])
  const walls = spots(env, ['temple', 'lantern'])
  const density = (x: number, y: number): number => {
    let d = 0.25 + 0.55 * smooth(0.5, 0.75, fbm(x / 6.5, y / 6.5, seed + 3, 2)) + 0.3 * smooth(0.6, 0.8, fbm(x / 2.2, y / 2.2, seed + 4, 2))
    for (const t of trees) {
      const r = Math.hypot((x - t.x) / 1.2, y - t.y + 0.4)
      d = Math.max(d, 1 - smooth(t.w * 0.55, t.w * 1.25, r))
    }
    for (const t of walls) d = Math.max(d, 0.75 * (1 - smooth(0.3, 1.4, Math.hypot((x - t.x) / Math.max(1, t.w / 2), y - t.y))))
    return Math.min(1, d)
  }
  field(ctx, w, h, 2, (x, y) => {
    const g = fbm(x * 0.2, y * 0.2, seed, 2)
    const grass = mix([150, 154, 102, 1], [124, 134, 90, 1], g)
    const mottle = fbm(x * 0.9, y * 0.9, seed + 5, 2)
    const t = smooth(0.32, 0.8, density(x, y) + (mottle - 0.5) * 0.25) * 0.92
    return mix(grass, [240, 196, 212, 1], t)
  })
  // 寺墙前耙过的白砂：一条条平行于墙的耙纹
  for (const t of spots(env, ['temple'])) {
    ctx.save()
    ctx.translate(t.x, t.y)
    ctx.rotate(t.a)
    const hw = t.w / 2 + 0.6
    patch(ctx, [[-hw, 0.1], [hw, 0.1], [hw, 1.8], [-hw, 1.8]], '#ded8cc', { line: '#9b8f80', lw: 0.03 })
    ctx.strokeStyle = '#b9ae9e'
    ctx.lineWidth = 0.025
    for (let y = 0.3; y < 1.75; y += 0.16) {
      ctx.beginPath()
      ctx.moveTo(-hw + 0.1, y)
      ctx.lineTo(hw - 0.1, y)
      ctx.stroke()
    }
    ctx.restore()
  }
  // 一串踏脚石
  let x = rng.next() * w
  let y = rng.next() * h
  let a = rng.next() * 6.28
  for (let k = 0; k < 14; k++) {
    stone(ctx, rng, x, y, 0.28, '#d0c8bc', '#6f6658')
    a += (rng.next() - 0.5) * 0.7
    x += Math.cos(a) * 0.75
    y += Math.sin(a) * 0.75
  }
  sow(rng, 1800, w, h, (px, py) => density(px, py), (px, py) => sakuraPetal(ctx, rng, px, py, 0.08 + rng.next() * 0.04))
}

/**
 * 春的接缝：一条小溪从草甸那边的台边流进来，过界的地方架一座红木桥，穿过樱庭从另一边的台边流出去；
 * 上游从几块长青苔的大石头缝里涌进来，下游漫过一道低石槛，水面上漂着花瓣，石槛前堆了一层
 */
const brook: Painter = (ctx, w, h, rng, env) => {
  const b = env.blend
  const tx = -b.ny
  const ty = b.nx
  const s0 = (rng.next() - 0.5) * 6
  const d0 = -b.amp * Math.sin((s0 / b.waveU) * Math.PI * 2 + b.phase)
  const cross: Pt = [b.cx + tx * s0 + b.nx * d0 - env.ox, b.cy + ty * s0 + b.ny * d0 - env.oy]
  const out = (dir: number): Pt => {
    const sk = (rng.next() - 0.5) * 0.8
    const dx = b.nx * dir + tx * sk
    const dy = b.ny * dir + ty * sk
    let u = 0
    while (u < 60 && cross[0] + dx * u > -0.5 && cross[0] + dx * u < w + 0.5 && cross[1] + dy * u > -0.5 && cross[1] + dy * u < h + 0.5) u += 0.25
    return [cross[0] + dx * u, cross[1] + dy * u]
  }
  const start = out(-1)
  const end = out(1)
  const up = meander(rng, start, cross, Math.max(2, Math.round(Math.hypot(cross[0] - start[0], cross[1] - start[1]) / 2.4)), 0.7)
  const down = meander(rng, cross, end, Math.max(2, Math.round(Math.hypot(end[0] - cross[0], end[1] - cross[1]) / 2.4)), 0.7)
  const mid = [...up, ...down.slice(1)]
  // 湿土的岸、水、水里一道深一点的流心、顺着水流的白线
  line(ctx, mid, '#7a6a4a', 1.35)
  band(ctx, mid, 1.1, '#76ad99', '#1f4a46', { shade: '#2a6a66' })
  line(ctx, mid, 'rgba(15,71,82,0.35)', 0.4)
  for (let k = 0; k < 3; k++) {
    const off = (k - 1) * 0.28
    const pts: Pt[] = mid.map((p, i) => {
      const q = mid[Math.min(mid.length - 1, i + 1)]!
      const r = mid[Math.max(0, i - 1)]!
      const l = Math.hypot(q[0] - r[0], q[1] - r[1]) || 1
      return [p[0] - ((q[1] - r[1]) / l) * off, p[1] + ((q[0] - r[0]) / l) * off]
    })
    line(ctx, pts, 'rgba(248,246,238,0.7)', 0.03, [0.3 + rng.next() * 0.3, 0.5 + rng.next() * 0.4])
  }
  // 上游的大石头：花岗岩，长着青苔，水从缝里冒白
  for (let k = 0; k < 4; k++) {
    const q = up[Math.min(up.length - 1, 1)]!
    const sx = start[0] + (q[0] - start[0]) * 0.3 + (rng.next() - 0.5) * 1.6
    const sy = start[1] + (q[1] - start[1]) * 0.3 + (rng.next() - 0.5) * 1.6
    stone(ctx, rng, sx, sy, 0.4 + rng.next() * 0.25, '#a8a49a', '#4a4840')
    ctx.beginPath()
    ctx.arc(sx - 0.1, sy - 0.12, 0.13, 0, 6.28)
    ctx.fillStyle = '#6c7e50'
    ctx.fill()
  }
  // 下游的石槛：一排方石横着拦过水面，水漫过去冒白
  const wi = Math.max(1, down.length - 2)
  const wp = down[wi]!
  const wq = down[Math.max(0, wi - 1)]!
  const wa = Math.atan2(wp[1] - wq[1], wp[0] - wq[0]) + Math.PI / 2
  for (let k = -3; k <= 3; k++) {
    const cx = wp[0] + Math.cos(wa) * k * 0.28
    const cy = wp[1] + Math.sin(wa) * k * 0.28
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(wa)
    patch(ctx, [[-0.13, -0.16], [0.13, -0.16], [0.13, 0.16], [-0.13, 0.16]], '#a8a094', { line: '#4a4438', lw: 0.025 })
    ctx.restore()
  }
  line(ctx, [[wp[0] + Math.cos(wa) * -0.9 + (wp[0] - wq[0]) * 0.15, wp[1] + Math.sin(wa) * -0.9 + (wp[1] - wq[1]) * 0.15], [wp[0] + Math.cos(wa) * 0.9 + (wp[0] - wq[0]) * 0.15, wp[1] + Math.sin(wa) * 0.9 + (wp[1] - wq[1]) * 0.15]], 'rgba(250,250,246,0.85)', 0.1, [0.12, 0.08], false)
  // 水上的花瓣：过了界往下游越漂越多，石槛前堆了一层
  for (let i = 0; i < 160; i++) {
    const t = Math.sqrt(rng.next())
    const k = Math.floor(up.length - 1 + t * (down.length - 1))
    const q = mid[Math.min(mid.length - 1, k)]!
    sakuraPetal(ctx, rng, q[0] + (rng.next() - 0.5) * 0.9, q[1] + (rng.next() - 0.5) * 0.9, 0.07)
  }
  for (let i = 0; i < 40; i++) sakuraPetal(ctx, rng, wq[0] + (wp[0] - wq[0]) * 0.8 + (rng.next() - 0.5) * 1.1, wq[1] + (wp[1] - wq[1]) * 0.8 + (rng.next() - 0.5) * 1.1, 0.07)
  // 桥架在溪水过界的地方，横跨水面：拱起的木板，红漆的扶手，铜顶的望柱
  const cx = cross[0]
  const cy = cross[1]
  const q0 = mid[Math.max(0, up.length - 2)]!
  const q1 = mid[Math.min(mid.length - 1, up.length)]!
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(Math.atan2(q1[1] - q0[1], q1[0] - q0[0]))
  ctx.fillStyle = 'rgba(31,74,70,0.4)'
  ctx.fillRect(-0.3, -1.2, 0.9, 2.5)
  patch(ctx, [[-0.45, -1.3], [0.45, -1.3], [0.45, 1.3], [-0.45, 1.3]], '#b08056', { line: '#4f321d', lw: 0.04 })
  ctx.strokeStyle = '#6e4a30'
  ctx.lineWidth = 0.025
  for (let v = -1.2; v < 1.25; v += 0.18) {
    ctx.beginPath()
    ctx.moveTo(-0.42, v)
    ctx.lineTo(0.42, v)
    ctx.stroke()
  }
  for (const s of [-0.5, 0.5]) {
    patch(ctx, [[s - 0.07, -1.4], [s + 0.07, -1.4], [s + 0.07, 1.4], [s - 0.07, 1.4]], '#c8433a', { line: '#4f1a14', lw: 0.03 })
    for (const v of [-1.4, 0, 1.4]) {
      ctx.beginPath()
      ctx.arc(s, v, 0.11, 0, 6.28)
      ctx.fillStyle = v === 0 ? '#c8433a' : '#d2a85a'
      ctx.fill()
      ctx.strokeStyle = '#4f1a14'
      ctx.stroke()
    }
  }
  ctx.restore()
  // 界线两边草与花瓣混着
  const sd = env.sd
  sow(rng, 260, w, h, (px, py) => (sd(px, py) < 0 && sd(px, py) > -4.5 ? 1 + sd(px, py) / 4.5 : 0), (px, py) => sakuraPetal(ctx, rng, px, py, 0.08))
}

/**
 * 夏的第一个景：沙漠。金黄的沙，丘间实一点的沙偏红；沙丘一个个月牙，迎风的一面亮，背风的一面压一片琥珀色的影，
 * 横着风一道道细细的沙纹；半埋着一副骆驼骨，一块风蚀的砂岩
 */
const desert: Painter = (ctx, w, h, rng) => {
  const seed = rng.int(0, 1 << 20)
  field(ctx, w, h, 2, (x, y) => {
    const t = fbm(x * 0.15, y * 0.15, seed, 2)
    return mix([250, 199, 145, 1], [237, 179, 128, 1], smooth(0.4, 0.7, t))
  })
  const wind = rng.next() * 6.28
  // 月牙沙丘：亮的一面朝着风来的方向，背风一面一道琥珀色的影
  for (let i = 0; i < 6; i++) {
    const cx = 1.5 + rng.next() * (w - 3)
    const cy = 1.5 + rng.next() * (h - 3)
    const r = 1.4 + rng.next() * 1.2
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(wind)
    patch(ctx, blob(rng, -r * 0.2, 0, r * 1.1, r * 0.8, 9, 0.1), '#ffdbad', { alpha: 0.8 })
    ctx.beginPath()
    ctx.moveTo(0, -r)
    ctx.quadraticCurveTo(r * 0.75, 0, 0, r)
    ctx.quadraticCurveTo(r * 0.35, 0, 0, -r)
    ctx.fillStyle = 'rgba(160,110,70,0.55)'
    ctx.fill()
    ctx.lineWidth = 0.04
    ctx.strokeStyle = LINE.summer
    ctx.beginPath()
    ctx.moveTo(0, -r)
    ctx.quadraticCurveTo(r * 0.35, 0, 0, r)
    ctx.stroke()
    ctx.restore()
  }
  ripples(ctx, rng, w, h, wind + Math.PI / 2, 0.5, 'rgba(128,97,77,0.45)', 0.04, () => true)
  // 骆驼骨：一根弯弯的脊梁，一个头骨，几对肋骨
  const bx = 2 + rng.next() * (w - 4)
  const by = 2 + rng.next() * (h - 4)
  ctx.save()
  ctx.translate(bx, by)
  ctx.rotate(rng.next() * 6.28)
  line(ctx, [[-1, 0], [-0.3, 0.1], [0.4, 0.05], [1, -0.05]], '#ede6d1', 0.1)
  for (let k = 0; k < 5; k++) {
    const x = -0.6 + k * 0.28
    for (const s of [-1, 1]) line(ctx, [[x, 0.03], [x + 0.08, s * 0.32], [x + 0.02, s * 0.5]], '#ede6d1', 0.06)
  }
  patch(ctx, [[1, -0.2], [1.5, -0.12], [1.55, 0.08], [1, 0.16]], '#ede6d1', { line: '#6a5a40', lw: 0.025 })
  for (const s of [-0.06, 0.08]) {
    ctx.beginPath()
    ctx.arc(1.2, s, 0.04, 0, 6.28)
    ctx.fillStyle = '#4a3420'
    ctx.fill()
  }
  ctx.restore()
  // 风蚀的砂岩：顺风拉长，一头钝一头尖，一层层红白相间
  const rx = 2 + rng.next() * (w - 4)
  const ry = 2 + rng.next() * (h - 4)
  ctx.save()
  ctx.translate(rx, ry)
  ctx.rotate(wind)
  const slab: Pt[] = [[-0.9, -0.4], [0.2, -0.45], [1.2, 0], [0.2, 0.42], [-0.9, 0.38], [-1.05, 0]]
  patch(ctx, slab, '#b8734f', { line: LINE.summer, lw: 0.04 })
  ctx.save()
  ctx.beginPath()
  smoothPath(ctx, slab)
  ctx.clip()
  for (let k = -3; k <= 3; k++) line(ctx, [[-1.2, k * 0.14], [1.3, k * 0.14 + 0.04]], k % 2 ? '#dbab80' : '#a0603e', 0.06, [], false)
  ctx.restore()
  ctx.restore()
  scatter(rng, 30, w, h, (x, y) => stone(ctx, rng, x, y, 0.07 + rng.next() * 0.06, '#9e8c78', '#664f40'))
}

/** 夏的第二个景：海，越往外越深，按深浅分成一圈圈色带 */
const sea: Painter = (ctx, w, h, rng, { sd }) => {
  const BANDS: readonly Rgba[] = [
    [168, 226, 216, 1],
    [126, 204, 208, 1],
    [88, 168, 196, 1],
    [62, 128, 176, 1],
    [46, 92, 146, 1],
  ]
  const seed = rng.int(0, 1 << 20)
  field(ctx, w, h, 2, (x, y) => {
    const d = sd(x, y) + (fbm(x * 0.25, y * 0.25, seed, 2) - 0.5) * 2.4
    const q = Math.max(0, d) / 2.6
    const k = Math.min(BANDS.length - 1, Math.floor(q))
    const f = q - Math.floor(q)
    const c = BANDS[k]!
    const rim = k < BANDS.length - 1 && f > 0.93 ? 0.88 : 1
    return [c[0] * rim, c[1] * rim, c[2] * rim, 1]
  })
  // 浅水里看得见的沙纹，深水里的小鱼与气泡
  ripples(ctx, rng, w, h, rng.next() * 6.28, 0.6, 'rgba(255,255,255,0.55)', 0.045, (x, y) => sd(x, y) > 0.8 && sd(x, y) < 4)
  sow(rng, 60, w, h, (x, y) => (sd(x, y) > 1.2 ? 1 : 0), (x, y) => {
    ctx.beginPath()
    ctx.moveTo(x - 0.2, y)
    ctx.quadraticCurveTo(x, y - 0.18, x + 0.2, y)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 0.05
    ctx.lineCap = 'round'
    ctx.stroke()
  })
  sow(rng, 30, w, h, (x, y) => (sd(x, y) > 5 ? 1 : 0), (x, y) => {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rng.next() < 0.5 ? 0 : Math.PI)
    ctx.fillStyle = 'rgba(28,52,96,0.6)'
    ctx.beginPath()
    ctx.ellipse(0, 0, 0.2, 0.08, 0, 0, 6.28)
    ctx.moveTo(-0.16, 0)
    ctx.lineTo(-0.3, -0.09)
    ctx.lineTo(-0.3, 0.09)
    ctx.fill()
    ctx.restore()
  })
  sow(rng, 40, w, h, (x, y) => (sd(x, y) > 2 ? 1 : 0), (x, y) => {
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'
    ctx.lineWidth = 0.025
    for (const [dx, dy, r] of [[0, 0, 0.07], [0.1, -0.16, 0.05], [0.02, -0.28, 0.035]] as const) {
      ctx.beginPath()
      ctx.arc(x + dx, y + dy, r, 0, 6.28)
      ctx.stroke()
    }
  })
}

/** 夏的接缝：沙漠走到海边是一片沙滩，湿沙一条，浪花两道；滩上贝壳、海星、一把遮阳伞，一串脚印从沙漠一直走到水边 */
const shore: Painter = (ctx, w, h, rng, { sd, blend: b, ox, oy }) => {
  const seed = rng.int(0, 1 << 20)
  field(ctx, w, h, 2, (x, y) => {
    const d = sd(x, y)
    if (d < -4.2 || d > 0.4) return null
    const wob = (valueNoise(x * 0.5, y * 0.5, seed) - 0.5) * 1.2
    const dry = smooth(-4 + wob, -3 + wob, d)
    const wet = smooth(-1.1, -0.5, d)
    const c = mix([248, 232, 194, 1], [226, 200, 144, 1], wet)
    return [c[0], c[1], c[2], dry]
  })
  for (const [off, lw, dash] of [[0.05, 0.16, []], [0.75, 0.06, [0.4, 0.25]], [1.5, 0.045, [0.25, 0.35]]] as const) {
    for (const run of contour(b, ox, oy, w, h, off)) line(ctx, run, '#ffffff', lw, [...dash])
  }
  along(contour(b, ox, oy, w, h, 0.05), 0.55, (x, y) => {
    ctx.beginPath()
    ctx.arc(x, y, 0.13, 0, 6.28)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
  })
  const onBeach = (x: number, y: number): number => (sd(x, y) > -2.8 && sd(x, y) < -0.5 ? 1 : 0)
  sow(rng, 60, w, h, onBeach, (x, y) => {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rng.next() * 6.28)
    if (rng.next() < 0.35) {
      ctx.beginPath()
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2
        const r = k % 2 === 0 ? 0.17 : 0.07
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
      }
      ctx.closePath()
      ctx.fillStyle = '#e8892c'
    } else {
      ctx.beginPath()
      ctx.moveTo(0, 0.09)
      ctx.arc(0, 0, 0.12, Math.PI * 0.15, Math.PI * 0.85, true)
      ctx.closePath()
      ctx.fillStyle = pick(rng, ['#f7c6d3', '#ffffff', '#f2e0b8'])
    }
    ctx.fill()
    ctx.strokeStyle = '#4a3420'
    ctx.lineWidth = 0.025
    ctx.stroke()
    ctx.restore()
  })
  // 遮阳伞从上面看：红白相间的一圈
  for (let t = 0; t < 40; t++) {
    const x = 2 + rng.next() * (w - 4)
    const y = 2 + rng.next() * (h - 4)
    if (sd(x, y) < -2.6 || sd(x, y) > -1.2) continue
    patch(ctx, [[x + 0.3, y + 0.9], [x + 1.3, y + 0.9], [x + 1.3, y + 1.5], [x + 0.3, y + 1.5]], '#3d6fb0', { line: '#4a3420', lw: 0.03 })
    for (let k = 0; k < 8; k++) {
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.arc(x, y, 0.75, (k / 8) * 6.28, ((k + 1) / 8) * 6.28)
      ctx.closePath()
      ctx.fillStyle = k % 2 === 0 ? '#d9452f' : '#ffffff'
      ctx.fill()
    }
    ctx.beginPath()
    ctx.arc(x, y, 0.75, 0, 6.28)
    ctx.strokeStyle = '#4a3420'
    ctx.lineWidth = 0.04
    ctx.stroke()
    break
  }
  // 脚印：从沙漠深处朝着海走过来
  let x = 0
  let y = 0
  for (let t = 0; t < 30; t++) {
    x = 1.5 + rng.next() * (w - 3)
    y = 1.5 + rng.next() * (h - 3)
    if (sd(x, y) < -9) break
  }
  const nx = b.nx
  const ny = b.ny
  for (let k = 0; k < 60 && sd(x, y) < -0.6; k++) {
    const side = k % 2 === 0 ? 1 : -1
    const fx = x - ny * side * 0.12
    const fy = y + nx * side * 0.12
    ctx.save()
    ctx.translate(fx, fy)
    ctx.rotate(Math.atan2(ny, nx))
    ctx.beginPath()
    ctx.ellipse(0, 0, 0.1, 0.06, 0, 0, 6.28)
    ctx.fillStyle = 'rgba(150,110,50,0.55)'
    ctx.fill()
    ctx.restore()
    const wob = (valueNoise(k * 0.3, 0, seed + 3) - 0.5) * 0.5
    x += (nx - ny * wob) * 0.36
    y += (ny + nx * wob) * 0.36
    if (x < 0.6 || x > w - 0.6 || y < 0.6 || y > h - 0.6) break
  }
}


/** 离分界越来越远的方向（地布上的单位向量）：圈里往圈外，线的一边往另一边 */
function outward(sd: Sd, x: number, y: number): Pt {
  const e = 0.05
  const gx = sd(x + e, y) - sd(x - e, y)
  const gy = sd(x, y + e) - sd(x, y - e)
  const l = Math.hypot(gx, gy) || 1
  return [gx / l, gy / l]
}

/** 从上往下看的一根晶体：根部近白、往尖上越来越紫的长菱形，中间一道亮棱，ang 朝尖 */
function prism(ctx: Ctx, x: number, y: number, len: number, wid: number, ang: number, deep: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(ang)
  const g = ctx.createLinearGradient(0, 0, len, 0)
  g.addColorStop(0, '#e2d4f4')
  g.addColorStop(1, `rgb(${Math.round(226 - 108 * deep)},${Math.round(212 - 158 * deep)},${Math.round(244 - 40 * deep)})`)
  ctx.beginPath()
  ctx.moveTo(0, -wid / 2)
  ctx.lineTo(len * 0.72, -wid / 2)
  ctx.lineTo(len, 0)
  ctx.lineTo(len * 0.72, wid / 2)
  ctx.lineTo(0, wid / 2)
  ctx.closePath()
  ctx.fillStyle = g
  ctx.fill()
  ctx.lineWidth = 0.025
  ctx.strokeStyle = '#2a1238'
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(0.04, -wid * 0.08)
  ctx.lineTo(len * 0.95, -wid * 0.04)
  ctx.lineWidth = 0.025
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'
  ctx.stroke()
  ctx.restore()
}

/** 一点闪光：四个尖的小星 */
function glint(ctx: Ctx, x: number, y: number, s: number, color = '#ffffff'): void {
  ctx.beginPath()
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    const r = k % 2 === 0 ? s : s * 0.22
    if (k === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
    else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
  }
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

/**
 * 秋的第一个景：紫水晶洞的洞底（圈里）。紫色的晶砂，一块块深色的斑，一片片细小的晶皮；地上半埋着几个小晶洞，一圈玛瑙纹里朝心长着晶；
 * 塌开的洞顶漏下一两束光，照到的地方亮白，碎晶散了一地闪着
 */
const geode: Painter = (ctx, w, h, rng, env) => {
  const seed = rng.int(0, 1 << 20)
  field(ctx, w, h, 2, (x, y) => {
    const n = fbm(x * 0.3, y * 0.3, seed, 3)
    const dark = smooth(0.55, 0.7, fbm(x * 0.12, y * 0.12, seed + 2, 2))
    const c = mix(mix([104, 60, 130, 1], [130, 76, 160, 1], n), [62, 42, 90, 1], dark * 0.8)
    return c
  })
  // 晶皮：一小片密密的小尖
  for (let i = 0; i < 10; i++) {
    const cx = rng.next() * w
    const cy = rng.next() * h
    if (env.sd(cx, cy) > -0.8) continue
    for (let k = 0; k < 24; k++) {
      const a = rng.next() * 6.28
      const d = Math.sqrt(rng.next()) * 0.8
      prism(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 0.12 + rng.next() * 0.08, 0.06, rng.next() * 6.28, 0.6 + rng.next() * 0.4)
    }
  }
  // 半埋的小晶洞
  for (let i = 0; i < 5; i++) {
    const cx = 1 + rng.next() * (w - 2)
    const cy = 1 + rng.next() * (h - 2)
    if (env.sd(cx, cy) > -1.4) continue
    const r = 0.5 + rng.next() * 0.25
    ctx.beginPath()
    ctx.arc(cx, cy + 0.04, r + 0.1, 0, 6.28)
    ctx.fillStyle = 'rgba(30,14,44,0.55)'
    ctx.fill()
    for (const [k, c] of [[1, '#5a4868'], [0.86, '#ded6ec'], [0.74, '#9684ba'], [0.64, '#c4bade']] as const) {
      ctx.beginPath()
      ctx.arc(cx, cy, r * k, 0, 6.28)
      ctx.fillStyle = c
      ctx.fill()
    }
    ctx.beginPath()
    ctx.arc(cx, cy, r * 0.56, 0, 6.28)
    ctx.fillStyle = '#221034'
    ctx.fill()
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * 6.28 + rng.next() * 0.2
      prism(ctx, cx + Math.cos(a) * r * 0.58, cy + Math.sin(a) * r * 0.58, r * 0.42, r * 0.16, a + Math.PI, 0.9)
    }
    ctx.lineWidth = 0.03
    ctx.strokeStyle = '#1a0a26'
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, 6.28)
    ctx.stroke()
  }
  // 洞顶漏下来的光：照到的地方亮，碎晶闪着
  for (let i = 0; i < 2; i++) {
    let cx = 0
    let cy = 0
    for (let t = 0; t < 30; t++) {
      cx = 1 + rng.next() * (w - 2)
      cy = 1 + rng.next() * (h - 2)
      if (env.sd(cx, cy) < -2.5) break
    }
    const r = 1.4 + rng.next() * 0.8
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
    g.addColorStop(0, 'rgba(255,246,255,0.75)')
    g.addColorStop(0.6, 'rgba(232,210,255,0.35)')
    g.addColorStop(1, 'rgba(220,196,255,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(cx, cy, r * 1.15, r, 0, 0, 6.28)
    ctx.fill()
    for (let k = 0; k < 16; k++) {
      const a = rng.next() * 6.28
      const d = rng.next() * r
      prism(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 0.2 + rng.next() * 0.15, 0.08, rng.next() * 6.28, 0.5 + rng.next() * 0.5)
    }
    for (let k = 0; k < 7; k++) glint(ctx, cx + (rng.next() - 0.5) * r * 1.5, cy + (rng.next() - 0.5) * r * 1.2, 0.12 + rng.next() * 0.08)
  }
  scatter(rng, 140, w, h, (x, y) => {
    ctx.beginPath()
    ctx.arc(x, y, 0.025 + rng.next() * 0.02, 0, 6.28)
    ctx.fillStyle = '#c4acec'
    ctx.fill()
  })
  scatter(rng, 18, w, h, (x, y) => glint(ctx, x, y, 0.08, '#efe2ff'))
  // 晶簇脚下的一圈碎晶
  for (const p of spots(env, ['cluster', 'beam', 'druse'])) {
    for (let k = 0; k < 10; k++) prism(ctx, p.x + (rng.next() - 0.5) * p.w * 1.2, p.y + (rng.next() - 0.3) * 0.8, 0.14 + rng.next() * 0.12, 0.06, rng.next() * 6.28, 0.8)
  }
}

/** 秋天的落叶：朱红、橙红、深红为主，夹着几片黄的、褐的 */
const FALL_LEAF = ['#e63c22', '#e63c22', '#f06224', '#f06224', '#d62a2e', '#d62a2e', '#f48628', '#ecac36', '#ac5c36', '#b85830'] as const

/**
 * 秋的第二个景：残垣。秋草上一处塌了的石砌院子：错缝的灰石板铺地，缺了几块，一角铺着红陶方砖，倒了的墙只剩齐地的墙基；
 * 四下里落满了红叶：到处都铺着一层，风吹成一溜溜的堆，枫树底下、墙脚下最厚，厚的地方底下一层烂成了褐红；墙脚爬着红地锦
 */
const ruins: Painter = (ctx, w, h, rng, env) => {
  const seed = rng.int(0, 1 << 20)
  field(ctx, w, h, 2, (x, y) => {
    const n = fbm(x * 0.2, y * 0.2, seed, 2)
    return mix(mix([128, 112, 66, 1], [96, 108, 54, 1], smooth(0.5, 0.75, n)), [150, 128, 78, 1], smooth(0.5, 0.25, n))
  })
  // 院子：转一个角的网格上铺几间屋的地面
  const rot = (rng.next() < 0.5 ? 1 : -1) * (0.14 + rng.next() * 0.28)
  const cr = Math.cos(rot)
  const sr = Math.sin(rot)
  const ox = w / 2
  const oy = h / 2
  const rooms: { x: number; y: number; w: number; h: number; tile: boolean }[] = []
  for (let i = 0; i < 4; i++) rooms.push({ x: (rng.next() - 0.5) * w * 0.8, y: (rng.next() - 0.5) * h * 0.8, w: 3 + rng.next() * 3, h: 2.6 + rng.next() * 2.6, tile: i === 3 })
  ctx.save()
  ctx.translate(ox, oy)
  ctx.rotate(rot)
  for (const r of rooms) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(r.x, r.y, r.w, r.h)
    ctx.clip()
    const sw = r.tile ? 0.5 : 0.85
    const sh = r.tile ? 0.5 : 0.62
    for (let y = r.y; y < r.y + r.h; y += sh) {
      const off = r.tile ? 0 : (Math.round(y / sh) % 2) * sw * 0.5
      for (let x = r.x - off; x < r.x + r.w; x += sw) {
        if (rng.next() < 0.14) continue
        ctx.beginPath()
        ctx.rect(x + 0.03, y + 0.03, sw - 0.06, sh - 0.06)
        ctx.fillStyle = r.tile ? pick(rng, ['#86624f', '#7a5a4a', '#926a56', '#725446']) : pick(rng, ['#9ea0a0', '#929698', '#a8aaa8', '#8a8e92'])
        ctx.fill()
        ctx.strokeStyle = '#5a6036'
        ctx.lineWidth = 0.03
        ctx.stroke()
      }
    }
    ctx.restore()
    // 墙基：一圈齐地的石头，断断续续
    for (const [a, b] of [[[r.x, r.y], [r.x + r.w, r.y]], [[r.x + r.w, r.y], [r.x + r.w, r.y + r.h]], [[r.x + r.w, r.y + r.h], [r.x, r.y + r.h]], [[r.x, r.y + r.h], [r.x, r.y]]] as const) {
      const t0 = rng.next() * 0.25
      const t1 = 0.55 + rng.next() * 0.45
      const seg: Pt[] = [[a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1]]
      line(ctx, seg, '#4a4e52', 0.42, [], false)
      line(ctx, seg, '#b4b6b8', 0.32, [0.34, 0.05], false)
    }
  }
  ctx.restore()
  // 落叶的厚薄
  const maples = spots(env, ['maple'])
  const walls = spots(env, ['ruin', 'tower', 'column', 'boards'])
  const inRoom = (x: number, y: number): boolean => {
    const lx = (x - ox) * cr + (y - oy) * sr
    const ly = -(x - ox) * sr + (y - oy) * cr
    return rooms.some((r) => lx > r.x && lx < r.x + r.w && ly > r.y && ly < r.y + r.h)
  }
  const density = (x: number, y: number): number => {
    let d = 0.34 + 0.5 * smooth(0.45, 0.7, fbm(x / 5, y / 5, seed + 7, 2))
    for (const t of maples) d = Math.max(d, 1 - smooth(t.w * 0.5, t.w * 1.3, Math.hypot((x - t.x) / 1.2, y - t.y + 0.4)))
    for (const t of walls) d = Math.max(d, 0.85 * (1 - smooth(0.2, 1.4, Math.hypot((x - t.x) / Math.max(1, t.w / 2), (y - t.y) * 1.4))))
    return inRoom(x, y) ? d * 0.55 : d
  }
  field(ctx, w, h, 2, (x, y) => {
    const d = density(x, y) + (fbm(x * 0.8, y * 0.8, seed + 9, 2) - 0.5) * 0.3
    const t = smooth(0.35, 0.8, d)
    return t > 0 ? [176, 80, 44, t * 0.9] : null
  })
  // 墙脚的红地锦
  for (const t of walls) {
    for (let k = 0; k < 18; k++) {
      ctx.save()
      ctx.translate(t.x + (rng.next() - 0.5) * t.w, t.y + rng.next() * 0.6)
      ctx.rotate(rng.next() * 6.28)
      mapleLeaf(ctx, 0.09, pick(rng, ['#b6301e', '#d24a2a', '#8e2618']), 0.015)
      ctx.restore()
    }
  }
  sow(rng, 3600, w, h, density, (x, y) => {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rng.next() * 6.28)
    mapleLeaf(ctx, 0.17 + rng.next() * 0.1, pick(rng, FALL_LEAF), 0.02)
    ctx.restore()
  })
}

/**
 * 秋的接缝：晶洞塌开的洞口。洞口一圈是塌下来的玄武岩乱石，大大小小、有疏有密，朝洞里那面长着紫晶；
 * 碎石与碎晶从洞口往外撒开，越远越稀；洞里的紫光往外漫出一点；红叶从残垣那边一路吹进洞里，越往里越稀
 */
const geodeRim: Painter = (ctx, w, h, rng, env) => {
  const b = env.blend
  const seed = rng.int(0, 1 << 20)
  // 洞口往外漫出的一点紫光、往里压一点暗
  field(ctx, w, h, 2, (x, y) => {
    const d = env.sd(x, y)
    if (d > 3 || d < -3) return null
    return d > 0 ? [150, 110, 200, 0.22 * (1 - smooth(0, 3, d))] : [30, 14, 44, 0.25 * (1 - smooth(-3, 0, d))]
  })
  const rock = (x: number, y: number, r: number): void => {
    const o = outward(env.sd, x, y)
    ctx.beginPath()
    ctx.ellipse(x + 0.08, y + 0.1, r * 1.05, r * 0.8, 0, 0, 6.28)
    ctx.fillStyle = 'rgba(16,8,24,0.45)'
    ctx.fill()
    const shape = blob(rng, x, y, r, r * 0.78, 7, 0.22)
    patch(ctx, shape, pick(rng, ['#54465e', '#5e5068', '#4a3e56']), { shade: '#1e1428', cover: 0.3, line: '#1e1428', lw: 0.035 })
    // 迎光的一面亮一点：几道棱
    line(ctx, [[x - r * 0.5, y - r * 0.2], [x - r * 0.1, y - r * 0.55], [x + r * 0.3, y - r * 0.4]], 'rgba(150,130,180,0.7)', 0.04, [], false)
    // 朝洞里的那面长着一簇晶
    if (r > 0.3) {
      const n = 2 + Math.floor(rng.next() * 4)
      for (let k = 0; k < n; k++) {
        const a = Math.atan2(-o[1], -o[0]) + (rng.next() - 0.5) * 1.4
        prism(ctx, x - o[0] * r * 0.4 + (rng.next() - 0.5) * r * 0.6, y - o[1] * r * 0.4 + (rng.next() - 0.5) * r * 0.5, r * (0.6 + rng.next() * 0.7), r * 0.26, a, 0.7 + rng.next() * 0.3)
      }
    }
  }
  // 洞口的乱石：沿界线有疏有密，大的小的混着，前后错开
  along(contour(b, env.ox, env.oy, w, h, 0), 0.6, (x, y) => {
    if (valueNoise(x * 0.35, y * 0.35, seed) < 0.45 || rng.next() < 0.35) return
    const o = outward(env.sd, x, y)
    const off = (rng.next() - 0.4) * 1.2
    rock(x + o[0] * off, y + o[1] * off, 0.25 + rng.next() * rng.next() * 0.75)
  })
  // 往外撒开的碎石与碎晶，往里吹进去的红叶
  sow(rng, 600, w, h, (x, y) => {
    const d = env.sd(x, y)
    return d > -1 && d < 3.5 ? (1 - smooth(-1, 3.5, d)) * 0.8 : 0
  }, (x, y) => {
    if (rng.next() < 0.5) {
      stone(ctx, rng, x, y, 0.05 + rng.next() * 0.1, pick(rng, ['#3a2e46', '#5a4a68', '#2a2234']), '#140a1e')
    } else prism(ctx, x, y, 0.12 + rng.next() * 0.16, 0.06, rng.next() * 6.28, 0.6 + rng.next() * 0.4)
  })
  sow(rng, 700, w, h, (x, y) => {
    const d = env.sd(x, y)
    return d > -4 && d < 1.5 ? smooth(-4, 1, d) * 0.9 : 0
  }, (x, y) => {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rng.next() * 6.28)
    mapleLeaf(ctx, 0.15 + rng.next() * 0.08, pick(rng, FALL_LEAF), 0.02)
    ctx.restore()
  })
}

/** 冬天从火山脚下淌出来的熔岩：从火山布景的底边起，顺着离火山口越来越远的方向弯弯曲曲往外流，一直淌进海里 */
function lavaPaths(sd: Sd, cone: { x: number; y: number; w: number; a: number } | undefined, w: number, h: number, rng: Rng): Pt[][] {
  const out: Pt[][] = []
  let from: Pt[]
  if (cone) {
    const ux = Math.cos(cone.a)
    const uy = Math.sin(cone.a)
    from = [-0.3, 0, 0.3].map((k): Pt => [cone.x + ux * cone.w * k, cone.y + uy * cone.w * k + 0.2])
  } else {
    let best: Pt = [w / 2, h / 2]
    let low = Infinity
    for (let y = 0.5; y < h; y += 1) for (let x = 0.5; x < w; x += 1) if (sd(x, y) < low) [low, best] = [sd(x, y), [x, y]]
    from = [best, best, best]
  }
  for (const [i, f] of from.entries()) {
    let [x, y] = f
    const pts: Pt[] = [[x, y]]
    const g0 = gradOf(sd, x, y)
    let a = Math.atan2(g0[1], g0[0]) + (i - 1) * 0.9
    for (let k = 0; k < 90 && sd(x, y) < 1.4; k++) {
      const [gx, gy] = gradOf(sd, x, y)
      const want = Math.atan2(gy, gx)
      const turn = Math.atan2(Math.sin(want - a), Math.cos(want - a))
      a += Math.sign(turn) * Math.min(Math.abs(turn), 0.12) + (rng.next() - 0.5) * 0.3
      x += Math.cos(a) * 0.35
      y += Math.sin(a) * 0.35
      if (x < 0.3 || x > w - 0.3 || y < 0.3 || y > h - 0.3) break
      pts.push([x, y])
    }
    if (pts.length > 4) out.push(pts)
  }
  return out
}

function gradOf(sd: Sd, x: number, y: number): Pt {
  const e = 0.05
  return [sd(x + e, y) - sd(x - e, y), sd(x, y + e) - sd(x, y - e)]
}

/** 一道熔岩：外圈一层光，边上一圈黑壳，里面橙红，流心黄白；壳上浮着几块黑的硬皮，裂缝透着红 */
function lavaFlow(ctx: Ctx, rng: Rng, pts: readonly Pt[], wid: number): void {
  ctx.save()
  ctx.globalAlpha = 0.35
  line(ctx, pts, '#ff5c14', wid * 2.6)
  ctx.globalAlpha = 1
  line(ctx, pts, '#1c120f', wid * 1.15)
  line(ctx, pts, '#9e1a0a', wid * 0.95)
  line(ctx, pts, '#e6420d', wid * 0.72)
  line(ctx, pts, '#ff7814', wid * 0.48)
  line(ctx, pts, '#ffad33', wid * 0.26)
  line(ctx, pts, '#ffe085', wid * 0.09, [0.5, 0.35])
  ctx.restore()
  for (let i = 2; i < pts.length - 1; i += 3) {
    if (rng.next() < 0.4) continue
    const p = pts[i]!
    const q = pts[i + 1]!
    const a = Math.atan2(q[1] - p[1], q[0] - p[0])
    ctx.save()
    ctx.translate(p[0] + (rng.next() - 0.5) * wid * 0.4, p[1] + (rng.next() - 0.5) * wid * 0.4)
    ctx.rotate(a)
    patch(ctx, blob(rng, 0, 0, wid * 0.22, wid * 0.13, 6, 0.3), '#2e1a12', { line: '#e6420d', lw: 0.02 })
    ctx.restore()
  }
}

/**
 * 冬的第一个景：雪火山脚下（圈里）。灰黑的火山灰，一格格泥裂；一大片积雪一块块盖在上面，背光处泛着淡紫蓝；
 * 老熔岩凝成的黑玄武岩一条条，上面有绳子一样的波纹；火山脚下几道熔岩正淌下来，把雪烧开；硫气孔周围一圈黄斑
 */
const volcano: Painter = (ctx, w, h, rng, env) => {
  const seed = rng.int(0, 1 << 20)
  field(ctx, w, h, 2, (x, y) => {
    const e = cellEdge(x * 0.7, y * 0.7, seed)
    const tone = valueNoise(x * 0.5, y * 0.5, seed + 1)
    const crack = e < 0.05 ? 0.82 : 1
    const ash: Rgba = [(64 + 26 * tone) * crack, (69 + 26 * tone) * crack, (73 + 26 * tone) * crack, 1]
    const snow = smooth(0.36, 0.44, fbm(x * 0.22, y * 0.22, seed + 2, 3) + (valueNoise(x * 1.6, y * 1.6, seed + 3) - 0.5) * 0.08)
    const lo = smooth(0.3, 0.7, fbm(x * 0.6 + 7, y * 0.6, seed + 4, 2))
    return mix(ash, mix([237, 241, 247, 1], [176, 190, 218, 1], lo * 0.6), snow)
  })
  // 老熔岩：凝住的黑玄武岩舌头，一道道绳纹
  for (let i = 0; i < 3; i++) {
    const cx = rng.next() * w
    const cy = rng.next() * h
    if (env.sd(cx, cy) > -1.5) continue
    const tongue = blob(rng, cx, cy, 1.4 + rng.next(), 0.8 + rng.next() * 0.5, 9, 0.28)
    patch(ctx, tongue, '#4a5056', { alpha: 0.85, line: '#2a2e32', lw: 0.03 })
    ctx.save()
    ctx.beginPath()
    smoothPath(ctx, tongue)
    ctx.clip()
    ctx.strokeStyle = '#30353a'
    ctx.lineWidth = 0.03
    for (let k = -4; k <= 4; k++) {
      ctx.beginPath()
      ctx.arc(cx - 2.5, cy + k * 0.25, 2.4, -0.5, 0.5)
      ctx.stroke()
    }
    ctx.restore()
  }
  // 硫气孔：一圈黄斑，地上冒着汽
  for (const p of spots(env, ['vent'])) {
    patch(ctx, blob(rng, p.x, p.y + 0.3, p.w * 0.9, 0.8, 8, 0.25), '#c4aa3a', { alpha: 0.85, shade: '#7a6a1a', cover: 0.3 })
  }
  // 熔岩把一路的雪烧开，露出湿黑的地，再淌过去
  for (const pts of env.lava) {
    ctx.save()
    ctx.globalAlpha = 0.7
    line(ctx, pts, '#3a3c3e', 1.6)
    ctx.restore()
  }
  for (const pts of env.lava) lavaFlow(ctx, rng, pts, 0.75)
  scatter(rng, 70, w, h, (x, y) => {
    ctx.beginPath()
    ctx.arc(x, y, 0.04 + rng.next() * 0.04, 0, 6.28)
    ctx.fillStyle = '#2a2c2e'
    ctx.fill()
  })
}

/** 冬天的风从哪边来：沙脊、雪纹都顺着它 */
function windOf(rng: Rng): number {
  return rng.next() * 6.28
}

/** 一块浮冰：中心、大小、轮廓 */
interface Floe {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly pts: readonly Pt[]
}

/** 一块浮冰的轮廓：几道折断的直边 */
function floeShape(rng: Rng, x: number, y: number, r: number, stretch: number, ang: number): Pt[] {
  const n = 6 + Math.floor(rng.next() * 4)
  const ph = rng.next() * 6.28
  const pts: Pt[] = []
  for (let k = 0; k < n; k++) {
    const a = ph + ((k + (rng.next() - 0.5) * 0.5) / n) * Math.PI * 2
    const rr = r * (0.72 + rng.next() * 0.38)
    const lx = Math.cos(a) * rr * stretch
    const ly = Math.sin(a) * rr
    pts.push([x + lx * Math.cos(ang) - ly * Math.sin(ang), y + lx * Math.sin(ang) + ly * Math.cos(ang)])
  }
  return pts
}

function polyPath(ctx: Ctx, pts: readonly Pt[]): void {
  ctx.beginPath()
  ctx.moveTo(pts[0]![0], pts[0]![1])
  for (const q of pts) ctx.lineTo(q[0], q[1])
  ctx.closePath()
}

/** 画一块浮冰：水下一圈青绿的冰脚、背光一侧落在水上的影子，冰面积雪、露着发蓝的老冰，断口透着青光 */
function drawFloe(ctx: Ctx, rng: Rng, f: Floe, wind: number): void {
  ctx.save()
  polyPath(ctx, f.pts)
  ctx.lineJoin = 'round'
  ctx.lineWidth = Math.min(0.7, 0.25 + f.r * 0.2)
  ctx.strokeStyle = 'rgba(31,120,128,0.65)'
  ctx.stroke()
  ctx.translate(0.12, 0.1)
  polyPath(ctx, f.pts)
  ctx.fillStyle = 'rgba(4,16,22,0.5)'
  ctx.fill()
  ctx.restore()
  ctx.save()
  polyPath(ctx, f.pts)
  ctx.fillStyle = '#bdcfd9'
  ctx.fill()
  ctx.clip()
  // 发蓝的老冰露出来几块，积雪顺着风堆成一片片
  for (let k = 0; k < Math.max(1, Math.round(f.r * 1.5)); k++) {
    patch(ctx, blob(rng, f.x + (rng.next() - 0.5) * f.r * 1.4, f.y + (rng.next() - 0.5) * f.r * 1.2, f.r * (0.25 + rng.next() * 0.3), f.r * (0.18 + rng.next() * 0.2), 7, 0.3), '#7099ab', { alpha: 0.75 })
  }
  for (let k = 0; k < Math.max(1, Math.round(f.r * 2)); k++) {
    ctx.save()
    ctx.translate(f.x + (rng.next() - 0.5) * f.r * 1.2, f.y + (rng.next() - 0.5) * f.r * 1.0)
    ctx.rotate(wind)
    patch(ctx, blob(rng, 0, 0, f.r * (0.4 + rng.next() * 0.4), f.r * (0.22 + rng.next() * 0.15), 9, 0.2), '#f7f9fc', { shade: '#9cb4d0', cover: 0.2 })
    ctx.restore()
  }
  if (f.r > 1.2) {
    ctx.strokeStyle = 'rgba(232,240,245,0.8)'
    ctx.lineWidth = 0.025
    for (let k = 0; k < f.r * 3; k++) {
      let x = f.x + (rng.next() - 0.5) * f.r * 1.4
      let y = f.y + (rng.next() - 0.5) * f.r * 1.2
      ctx.beginPath()
      ctx.moveTo(x, y)
      for (let j = 0; j < 3; j++) {
        x += (rng.next() - 0.5) * 0.8
        y += (rng.next() - 0.5) * 0.8
        ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
  }
  // 冰边一圈湿冰发青
  polyPath(ctx, f.pts)
  ctx.lineWidth = 0.22
  ctx.strokeStyle = 'rgba(107,168,199,0.8)'
  ctx.stroke()
  ctx.restore()
  polyPath(ctx, f.pts)
  ctx.lineWidth = 0.04
  ctx.strokeStyle = LINE.winter
  ctx.stroke()
}

/**
 * 冬的第二个景：南极的冻海。深青黑的冷水，浪尖一道道白，一溜溜油脂似的薄冰顺着风；水面上漂着大大小小一块块分开的浮冰：
 * 冰山、冰脊、雪堆各自坐在一块大浮冰上，别处还有中的小的，离岸越远越大，冰与冰之间露着水；靠岸的地方是一片片荷叶冰
 */
const floe: Painter = (ctx, w, h, rng, env) => {
  const seed = rng.int(0, 1 << 20)
  const wind = windOf(rng)
  const b = env.blend
  field(ctx, w, h, 2, (x, y) => {
    const n = fbm(x * 0.18, y * 0.18, seed, 3)
    const swell = 0.5 + 0.5 * Math.sin((x * Math.cos(wind) + y * Math.sin(wind)) * 0.9 + n * 4)
    return mix(mix([8, 26, 34, 1], [26, 66, 78, 1], n), [36, 84, 96, 1], swell * 0.25)
  })
  ripples(ctx, rng, w, h, wind, 0.55, 'rgba(120,170,180,0.3)', 0.04, () => true)
  // 油脂冰：顺着风一溜溜发暗的平水
  for (let i = 0; i < 8; i++) {
    ctx.save()
    ctx.translate(rng.next() * w, rng.next() * h)
    ctx.rotate(wind)
    patch(ctx, blob(rng, 0, 0, 2 + rng.next() * 2.5, 0.3 + rng.next() * 0.3, 8, 0.3), '#1c2b30', { alpha: 0.5 })
    ctx.restore()
  }
  sow(rng, 140, w, h, () => 1, (x, y) => {
    ctx.beginPath()
    ctx.ellipse(x, y, 0.22, 0.04, wind, 0, 6.28)
    ctx.fillStyle = 'rgba(220,232,236,0.6)'
    ctx.fill()
  })
  // 浮冰：先给每件布景垫一块大的，再往空处撒中的小的，彼此不挨着
  const floes: Floe[] = []
  const free = (x: number, y: number, r: number): boolean => floes.every((f) => Math.hypot(f.x - x, f.y - y) > f.r + r + 0.35)
  for (const p of spots(env, ['berg', 'ridge', 'drift'])) {
    const r = Math.max(1.5, p.w * 0.62) + 0.5
    floes.push({ x: p.x, y: p.y - 0.4, r, pts: floeShape(rng, p.x, p.y - 0.4, r, 1.15, p.a) })
  }
  for (let t = 0; t < 900 && floes.length < 70; t++) {
    const x = rng.next() * w
    const y = rng.next() * h
    const d = env.sd(x, y) - b.band
    if (d < 0.6) continue
    const big = Math.min(1, d / 9)
    const r = 0.35 + rng.next() * rng.next() * (0.8 + 2.4 * big)
    if (!free(x, y, r)) continue
    floes.push({ x, y, r, pts: floeShape(rng, x, y, r, 1 + rng.next() * 0.5, rng.next() * 6.28) })
  }
  for (const f of floes) drawFloe(ctx, rng, f, wind)
  // 靠岸一带：荷叶冰，一个个圆盘，边上翻起一圈白
  sow(rng, 260, w, h, (x, y) => {
    const d = env.sd(x, y) - b.band
    return d > 0 && d < 3.5 && free(x, y, 0.2) ? 1 - d / 3.5 : 0
  }, (x, y) => {
    const r = 0.12 + rng.next() * 0.16
    ctx.beginPath()
    ctx.ellipse(x, y, r, r * 0.85, rng.next() * 3, 0, 6.28)
    ctx.fillStyle = '#9fbcc6'
    ctx.fill()
    ctx.lineWidth = 0.04
    ctx.strokeStyle = '#eef6f9'
    ctx.stroke()
  })
}

/**
 * 冬的接缝：火山与冻海之间一道黑玄武岩的岸，积着几块雪；熔岩淌到岸边落进海里，冒起一大团白汽，水面上一圈烫红；
 * 岸边别处也零星冒着汽
 */
const steamShore: Painter = (ctx, w, h, rng, env) => {
  const seed = rng.int(0, 1 << 20)
  field(ctx, w, h, 2, (x, y) => {
    const d = env.sd(x, y) + (valueNoise(x * 0.9, y * 0.9, seed) - 0.5) * 0.7
    const a = smooth(-1.05, -0.8, d) * (1 - smooth(0.55, 0.8, d))
    if (a <= 0) return null
    const t = valueNoise(x * 2, y * 2, seed + 1)
    const snow = smooth(0.64, 0.72, valueNoise(x * 0.8, y * 0.8, seed + 2)) * (1 - smooth(0.1, 0.3, d))
    return mix([24 + 16 * t, 26 + 16 * t, 30 + 16 * t, a], [232, 238, 246, a], snow)
  })
  for (const run of contour(env.blend, env.ox, env.oy, w, h, 0.55)) line(ctx, run, 'rgba(230,240,244,0.75)', 0.06, [0.3, 0.2])
  const puff = (px: number, py: number, r: number): void => {
    ctx.beginPath()
    ctx.arc(px, py, r, 0, 6.28)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.strokeStyle = '#8a9aa8'
    ctx.lineWidth = 0.03
    ctx.stroke()
  }
  for (const pts of env.lava) {
    const end = pts[pts.length - 1]!
    lavaFlow(ctx, rng, pts.slice(Math.max(0, pts.length - 6)), 0.75)
    const g = ctx.createRadialGradient(end[0], end[1], 0, end[0], end[1], 1.6)
    g.addColorStop(0, 'rgba(255,120,40,0.55)')
    g.addColorStop(1, 'rgba(255,120,40,0)')
    ctx.fillStyle = g
    ctx.fillRect(end[0] - 1.6, end[1] - 1.6, 3.2, 3.2)
    for (let k = 0; k < 9; k++) puff(end[0] + (rng.next() - 0.5) * 1.6, end[1] + (rng.next() - 0.5) * 1.2 - k * 0.1, 0.2 + rng.next() * 0.25)
  }
  along(contour(env.blend, env.ox, env.oy, w, h, 0.2), 2.4, (x, y) => {
    if (rng.next() < 0.5) return
    for (let k = 0; k < 3; k++) puff(x + (rng.next() - 0.5) * 0.6, y + (rng.next() - 0.5) * 0.4 - k * 0.12, 0.12 + rng.next() * 0.12)
  })
}

interface Season {
  readonly a: Painter
  readonly b: Painter
  /** 第二个景盖上来多少：0 是全露出第一个景 */
  readonly mask: (d: number) => number
  /** 界线上的抖动，格 */
  readonly wob: number
  readonly seam: Painter
}

const SEASONS: Record<ChapterKey, Season> = {
  spring: { a: meadow, b: garden, mask: (d) => smooth(-2.4, 2.4, d), wob: 1.4, seam: brook },
  summer: { a: desert, b: sea, mask: (d) => smooth(-0.05, 0.25, d), wob: 0, seam: shore },
  autumn: { a: geode, b: ruins, mask: (d) => smooth(-1.4, 1.4, d), wob: 1.1, seam: geodeRim },
  winter: { a: volcano, b: floe, mask: (d) => smooth(-0.3, 0.3, d), wob: 0.3, seam: steamShore },
}

/** 地布四周画的一道双线框，四角卷一个小涡 */
function frame(ctx: Ctx, x0: number, x1: number, h: number, color: string): void {
  for (const inset of [0.55, 0.72]) {
    ctx.strokeStyle = color
    ctx.lineWidth = inset === 0.55 ? 0.06 : 0.03
    ctx.strokeRect(x0 + inset, inset, x1 - x0 - inset * 2, h - inset * 2)
  }
  for (const [cx, cy, sx, sy] of [[x0 + 0.72, 0.72, 1, 1], [x1 - 0.72, 0.72, -1, 1], [x0 + 0.72, h - 0.72, 1, -1], [x1 - 0.72, h - 0.72, -1, -1]] as const) {
    ctx.beginPath()
    for (let k = 0; k <= 24; k++) {
      const a = (k / 24) * Math.PI * 2.2
      const r = 0.05 + k * 0.016
      const px = cx + sx * (0.32 + Math.cos(a) * r)
      const py = cy + sy * (0.32 + Math.sin(a) * r)
      if (k === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.lineWidth = 0.035
    ctx.stroke()
  }
}

/** 天幕上一季的天色：天顶、天边，远处的山、近一点的山 */
const SKY: Record<ChapterKey, { readonly top: string; readonly low: string; readonly far: string; readonly near: string }> = {
  spring: { top: '#9fd0ec', low: '#f8dfe6', far: '#b9d89a', near: '#86b865' },
  summer: { top: '#4f9fdc', low: '#bfe6f2', far: '#e9c98a', near: '#2f6a9a' },
  autumn: { top: '#e98a4a', low: '#f8d79a', far: '#c66a3a', near: '#8a4a2e' },
  winter: { top: '#6a83a8', low: '#dfe8f2', far: '#c9d6e3', near: '#163a48' },
}

/** 远远近近一道起伏的山脊，底下填满；返回山脊上的点 */
function ridge(ctx: Ctx, rng: Rng, w: number, base: number, amp: number, n: number, fill: string, line: string): Pt[] {
  const top: Pt[] = []
  for (let i = 0; i <= n; i++) top.push([(w * i) / n, base - amp * (0.4 + 0.6 * rng.next())])
  const pts: Pt[] = [[-1, base + 5], ...top, [w + 1, base + 5]]
  ctx.beginPath()
  smoothPath(ctx, pts)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.lineWidth = 0.05
  ctx.strokeStyle = line
  ctx.stroke()
  return top
}

function cloud(ctx: Ctx, x: number, y: number, s: number, line: string): void {
  ctx.beginPath()
  for (const [dx, dy, r] of [[-0.9, 0.15, 0.55], [-0.3, -0.2, 0.75], [0.45, -0.05, 0.65], [1.0, 0.2, 0.45]] as const) ctx.ellipse(x + dx * s, y + dy * s, r * s, r * s * 0.8, 0, 0, 6.28)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.lineWidth = 0.04
  ctx.strokeStyle = line
  ctx.stroke()
}

/** 天幕上的一棵树：一团圆圆的树冠 */
function puffTree(ctx: Ctx, x: number, y: number, r: number, fill: string, line: string): void {
  line2(ctx, [[x, y + r * 1.6], [x, y + r * 0.4]], '#6a4a30', r * 0.25)
  ctx.beginPath()
  ctx.arc(x, y, r, 0, 6.28)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.lineWidth = 0.04
  ctx.strokeStyle = line
  ctx.stroke()
}

/** 天幕上的一棵云杉：三层三角 */
function spruce(ctx: Ctx, x: number, y: number, s: number, fill: string, line: string): void {
  for (let k = 0; k < 3; k++) patch(ctx, [[x, y - s * (1.3 - k * 0.35)], [x + s * (0.35 + k * 0.12), y - s * (0.55 - k * 0.3)], [x - s * (0.35 + k * 0.12), y - s * (0.55 - k * 0.3)]], fill, { line, lw: 0.035 })
}

/**
 * 天幕：挂在台后的一大块画布，画着这一季的天和远处的景，上半截藏在帷幔后面，景都画在下半截——
 * 春天绿山一边是黑压压的云杉林、一边是开满樱花的山坡和寺院的瓦顶；夏天一边沙丘一边深蓝的海；
 * 秋天橘红的晚霞下满山红枫，山头一座塌了一半的塔楼，另一边一座黑岩山，洞口透出紫光；
 * 冬天一座积雪的火山正冒着烟、山口发红，另一边是黑青的冻海，海上漂着冰山；上边一根吊杆，下边一道压脚
 */
export function paintDrop(chapter: number, seed: number, w: number, h: number, canvas: HTMLCanvasElement): void {
  const ch = CHAPTERS[chapter]!
  const key = ch.key
  const S = SKY[key]
  const L = LINE[key]
  const k = PAINT_PPU / 2
  canvas.width = Math.round(w * k)
  canvas.height = Math.round(h * k)
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(k, 0, 0, k, 0, 0)
  const rng = new Rng(seed ^ 0xd209)
  const g = ctx.createLinearGradient(0, h * 0.3, 0, h)
  g.addColorStop(0, S.top)
  g.addColorStop(0.85, S.low)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = dots(ctx, S.top, 0.12)
  ctx.fillRect(0, 0, w, h * 0.6)
  const left = rng.next() < 0.5
  const side = (t: number): number => (left ? t : 1 - t) * w
  const sunX = side(0.55 + 0.3 * rng.next())
  if (key !== 'winter') {
    ctx.beginPath()
    ctx.arc(sunX, h * 0.6, key === 'autumn' ? 1.3 : 0.9, 0, 6.28)
    ctx.fillStyle = key === 'autumn' ? '#f6c060' : key === 'spring' ? '#fff3c4' : '#ffd84a'
    ctx.fill()
  }
  for (let i = 0; i < 4; i++) cloud(ctx, rng.next() * w, h * (0.55 + 0.12 * rng.next()), 0.5 + rng.next() * 0.4, key === 'autumn' ? '#c97a4a' : '#9ab3c8')
  if (key === 'spring') {
    const far = ridge(ctx, rng, w, h * 0.86, 1.8, 7, S.far, L)
    // 一边是黑压压的云杉林
    for (const [x, y] of far) {
      if ((left ? x / w : 1 - x / w) > 0.45) continue
      for (let j = 0; j < 3; j++) spruce(ctx, x + (j - 1) * 0.55 + (rng.next() - 0.5) * 0.3, y + 0.35 + rng.next() * 0.2, 0.75 + rng.next() * 0.3, '#2f5a4a', L)
    }
    // 一边是樱花山坡和寺院的瓦顶
    for (let i = 0; i < 12; i++) puffTree(ctx, side(0.55 + rng.next() * 0.45), h * (0.74 + rng.next() * 0.1), 0.45 + rng.next() * 0.25, pick(rng, ['#fcdae4', '#f6b4cc', '#f2a7c3']), L)
    const tx = side(0.72)
    patch(ctx, [[tx - 2, h * 0.86], [tx - 1.6, h * 0.78], [tx + 1.6, h * 0.78], [tx + 2, h * 0.86]], '#6d6f78', { line: L, lw: 0.04 })
    patch(ctx, [[tx - 1.5, h * 0.86], [tx + 1.5, h * 0.86], [tx + 1.5, h * 0.95], [tx - 1.5, h * 0.95]], '#f0e6cf', { line: L, lw: 0.04 })
    ridge(ctx, rng, w, h * 0.98, 0.5, 8, S.near, L)
    for (let i = 0; i < 50; i++) sakuraPetal(ctx, rng, side(0.4 + rng.next() * 0.6), h * (0.5 + rng.next() * 0.5), 0.07)
  } else if (key === 'summer') {
    // 一边是沙丘，一边是深蓝的海
    ctx.fillStyle = S.near
    ctx.fillRect(0, h * 0.78, w, h)
    for (let y = h * 0.81; y < h; y += 0.35) line(ctx, [[0, y], [w, y]], 'rgba(255,255,255,0.35)', 0.035, [0.3, 0.5], false)
    const dunes: Pt[] = left ? [[-1, h + 1], [-1, h * 0.62], [w * 0.2, h * 0.66], [w * 0.38, h * 0.8], [w * 0.47, h + 1]] : [[w + 1, h + 1], [w + 1, h * 0.62], [w * 0.8, h * 0.66], [w * 0.62, h * 0.8], [w * 0.53, h + 1]]
    patch(ctx, dunes, S.far, { shade: '#c99a50', cover: 0.2, line: L, lw: 0.05 })
    const cx = side(0.2)
    line2(ctx, [[cx, h * 0.86], [cx, h * 0.7]], '#2e4e26', 0.3)
    line2(ctx, [[cx, h * 0.78], [cx + 0.45, h * 0.78], [cx + 0.45, h * 0.7]], '#2e4e26', 0.18)
  } else if (key === 'autumn') {
    const far = ridge(ctx, rng, w, h * 0.84, 2, 6, S.far, L)
    // 满山红枫
    for (const [x, y] of far) for (let j = 0; j < 4; j++) puffTree(ctx, x + (rng.next() - 0.5) * 2.4, y + 0.3 + rng.next() * 0.9, 0.4 + rng.next() * 0.25, pick(rng, ['#e63c22', '#f06224', '#d62a2e', '#f48628']), L)
    // 山头一座塌了一半的塔楼
    const tx = side(0.7)
    patch(ctx, [[tx - 0.8, h * 0.8], [tx - 0.8, h * 0.56], [tx - 0.5, h * 0.56], [tx - 0.5, h * 0.53], [tx - 0.2, h * 0.53], [tx - 0.2, h * 0.58], [tx + 0.3, h * 0.6], [tx + 0.8, h * 0.66], [tx + 0.8, h * 0.8]], '#9a9ea4', { line: L, lw: 0.04 })
    patch(ctx, [[tx - 0.2, h * 0.62], [tx, h * 0.62], [tx, h * 0.68], [tx - 0.2, h * 0.68]], '#2a2220', {})
    // 另一边一座黑岩山，洞口透着紫光
    const cx = side(0.16)
    patch(ctx, [[cx - 3, h + 1], [cx - 2.2, h * 0.7], [cx - 0.6, h * 0.58], [cx + 1, h * 0.64], [cx + 2.4, h * 0.8], [cx + 3, h + 1]], '#3a2a46', { line: L, lw: 0.05 })
    patch(ctx, [[cx - 0.9, h * 0.98], [cx - 0.7, h * 0.82], [cx, h * 0.76], [cx + 0.7, h * 0.82], [cx + 0.9, h * 0.98]], '#9a6ae0', { line: '#2a1238', lw: 0.04 })
    for (let i = 0; i < 6; i++) glint(ctx, cx + (rng.next() - 0.5) * 1.3, h * (0.8 + rng.next() * 0.15), 0.12, '#efe2ff')
    ridge(ctx, rng, w, h * 0.99, 0.4, 8, S.near, L)
    for (let i = 0; i < 40; i++) {
      ctx.save()
      ctx.translate(rng.next() * w, h * (0.5 + rng.next() * 0.5))
      ctx.rotate(rng.next() * 6.28)
      mapleLeaf(ctx, 0.12, pick(rng, FALL_LEAF), 0.02)
      ctx.restore()
    }
  } else {
    // 一边是黑青的冻海，海上漂着冰山；一边是积雪的火山，山口发红，灰烟一柱顺风斜过去
    ctx.fillStyle = S.near
    ctx.fillRect(0, h * 0.8, w, h)
    for (let y = h * 0.83; y < h; y += 0.3) line(ctx, [[0, y], [w, y]], 'rgba(200,225,235,0.3)', 0.03, [0.3, 0.6], false)
    for (let i = 0; i < 5; i++) {
      const x = side(0.45 + rng.next() * 0.55)
      const s = 0.4 + rng.next() * 0.7
      patch(ctx, [[x - s * 1.4, h * 0.82], [x - s * 0.5, h * 0.82 - s * 1.1], [x + s * 0.2, h * 0.82 - s * 0.7], [x + s * 0.8, h * 0.82 - s * 1.3], [x + s * 1.5, h * 0.82]], '#eef6fb', { shade: '#6fa6c8', cover: 0.35, line: L, lw: 0.04 })
    }
    const vx = side(0.22)
    for (let i = 0; i < 7; i++) {
      ctx.beginPath()
      ctx.ellipse(vx + i * i * 0.12 + i * 0.3, h * (0.48 - i * 0.05), 0.5 + i * 0.25, 0.35 + i * 0.12, 0, 0, 6.28)
      ctx.fillStyle = i < 2 ? '#5f6367' : 'rgba(140,144,148,0.85)'
      ctx.fill()
    }
    patch(ctx, [[vx - 5, h * 1.02], [vx - 0.7, h * 0.52], [vx + 0.7, h * 0.52], [vx + 5, h * 1.02]], '#56423a', { line: L, lw: 0.05 })
    patch(ctx, [[vx - 2.6, h * 0.78], [vx - 0.7, h * 0.52], [vx + 0.7, h * 0.52], [vx + 2.6, h * 0.78], [vx + 1.4, h * 0.72], [vx + 0.4, h * 0.8], [vx - 0.6, h * 0.71], [vx - 1.5, h * 0.79]], '#eef2f8', { shade: '#8a9cc0', cover: 0.3 })
    line(ctx, [[vx - 0.3, h * 0.53], [vx - 0.6, h * 0.66], [vx - 0.4, h * 0.8], [vx - 0.9, h * 0.95]], '#ff7814', 0.16)
    ctx.beginPath()
    ctx.ellipse(vx, h * 0.52, 0.7, 0.12, 0, 0, 6.28)
    ctx.fillStyle = '#ffad33'
    ctx.fill()
    for (let i = 0; i < 70; i++) {
      ctx.beginPath()
      ctx.arc(rng.next() * w, rng.next() * h, 0.04 + rng.next() * 0.05, 0, 6.28)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
    }
  }
  // 画布的褶：几道竖着的淡影；上边的吊杆，下边的压脚
  for (let x = 2; x < w; x += 3.4) {
    const gr = ctx.createLinearGradient(x - 0.8, 0, x + 0.8, 0)
    gr.addColorStop(0, 'rgba(0,0,0,0)')
    gr.addColorStop(0.5, 'rgba(40,20,10,0.08)')
    gr.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = gr
    ctx.fillRect(x - 0.8, 0, 1.6, h)
  }
  ctx.fillStyle = '#5a3a24'
  ctx.fillRect(0, 0, w, 0.3)
  ctx.fillStyle = 'rgba(40,20,10,0.35)'
  ctx.fillRect(0, h - 0.25, w, 0.25)
}

/** 台框上挂的帷幔连垂下来的弧多高、上面的平幔多高、一个弧多宽，格；两边大幕从台边往里盖住多少、外边留出台框金柱多宽、一道褶多宽，格 */
const VALANCE_U = 5.4
const HEAD_U = 3.3
const SWAG_U = 4.6
const DRAPE_IN_U = 0.45
const PILLAR_U = 1.3
const FOLD_U = 0.9

/**
 * 台框前挂着的东西，盖在地布、天幕上面：legs 是台两边的红丝绒大幕，从台框的金柱一直垂到台边，压住地布与天幕的两边，
 * 一道道竖褶，靠台的一边镶金边、往台上投影子——推景时新景从右边大幕后面推出来，旧景推进左边大幕后面；
 * valance 是顶上一道红丝绒帷幔，一个个弧垂下来，镶金穗子，吊上去的布景收进它后面
 */
export function paintMasking(stage: Stage, size: number, part: 'legs' | 'valance', canvas: HTMLCanvasElement): void {
  const k = PAINT_PPU / 2
  canvas.width = Math.round(size * k)
  canvas.height = Math.round(size * k)
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(k, 0, 0, k, 0, 0)
  const bottom = stage.y1 + 2.3
  for (const side of part === 'legs' ? [-1, 1] : []) {
    const edge = side < 0 ? stage.x0 + DRAPE_IN_U : stage.x1 - DRAPE_IN_U
    const outer = side < 0 ? PILLAR_U : size - PILLAR_U
    const x0 = Math.min(edge, outer)
    const w = Math.abs(edge - outer)
    // 往台上投的影子
    const sh = ctx.createLinearGradient(edge, 0, edge - side * 1.4, 0)
    sh.addColorStop(0, 'rgba(30,4,8,0.5)')
    sh.addColorStop(1, 'rgba(30,4,8,0)')
    ctx.fillStyle = sh
    ctx.fillRect(side < 0 ? edge : edge - 1.4, VALANCE_U * 0.6, 1.4, bottom - VALANCE_U * 0.6)
    // 一道道竖褶：亮的褶脊、暗的褶沟
    const g = ctx.createLinearGradient(x0, 0, x0 + w, 0)
    const n = Math.max(2, Math.round(w / FOLD_U))
    for (let f = 0; f <= n * 2; f++) g.addColorStop(f / (n * 2), f % 2 === 0 ? '#6a0a14' : '#c4283a')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(x0, 0)
    ctx.lineTo(x0 + w, 0)
    ctx.lineTo(x0 + w, bottom)
    // 下摆拖在台口上，微微起伏
    for (let f = n; f >= 0; f--) ctx.lineTo(x0 + (w * f) / n, bottom + (f % 2 === 0 ? 0.25 : 0))
    ctx.closePath()
    ctx.fill()
    // 上头压暗一点，像是从台框里垂下来
    const top = ctx.createLinearGradient(0, 0, 0, VALANCE_U * 2)
    top.addColorStop(0, 'rgba(20,0,4,0.45)')
    top.addColorStop(1, 'rgba(20,0,4,0)')
    ctx.fillStyle = top
    ctx.fillRect(x0, 0, w, VALANCE_U * 2)
    // 靠台的一边：金边与流苏
    ctx.fillStyle = '#e2b25a'
    ctx.fillRect(side < 0 ? edge - 0.16 : edge, 0, 0.16, bottom)
    ctx.strokeStyle = '#e2b25a'
    ctx.lineWidth = 0.05
    ctx.beginPath()
    for (let y = 0.3; y < bottom; y += 0.22) {
      ctx.moveTo(edge, y)
      ctx.lineTo(edge + side * 0.18, y + 0.1)
    }
    ctx.stroke()
  }
  if (part === 'legs') return
  // 帷幔：上面一道打褶的平幔压住天幕的上半，底下一道金边与流苏，再往下一个个弧垂下来，弧与弧之间挂着金穗子
  const left = PILLAR_U
  const right = size - PILLAR_U
  const pleat = ctx.createLinearGradient(left, 0, right, 0)
  const pn = Math.round((right - left) / 0.7)
  for (let f = 0; f <= pn; f++) pleat.addColorStop(f / pn, f % 2 === 0 ? '#7a0e18' : '#a8182a')
  ctx.fillStyle = pleat
  ctx.fillRect(left, 0, right - left, HEAD_U)
  const shade = ctx.createLinearGradient(0, 0, 0, HEAD_U)
  shade.addColorStop(0, 'rgba(20,0,4,0.55)')
  shade.addColorStop(0.5, 'rgba(20,0,4,0)')
  shade.addColorStop(1, 'rgba(20,0,4,0.25)')
  ctx.fillStyle = shade
  ctx.fillRect(left, 0, right - left, HEAD_U)
  const n = Math.max(3, Math.round((right - left) / SWAG_U))
  const sw = (right - left) / n
  const y0 = HEAD_U - 0.3
  for (let i = 0; i < n; i++) {
    const a = left + i * sw
    const gr = ctx.createLinearGradient(0, y0, 0, VALANCE_U)
    gr.addColorStop(0, '#a3182a')
    gr.addColorStop(0.7, '#c4283a')
    gr.addColorStop(1, '#6e0c16')
    ctx.beginPath()
    ctx.moveTo(a, y0)
    ctx.lineTo(a + sw, y0)
    ctx.quadraticCurveTo(a + sw / 2, VALANCE_U + (VALANCE_U - y0) * 0.6, a, y0)
    ctx.closePath()
    ctx.fillStyle = gr
    ctx.fill()
    for (let f = 1; f < 4; f++) {
      ctx.beginPath()
      ctx.moveTo(a + sw * 0.08 * f, y0)
      ctx.quadraticCurveTo(a + sw / 2, y0 + (VALANCE_U - y0) * (0.35 + 0.3 * f), a + sw * (1 - 0.08 * f), y0)
      ctx.lineWidth = 0.07
      ctx.strokeStyle = 'rgba(60,4,10,0.5)'
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.moveTo(a, y0)
    ctx.quadraticCurveTo(a + sw / 2, VALANCE_U + (VALANCE_U - y0) * 0.6, a + sw, y0)
    ctx.lineWidth = 0.18
    ctx.setLineDash([0.08, 0.06])
    ctx.strokeStyle = '#e2b25a'
    ctx.stroke()
    ctx.setLineDash([])
  }
  // 平幔底边的金边与一排短流苏
  ctx.fillStyle = '#e2b25a'
  ctx.fillRect(left, HEAD_U - 0.42, right - left, 0.2)
  ctx.fillRect(left, 0, right - left, 0.22)
  ctx.strokeStyle = '#c8963e'
  ctx.lineWidth = 0.05
  ctx.beginPath()
  for (let x = left; x < right; x += 0.16) {
    ctx.moveTo(x, HEAD_U - 0.22)
    ctx.lineTo(x, HEAD_U - 0.02)
  }
  ctx.stroke()
  // 金穗子：一根绳，一个结，一把穗
  for (let i = 0; i <= n; i++) {
    const x = left + i * sw
    ctx.strokeStyle = '#e2b25a'
    ctx.lineWidth = 0.06
    ctx.beginPath()
    ctx.moveTo(x, y0)
    ctx.lineTo(x, y0 + 0.9)
    ctx.stroke()
    ctx.beginPath()
    ctx.ellipse(x, y0 + 1, 0.2, 0.2, 0, 0, 6.28)
    ctx.fillStyle = '#e2b25a'
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(x - 0.12, y0 + 1.1)
    ctx.lineTo(x - 0.24, y0 + 1.9)
    ctx.lineTo(x + 0.24, y0 + 1.9)
    ctx.lineTo(x + 0.12, y0 + 1.1)
    ctx.closePath()
    ctx.fillStyle = '#c8963e'
    ctx.fill()
    ctx.strokeStyle = '#8a5a1a'
    ctx.lineWidth = 0.03
    ctx.beginPath()
    for (let k = -2; k <= 2; k++) {
      ctx.moveTo(x + k * 0.04, y0 + 1.15)
      ctx.lineTo(x + k * 0.09, y0 + 1.88)
    }
    ctx.stroke()
  }
}

/** 白色聚光灯的光斑：中间发白，往外软软地淡掉 */
export function paintSpot(n: number, canvas: HTMLCanvasElement): void {
  canvas.width = n
  canvas.height = n
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2)
  g.addColorStop(0, 'rgba(255,255,250,1)')
  g.addColorStop(0.45, 'rgba(255,254,244,0.92)')
  g.addColorStop(0.8, 'rgba(255,250,232,0.35)')
  g.addColorStop(1, 'rgba(255,250,232,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, n, n)
}

/**
 * 一幕的地布：白底上的颜料，乘到粗布上就是画上去的样子。插画平涂、偏一点套版、网点压暗、描墨线；
 * 两个景各画一张，第二个景按界线淡进来，再画上连着两个景的东西；四周一道双线框
 */
export function paintFloor(act: Act, stage: Stage, canvas: HTMLCanvasElement): void {
  const w = stage.x1 - stage.x0
  const h = stage.y1 - stage.y0
  const W = Math.round(w * PAINT_PPU)
  const H = Math.round(h * PAINT_PPU)
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const key = CHAPTERS[act.chapter]!.key
  const S = SEASONS[key]
  const sd: Sd = (x, y) => blendSd(act.blend, x + stage.x0, y + stage.y0)
  const seed = act.seed ^ 0x9a1e7
  const base = { sd, blend: act.blend, ox: stage.x0, oy: stage.y0, pieces: act.pieces, lava: [] }
  const env: Env = key === 'winter' ? { ...base, lava: lavaPaths(sd, spots(base, ['cone'])[0], w, h, new Rng(seed ^ 0x1a4a)) } : base
  ctx.setTransform(PAINT_PPU, 0, 0, PAINT_PPU, 0, 0)
  S.a(ctx, w, h, new Rng(seed), env)
  const top = Object.assign(document.createElement('canvas'), { width: W, height: H })
  const tc = top.getContext('2d')!
  tc.setTransform(PAINT_PPU, 0, 0, PAINT_PPU, 0, 0)
  S.b(tc, w, h, new Rng(seed ^ 0x51a7), env)
  // 第二个景只留界线这边的：按离界线的远近淡出，界线随噪声抖一抖
  const m = document.createElement('canvas')
  const mc = m.getContext('2d')!
  m.width = W
  m.height = H
  const ms = (act.seed >>> 3) & 0xffff
  field(mc, w, h, 2, (x, y) => [0, 0, 0, S.mask(sd(x, y) + (fbm(x * 0.35, y * 0.35, ms, 2) - 0.5) * 2 * S.wob)])
  tc.setTransform(1, 0, 0, 1, 0, 0)
  tc.globalCompositeOperation = 'destination-in'
  tc.drawImage(m, 0, 0, W, H)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.drawImage(top, 0, 0)
  ctx.setTransform(PAINT_PPU, 0, 0, PAINT_PPU, 0, 0)
  S.seam(ctx, w, h, new Rng(seed ^ 0x2c3), env)
  frame(ctx, 0, w, h, LINE[key])
}
