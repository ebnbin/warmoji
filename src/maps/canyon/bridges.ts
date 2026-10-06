import type Phaser from 'phaser'
import { LIFT_PER_M, UNIT } from '../../util/units'
import { AWAY } from '../../data/light'
import { mix } from '../color'
import { sagAt } from './model'
import { SHADOW_U } from './ground'
import type { Bridge } from './model'
import type { CanyonConfig } from '../../types/maps'

/** 木板顺着桥多厚、板与板之间隔多远，格 */
const PLANK_U = 0.25
const PITCH_U = 0.32
/** 扶绳离桥面多高、比桥面多垂多少，米；桩子多高，米 */
const RAIL_M = 0.95
const RAIL_SAG_M = 0.25
const POST_M = 1.25
/** 三种结实程度：扶绳的粗细（像素）、木板的颜色、缺板与歪板的比例、绳子毛不毛 */
const LOOKS = [
  { rope: 2.2, plank: 0x8f877a, missing: 0.14, askew: 0.22, fray: true },
  { rope: 3.4, plank: 0x9c6c43, missing: 0.04, askew: 0.08, fray: false },
  { rope: 5, plank: 0xcf9858, missing: 0, askew: 0, fray: false },
] as const
const ROPE = 0xcdb38a
const ROPE_DARK = 0x5a4632
/** 压到上限的绳子绷得发红 */
const ROPE_STRAIN = 0xff6a3d
const OUTLINE = 0x2a1a14
const POST = 0x8a5a36
/** 断桥垂下来最多多长：崖高的这么多倍 */
const HANG = 1.25
/** 重新拉绳：每边分几截拉起来；拉到这么多以后才铺木板 */
const PULLS = 6
const PLANK_FROM = 0.6

/** 填一个多边形：按顶点连成闭合的路径 */
export function fillPoly(g: Phaser.GameObjects.Graphics, pts: readonly { readonly x: number; readonly y: number }[]): void {
  g.beginPath()
  pts.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)))
  g.closePath()
  g.fillPath()
}

function hash(a: number, b: number): number {
  let h = Math.imul(a, 0x27d4eb2d) ^ Math.imul(b, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** 一座桥这一帧怎么摆：左右晃了多少（像素），抖得多厉害（0 到 1） */
export interface Swing {
  readonly sway: number
  readonly shake: number
}

/** 桥面上 t 处画在哪：顺着桥的位置，横着晃一点，往下垂多少画低多少；lift 是离桥面多高（米），over 是比桥面多垂多少（米） */
function at(b: Bridge, cfg: CanyonConfig, t: number, side: number, lift: number, over: number, sw: Swing, now: number): { x: number; y: number } {
  const s = Math.sin(Math.PI * Math.min(1, Math.max(0, t)))
  const jitter = sw.shake > 0 ? Math.sin(now * 0.09 + t * 23) * sw.shake * 0.05 * UNIT : 0
  const lat = (sw.sway + jitter) * s
  const sag = sagAt(b, cfg, t) + over * 4 * t * (1 - t)
  return {
    x: b.ax + b.ux * b.len * t + b.nx * (side * b.half + lat),
    y: b.ay + b.uy * b.len * t + b.ny * (side * b.half + lat) + (sag - lift) * LIFT_PER_M,
  }
}

/** 一根绳：从 t0 到 t1 一路按桥面垂 */
function rope(g: Phaser.GameObjects.Graphics, b: Bridge, cfg: CanyonConfig, t0: number, t1: number, side: number, lift: number, over: number, sw: Swing, now: number, w: number, color: number): void {
  if (t1 <= t0) return
  const n = Math.max(2, Math.ceil(((t1 - t0) * b.len) / (0.4 * UNIT)))
  for (const [lw, c, a] of [[w + 2, OUTLINE, 0.85], [w, color, 1]] as const) {
    g.lineStyle(lw, c, a)
    g.beginPath()
    for (let i = 0; i <= n; i++) {
      const p = at(b, cfg, t0 + ((t1 - t0) * i) / n, side, lift, over, sw, now)
      if (i === 0) g.moveTo(p.x, p.y)
      else g.lineTo(p.x, p.y)
    }
    g.strokePath()
  }
}

/** 桥头的一根桩：立在台面上，顶上缠着绳 */
function post(g: Phaser.GameObjects.Graphics, x: number, y: number, glow: number): void {
  const h = POST_M * LIFT_PER_M
  if (glow > 0) {
    g.fillStyle(0xffc14d, 0.35 * glow).fillCircle(x, y - h * 0.6, 0.38 * UNIT)
    g.fillStyle(0xffe08a, 0.5 * glow).fillCircle(x, y - h * 0.6, 0.2 * UNIT)
  }
  g.fillStyle(0x000000, 0.25).fillEllipse(x + AWAY.x * h * 0.5, y + AWAY.y * h * 0.5, 0.22 * UNIT, 0.12 * UNIT)
  g.fillStyle(OUTLINE, 1).fillRect(x - 4.5, y - h - 1.5, 9, h + 3)
  g.fillStyle(POST, 1).fillRect(x - 3, y - h, 6, h)
  g.fillStyle(0xb98256, 1).fillRect(x - 3, y - h, 2, h)
  g.fillStyle(ROPE, 1).fillRect(x - 4, y - h * 0.82, 8, 3)
  g.fillStyle(ROPE, 1).fillRect(x - 4, y - h * 0.62, 8, 3)
  g.fillStyle(0x6e4528, 1).fillEllipse(x, y - h, 7, 4)
}

/** 一块木板：横跨桥面，按桥的结实程度换颜色、缺块、歪斜；朝着太阳的一边亮一线 */
function plank(g: Phaser.GameObjects.Graphics, b: Bridge, cfg: CanyonConfig, t: number, k: number, sw: Swing, now: number, seed: number, fade: number): void {
  const look = LOOKS[Math.min(LOOKS.length - 1, b.span.kind)]!
  const h = hash(seed, k)
  if (h < look.missing) return
  const l = at(b, cfg, t, -1, 0, 0, sw, now)
  const r = at(b, cfg, t, 1, 0, 0, sw, now)
  const skew = h > 1 - look.askew ? (hash(seed + 7, k) - 0.5) * 0.35 : 0
  const half = (PLANK_U * UNIT) / 2
  const ux = b.ux
  const uy = b.uy
  const shrink = 0.9 + hash(seed + 3, k) * 0.1
  const cx = (l.x + r.x) / 2
  const cy = (l.y + r.y) / 2
  const ax = cx + (l.x - cx) * shrink
  const ay = cy + (l.y - cy) * shrink
  const bx = cx + (r.x - cx) * shrink
  const by = cy + (r.y - cy) * shrink
  const pts = [
    { x: ax - ux * half * (1 + skew), y: ay - uy * half * (1 + skew) },
    { x: bx - ux * half * (1 - skew), y: by - uy * half * (1 - skew) },
    { x: bx + ux * half * (1 + skew), y: by + uy * half * (1 + skew) },
    { x: ax + ux * half * (1 - skew), y: ay + uy * half * (1 - skew) },
  ]
  const tone = mix(look.plank, hash(seed + 5, k) > 0.5 ? 0xffffff : 0x000000, 0.08 + hash(seed + 9, k) * 0.1)
  fillPoly(g.fillStyle(OUTLINE, 0.9 * fade), pts.map((p) => ({ x: p.x, y: p.y + 2 })))
  fillPoly(g.fillStyle(tone, fade), pts)
  g.lineStyle(1.2, mix(tone, 0xffffff, 0.35), 0.8 * fade).lineBetween(pts[0]!.x, pts[0]!.y, pts[1]!.x, pts[1]!.y)
  if (b.span.kind === 0 && hash(seed + 11, k) < 0.4) g.lineStyle(1, OUTLINE, 0.6 * fade).lineBetween((pts[0]!.x + pts[3]!.x) / 2, (pts[0]!.y + pts[3]!.y) / 2, (pts[0]!.x * 0.4 + pts[1]!.x * 0.6 + pts[3]!.x) / 2, (pts[0]!.y * 0.4 + pts[1]!.y * 0.6 + pts[3]!.y) / 2)
}

/** 桥的两头：桩子立在台沿往里一点 */
function ends(b: Bridge): { t0: number; t1: number } {
  const inset = (0.35 * UNIT) / b.len
  return { t0: -inset, t1: 1 + inset }
}

/** 一座完好的桥：桥面一排木板，底下两根托绳，两边扶绳与吊绳；桥上越重垂得越低，绳子越绷越红 */
export function drawUp(g: Phaser.GameObjects.Graphics, b: Bridge, cfg: CanyonConfig, sw: Swing, now: number, seed: number, from = 0, to = 1, planks = 1): void {
  const look = LOOKS[Math.min(LOOKS.length - 1, b.span.kind)]!
  const strain = Math.min(1, Math.max(0, (b.kg / b.cap - 0.55) / 0.45))
  const color = mix(ROPE, ROPE_STRAIN, strain * 0.85)
  const { t0, t1 } = ends(b)
  const a = Math.max(t0, from)
  const z = Math.min(t1, to)
  rope(g, b, cfg, a, z, -1, 0.05, 0, sw, now, 1.6, ROPE_DARK)
  rope(g, b, cfg, a, z, 1, 0.05, 0, sw, now, 1.6, ROPE_DARK)
  const n = Math.floor((b.len + 0.7 * UNIT) / (PITCH_U * UNIT))
  for (let k = 0; k <= n; k++) {
    const t = t0 + ((t1 - t0) * k) / n
    if (t < a || t > z) continue
    if (Math.min(t - t0, t1 - t) / (t1 - t0) > planks * 0.5) continue
    plank(g, b, cfg, t, k, sw, now, seed, 1)
  }
  // 吊绳：扶绳隔几块板垂一根下来拴住桥面
  for (let k = 0; k <= n; k += 3) {
    const t = t0 + ((t1 - t0) * k) / n
    if (t < a || t > z) continue
    for (const side of [-1, 1]) {
      const p = at(b, cfg, t, side, 0, 0, sw, now)
      const q = at(b, cfg, t, side, RAIL_M, RAIL_SAG_M, sw, now)
      g.lineStyle(1.2, ROPE_DARK, 0.9).lineBetween(p.x, p.y, q.x, q.y)
    }
  }
  for (const side of [-1, 1]) {
    rope(g, b, cfg, a, z, side, RAIL_M, RAIL_SAG_M, sw, now, look.rope, color)
    if (!look.fray) continue
    // 朽绳上翘着的毛刺
    for (let k = 0; k < 10; k++) {
      const t = a + (z - a) * hash(seed + side, k + 50)
      const p = at(b, cfg, t, side, RAIL_M, RAIL_SAG_M, sw, now)
      g.lineStyle(1, 0xe6d3ae, 0.8).lineBetween(p.x, p.y, p.x + (hash(seed, k) - 0.5) * 7, p.y - 3 - hash(seed + 2, k) * 4)
    }
  }
}

/** 断桥：从两头的桩子垂下去的两截，越往下越隐进谷里的雾；重新拉绳时慢慢收上来 */
export function drawHanging(g: Phaser.GameObjects.Graphics, b: Bridge, depth: number, now: number, seed: number, keep: number): void {
  if (keep <= 0) return
  const look = LOOKS[Math.min(LOOKS.length - 1, b.span.kind)]!
  for (const end of [0, 1]) {
    const part = end === 0 ? b.snapT : 1 - b.snapT
    const len = Math.min(part * b.len, depth * UNIT * HANG) * keep
    const x0 = b.ax + b.ux * b.len * end
    const y0 = b.ay + b.uy * b.len * end
    const swing = Math.sin(now / 900 + end * 2 + seed) * 0.25 * UNIT
    const n = Math.max(2, Math.floor(len / (PITCH_U * UNIT)))
    const pt = (f: number, side: number): { x: number; y: number } => ({
      x: x0 + b.nx * side * b.half * (1 - f * 0.25) + swing * f * f,
      y: y0 + b.ny * side * b.half * (1 - f * 0.25) + len * f,
    })
    for (let k = 1; k <= n; k++) {
      const f = k / n
      if (hash(seed + end * 31, k) < look.missing + 0.12 * f) continue
      const l = pt(f, -1)
      const r = pt(f, 1)
      const fade = 1 - f * 0.8
      g.lineStyle(5, OUTLINE, 0.7 * fade).lineBetween(l.x, l.y + 1, r.x, r.y + 1)
      g.lineStyle(3.5, look.plank, fade).lineBetween(l.x, l.y, r.x, r.y)
    }
    for (const side of [-1, 1]) {
      g.lineStyle(look.rope, ROPE, 0.9)
      g.beginPath()
      for (let k = 0; k <= 8; k++) {
        const p = pt(k / 8, side)
        if (k === 0) g.moveTo(p.x, p.y)
        else g.lineTo(p.x, p.y)
      }
      g.strokePath()
    }
  }
}

/** 重新拉绳：两头的绳一截截往中间拉，拉满了再从两头往中间铺木板；桩子一闪一闪地发亮 */
export function drawRebuild(g: Phaser.GameObjects.Graphics, b: Bridge, cfg: CanyonConfig, p: number, now: number, seed: number): void {
  const sw: Swing = { sway: 0, shake: 0 }
  const pulled = Math.min(1, p / PLANK_FROM)
  const step = Math.floor(pulled * PULLS)
  const within = pulled * PULLS - step
  const reach = Math.min(0.5, ((step + Math.min(1, within / 0.35)) / PULLS) * 0.5)
  const look = LOOKS[Math.min(LOOKS.length - 1, b.span.kind)]!
  const planks = p < PLANK_FROM ? 0 : (p - PLANK_FROM) / (1 - PLANK_FROM)
  const { t0, t1 } = ends(b)
  for (const [a, z] of [[t0, Math.max(t0, reach)], [Math.min(t1, 1 - reach), t1]] as const) {
    if (planks > 0) drawUp(g, b, cfg, sw, now, seed, a, z, planks)
    else {
      rope(g, b, cfg, a, z, -1, 0.05, 0, sw, now, 1.6, ROPE_DARK)
      rope(g, b, cfg, a, z, 1, 0.05, 0, sw, now, 1.6, ROPE_DARK)
      for (const side of [-1, 1]) rope(g, b, cfg, a, z, side, RAIL_M, RAIL_SAG_M, sw, now, look.rope, ROPE)
    }
  }
}

/** 桥头的四根桩；glow 是重新拉绳时的闪光 */
export function drawPosts(g: Phaser.GameObjects.Graphics, b: Bridge, glow: number): void {
  const { t0, t1 } = ends(b)
  for (const t of [t0, t1]) {
    for (const side of [-1, 1]) {
      post(g, b.ax + b.ux * b.len * t + b.nx * side * b.half * 1.05, b.ay + b.uy * b.len * t + b.ny * side * b.half * 1.05, glow)
    }
  }
}

/** 桥在谷底的影子：往下推一个崖高、再顺着太阳铺出去，一道细细的暗带 */
export function drawShadow(g: Phaser.GameObjects.Graphics, b: Bridge, cfg: CanyonConfig, depth: number, from: number, to: number): void {
  const ox = AWAY.x * SHADOW_U * UNIT * 0.85
  const oy = depth * UNIT + AWAY.y * SHADOW_U * UNIT * 0.85
  const n = 12
  const pts: { x: number; y: number }[] = []
  for (const side of [-1, 1]) {
    for (let i = 0; i <= n; i++) {
      const t = from + ((to - from) * (side < 0 ? i : n - i)) / n
      pts.push({ x: b.ax + b.ux * b.len * t + b.nx * side * b.half * 0.9 + ox, y: b.ay + b.uy * b.len * t + b.ny * side * b.half * 0.9 + oy + sagAt(b, cfg, t) * LIFT_PER_M })
    }
  }
  fillPoly(g.fillStyle(0x1a1030, 0.28), pts)
}
