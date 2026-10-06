import { cellEdge, fbm, valueNoise } from '../../util/noise'
import { Rng } from '../../util/rng'
import { INK, smoothPath } from './art'
import { blendSd, CHAPTERS } from './model'
import type { Blend, Stage, ChapterKey, Act } from './model'

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

function flower(ctx: Ctx, x: number, y: number, s: number, petal: string): void {
  ctx.fillStyle = petal
  for (let k = 0; k < 5; k++) {
    ctx.beginPath()
    ctx.arc(x + Math.cos((k / 5) * 6.28) * s, y + Math.sin((k / 5) * 6.28) * s, s * 0.75, 0, 6.28)
    ctx.fill()
  }
  ctx.beginPath()
  ctx.arc(x, y, s * 0.55, 0, 6.28)
  ctx.fillStyle = INK.gold
  ctx.fill()
}

function tuft(ctx: Ctx, x: number, y: number, s: number, color: string): void {
  for (const a of [-0.5, 0, 0.5]) line(ctx, [[x, y], [x + Math.sin(a) * s, y - Math.cos(a) * s]], color, 0.05, [], false)
}

/** 随机撒 n 个点，躲开 avoid 返回真的地方 */
function scatter(rng: Rng, n: number, w: number, h: number, each: (x: number, y: number, i: number) => void): void {
  for (let i = 0; i < n; i++) each(0.6 + rng.next() * (w - 1.2), 0.6 + rng.next() * (h - 1.2), i)
}

type Rgba = readonly [number, number, number, number]
/** 一幕地布上的一处离两个景的分界多远，格：第一个景那边为负 */
type Sd = (x: number, y: number) => number
type Painter = (ctx: Ctx, w: number, h: number, rng: Rng, sd: Sd) => void

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

function petal(ctx: Ctx, rng: Rng, x: number, y: number, s: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rng.next() * 6.28)
  ctx.beginPath()
  ctx.ellipse(0, 0, s, s * 0.6, 0, 0, 6.28)
  ctx.fillStyle = pick(rng, ['#f2a7bd', '#f7c6d3', '#ec8fac'])
  ctx.fill()
  ctx.restore()
}

/** 一片落叶：五个尖的枫叶或一片椭圆的叶 */
function leaf(ctx: Ctx, rng: Rng, x: number, y: number, s: number, line: string): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rng.next() * 6.28)
  ctx.beginPath()
  if (rng.next() < 0.6) {
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 - Math.PI / 2
      const r = k % 2 === 0 ? s : s * 0.45
      if (k === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r)
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    }
    ctx.closePath()
  } else ctx.ellipse(0, 0, s, s * 0.5, 0, 0, 6.28)
  ctx.fillStyle = pick(rng, ['#d9502e', '#e8892c', '#e9b632', '#b8332a'])
  ctx.fill()
  ctx.lineWidth = 0.025
  ctx.strokeStyle = line
  ctx.stroke()
  ctx.restore()
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

/** 春的第一个景：草甸 */
const meadow: Painter = (ctx, w, h, rng) => {
  ctx.fillStyle = '#e0edbf'
  ctx.fillRect(0, 0, w, h)
  for (let i = 0; i < 16; i++) patch(ctx, blob(rng, rng.next() * w, rng.next() * h, 2 + rng.next() * 4, 1.5 + rng.next() * 3), '#a9c97e', { alpha: 0.5, shade: '#4f7a3a', cover: 0.16 })
  scatter(rng, 26, w, h, (x, y) => {
    ctx.fillStyle = '#7fae55'
    for (let k = 0; k < 3; k++) {
      ctx.beginPath()
      ctx.arc(x + Math.cos(k * 2.09) * 0.09, y + Math.sin(k * 2.09) * 0.09, 0.08, 0, 6.28)
      ctx.fill()
    }
  })
  scatter(rng, 130, w, h, (x, y) => tuft(ctx, x, y, 0.2 + rng.next() * 0.14, rng.next() < 0.5 ? '#4f7a3a' : '#2f3a26'))
  scatter(rng, 70, w, h, (x, y) => flower(ctx, x, y, 0.07 + rng.next() * 0.04, pick(rng, ['#ffffff', '#f6d36b', '#9fc4ec'])))
  scatter(rng, 10, w, h, (x, y) => {
    ctx.strokeStyle = '#8a8a7a'
    ctx.lineWidth = 0.02
    ctx.beginPath()
    for (let k = 0; k < 12; k++) {
      ctx.moveTo(x, y)
      ctx.lineTo(x + Math.cos(k * 0.52) * 0.16, y + Math.sin(k * 0.52) * 0.16)
    }
    ctx.stroke()
  })
}

/** 春的第二个景：樱花庭院 */
const garden: Painter = (ctx, w, h, rng, sd) => {
  ctx.fillStyle = '#f6e6e2'
  ctx.fillRect(0, 0, w, h)
  for (let i = 0; i < 12; i++) patch(ctx, blob(rng, rng.next() * w, rng.next() * h, 1.6 + rng.next() * 3, 1.2 + rng.next() * 2), '#cfe0b0', { alpha: 0.6, shade: '#7fa65a', cover: 0.14 })
  // 耙过的白沙：一块里一两块石头，沙纹一圈圈绕着石头
  for (let i = 0; i < 4; i++) {
    const cx = 2 + rng.next() * (w - 4)
    const cy = 2 + rng.next() * (h - 4)
    if (sd(cx, cy) < 3) continue
    const outline = blob(rng, cx, cy, 2.4 + rng.next(), 1.6 + rng.next() * 0.8, 9, 0.12)
    patch(ctx, outline, '#efe9de', { line: '#9b8f80', lw: 0.04 })
    ctx.save()
    ctx.beginPath()
    smoothPath(ctx, outline)
    ctx.clip()
    ctx.strokeStyle = '#b9ae9e'
    ctx.lineWidth = 0.03
    for (let y = cy - 4; y < cy + 4; y += 0.2) {
      ctx.beginPath()
      ctx.moveTo(cx - 5, y)
      ctx.lineTo(cx + 5, y)
      ctx.stroke()
    }
    const rx = cx + (rng.next() - 0.5) * 1.2
    const ry = cy + (rng.next() - 0.5) * 0.6
    ctx.fillStyle = '#efe9de'
    ctx.beginPath()
    ctx.arc(rx, ry, 0.95, 0, 6.28)
    ctx.fill()
    for (let r = 0.45; r < 1; r += 0.2) {
      ctx.beginPath()
      ctx.arc(rx, ry, r, 0, 6.28)
      ctx.stroke()
    }
    ctx.restore()
    stone(ctx, rng, rx, ry, 0.38, '#a7a0b8', '#4a4458')
  }
  // 一串踏脚石
  let x = rng.next() * w
  let y = rng.next() * h
  let a = rng.next() * 6.28
  for (let k = 0; k < 14; k++) {
    stone(ctx, rng, x, y, 0.28, '#dcd5ca', '#6f6658')
    a += (rng.next() - 0.5) * 0.7
    x += Math.cos(a) * 0.75
    y += Math.sin(a) * 0.75
  }
  scatter(rng, 170, w, h, (px, py) => petal(ctx, rng, px, py, 0.09 + rng.next() * 0.04))
}

/** 春的接缝：一条小溪从草地流过界线，进了院子里的小池塘；过界的地方架一座红木小桥，界线两边花瓣与草混着 */
const brook = (ctx: Ctx, w: number, h: number, rng: Rng, sd: Sd, b: Blend, ox: number, oy: number): void => {
  const tx = -b.ny
  const ty = b.nx
  let pond: Pt | null = null
  let start: Pt = [0, 0]
  for (let t = 0; t < 24 && !pond; t++) {
    const s = (rng.next() - 0.5) * 10
    const d = -b.amp * Math.sin((s / b.waveU) * Math.PI * 2 + b.phase)
    const p: Pt = [b.cx + tx * s + b.nx * d - ox, b.cy + ty * s + b.ny * d - oy]
    const reach = 4.5 + t * 0.05
    const q: Pt = [p[0] + b.nx * reach, p[1] + b.ny * reach]
    if (q[0] < 3 || q[0] > w - 3 || q[1] < 2.6 || q[1] > h - 2.6) continue
    let u = 0
    while (u < 40 && p[0] - b.nx * u > -1 && p[0] - b.nx * u < w + 1 && p[1] - b.ny * u > -1 && p[1] - b.ny * u < h + 1) u += 0.5
    if (u < 3) continue
    pond = q
    start = [p[0] - b.nx * u, p[1] - b.ny * u]
  }
  if (pond) {
    const P = pond
    const mid = meander(rng, start, P, Math.max(3, Math.round(Math.hypot(P[0] - start[0], P[1] - start[1]) / 2.2)), 0.9)
    band(ctx, mid, 0.95, '#a9d4e6', '#2d5a74', { shade: '#5b93b5' })
    const water = blob(rng, P[0], P[1], 2.2, 1.6, 10, 0.14)
    patch(ctx, water, '#a9d4e6', { shade: '#4d88ad', cover: 0.3, line: '#2d5a74', lw: 0.05 })
    for (let i = 0; i < 4; i++) {
      const lx = P[0] + (rng.next() - 0.5) * 2.6
      const ly = P[1] + (rng.next() - 0.5) * 1.6
      ctx.beginPath()
      ctx.moveTo(lx, ly)
      ctx.arc(lx, ly, 0.22, 0.4, 6.0)
      ctx.closePath()
      ctx.fillStyle = '#7fae55'
      ctx.fill()
      ctx.strokeStyle = '#2f3a26'
      ctx.lineWidth = 0.03
      ctx.stroke()
    }
    for (let i = 0; i < 3; i++) {
      const kx = P[0] + (rng.next() - 0.5) * 2
      const ky = P[1] + (rng.next() - 0.5) * 1
      ctx.save()
      ctx.translate(kx, ky)
      ctx.rotate(rng.next() * 6.28)
      patch(ctx, [[-0.26, 0], [-0.05, -0.1], [0.2, 0], [-0.05, 0.1]], i === 1 ? '#ffffff' : '#e8892c', { line: '#7a3a14', lw: 0.025 })
      patch(ctx, [[-0.26, 0], [-0.38, -0.09], [-0.38, 0.09]], '#e8892c', { line: '#7a3a14', lw: 0.02 })
      ctx.restore()
    }
    for (let i = 0; i < 26; i++) {
      const q = mid[Math.floor(mid.length / 2 + rng.next() * (mid.length / 2 - 1))]!
      petal(ctx, rng, q[0] + (rng.next() - 0.5) * 0.6, q[1] + (rng.next() - 0.5) * 0.6, 0.08)
    }
    for (let i = 0; i < 14; i++) petal(ctx, rng, P[0] + (rng.next() - 0.5) * 3.4, P[1] + (rng.next() - 0.5) * 2.4, 0.08)
    // 桥架在溪水过界的地方，横跨水面
    let best = 0
    for (let i = 1; i < mid.length; i++) if (Math.abs(sd(mid[i]![0], mid[i]![1])) < Math.abs(sd(mid[best]![0], mid[best]![1]))) best = i
    const q0 = mid[Math.max(0, best - 1)]!
    const q1 = mid[Math.min(mid.length - 1, best + 1)]!
    const cx = mid[best]![0]
    const cy = mid[best]![1]
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(Math.atan2(q1[1] - q0[1], q1[0] - q0[0]))
    patch(ctx, [[-0.42, -0.95], [0.42, -0.95], [0.42, 0.95], [-0.42, 0.95]], '#e0b48a', { line: '#4f321d', lw: 0.04 })
    ctx.strokeStyle = '#8a5a35'
    ctx.lineWidth = 0.025
    for (let v = -0.8; v < 0.9; v += 0.2) {
      ctx.beginPath()
      ctx.moveTo(-0.38, v)
      ctx.lineTo(0.38, v)
      ctx.stroke()
    }
    for (const s of [-0.46, 0.46]) {
      patch(ctx, [[s - 0.07, -1.05], [s + 0.07, -1.05], [s + 0.07, 1.05], [s - 0.07, 1.05]], '#c8433a', { line: '#4f1a14', lw: 0.03 })
      for (const v of [-1.05, 0, 1.05]) {
        ctx.beginPath()
        ctx.arc(s, v, 0.1, 0, 6.28)
        ctx.fillStyle = '#c8433a'
        ctx.fill()
        ctx.stroke()
      }
    }
    ctx.restore()
  }
  sow(rng, 160, w, h, (x, y) => (sd(x, y) < 0 && sd(x, y) > -4.5 ? 1 + sd(x, y) / 4.5 : 0), (x, y) => petal(ctx, rng, x, y, 0.08))
  sow(rng, 90, w, h, (x, y) => (sd(x, y) > 0 && sd(x, y) < 3.5 ? 1 - sd(x, y) / 3.5 : 0), (x, y) => tuft(ctx, x, y, 0.2, '#4f7a3a'))
}

/** 夏的第一个景：沙漠 */
const desert: Painter = (ctx, w, h, rng) => {
  ctx.fillStyle = '#f1d79c'
  ctx.fillRect(0, 0, w, h)
  for (let i = 0; i < 9; i++) patch(ctx, blob(rng, rng.next() * w, rng.next() * h, 3 + rng.next() * 4, 1.4 + rng.next() * 1.6, 7, 0.25), '#e6c27a', { alpha: 0.7, shade: '#c99a50', cover: 0.2 })
  const ang = rng.next() * 6.28
  ripples(ctx, rng, w, h, ang, 0.55, '#cfa45a', 0.05, () => true)
  scatter(rng, 40, w, h, (x, y) => stone(ctx, rng, x, y, 0.08 + rng.next() * 0.07, '#c8a879', '#6f5530'))
  scatter(rng, 14, w, h, (x, y) => tuft(ctx, x, y, 0.22, '#9a7a3a'))
}

/** 夏的第二个景：海，越往外越深，按深浅分成一圈圈色带 */
const sea: Painter = (ctx, w, h, rng, sd) => {
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
const shore = (ctx: Ctx, w: number, h: number, rng: Rng, sd: Sd, b: Blend, ox: number, oy: number): void => {
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

/** 秋的第一个景：溶洞的地面（圈里） */
const cavern: Painter = (ctx, w, h, rng) => {
  ctx.fillStyle = '#b4adbf'
  ctx.fillRect(0, 0, w, h)
  for (let i = 0; i < 14; i++) patch(ctx, blob(rng, rng.next() * w, rng.next() * h, 1.5 + rng.next() * 3, 1.2 + rng.next() * 2, 8, 0.3), '#948ca3', { alpha: 0.65, shade: '#5f5872', cover: 0.22 })
  scatter(rng, 7, w, h, (x, y) => {
    const pool = blob(rng, x, y, 0.8 + rng.next() * 0.8, 0.5 + rng.next() * 0.4, 8, 0.2)
    patch(ctx, pool, '#8fbfcf', { shade: '#4d7d9a', cover: 0.25, line: '#3a3450', lw: 0.04 })
    line(ctx, [[x - 0.3, y - 0.1], [x + 0.1, y - 0.1]], '#ffffff', 0.05, [], false)
  })
  // 石笋从上面看：一圈套一圈
  scatter(rng, 18, w, h, (x, y) => {
    const r = 0.18 + rng.next() * 0.2
    for (const [k, c] of [[1, '#a39bb2'], [0.6, '#c3bccf'], [0.25, '#ddd8e4']] as const) {
      ctx.beginPath()
      ctx.arc(x, y, r * k, 0, 6.28)
      ctx.fillStyle = c
      ctx.fill()
      ctx.strokeStyle = '#3a3450'
      ctx.lineWidth = 0.025
      ctx.stroke()
    }
  })
  scatter(rng, 9, w, h, (x, y) => {
    for (let k = 0; k < 4; k++) {
      const a = rng.next() * 6.28
      const l = 0.18 + rng.next() * 0.16
      ctx.save()
      ctx.translate(x + Math.cos(a) * 0.12, y + Math.sin(a) * 0.12)
      ctx.rotate(a)
      patch(ctx, [[0, -0.06], [l, 0], [0, 0.06], [-0.04, 0]], pick(rng, ['#9ad7e0', '#c8a6e8', '#b8e8d8']), { line: '#3a3450', lw: 0.025 })
      ctx.restore()
    }
  })
  scatter(rng, 50, w, h, (x, y) => {
    ctx.beginPath()
    ctx.arc(x, y, 0.035, 0, 6.28)
    ctx.fillStyle = '#ecf6c8'
    ctx.fill()
  })
}

/** 秋的第二个景：落满红叶的旧城址 */
const ruins: Painter = (ctx, w, h, rng) => {
  ctx.fillStyle = '#f2dcb0'
  ctx.fillRect(0, 0, w, h)
  for (let i = 0; i < 12; i++) patch(ctx, blob(rng, rng.next() * w, rng.next() * h, 2 + rng.next() * 3.5, 1.4 + rng.next() * 2.4), '#d9c48a', { alpha: 0.6, shade: '#a8833a', cover: 0.16 })
  // 旧院子的石板地：一块块不规则的方石，缺了几块
  for (let i = 0; i < 3; i++) {
    const cx = 3 + rng.next() * (w - 6)
    const cy = 3 + rng.next() * (h - 6)
    const out = blob(rng, cx, cy, 2.4 + rng.next() * 1.4, 1.8 + rng.next() * 1, 9, 0.22)
    ctx.save()
    ctx.beginPath()
    smoothPath(ctx, out)
    ctx.clip()
    for (let y = cy - 4; y < cy + 4; y += 0.6) {
      const off = (Math.round(y / 0.6) % 2) * 0.35
      for (let x = cx - 5 + off; x < cx + 5; x += 0.72) {
        if (rng.next() < 0.15) continue
        ctx.beginPath()
        ctx.roundRect(x + 0.04, y + 0.04, 0.64, 0.52, 0.08)
        ctx.fillStyle = pick(rng, ['#e3d6c0', '#d8cab0', '#ebe0cc'])
        ctx.fill()
        ctx.strokeStyle = '#8a7a62'
        ctx.lineWidth = 0.03
        ctx.stroke()
      }
    }
    ctx.restore()
  }
  // 倒掉的墙只剩墙基：一截截断开的粗线
  for (let i = 0; i < 4; i++) {
    const x0 = 2 + rng.next() * (w - 8)
    const y0 = 2 + rng.next() * (h - 6)
    const bw = 3 + rng.next() * 3
    const bh = 2 + rng.next() * 2
    const pts: Pt[] = [[x0, y0], [x0 + bw, y0], [x0 + bw, y0 + bh], [x0, y0 + bh], [x0, y0]]
    for (let k = 0; k < 4; k++) {
      const a = pts[k]!
      const c = pts[k + 1]!
      const t0 = rng.next() * 0.3
      const t1 = 0.5 + rng.next() * 0.5
      const seg: Pt[] = [[a[0] + (c[0] - a[0]) * t0, a[1] + (c[1] - a[1]) * t0], [a[0] + (c[0] - a[0]) * t1, a[1] + (c[1] - a[1]) * t1]]
      line(ctx, seg, '#5e5040', 0.32, [], false)
      line(ctx, seg, '#c9bba2', 0.22, [], false)
    }
  }
  scatter(rng, 90, w, h, (x, y) => tuft(ctx, x, y, 0.2, '#8a7a3a'))
  scatter(rng, 150, w, h, (x, y) => leaf(ctx, rng, x, y, 0.1 + rng.next() * 0.06, '#3a2a20'))
  scatter(rng, 10, w, h, (x, y) => {
    ctx.beginPath()
    ctx.ellipse(x, y + 0.04, 0.08, 0.1, 0, 0, 6.28)
    ctx.fillStyle = '#b8823a'
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(x, y - 0.06, 0.1, 0.05, 0, 0, 6.28)
    ctx.fillStyle = '#6f4528'
    ctx.fill()
  })
}

/** 秋的接缝：洞口一圈乱石，往洞里阴影一层层加深；红叶被风吹进洞口 */
const cavemouth = (ctx: Ctx, w: number, h: number, rng: Rng, sd: Sd, b: Blend, ox: number, oy: number): void => {
  field(ctx, w, h, 2, (x, y) => {
    const d = sd(x, y)
    if (d > 0) return null
    const k = Math.floor(smooth(0, -6, d) * 4) / 4
    return [60, 48, 84, k * 0.32]
  })
  for (const off of [-0.7, -1.6]) {
    for (const run of contour(b, ox, oy, w, h, off)) {
      ctx.save()
      ctx.beginPath()
      smoothPath(ctx, run, false)
      ctx.lineWidth = 0.9
      ctx.strokeStyle = dots(ctx, '#3a3050', 0.3)
      ctx.stroke()
      ctx.restore()
    }
  }
  along(contour(b, ox, oy, w, h, 0), 0.55, (x, y) => {
    const r = 0.22 + rng.next() * 0.28
    stone(ctx, rng, x + (rng.next() - 0.5) * 0.4, y + (rng.next() - 0.5) * 0.4, r, pick(rng, ['#a7a0b8', '#8c7f86', '#cbc6d6']), '#3a3050')
  })
  sow(rng, 140, w, h, (x, y) => {
    const d = sd(x, y)
    return d < -4.5 || d > 2 ? 0 : d > 0 ? 1 - d / 2 : 1 + d / 4.5
  }, (x, y) => leaf(ctx, rng, x, y, 0.1, '#3a2a20'))
}

/** 冬的第一个景：火山脚下（圈里），玄武岩一格格裂开，岩浆从圈心那边淌过来 */
const volcano: Painter = (ctx, w, h, rng, sd) => {
  const seed = rng.int(0, 1 << 20)
  field(ctx, w, h, 2, (x, y) => {
    const e = cellEdge(x * 0.9, y * 0.9, seed)
    const tone = 0.85 + (valueNoise(x * 0.4, y * 0.4, seed + 1) - 0.5) * 0.2
    const crack = e < 0.07 ? 0.62 : 1
    return [141 * tone * crack, 127 * tone * crack, 120 * tone * crack, 1]
  })
  scatter(rng, 70, w, h, (x, y) => {
    ctx.beginPath()
    ctx.arc(x, y, 0.05 + rng.next() * 0.04, 0, 6.28)
    ctx.fillStyle = '#4d403a'
    ctx.fill()
  })
  // 岩浆沟：从最深处往外淌，淌到快出圈就凝住
  let deepest: Pt = [0, 0]
  let low = 0
  for (let y = 0.5; y < h; y += 1) for (let x = 0.5; x < w; x += 1) if (sd(x, y) < low) [low, deepest] = [sd(x, y), [x, y]]
  for (let i = 0; i < 4; i++) {
    let x = deepest[0] + (rng.next() - 0.5) * 2
    let y = deepest[1] + (rng.next() - 0.5) * 2
    const pts: Pt[] = [[x, y]]
    let a = rng.next() * 6.28
    for (let k = 0; k < 40 && sd(x, y) < -1.6; k++) {
      const gx = sd(x + 0.1, y) - sd(x - 0.1, y)
      const gy = sd(x, y + 0.1) - sd(x, y - 0.1)
      const want = Math.atan2(gy, gx)
      const turn = Math.atan2(Math.sin(want - a), Math.cos(want - a))
      a += Math.sign(turn) * 0.25
      a += (rng.next() - 0.5) * 0.5
      x += Math.cos(a) * 0.5
      y += Math.sin(a) * 0.5
      pts.push([x, y])
    }
    if (pts.length < 3) continue
    ctx.save()
    ctx.translate(0.035, 0.025)
    line(ctx, pts, '#e85d2a', 0.55)
    ctx.restore()
    line(ctx, pts, '#f6d36b', 0.2)
    line(ctx, pts, 'rgba(60,30,20,0.8)', 0.04, [0.5, 0.4])
    const end = pts[pts.length - 1]!
    patch(ctx, blob(rng, end[0], end[1], 0.45, 0.35, 7, 0.2), '#5a4038', { line: '#2a1a14', lw: 0.03 })
  }
}

/** 冬的第二个景：冰原，积雪里露出一块块冰，冰上有裂纹；小企鹅走过留下一串脚印 */
const tundra: Painter = (ctx, w, h, rng) => {
  ctx.fillStyle = '#eef3f7'
  ctx.fillRect(0, 0, w, h)
  for (let i = 0; i < 12; i++) {
    const cx = rng.next() * w
    const cy = rng.next() * h
    const out = blob(rng, cx, cy, 1.4 + rng.next() * 2.6, 1 + rng.next() * 1.8, 8, 0.25)
    patch(ctx, out, '#cfe3ef', { shade: '#8fb3cc', cover: 0.16, line: '#5b7f98', lw: 0.035 })
    let x = cx
    let y = cy
    const pts: Pt[] = [[x, y]]
    for (let k = 0; k < 4; k++) {
      x += (rng.next() - 0.5) * 1.2
      y += (rng.next() - 0.5) * 1.2
      pts.push([x, y])
    }
    line(ctx, pts, '#ffffff', 0.04, [], false)
  }
  scatter(rng, 50, w, h, (x, y) => {
    ctx.strokeStyle = '#a9c4d8'
    ctx.lineWidth = 0.025
    ctx.beginPath()
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI
      ctx.moveTo(x - Math.cos(a) * 0.12, y - Math.sin(a) * 0.12)
      ctx.lineTo(x + Math.cos(a) * 0.12, y + Math.sin(a) * 0.12)
    }
    ctx.stroke()
  })
  for (let t = 0; t < 2; t++) {
    let x = rng.next() * w
    let y = rng.next() * h
    let a = rng.next() * 6.28
    for (let k = 0; k < 28; k++) {
      const side = k % 2 === 0 ? 1 : -1
      ctx.save()
      ctx.translate(x - Math.sin(a) * side * 0.08, y + Math.cos(a) * side * 0.08)
      ctx.rotate(a)
      ctx.fillStyle = 'rgba(90,120,150,0.5)'
      ctx.beginPath()
      ctx.moveTo(0.08, 0)
      ctx.lineTo(-0.04, -0.06)
      ctx.lineTo(-0.04, 0.06)
      ctx.fill()
      ctx.restore()
      a += (rng.next() - 0.5) * 0.4
      x += Math.cos(a) * 0.22
      y += Math.sin(a) * 0.22
    }
  }
}

/** 冬的接缝：岩浆碰到冰雪的地方化成一圈泥泞的融水，冒着一团团白汽 */
const thaw = (ctx: Ctx, w: number, h: number, rng: Rng, sd: Sd, b: Blend, ox: number, oy: number): void => {
  const seed = rng.int(0, 1 << 20)
  field(ctx, w, h, 2, (x, y) => {
    const d = sd(x, y) + (valueNoise(x * 0.7, y * 0.7, seed) - 0.5) * 0.8
    const a = 1 - smooth(0.3, 1.1, Math.abs(d - 0.2))
    if (a <= 0) return null
    return [150, 178, 192, a * 0.85]
  })
  for (const run of contour(b, ox, oy, w, h, 0.2)) line(ctx, run, '#5b7f98', 0.04, [0.3, 0.2])
  along(contour(b, ox, oy, w, h, 0.4), 1.6, (x, y) => {
    if (rng.next() < 0.3) return
    const puff = (px: number, py: number, r: number): void => {
      ctx.beginPath()
      ctx.arc(px, py, r, 0, 6.28)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      ctx.strokeStyle = '#8a9aa8'
      ctx.lineWidth = 0.03
      ctx.stroke()
    }
    for (let k = 0; k < 4; k++) puff(x + (rng.next() - 0.5) * 0.7, y + (rng.next() - 0.5) * 0.5 - k * 0.12, 0.16 + rng.next() * 0.14)
  })
}

interface Season {
  readonly a: Painter
  readonly b: Painter
  /** 第二个景盖上来多少：0 是全露出第一个景 */
  readonly mask: (d: number) => number
  /** 界线上的抖动，格 */
  readonly wob: number
  readonly seam: (ctx: Ctx, w: number, h: number, rng: Rng, sd: Sd, b: Blend, ox: number, oy: number) => void
}

const SEASONS: Record<ChapterKey, Season> = {
  spring: { a: meadow, b: garden, mask: (d) => smooth(-2.4, 2.4, d), wob: 1.4, seam: brook },
  summer: { a: desert, b: sea, mask: (d) => smooth(-0.05, 0.25, d), wob: 0, seam: shore },
  autumn: { a: cavern, b: ruins, mask: (d) => smooth(-1.2, 1.2, d), wob: 0.8, seam: cavemouth },
  winter: { a: volcano, b: tundra, mask: (d) => smooth(-0.8, 0.8, d), wob: 0.6, seam: thaw },
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
  summer: { top: '#4f9fdc', low: '#bfe6f2', far: '#e9c98a', near: '#5fb3c9' },
  autumn: { top: '#e98a4a', low: '#f8d79a', far: '#c66a3a', near: '#8a4a2e' },
  winter: { top: '#8aa3bf', low: '#e6eef5', far: '#c9d6e3', near: '#f4f8fb' },
}

/** 远远近近一道起伏的山脊，底下填满 */
function ridge(ctx: Ctx, rng: Rng, w: number, base: number, amp: number, n: number, fill: string, line: string): void {
  const pts: Pt[] = [[-1, base + 5]]
  for (let i = 0; i <= n; i++) pts.push([(w * i) / n, base - amp * (0.4 + 0.6 * rng.next())])
  pts.push([w + 1, base + 5])
  ctx.beginPath()
  smoothPath(ctx, pts)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.lineWidth = 0.05
  ctx.strokeStyle = line
  ctx.stroke()
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

/**
 * 天幕：挂在台后的一大块画布，画着这一季的天和远处的景——春天粉蓝的天、绿山上开着樱花，夏天大太阳、一边沙丘一边海，
 * 秋天橘红的晚霞、山上的红叶与城墙，冬天灰蓝的天、雪山和远处冒烟的火山；上边一根吊杆，下边一道压脚
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
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, S.top)
  g.addColorStop(0.75, S.low)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = dots(ctx, S.top, 0.12)
  ctx.fillRect(0, 0, w, h * 0.45)
  const sunX = w * (0.15 + 0.7 * rng.next())
  if (key === 'summer') {
    ctx.strokeStyle = '#f6c84a'
    ctx.lineWidth = 0.12
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(sunX + Math.cos(a) * 1.4, h * 0.3 + Math.sin(a) * 1.4)
      ctx.lineTo(sunX + Math.cos(a) * 2, h * 0.3 + Math.sin(a) * 2)
      ctx.stroke()
    }
  }
  if (key !== 'winter') {
    ctx.beginPath()
    ctx.arc(sunX, h * 0.3, key === 'autumn' ? 1.6 : 1.1, 0, 6.28)
    ctx.fillStyle = key === 'autumn' ? '#f6c060' : key === 'spring' ? '#fff3c4' : '#ffd84a'
    ctx.fill()
  }
  for (let i = 0; i < (key === 'summer' ? 3 : 5); i++) cloud(ctx, rng.next() * w, h * (0.12 + 0.3 * rng.next()), 0.6 + rng.next() * 0.6, key === 'autumn' ? '#c97a4a' : '#9ab3c8')
  if (key === 'winter') {
    // 雪山一排，远处一座火山冒着烟
    const vx = rng.next() < 0.5 ? w * 0.2 : w * 0.8
    for (let i = 0; i < 6; i++) {
      ctx.beginPath()
      ctx.moveTo(vx - 0.5 + i * 0.3, h * 0.42)
      ctx.quadraticCurveTo(vx + (rng.next() - 0.3) * 3, h * 0.25 - i * 0.6, vx + 1 + i * 0.6, h * 0.05 - i * 0.2)
      ctx.lineWidth = 0.5 - i * 0.05
      ctx.strokeStyle = 'rgba(120,120,130,0.35)'
      ctx.stroke()
    }
    patch(ctx, [[vx - 4, h * 0.85], [vx - 0.7, h * 0.42], [vx + 0.7, h * 0.42], [vx + 4, h * 0.85]], '#6d5f5a', { line: L, lw: 0.05 })
    line(ctx, [[vx - 0.5, h * 0.44], [vx - 0.2, h * 0.55], [vx + 0.1, h * 0.5]], '#e85d2a', 0.15)
    for (let x = -1; x < w + 2; x += 3 + rng.next() * 3) {
      if (Math.abs(x - vx) < 4.5) continue
      const top = h * (0.3 + 0.2 * rng.next())
      patch(ctx, [[x - 3, h * 0.9], [x, top], [x + 3, h * 0.9]], S.far, { line: L, lw: 0.04 })
      patch(ctx, [[x - 0.9, top + 1.2], [x, top], [x + 0.9, top + 1.2], [x + 0.3, top + 0.9], [x - 0.3, top + 1.1]], '#ffffff', {})
    }
    ridge(ctx, rng, w, h * 0.9, 0.6, 10, S.near, L)
    for (let i = 0; i < 70; i++) {
      ctx.beginPath()
      ctx.arc(rng.next() * w, rng.next() * h, 0.05 + rng.next() * 0.05, 0, 6.28)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
    }
  } else if (key === 'summer') {
    // 一边是沙丘，一边是海天一线
    const left = rng.next() < 0.5
    ctx.fillStyle = S.near
    ctx.fillRect(0, h * 0.62, w, h)
    for (let y = h * 0.66; y < h; y += 0.45) line(ctx, [[0, y], [w, y]], 'rgba(255,255,255,0.5)', 0.04, [0.3, 0.5], false)
    const dunes: Pt[] = left ? [[-1, h + 1], [-1, h * 0.5], [w * 0.2, h * 0.55], [w * 0.38, h * 0.7], [w * 0.45, h + 1]] : [[w + 1, h + 1], [w + 1, h * 0.5], [w * 0.8, h * 0.55], [w * 0.62, h * 0.7], [w * 0.55, h + 1]]
    patch(ctx, dunes, S.far, { shade: '#c99a50', cover: 0.2, line: L, lw: 0.05 })
  } else if (key === 'spring') {
    ridge(ctx, rng, w, h * 0.72, 1.6, 6, S.far, L)
    ridge(ctx, rng, w, h * 0.9, 1.2, 8, S.near, L)
    for (let i = 0; i < 9; i++) {
      const x = rng.next() * w
      const y = h * (0.62 + 0.25 * rng.next())
      ctx.beginPath()
      ctx.arc(x, y, 0.45 + rng.next() * 0.3, 0, 6.28)
      ctx.fillStyle = '#f2a7bd'
      ctx.fill()
      ctx.lineWidth = 0.04
      ctx.strokeStyle = L
      ctx.stroke()
    }
  } else {
    ridge(ctx, rng, w, h * 0.7, 2, 5, S.far, L)
    // 山上一截城墙，山脚一个洞口
    const wx = w * (0.2 + 0.6 * rng.next())
    for (let i = 0; i < 6; i++) patch(ctx, [[wx + i * 0.7, h * 0.6], [wx + i * 0.7 + 0.6, h * 0.6], [wx + i * 0.7 + 0.6, h * 0.48 - (i % 2) * 0.25], [wx + i * 0.7, h * 0.48 - (i % 2) * 0.25]], '#c9bba2', { line: L, lw: 0.04 })
    ridge(ctx, rng, w, h * 0.92, 1.1, 8, S.near, L)
    const cx = wx < w / 2 ? w * 0.78 : w * 0.18
    patch(ctx, [[cx - 1.4, h * 0.95], [cx - 1, h * 0.72], [cx, h * 0.66], [cx + 1, h * 0.72], [cx + 1.4, h * 0.95]], '#2a1e24', { line: L, lw: 0.05 })
    for (let i = 0; i < 40; i++) leaf(ctx, rng, rng.next() * w, rng.next() * h, 0.12, L)
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

/** 台框上挂的帷幔多高、一个弧多宽，格；两边大幕从台边往里盖住多少、外边留出台框金柱多宽、一道褶多宽，格 */
const VALANCE_U = 2.4
const SWAG_U = 4.2
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
  // 帷幔：一道底边，下面一个个弧，金穗子
  const left = 1.3
  const right = size - 1.3
  ctx.fillStyle = '#7a0e18'
  ctx.fillRect(left, 0, right - left, VALANCE_U * 0.45)
  const n = Math.max(3, Math.round((right - left) / SWAG_U))
  const sw = (right - left) / n
  for (let i = 0; i < n; i++) {
    const a = left + i * sw
    const gr = ctx.createLinearGradient(0, 0, 0, VALANCE_U)
    gr.addColorStop(0, '#a3182a')
    gr.addColorStop(0.7, '#c4283a')
    gr.addColorStop(1, '#6e0c16')
    ctx.beginPath()
    ctx.moveTo(a, 0)
    ctx.lineTo(a + sw, 0)
    ctx.lineTo(a + sw, VALANCE_U * 0.45)
    ctx.quadraticCurveTo(a + sw / 2, VALANCE_U * 1.25, a, VALANCE_U * 0.45)
    ctx.closePath()
    ctx.fillStyle = gr
    ctx.fill()
    for (let f = 1; f < 4; f++) {
      ctx.beginPath()
      ctx.moveTo(a + sw * 0.08 * f, VALANCE_U * 0.45)
      ctx.quadraticCurveTo(a + sw / 2, VALANCE_U * (0.5 + 0.17 * f), a + sw * (1 - 0.08 * f), VALANCE_U * 0.45)
      ctx.lineWidth = 0.06
      ctx.strokeStyle = 'rgba(60,4,10,0.5)'
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.moveTo(a, VALANCE_U * 0.45)
    ctx.quadraticCurveTo(a + sw / 2, VALANCE_U * 1.25, a + sw, VALANCE_U * 0.45)
    ctx.lineWidth = 0.16
    ctx.setLineDash([0.08, 0.06])
    ctx.strokeStyle = '#e2b25a'
    ctx.stroke()
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.ellipse(a, VALANCE_U * 0.55, 0.16, 0.42, 0, 0, 6.28)
    ctx.fillStyle = '#e2b25a'
    ctx.fill()
  }
  ctx.fillStyle = '#e2b25a'
  ctx.fillRect(left, 0, right - left, 0.18)
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
  ctx.setTransform(PAINT_PPU, 0, 0, PAINT_PPU, 0, 0)
  S.a(ctx, w, h, new Rng(seed), sd)
  const top = Object.assign(document.createElement('canvas'), { width: W, height: H })
  const tc = top.getContext('2d')!
  tc.setTransform(PAINT_PPU, 0, 0, PAINT_PPU, 0, 0)
  S.b(tc, w, h, new Rng(seed ^ 0x51a7), sd)
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
  S.seam(ctx, w, h, new Rng(seed ^ 0x2c3), sd, act.blend, stage.x0, stage.y0)
  frame(ctx, 0, w, h, LINE[key])
}
