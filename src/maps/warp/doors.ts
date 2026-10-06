import Phaser from 'phaser'
import { UNIT } from '../../util/units'
import { lift, shade } from './palette'

type G = Phaser.GameObjects.Graphics

/** 安全出口指示牌的绿 */
export const EXIT_SIGN = 0x12b85a
/** 门后透出来的光：出口是发白的绿，真正的出口是日光 */
export const EXIT_LIGHT = 0xc8ffe0
export const DAYLIGHT = 0xfff0c0

/**
 * 一扇立着的门此刻的样子，像素：门脚的中点 (x, y)，门宽 w、门高 h；open 是开了几成（0 关死，1 大开）；
 * light 是门里透出来的光与它有多亮（0 时门里是黑的）；alpha 是整扇门的不透明度
 */
export interface DoorPose {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly open: number
  readonly light: number
  readonly lightK: number
  readonly alpha: number
}

/** 门洞：门框里面那块，像素 */
function hole(p: DoorPose): { x: number; y: number; w: number; h: number } {
  const w = p.w * 0.72
  const h = p.h * 0.86
  return { x: p.x - w / 2, y: p.y - h, w, h }
}

/** 门洞里：黑的，或透着光；开着时光往门外的地上洒一片 */
function inside(g: G, p: DoorPose): void {
  const o = hole(p)
  g.fillStyle(0x05080c, p.alpha)
  g.fillRect(o.x, o.y, o.w, o.h)
  if (p.lightK <= 0) return
  g.fillStyle(p.light, p.alpha * p.lightK * (0.35 + 0.65 * p.open))
  g.fillRect(o.x, o.y, o.w, o.h)
  g.fillStyle(0xffffff, p.alpha * p.lightK * p.open * 0.6)
  g.fillRect(o.x + o.w * 0.2, o.y + o.h * 0.08, o.w * 0.6, o.h * 0.92)
}

/** 门扇绕左边的合页转开：看得见的宽度随开的几成收窄 */
function leaf(p: DoorPose): { x: number; y: number; w: number; h: number } {
  const o = hole(p)
  return { x: o.x, y: o.y, w: Math.max(o.w * 0.12, o.w * (1 - p.open * 0.88)), h: o.h }
}

/** 樱庭寺院的木门：朱红的门柱，一小片灰瓦的门顶，深色的木门扇上一排排铜钉，瓦上落着几片樱花 */
function temple(g: G, p: DoorPose, t: number): void {
  const a = p.alpha
  const o = hole(p)
  const post = p.w * 0.12
  g.fillStyle(0xb8321e, a)
  g.fillRect(o.x - post, o.y, post, o.h)
  g.fillRect(o.x + o.w, o.y, post, o.h)
  g.fillRect(o.x - post * 1.4, o.y - p.h * 0.07, o.w + post * 2.8, p.h * 0.07)
  inside(g, p)
  const l = leaf(p)
  g.fillStyle(0x5a2c18, a)
  g.fillRect(l.x, l.y, l.w, l.h)
  g.lineStyle(0.03 * UNIT, 0x2e1408, a)
  g.strokeRect(l.x, l.y, l.w, l.h)
  if (l.w > o.w * 0.3) {
    g.fillStyle(0xe0b048, a)
    for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) g.fillCircle(l.x + (l.w * (i + 0.5)) / 3, l.y + (l.h * (j + 0.6)) / 4.4, 0.035 * UNIT)
  }
  // 灰瓦门顶
  const top = o.y - p.h * 0.07
  const rw = o.w + post * 2.8 + p.w * 0.36
  g.fillStyle(0x3c4250, a)
  g.fillTriangle(p.x - rw / 2, top, p.x + rw / 2, top, p.x, top - p.h * 0.16)
  g.lineStyle(0.025 * UNIT, 0x6a7282, a)
  for (let k = 1; k < 5; k++) g.lineBetween(p.x - rw / 2 + (rw * k) / 5, top, p.x, top - p.h * 0.16)
  // 落在瓦上的樱花，有一片在往下飘
  g.fillStyle(0xffb6d6, a)
  for (const [u, v] of [
    [-0.3, 0.04],
    [0.18, 0.08],
    [0.36, 0.02],
  ] as const) g.fillEllipse(p.x + u * rw, top - p.h * v, 0.09 * UNIT, 0.06 * UNIT)
  const fall = (t * 0.25) % 1
  g.fillStyle(0xffc6e0, a * Math.sin(fall * Math.PI))
  g.fillEllipse(p.x + rw * 0.4 + Math.sin(t * 2) * 0.15 * UNIT, top + fall * p.h, 0.08 * UNIT, 0.05 * UNIT)
}

/** 深海潜艇的舱门：圆角的钢门框一圈铆钉，门扇上一扇圆舷窗和一只转盘，门顶上一盏暖黄的门灯；门缝里偶尔冒一串气泡 */
function hatch(g: G, p: DoorPose, t: number): void {
  const a = p.alpha
  const o = hole(p)
  const rim = p.w * 0.13
  g.fillStyle(0x2c3a42, a)
  g.fillRoundedRect(o.x - rim, o.y - rim, o.w + rim * 2, o.h + rim, rim * 1.6)
  g.fillStyle(0xc8a040, a)
  for (let k = 0; k < 6; k++) {
    g.fillCircle(o.x - rim / 2, o.y + (o.h * (k + 0.5)) / 6, 0.03 * UNIT)
    g.fillCircle(o.x + o.w + rim / 2, o.y + (o.h * (k + 0.5)) / 6, 0.03 * UNIT)
  }
  inside(g, p)
  const l = leaf(p)
  g.fillStyle(0x56666e, a)
  g.fillRoundedRect(l.x, l.y, l.w, l.h, Math.min(l.w / 2, rim))
  if (l.w > o.w * 0.4) {
    const cx = l.x + l.w / 2
    g.fillStyle(0x0c3a44, a)
    g.fillCircle(cx, l.y + l.h * 0.28, l.w * 0.24)
    g.lineStyle(0.04 * UNIT, 0xc8a040, a)
    g.strokeCircle(cx, l.y + l.h * 0.28, l.w * 0.24)
    g.fillStyle(0x9fe8ff, a * 0.5)
    g.fillCircle(cx - l.w * 0.08, l.y + l.h * 0.24, l.w * 0.07)
    const wy = l.y + l.h * 0.66
    g.lineStyle(0.04 * UNIT, 0x2a2f33, a)
    g.strokeCircle(cx, wy, l.w * 0.2)
    for (let k = 0; k < 3; k++) {
      const ang = (k * Math.PI) / 3
      g.lineBetween(cx - Math.cos(ang) * l.w * 0.2, wy - Math.sin(ang) * l.w * 0.2, cx + Math.cos(ang) * l.w * 0.2, wy + Math.sin(ang) * l.w * 0.2)
    }
  }
  // 门灯
  g.fillStyle(0x2c3a42, a)
  g.fillRect(p.x - 0.12 * UNIT, o.y - rim - 0.14 * UNIT, 0.24 * UNIT, 0.14 * UNIT)
  g.fillStyle(0xffd27a, a)
  g.fillRect(p.x - 0.09 * UNIT, o.y - rim - 0.11 * UNIT, 0.18 * UNIT, 0.08 * UNIT)
  for (let k = 0; k < 3; k++) {
    const s = (t * 0.4 + k / 3) % 1
    g.lineStyle(0.02 * UNIT, 0xbfefff, a * 0.7 * Math.sin(s * Math.PI))
    g.strokeCircle(o.x + o.w + rim * 0.5 + Math.sin(t * 3 + k) * 0.05 * UNIT, o.y + o.h - s * p.h * 1.2, (0.04 + 0.03 * k) * UNIT)
  }
}

/** 紫水晶洞穴的暗道口：一圈粗糙的玄武岩拱，拱上长着一簇簇紫水晶、一颗黄水晶；门扇是一块嵌着紫色晶脉的石板 */
function grotto(g: G, p: DoorPose): void {
  const a = p.alpha
  const o = hole(p)
  const rim = p.w * 0.14
  g.fillStyle(0x24202c, a)
  g.fillRect(o.x - rim, o.y, rim, o.h)
  g.fillRect(o.x + o.w, o.y, rim, o.h)
  g.fillEllipse(p.x, o.y, o.w + rim * 2, rim * 3)
  inside(g, p)
  const l = leaf(p)
  g.fillStyle(0x3a3444, a)
  g.fillRect(l.x, l.y, l.w, l.h)
  g.lineStyle(0.03 * UNIT, 0x9a60e0, a * 0.8)
  g.lineBetween(l.x + l.w * 0.2, l.y + l.h * 0.15, l.x + l.w * 0.7, l.y + l.h * 0.5)
  g.lineBetween(l.x + l.w * 0.7, l.y + l.h * 0.5, l.x + l.w * 0.35, l.y + l.h * 0.85)
  const crystal = (x: number, y: number, s: number, c: number, lean: number): void => {
    g.fillStyle(c, a)
    g.fillTriangle(x - s * 0.35, y, x + s * 0.35, y, x + lean * s, y - s * 1.6)
    g.fillStyle(lift(c, 0.45), a)
    g.fillTriangle(x, y, x + s * 0.35, y, x + lean * s, y - s * 1.6)
  }
  const s = 0.18 * UNIT
  crystal(o.x - rim * 0.3, o.y + o.h * 0.15, s, 0x8a4ad8, -0.5)
  crystal(o.x - rim * 0.1, o.y - rim * 0.3, s * 1.2, 0xa060f0, -0.3)
  crystal(p.x - o.w * 0.15, o.y - rim * 1.1, s, 0x7a3ac8, 0.1)
  crystal(p.x + o.w * 0.2, o.y - rim * 1.2, s * 1.3, 0xe8b830, 0.2)
  crystal(o.x + o.w + rim * 0.2, o.y - rim * 0.2, s * 1.1, 0x9a56e8, 0.45)
  crystal(o.x + o.w + rim * 0.4, o.y + o.h * 0.45, s * 0.8, 0x8a4ad8, 0.6)
}

/** 浮冰上冰砖砌的门：一块块发蓝的冰砖，门顶一层积雪；门扇是一块起了霜、带着裂纹的厚冰 */
function ice(g: G, p: DoorPose): void {
  const a = p.alpha
  const o = hole(p)
  const rim = p.w * 0.13
  const brick = o.h / 5
  for (const x of [o.x - rim, o.x + o.w]) {
    for (let k = 0; k < 5; k++) {
      g.fillStyle(k % 2 ? 0xb8e8f8 : 0xd4f4ff, a)
      g.fillRect(x, o.y + k * brick, rim, brick)
      g.lineStyle(0.02 * UNIT, 0x7ab8d0, a)
      g.strokeRect(x, o.y + k * brick, rim, brick)
    }
  }
  g.fillStyle(0xc4ecfa, a)
  g.fillRect(o.x - rim, o.y - rim, o.w + rim * 2, rim)
  g.lineStyle(0.02 * UNIT, 0x7ab8d0, a)
  g.strokeRect(o.x - rim, o.y - rim, o.w + rim * 2, rim)
  g.fillStyle(0xffffff, a)
  g.fillEllipse(p.x, o.y - rim, o.w + rim * 2.6, rim * 1.3)
  inside(g, p)
  const l = leaf(p)
  g.fillStyle(0x9ad8f0, a * 0.92)
  g.fillRect(l.x, l.y, l.w, l.h)
  g.fillStyle(0xffffff, a * 0.35)
  g.fillRect(l.x, l.y, l.w, l.h * 0.18)
  g.lineStyle(0.025 * UNIT, 0xffffff, a * 0.7)
  g.lineBetween(l.x + l.w * 0.15, l.y + l.h * 0.3, l.x + l.w * 0.55, l.y + l.h * 0.55)
  g.lineBetween(l.x + l.w * 0.55, l.y + l.h * 0.55, l.x + l.w * 0.4, l.y + l.h * 0.8)
  g.lineBetween(l.x + l.w * 0.55, l.y + l.h * 0.55, l.x + l.w * 0.9, l.y + l.h * 0.62)
}

/** 真正的出口：一扇普普通通的白门，开着一道缝，门里是日光 */
function plain(g: G, p: DoorPose): void {
  const a = p.alpha
  const o = hole(p)
  const rim = p.w * 0.08
  g.fillStyle(0xe8eef0, a)
  g.fillRect(o.x - rim, o.y - rim, o.w + rim * 2, o.h + rim)
  inside(g, p)
  const l = leaf(p)
  g.fillStyle(0xf4f6f6, a)
  g.fillRect(l.x, l.y, l.w, l.h)
  g.fillStyle(0xb0b8bc, a)
  g.fillRect(l.x + l.w - 0.1 * UNIT, l.y + l.h * 0.52, 0.06 * UNIT, 0.03 * UNIT)
}

/** 门的样子：0 到 3 按签名是春夏秋冬四扇，4 是正中那扇真正的出口 */
export const PLAIN_DOOR = 4

export function drawDoor(g: G, style: number, p: DoorPose, t: number): void {
  if (style === 0) temple(g, p, t)
  else if (style === 1) hatch(g, p, t)
  else if (style === 2) grotto(g, p)
  else if (style === 3) ice(g, p)
  else plain(g, p)
}

/** 七段数码管的每一段：哪几个数字点亮它 */
const SEGS: readonly (readonly [number, number, number, number, string])[] = [
  [0, 0, 1, 0, '02356789'],
  [1, 0, 1, 1, '01234789'],
  [1, 1, 1, 2, '013456789'],
  [0, 2, 1, 2, '0235689'],
  [0, 1, 0, 2, '0268'],
  [0, 0, 0, 1, '045689'],
  [0, 1, 1, 1, '2345689-'],
]

/** 一位七段数码，像素：左上角 (x, y)，字高 h */
function digit(g: G, x: number, y: number, h: number, ch: string, color: number, alpha: number): void {
  const w = h * 0.5
  g.lineStyle(h * 0.14, color, alpha)
  for (const [x0, y0, x1, y1, on] of SEGS) {
    if (!on.includes(ch)) continue
    g.lineBetween(x + x0 * w, y + (y0 * h) / 2, x + x1 * w, y + (y1 * h) / 2)
  }
}

/**
 * 安全出口指示牌，像素：牌心 (x, y)、牌宽 w。绿底白边，左边一个往门里跑的白色小人，右边一块黑底的数码屏：
 * text 是屏上的两位（倒数的秒数、"--"），为空时屏上是一个往右的箭头；lit 是牌子亮几成（0 是熄了的灰绿）；run 让小人跑起来
 */
export function drawSign(g: G, x: number, y: number, w: number, text: string, lit: number, run: boolean, t: number, alpha: number): void {
  const h = w * 0.4
  const x0 = x - w / 2
  const y0 = y - h / 2
  const base = lit > 0 ? EXIT_SIGN : 0x24382c
  g.fillStyle(shade(base, 0.35 + 0.65 * Math.max(lit, 0.25)), alpha)
  g.fillRect(x0, y0, w, h)
  g.lineStyle(h * 0.06, lit > 0 ? 0xffffff : 0x56645a, alpha * (0.5 + 0.5 * lit))
  g.strokeRect(x0, y0, w, h)
  // 往门里跑的小人：门框一道，人在门口
  const ink = lit > 0 ? 0xffffff : 0x667a6c
  const ia = alpha * (0.4 + 0.6 * lit)
  const mx = x0 + w * 0.22
  const my = y0 + h * 0.5
  const s = h * 0.36
  const step = run ? Math.sin(t * 14) : 0.6
  g.lineStyle(s * 0.22, ink, ia)
  g.strokeRect(x0 + w * 0.05, y0 + h * 0.16, w * 0.08, h * 0.68)
  g.fillStyle(ink, ia)
  g.fillCircle(mx + s * 0.25, my - s * 0.85, s * 0.2)
  g.lineBetween(mx + s * 0.15, my - s * 0.6, mx - s * 0.1, my + s * 0.1)
  g.lineBetween(mx - s * 0.1, my + s * 0.1, mx - s * 0.5 * step, my + s * 0.75)
  g.lineBetween(mx - s * 0.1, my + s * 0.1, mx + s * 0.45 * step, my + s * 0.7)
  g.lineBetween(mx + s * 0.1, my - s * 0.45, mx + s * 0.55, my - s * (0.15 + 0.2 * step))
  g.lineBetween(mx + s * 0.1, my - s * 0.45, mx - s * 0.4, my - s * (0.3 - 0.2 * step))
  // 数码屏
  const px = x0 + w * 0.46
  const pw = w * 0.48
  const py = y0 + h * 0.14
  const ph = h * 0.72
  g.fillStyle(0x020604, alpha)
  g.fillRect(px, py, pw, ph)
  if (lit <= 0) return
  const fg = 0xd8ffe6
  if (text) {
    const dh = ph * 0.72
    for (let k = 0; k < text.length; k++) digit(g, px + pw * 0.16 + k * dh * 0.82, py + ph * 0.14, dh, text[k]!, fg, alpha * lit)
    return
  }
  const sweep = (t * 2) % 1
  g.lineStyle(ph * 0.14, fg, alpha * lit)
  for (let k = 0; k < 2; k++) {
    const ax = px + pw * (0.25 + 0.3 * k + 0.12 * sweep)
    g.lineBetween(ax, py + ph * 0.22, ax + pw * 0.18, py + ph * 0.5)
    g.lineBetween(ax + pw * 0.18, py + ph * 0.5, ax, py + ph * 0.78)
  }
}
