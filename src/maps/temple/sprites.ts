import { SUN } from '../../data/light'
import { valueNoise } from '../../util/noise'
import { glyphInk } from './ground'
import { toLocal } from './layout'
import type { Frame, Local, Rect, TrapKind } from './layout'

const LEN = Math.hypot(SUN.x, SUN.y, SUN.z)
const LX = SUN.x / LEN
const LY = SUN.y / LEN
const LZ = SUN.z / LEN

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

/** 一张按世界坐标摆正的贴图：盖住本地长方形转过去以后的外接框，左上角在 (x, y) 格，每格 ppu 像素 */
export interface Patch {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly ppu: number
}

/** 本地长方形转到世界里的外接框，外扩 pad 格 */
export function patchOf(f: Frame, r: Rect, ppu: number, pad: number): Patch {
  const xs: number[] = []
  const ys: number[] = []
  for (const a of [r.a0, r.a1]) {
    for (const b of [r.b0, r.b1]) {
      xs.push(f.ox + f.nx * a + f.tx * b)
      ys.push(f.oy + f.ny * a + f.ty * b)
    }
  }
  const x = Math.min(...xs) - pad
  const y = Math.min(...ys) - pad
  return { x, y, w: Math.ceil((Math.max(...xs) + pad - x) * ppu), h: Math.ceil((Math.max(...ys) + pad - y) * ppu), ppu }
}

/** 逐像素画一张世界摆正的贴图：fn 拿到像素中心的本地坐标与世界坐标（格），往 out 里写 0–255 的 RGBA */
export function paintPatch(ctx: CanvasRenderingContext2D, f: Frame, p: Patch, fn: (a: number, b: number, x: number, y: number, out: number[]) => void): void {
  const img = ctx.createImageData(p.w, p.h)
  const L: Local = { a: 0, b: 0 }
  const c = [0, 0, 0, 0]
  for (let j = 0; j < p.h; j++) {
    for (let i = 0; i < p.w; i++) {
      const x = p.x + (i + 0.5) / p.ppu
      const y = p.y + (j + 0.5) / p.ppu
      toLocal(f, x, y, L)
      c[0] = c[1] = c[2] = c[3] = 0
      fn(L.a, L.b, x, y, c)
      const o = (j * p.w + i) * 4
      img.data[o] = c[0]!
      img.data[o + 1] = c[1]!
      img.data[o + 2] = c[2]!
      img.data[o + 3] = c[3]!
    }
  }
  ctx.putImageData(img, 0, 0)
}

/**
 * 压板：一块发黑的玄武岩方板，刻着它那种机关的符号，刻痕里填着骨白的石灰。复位好了的板比地面高出一点，四条边倒成斜面，迎着太阳的亮、背着的暗；
 * 踩下去的板沉进槽里，靠太阳那两条边被槽沿投下一道影子，符号也暗下去。(u, v) 是板上的本地坐标，±1 是板边；(dx, dy) 是离板心的世界偏移（格）
 */
export function plateShade(kind: TrapKind, u: number, v: number, dx: number, dy: number, half: number, sunk: boolean, x: number, y: number, out: number[]): void {
  if (Math.abs(u) > 1 || Math.abs(v) > 1) return
  const grain = 0.86 + 0.28 * valueNoise(x * 18, y * 18, 7) * (0.7 + 0.3 * valueNoise(x * 4, y * 4, 9))
  let r = 66 * grain
  let g = 74 * grain
  let bl = 68 * grain
  const ink = glyphInk(kind, u / 0.74, v / 0.74)
  r += ((sunk ? 112 : 226) - r) * ink * 0.92
  g += ((sunk ? 104 : 210) - g) * ink * 0.92
  bl += ((sunk ? 84 : 164) - bl) * ink * 0.92
  const edge = (1 - Math.max(Math.abs(u), Math.abs(v))) * half
  let k = bevelLight(dx, dy, edge, !sunk)
  if (sunk) {
    // 槽沿的影子：从板边往背光的方向退进板里
    const sx = dx + LX * 0.28
    const sy = dy + LY * 0.28
    const inside = Math.max(Math.abs(sx), Math.abs(sy)) < half * 0.98
    k *= inside ? 0.72 : 0.42
  }
  out[0] = r * k
  out[1] = g * k
  out[2] = bl * k
  out[3] = 255
}

/** 方板的斜面打光：(dx, dy) 是离板心的世界偏移（格），edge 是离板边多远（格）；斜面朝外倒，迎着太阳的亮 */
export function bevelLight(dx: number, dy: number, edge: number, raised: boolean): number {
  const t = smooth(0.13, 0, edge)
  if (t <= 0) return raised ? 1.04 : 0.84
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  const nx = ax >= ay ? Math.sign(dx) * 0.75 * t : 0
  const ny = ay > ax ? Math.sign(dy) * 0.75 * t : 0
  const nz = Math.sqrt(1 - nx * nx - ny * ny)
  const lam = clamp01(nx * LX + ny * LY + nz * LZ) / LZ
  return raised ? 0.45 + 0.6 * lam : 0.7 + 0.14 * lam
}

/**
 * 一片刺阵弹起的石刺：每个孔里立着一根灰白的石锥，按假想的斜俯视立着画，锥尖往屏幕上方抬起离地的高度；迎着太阳的半边亮、背着的半边暗，
 * 尖上一点高光；每根在地上往背光的方向投一道影子。从后往前画，前面的压着后面的。p 是贴图盖住的世界范围，pitch 是孔距（格），tallU 是锥尖抬起多少格
 */
export function drawSpikes(ctx: CanvasRenderingContext2D, f: Frame, p: Patch, rect: Rect, pitch: number, tallU: number): void {
  const pts: { x: number; y: number }[] = []
  for (let u = pitch / 2; u < rect.a1 - rect.a0; u += pitch) {
    for (let v = pitch / 2; v < rect.b1 - rect.b0; v += pitch) {
      const a = rect.a0 + u
      const b = rect.b0 + v
      pts.push({ x: f.ox + f.nx * a + f.tx * b, y: f.oy + f.ny * a + f.ty * b })
    }
  }
  pts.sort((m, n) => m.y - n.y)
  const k = p.ppu
  const px = (x: number): number => (x - p.x) * k
  const py = (y: number): number => (y - p.y) * k
  const away = { x: -LX / Math.hypot(LX, LY), y: -LY / Math.hypot(LX, LY) }
  const half = 0.11
  const shadow = tallU * 0.9
  ctx.fillStyle = 'rgba(8, 10, 6, 0.45)'
  for (const q of pts) {
    ctx.beginPath()
    ctx.moveTo(px(q.x - away.y * half), py(q.y + away.x * half))
    ctx.lineTo(px(q.x + away.x * shadow), py(q.y + away.y * shadow))
    ctx.lineTo(px(q.x + away.y * half), py(q.y - away.x * half))
    ctx.closePath()
    ctx.fill()
  }
  for (const q of pts) {
    const bx = px(q.x)
    const by = py(q.y)
    const tx = bx
    const ty = py(q.y - tallU)
    const w = half * k
    ctx.fillStyle = '#d9cfbd'
    ctx.beginPath()
    ctx.moveTo(bx - w, by)
    ctx.lineTo(tx, ty)
    ctx.lineTo(bx, by + w * 0.35)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#7d7466'
    ctx.beginPath()
    ctx.moveTo(bx + w, by)
    ctx.lineTo(tx, ty)
    ctx.lineTo(bx, by + w * 0.35)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgba(255, 250, 235, 0.9)'
    ctx.beginPath()
    ctx.moveTo(tx, ty)
    ctx.lineTo(tx - w * 0.25, ty + w * 0.9)
    ctx.lineTo(tx + w * 0.1, ty + w * 0.9)
    ctx.closePath()
    ctx.fill()
  }
}

/** 开着的陷坑：深黑的坑，四壁的石头一层层往下暗，坑底一排削尖的竹签，散着几块骨头；两扇翻板挂在两侧的轴上垂下去，只看得见它们的边 */
export function pitShade(rect: Rect, a: number, b: number, x: number, y: number, out: number[]): void {
  const la = rect.a1 - rect.a0
  const lb = rect.b1 - rect.b0
  const u = a - rect.a0
  const v = b - rect.b0
  if (u < 0 || v < 0 || u > la || v > lb) return
  const e = Math.min(u, la - u, v, lb - v)
  const depth = smooth(0, 0.9, e)
  let r = 56 * (1 - depth) + 8 * depth
  let g = 50 * (1 - depth) + 7 * depth
  let bl = 42 * (1 - depth) + 6 * depth
  const course = Math.abs(Math.sin(e * 22))
  r *= 0.85 + 0.15 * course
  g *= 0.85 + 0.15 * course
  bl *= 0.85 + 0.15 * course
  // 垂下去的两扇翻板：贴着两侧的轴，看得见一道窄窄的板边
  const flap = Math.min(v, lb - v)
  if (flap < 0.18) {
    const t = 1 - flap / 0.18
    r += (118 - r) * t * 0.8
    g += (104 - g) * t * 0.8
    bl += (88 - bl) * t * 0.8
  }
  // 坑底的竹签：一排排削尖的头，迎光一点亮
  if (e > 0.5) {
    const su = u * 3.2
    const sv = v * 3.2
    const fu = su - Math.floor(su) - 0.5
    const fv = sv - Math.floor(sv) - 0.5
    const d = Math.hypot(fu, fv)
    if (d < 0.18 && valueNoise(Math.floor(su), Math.floor(sv), 3) > 0.25) {
      const k = 1 - d / 0.18
      r += (150 - r) * k * 0.6
      g += (128 - g) * k * 0.6
      bl += (76 - bl) * k * 0.6
    }
    const bone = valueNoise(x * 2.5, y * 2.5, 17)
    if (bone > 0.78) {
      r += (186 - r) * 0.5
      g += (176 - g) * 0.5
      bl += (150 - bl) * 0.5
    }
  }
  out[0] = r
  out[1] = g
  out[2] = bl
  out[3] = 255
}

/**
 * 滚石：一颗灰绿的石球，赤道一圈刻着回纹带，两极各刻一个螺旋——和石槽边的压板刻的一样。按俯视的正交投影逐像素画：
 * 像素对应球面上的一点，按滚过的角度绕滚动轴转回去取纹样，再按太阳打光。roll 是滚过的角度，axis 是滚动轴在画面上的方向（弧度）
 */
export function drawBoulder(img: ImageData, roll: number, axis: number): void {
  const n = img.width
  const c = (n - 1) / 2
  const R = c - 1
  const ax = Math.cos(axis)
  const ay = Math.sin(axis)
  const cr = Math.cos(roll)
  const sr = Math.sin(roll)
  const d = img.data
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const o = (j * n + i) * 4
      const px = (i - c) / R
      const py = (j - c) / R
      const rr = px * px + py * py
      if (rr > 1) {
        d[o + 3] = 0
        continue
      }
      const pz = Math.sqrt(1 - rr)
      // 球面上这一点在石球自己的坐标里：s 沿滚动轴，t、w 是绕轴转的两个分量
      const s = px * ax + py * ay
      const t0 = -px * ay + py * ax
      const t = t0 * cr - pz * sr
      const w = t0 * sr + pz * cr
      const lat = Math.asin(Math.max(-1, Math.min(1, s)))
      const lon = Math.atan2(w, t)
      let k = 0.86 + 0.14 * valueNoise(lon * 3 + 9, lat * 6 + 9, 41) + 0.1 * (valueNoise(lon * 9, lat * 14, 43) - 0.5)
      // 赤道一圈回纹带
      if (Math.abs(lat) < 0.22) {
        const fret = Math.abs(Math.sin(lon * 8)) > 0.75 || Math.abs(lat) > 0.17 ? 0.62 : 1
        k *= fret
      }
      // 两极的螺旋
      const pole = Math.PI / 2 - Math.abs(lat)
      if (pole < 0.75) {
        const sp = Math.abs(((pole * 3.2 - lon / (Math.PI * 2)) % 1 + 1.5) % 1 - 0.5)
        if (sp < 0.12) k *= 0.6
      }
      const lam = clamp01(px * LX + py * LY + pz * LZ)
      const light = 0.35 + 0.78 * lam
      const rim = smooth(0.85, 1, Math.sqrt(rr)) * 0.25
      d[o] = (150 * k * light) * (1 - rim)
      d[o + 1] = (148 * k * light) * (1 - rim)
      d[o + 2] = (132 * k * light) * (1 - rim)
      d[o + 3] = 255 * smooth(1, 0.96, Math.sqrt(rr))
    }
  }
}

/** 一支飞镖：骨白的镖身，前头一截黑曜石的尖，后头一撮红黑的羽毛；朝 +x */
export function drawDart(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const m = h / 2
  ctx.fillStyle = '#7a1f12'
  ctx.beginPath()
  ctx.moveTo(0, m - h * 0.42)
  ctx.lineTo(w * 0.3, m - h * 0.08)
  ctx.lineTo(w * 0.3, m + h * 0.08)
  ctx.lineTo(0, m + h * 0.42)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#1b1b1b'
  ctx.fillRect(w * 0.06, m - h * 0.06, w * 0.12, h * 0.12)
  ctx.fillStyle = '#e8dcc2'
  ctx.fillRect(w * 0.22, m - h * 0.09, w * 0.6, h * 0.18)
  ctx.fillStyle = '#202024'
  ctx.beginPath()
  ctx.moveTo(w * 0.8, m - h * 0.14)
  ctx.lineTo(w, m)
  ctx.lineTo(w * 0.8, m + h * 0.14)
  ctx.closePath()
  ctx.fill()
}

/** 一团柔和的光：中心实、往外淡，着色后当发光的眼睛、光斑用 */
export function drawGlow(ctx: CanvasRenderingContext2D, size: number): void {
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
}

/** 一道从树冠缝里斜照下来的光柱：顺着长边两头淡出，横着中间亮，带一点絮状的不匀 */
export function drawBeam(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const img = ctx.createImageData(w, h)
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const u = (i + 0.5) / w
      const v = (j + 0.5) / h
      const across = Math.sin(Math.PI * u) ** 2
      const along = smooth(0, 0.25, v) * smooth(1, 0.55, v)
      const fluff = 0.7 + 0.3 * valueNoise(u * 4, v * 9, 5)
      const o = (j * w + i) * 4
      img.data[o] = 255
      img.data[o + 1] = 255
      img.data[o + 2] = 255
      img.data[o + 3] = 255 * across * along * fluff
    }
  }
  ctx.putImageData(img, 0, 0)
}

/** 一闪的金光：四芒的星 */
export function drawGlint(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2
  const img = ctx.createImageData(size, size)
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = Math.abs(i + 0.5 - c) / c
      const y = Math.abs(j + 0.5 - c) / c
      const star = Math.max(smooth(0.12, 0, y) * smooth(1, 0, x), smooth(0.12, 0, x) * smooth(1, 0, y))
      const core = smooth(0.35, 0, Math.hypot(x, y))
      const o = (j * size + i) * 4
      img.data[o] = 255
      img.data[o + 1] = 255
      img.data[o + 2] = 255
      img.data[o + 3] = 255 * Math.min(1, star + core)
    }
  }
  ctx.putImageData(img, 0, 0)
}

/** 金刚鹦鹉：从上往下看，红身子、展开的翅膀外黄内蓝、长长的尾羽；朝 +x，翅膀横着展开 */
export function drawMacaw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const m = h / 2
  // 翅膀
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#2f6fd6'
    ctx.beginPath()
    ctx.moveTo(w * 0.52, m)
    ctx.quadraticCurveTo(w * 0.6, m + s * h * 0.3, w * 0.44, m + s * h * 0.5)
    ctx.lineTo(w * 0.3, m + s * h * 0.44)
    ctx.quadraticCurveTo(w * 0.36, m + s * h * 0.2, w * 0.36, m)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#f2c230'
    ctx.beginPath()
    ctx.moveTo(w * 0.52, m + s * h * 0.04)
    ctx.quadraticCurveTo(w * 0.56, m + s * h * 0.2, w * 0.48, m + s * h * 0.28)
    ctx.lineTo(w * 0.4, m + s * h * 0.22)
    ctx.closePath()
    ctx.fill()
  }
  // 尾羽
  ctx.fillStyle = '#c62828'
  ctx.beginPath()
  ctx.moveTo(w * 0.36, m - h * 0.05)
  ctx.lineTo(0, m - h * 0.02)
  ctx.lineTo(0, m + h * 0.02)
  ctx.lineTo(w * 0.36, m + h * 0.05)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#2f6fd6'
  ctx.fillRect(0, m - h * 0.012, w * 0.12, h * 0.024)
  // 身子与头
  ctx.fillStyle = '#d32f2f'
  ctx.beginPath()
  ctx.ellipse(w * 0.55, m, w * 0.16, h * 0.08, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(w * 0.74, m, w * 0.07, h * 0.065, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#f5f0e6'
  ctx.beginPath()
  ctx.ellipse(w * 0.79, m, w * 0.03, h * 0.05, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#222'
  ctx.beginPath()
  ctx.ellipse(w * 0.84, m, w * 0.03, h * 0.035, 0, 0, Math.PI * 2)
  ctx.fill()
}

/** 闪蝶：两片亮蓝的翅膀，外沿一圈黑边；朝 +x */
export function drawMorpho(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#101820'
    ctx.beginPath()
    ctx.ellipse(c + size * 0.08, c + s * size * 0.22, size * 0.2, size * 0.24, s * 0.3, 0, Math.PI * 2)
    ctx.ellipse(c - size * 0.12, c + s * size * 0.18, size * 0.15, size * 0.17, -s * 0.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#3fa9ff'
    ctx.beginPath()
    ctx.ellipse(c + size * 0.07, c + s * size * 0.2, size * 0.15, size * 0.18, s * 0.3, 0, Math.PI * 2)
    ctx.ellipse(c - size * 0.11, c + s * size * 0.16, size * 0.11, size * 0.12, -s * 0.2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(c - size * 0.22, c - size * 0.025, size * 0.44, size * 0.05)
}

/** 猴子：从上往下看，蜷着的棕色身子、浅色的脸、一条卷起的长尾巴；脸朝 +x */
export function drawMonkey(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2
  ctx.strokeStyle = '#5b3a22'
  ctx.lineWidth = size * 0.07
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(c - size * 0.18, c)
  ctx.bezierCurveTo(c - size * 0.45, c + size * 0.05, c - size * 0.45, c + size * 0.35, c - size * 0.25, c + size * 0.32)
  ctx.stroke()
  ctx.fillStyle = '#6d4527'
  ctx.beginPath()
  ctx.ellipse(c - size * 0.04, c, size * 0.2, size * 0.17, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(c + size * 0.2, c, size * 0.12, size * 0.12, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#d8b48a'
  ctx.beginPath()
  ctx.ellipse(c + size * 0.25, c, size * 0.07, size * 0.08, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#6d4527'
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(c + size * 0.17, c + s * size * 0.12, size * 0.04, size * 0.04, 0, 0, Math.PI * 2)
    ctx.fill()
  }
}
