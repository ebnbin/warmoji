import { Rng } from '../../util/rng'
import { INK, smoothPath } from './art'
import { CHAPTERS } from './model'
import type { Book, ChapterKey, Page } from './model'

/** 页面上的印刷每格多少像素 */
export const PRINT_PPU = 32
/** 网点的格距，像素 */
const DOT_PX = 4.5
/** 印字用的字体：宋体一类有衬线的 */
const SERIF = '"Songti SC", "STSong", "Noto Serif CJK SC", "Source Han Serif SC", "SimSun", serif'

type Ctx = CanvasRenderingContext2D
type Pt = readonly [number, number]

/** 每一章的墨色：描线、主色、浅色铺底 */
const PALETTE: Record<ChapterKey, { readonly line: string; readonly wash: string; readonly deep: string; readonly accent: string }> = {
  forest: { line: '#2f3a26', wash: '#dfe8c2', deep: '#9fbf78', accent: '#c8553d' },
  mill: { line: '#4a3420', wash: '#efe2b4', deep: '#cdb066', accent: '#3d6fb0' },
  castle: { line: '#2c2c4a', wash: '#dfe3c8', deep: '#a8b9d8', accent: '#b8333a' },
  lair: { line: '#2e2430', wash: '#ded3d2', deep: '#a99aa6', accent: '#d9a62e' },
}

const TILES = new Map<string, HTMLCanvasElement>()
/** 网点纹样：按页面的比例缩回像素大小，转 45° */
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
  p.setTransform(new DOMMatrix().scale(1 / PRINT_PPU).rotate(angle))
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

type Painter = (ctx: Ctx, w: number, h: number, gx: number, rng: Rng) => void

const forest: Painter = (ctx, w, h, _gx, rng) => {
  const P = PALETTE.forest
  for (let i = 0; i < 14; i++) patch(ctx, blob(rng, rng.next() * w, rng.next() * h, 2 + rng.next() * 4, 1.6 + rng.next() * 3), P.deep, { alpha: 0.45, shade: '#4f7a3a', cover: 0.18 })
  const path = meander(rng, [-1, h * (0.25 + 0.5 * rng.next())], [w + 1, h * (0.25 + 0.5 * rng.next())], 6, h * 0.18)
  band(ctx, path, 1.5, '#e8d2a2', P.line, { dash: [0.18, 0.14], shade: '#c9a56a' })
  for (let i = 0; i < 40; i++) {
    const p = path[Math.floor(rng.next() * (path.length - 1))]!
    ctx.beginPath()
    ctx.ellipse(p[0] + (rng.next() - 0.5) * 1.6, p[1] + (rng.next() - 0.5) * 1, 0.09, 0.06, 0, 0, 6.28)
    ctx.fillStyle = '#b49a74'
    ctx.fill()
  }
  const side = rng.next() < 0.5 ? 0.25 : 0.75
  const brook = meander(rng, [w * side + (rng.next() - 0.5) * 3, -1], [w * side + (rng.next() - 0.5) * 3, h + 1], 6, 2.2)
  band(ctx, brook, 0.9, '#a9cfe0', '#2d5a74', { shade: '#5b93b5' })
  for (let i = 0; i < 18; i++) {
    const p = brook[1 + Math.floor(rng.next() * (brook.length - 2))]!
    line(ctx, [[p[0] - 0.15, p[1] + (rng.next() - 0.5) * 0.6], [p[0] + 0.15, p[1] + (rng.next() - 0.5) * 0.6]], '#ffffff', 0.05, [], false)
  }
  scatter(rng, 110, w, h, (x, y) => tuft(ctx, x, y, 0.22 + rng.next() * 0.12, rng.next() < 0.5 ? '#4f7a3a' : P.line))
  scatter(rng, 60, w, h, (x, y) => flower(ctx, x, y, 0.07 + rng.next() * 0.04, ['#ffffff', '#f2a7bd', '#f6d36b'][Math.floor(rng.next() * 3)]!))
  scatter(rng, 30, w, h, (x, y) => {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rng.next() * 6.28)
    patch(ctx, [[0, -0.18], [0.1, 0], [0, 0.18], [-0.1, 0]], ['#d08a3c', '#b8613a', '#e2b54e'][Math.floor(rng.next() * 3)]!, { line: P.line, lw: 0.03 })
    ctx.restore()
  })
  scatter(rng, 9, w, h, (x, y) => {
    patch(ctx, [[x - 0.05, y + 0.25], [x + 0.05, y + 0.25], [x + 0.05, y], [x - 0.05, y]], '#f4ead2', { line: P.line, lw: 0.03 })
    patch(ctx, [[x - 0.22, y + 0.02], [x, y - 0.18], [x + 0.22, y + 0.02]], P.accent, { line: P.line, lw: 0.035 })
  })
}

const mill: Painter = (ctx, w, h, _gx, rng) => {
  const P = PALETTE.mill
  const kinds = [
    { fill: '#ecd38c', row: '#c9a74d' },
    { fill: '#cfe09f', row: '#89a85a' },
    { fill: '#dcbf96', row: '#a8835a' },
    { fill: '#e2ecc6', row: '#a9c17e' },
  ]
  const cols = 4
  const rows = 3
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x0 = (w / cols) * i + (rng.next() - 0.5) * 1.2
      const y0 = (h / rows) * j + (rng.next() - 0.5) * 1.2
      const x1 = (w / cols) * (i + 1) + (rng.next() - 0.5) * 1.2
      const y1 = (h / rows) * (j + 1) + (rng.next() - 0.5) * 1.2
      const k = kinds[Math.floor(rng.next() * kinds.length)]!
      ctx.save()
      ctx.beginPath()
      ctx.rect(x0, y0, x1 - x0, y1 - y0)
      ctx.fillStyle = k.fill
      ctx.fill()
      ctx.clip()
      const ang = rng.next() < 0.5 ? 0 : Math.PI / 2
      const spacing = 0.42
      ctx.strokeStyle = k.row
      ctx.lineWidth = 0.07
      ctx.beginPath()
      for (let t = -h; t < w + h; t += spacing) {
        if (ang === 0) {
          ctx.moveTo(x0 - 1, y0 + (t % (y1 - y0 + 2)))
          ctx.lineTo(x1 + 1, y0 + (t % (y1 - y0 + 2)))
        } else {
          ctx.moveTo(x0 + (t % (x1 - x0 + 2)), y0 - 1)
          ctx.lineTo(x0 + (t % (x1 - x0 + 2)), y1 + 1)
        }
      }
      ctx.stroke()
      ctx.restore()
      line(ctx, [[x0, y0], [x1, y0]], '#6f9a46', 0.22, [0.12, 0.1], false)
      line(ctx, [[x0, y0], [x0, y1]], '#6f9a46', 0.22, [0.12, 0.1], false)
    }
  }
  const road = meander(rng, [w * (0.2 + 0.6 * rng.next()), -1], [w * (0.2 + 0.6 * rng.next()), h + 1], 4, 3)
  band(ctx, road, 1.7, '#efe0bb', P.line, { shade: '#cdb38a' })
  line(ctx, road.map((p) => [p[0] - 0.35, p[1]] as Pt), '#bfa178', 0.06, [0.3, 0.2])
  line(ctx, road.map((p) => [p[0] + 0.35, p[1]] as Pt), '#bfa178', 0.06, [0.3, 0.2])
  const px = rng.next() < 0.5 ? w * 0.22 : w * 0.78
  const py = h * (0.3 + 0.4 * rng.next())
  const pond = blob(rng, px, py, 2.4, 1.6, 9, 0.18)
  patch(ctx, pond, '#a6cde0', { shade: '#4d88ad', cover: 0.3, line: '#2d5a74', lw: 0.05 })
  for (let i = 0; i < 3; i++) {
    const x = px + (rng.next() - 0.5) * 2
    const y = py + (rng.next() - 0.5) * 1
    patch(ctx, [[x - 0.2, y], [x, y - 0.1], [x + 0.2, y], [x, y + 0.1]], '#ffffff', { line: P.line, lw: 0.03 })
    ctx.beginPath()
    ctx.arc(x + 0.2, y - 0.1, 0.05, 0, 6.28)
    ctx.fillStyle = '#e8892c'
    ctx.fill()
  }
  for (let i = 0; i < 14; i++) {
    const a = rng.next() * 6.28
    tuft(ctx, px + Math.cos(a) * 2.6, py + Math.sin(a) * 1.8, 0.35, '#4f7a3a')
  }
  scatter(rng, 40, w, h, (x, y) => flower(ctx, x, y, 0.07, ['#ffffff', '#e4573f', '#f6d36b'][Math.floor(rng.next() * 3)]!))
}

const castle: Painter = (ctx, w, h, gx, rng) => {
  const P = PALETTE.castle
  for (let i = 0; i < 10; i++) patch(ctx, blob(rng, rng.next() * w, rng.next() * h, 2 + rng.next() * 3, 2 + rng.next() * 2), '#cddca8', { alpha: 0.6 })
  // 护城河：沿上页边横过两页
  const moat = meander(rng, [-1, 1.6], [w + 1, 1.6], 8, 0.25)
  band(ctx, moat, 1.2, '#9fc6dc', '#2d5a74', { shade: '#4d88ad' })
  for (const u of [w * 0.25, w * 0.75]) {
    ctx.save()
    ctx.translate(0.035, 0.025)
    ctx.fillStyle = '#c69a62'
    ctx.fillRect(u - 0.7, 0.8, 1.4, 1.6)
    ctx.restore()
    ctx.strokeStyle = P.line
    ctx.lineWidth = 0.05
    ctx.strokeRect(u - 0.7, 0.8, 1.4, 1.6)
    for (let k = 1; k < 5; k++) line(ctx, [[u - 0.7, 0.8 + k * 0.32], [u + 0.7, 0.8 + k * 0.32]], '#8a5a35', 0.04, [], false)
  }
  // 庭院：卵石铺地的一大片
  const cx0 = 2.5
  const cy0 = 4
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(cx0, cy0, w - cx0 * 2, h - cy0 - 2.2, 2)
  ctx.fillStyle = '#ddd6e2'
  ctx.fill()
  ctx.clip()
  for (let y = cy0; y < h; y += 0.42) {
    const off = (Math.floor(y / 0.42) % 2) * 0.3
    for (let x = cx0 + off; x < w; x += 0.6) {
      ctx.beginPath()
      ctx.roundRect(x + 0.04, y + 0.04, 0.52 + (rng.next() - 0.5) * 0.1, 0.34, 0.12)
      ctx.strokeStyle = '#a69fb6'
      ctx.lineWidth = 0.035
      ctx.stroke()
    }
  }
  ctx.restore()
  ctx.beginPath()
  ctx.roundRect(cx0, cy0, w - cx0 * 2, h - cy0 - 2.2, 2)
  ctx.lineWidth = 0.06
  ctx.strokeStyle = P.line
  ctx.stroke()
  // 红毯：从下页边铺进来，金边
  const cu = gx + (rng.next() < 0.5 ? -1 : 1) * (4 + rng.next() * 6)
  ctx.save()
  ctx.translate(0.035, 0.025)
  ctx.fillStyle = P.accent
  ctx.fillRect(cu - 0.8, h * 0.35, 1.6, h)
  ctx.restore()
  ctx.fillStyle = dots(ctx, '#7a1c24', 0.3)
  ctx.fillRect(cu + 0.2, h * 0.35, 0.6, h)
  for (const s of [-0.8, 0.8]) line(ctx, [[cu + s, h * 0.35], [cu + s, h + 1]], INK.gold, 0.12, [], false)
  // 喷泉
  const fx = gx + (cu < gx ? 1 : -1) * (5 + rng.next() * 5)
  const fy = h * (0.45 + 0.2 * rng.next())
  patch(ctx, blob(rng, fx, fy, 1.5, 1.5, 12, 0.02), '#cfc7d9', { line: P.line, lw: 0.06 })
  patch(ctx, blob(rng, fx, fy, 1.1, 1.1, 12, 0.02), '#9fc6dc', { shade: '#4d88ad', line: P.line, lw: 0.05 })
  for (const r of [0.35, 0.65]) {
    ctx.beginPath()
    ctx.arc(fx, fy, r, 0, 6.28)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 0.05
    ctx.stroke()
  }
  // 彩旗：一串三角旗挂过两页
  const y0 = 3.3
  const flags = 22
  line(ctx, [[0.5, y0], [w / 2, y0 + 0.7], [w - 0.5, y0]], P.line, 0.04)
  for (let i = 1; i < flags; i++) {
    const t = i / flags
    const x = 0.5 + (w - 1) * t
    const y = y0 + 0.7 * (1 - Math.abs(2 * t - 1) ** 2)
    patch(ctx, [[x - 0.2, y], [x + 0.2, y], [x, y + 0.45]], [P.accent, INK.gold, INK.blue, '#ffffff'][i % 4]!, { line: P.line, lw: 0.03 })
  }
  scatter(rng, 40, w, h, (x, y) => {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rng.next())
    ctx.fillStyle = [P.accent, INK.gold, INK.blue][Math.floor(rng.next() * 3)]!
    ctx.fillRect(-0.06, -0.06, 0.12, 0.12)
    ctx.restore()
  })
}

const lair: Painter = (ctx, w, h, _gx, rng) => {
  const P = PALETTE.lair
  for (let i = 0; i < 16; i++) patch(ctx, blob(rng, rng.next() * w, rng.next() * h, 1.5 + rng.next() * 3.5, 1.2 + rng.next() * 2.4, 7, 0.3), P.deep, { alpha: 0.55, shade: '#6e5f6c', cover: 0.25, line: P.line, lw: 0.04 })
  for (let i = 0; i < 14; i++) {
    let x = rng.next() * w
    let y = rng.next() * h
    const pts: Pt[] = [[x, y]]
    let a = rng.next() * 6.28
    for (let k = 0; k < 5; k++) {
      a += (rng.next() - 0.5) * 1.2
      x += Math.cos(a) * 0.7
      y += Math.sin(a) * 0.7
      pts.push([x, y])
    }
    line(ctx, pts, P.line, 0.05, [], false)
  }
  const stream = meander(rng, [-1, h * (0.3 + 0.4 * rng.next())], [w + 1, h * (0.3 + 0.4 * rng.next())], 7, 2.5)
  band(ctx, stream, 0.8, '#7fa9a6', '#1d3b3a', { shade: '#2f5f5c' })
  for (let c = 0; c < 7; c++) {
    const cx = 1.5 + rng.next() * (w - 3)
    const cy = 1.5 + rng.next() * (h - 3)
    for (let i = 0; i < 10; i++) {
      const x = cx + (rng.next() - 0.5) * 2
      const y = cy + (rng.next() - 0.5) * 1.4
      ctx.save()
      ctx.translate(0.03, 0.02)
      ctx.beginPath()
      ctx.ellipse(x, y, 0.17, 0.12, 0, 0, 6.28)
      ctx.fillStyle = '#ecc25a'
      ctx.fill()
      ctx.restore()
      ctx.beginPath()
      ctx.ellipse(x, y, 0.17, 0.12, 0, 0, 6.28)
      ctx.lineWidth = 0.035
      ctx.strokeStyle = '#7a5214'
      ctx.stroke()
    }
  }
  scatter(rng, 10, w, h, (x, y) => {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rng.next() * 6.28)
    ctx.fillStyle = '#f6efe0'
    ctx.strokeStyle = P.line
    ctx.lineWidth = 0.03
    ctx.beginPath()
    ctx.roundRect(-0.25, -0.04, 0.5, 0.08, 0.04)
    for (const sx of [-0.25, 0.25]) for (const sy of [-0.06, 0.06]) ctx.ellipse(sx, sy, 0.07, 0.07, 0, 0, 6.28)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  })
  scatter(rng, 24, w, h, (x, y) => {
    ctx.beginPath()
    ctx.arc(x, y, 0.22, 0, 6.28)
    ctx.fillStyle = dots(ctx, '#3fc7b0', 0.3)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x, y, 0.07, 0, 6.28)
    ctx.fillStyle = '#6fe6d0'
    ctx.fill()
  })
  scatter(rng, 5, w, h, (x, y) => {
    ctx.beginPath()
    ctx.ellipse(x, y, 1.2, 0.8, rng.next(), 0, 6.28)
    ctx.fillStyle = dots(ctx, '#3a2c2c', 0.45)
    ctx.fill()
  })
}

const PAINTERS: Record<ChapterKey, Painter> = { forest, mill, castle, lair }

/** 页面四周印的一道双线框，四角卷一个小涡 */
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

/** 左页左上角印着章名与几行故事，字底下的插画淡开；两页下角印页码 */
function words(ctx: Ctx, page: Page, w: number, h: number, color: string): void {
  const ch = CHAPTERS[page.chapter]!
  const x = 1.5
  const y = 1.6
  const g = ctx.createRadialGradient(x + 3.6, y + 1.8, 0.5, x + 3.6, y + 1.8, 5.2)
  g.addColorStop(0, 'rgba(255,255,255,0.92)')
  g.addColorStop(0.6, 'rgba(255,255,255,0.75)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, x + 9, y + 5.5)
  ctx.fillStyle = color
  ctx.textBaseline = 'top'
  ctx.font = `0.42px ${SERIF}`
  ctx.fillText(`第${ch.num}章`, x, y)
  ctx.font = `bold 0.82px ${SERIF}`
  ctx.fillText(ch.name, x, y + 0.55)
  ctx.font = `0.36px ${SERIF}`
  ch.text.forEach((t, i) => ctx.fillText(t, x, y + 1.65 + i * 0.52))
  ctx.font = `0.36px ${SERIF}`
  ctx.textAlign = 'left'
  ctx.fillText(`· ${page.number} ·`, 1.2, h - 0.62)
  ctx.textAlign = 'right'
  ctx.fillText(`· ${page.number + 1} ·`, w - 1.2, h - 0.62)
  ctx.textAlign = 'left'
}

/**
 * 一页的印刷：白底上的油墨，乘到纸面上就是印出来的样子。插画平涂、偏一点套版、网点压暗、描墨线；
 * 两页各印一道双线框，左页左上角是章名与故事，下角是页码
 */
export function paintPrint(page: Page, book: Book, canvas: HTMLCanvasElement): void {
  const w = book.x1 - book.x0
  const h = book.y1 - book.y0
  canvas.width = Math.round(w * PRINT_PPU)
  canvas.height = Math.round(h * PRINT_PPU)
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(PRINT_PPU, 0, 0, PRINT_PPU, 0, 0)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  const key = CHAPTERS[page.chapter]!.key
  const P = PALETTE[key]
  ctx.fillStyle = P.wash
  ctx.fillRect(0, 0, w, h)
  const rng = new Rng(page.seed ^ 0x9a1e7)
  PAINTERS[key](ctx, w, h, book.gx - book.x0, rng)
  const gx = book.gx - book.x0
  frame(ctx, 0, gx, h, P.line)
  frame(ctx, gx, w, h, P.line)
  words(ctx, page, w, h, P.line)
}
