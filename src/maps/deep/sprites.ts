import { SUN } from '../../data/light'
import { rimOf } from './sub'
import type { Hull } from './sub'

/** 圆角矩形的路径 */
function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + k, y)
  ctx.arcTo(x + w, y, x + w, y + h, k)
  ctx.arcTo(x + w, y + h, x, y + h, k)
  ctx.arcTo(x, y + h, x, y, k)
  ctx.arcTo(x, y, x + w, y, k)
  ctx.closePath()
}

/** 潜艇贴图在潜艇坐标里框住的范围（格）：左上角 (u0, v0)，宽 w 高 h；u 朝右是艇首，v 朝下是门那一舷 */
export interface SubFrame {
  readonly u0: number
  readonly v0: number
  readonly w: number
  readonly h: number
}

/** 艇身的贴图框：艇尾的螺旋桨、两舷的舵与边上的阴影都在里面 */
export function subFrame(h: Hull): SubFrame {
  const u0 = h.tail - h.tailR - 0.55
  const v0 = -h.r - 0.35
  return { u0, v0, w: h.bow + h.r + 0.2 - u0, h: 2 * h.r + 0.7 }
}

/** 开着的门的贴图框：门洞、放下来的踏板与踏板上的光 */
export function doorFrame(h: Hull): SubFrame {
  return { u0: h.door - 0.75, v0: h.r - 0.7, w: 1.5, h: 1.75 }
}

/** 落在谷底上的影子的贴图框：艇身往外留出一圈晕开的地方 */
export function shadowFrame(h: Hull): SubFrame {
  const u0 = h.tail - h.tailR - 0.9
  const v0 = -h.r - 0.9
  return { u0, v0, w: h.bow + h.r + 0.9 - u0, h: 2 * h.r + 1.8 }
}

/** 在框 f 里按每格 ppu 像素画：返回潜艇坐标到画布像素的换算 */
function mapper(f: SubFrame, ppu: number): { x: (u: number) => number; y: (v: number) => number; k: number } {
  return { x: (u) => (u - f.u0) * ppu, y: (v) => (v - f.v0) * ppu, k: ppu }
}

/** 沿艇壁一圈的路径 */
function hullPath(h: Hull, m: ReturnType<typeof mapper>): Path2D {
  const path = new Path2D()
  rimOf(h, 160).forEach((q, i) => (i === 0 ? path.moveTo(m.x(q.u), m.y(q.v)) : path.lineTo(m.x(q.u), m.y(q.v))))
  path.closePath()
  return path
}

/** 指挥塔的轮廓：前头圆、往后收窄的水滴 */
function sailPath(m: ReturnType<typeof mapper>, u0: number, u1: number, half: number): Path2D {
  const p = new Path2D()
  const len = u1 - u0
  p.moveTo(m.x(u0), m.y(0))
  p.bezierCurveTo(m.x(u0 + len * 0.05), m.y(-half * 1.25), m.x(u1 - len * 0.35), m.y(-half * 1.05), m.x(u1 - len * 0.05), m.y(-half * 0.55))
  p.quadraticCurveTo(m.x(u1 + len * 0.04), m.y(0), m.x(u1 - len * 0.05), m.y(half * 0.55))
  p.bezierCurveTo(m.x(u1 - len * 0.35), m.y(half * 1.05), m.x(u0 + len * 0.05), m.y(half * 1.25), m.x(u0), m.y(0))
  p.closePath()
  return p
}

/** 一块圆角的板：舵、指挥塔两侧的水平舵 */
function plate(ctx: CanvasRenderingContext2D, m: ReturnType<typeof mapper>, pts: readonly [number, number][], fill: string): void {
  ctx.beginPath()
  pts.forEach(([u, v], i) => (i === 0 ? ctx.moveTo(m.x(u), m.y(v)) : ctx.lineTo(m.x(u), m.y(v))))
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  ctx.lineJoin = 'round'
  ctx.lineWidth = 0.035 * m.k
  ctx.strokeStyle = 'rgba(25, 15, 0, 0.9)'
  ctx.stroke()
}

/** 黑黄相间的斜纹警示条：沿着从 (u0, v0) 到 (u1, v1) 的一条带子画，宽 w 格 */
function hazard(ctx: CanvasRenderingContext2D, m: ReturnType<typeof mapper>, u0: number, v0: number, u1: number, v1: number, w: number): void {
  const len = Math.hypot(u1 - u0, v1 - v0)
  const tu = (u1 - u0) / len
  const tv = (v1 - v0) / len
  const nu = (-tv * w) / 2
  const nv = (tu * w) / 2
  const at = (s: number, side: number): [number, number] => [m.x(u0 + tu * s + nu * side), m.y(v0 + tv * s + nv * side)]
  const n = Math.max(2, Math.round(len / (w * 1.4)))
  const skew = w * 0.6
  for (let i = 0; i < n; i++) {
    const a = (i / n) * len
    const b = ((i + 1) / n) * len
    ctx.fillStyle = i % 2 === 0 ? '#1d1d1f' : '#ffcc00'
    ctx.beginPath()
    ctx.moveTo(...at(a, -1))
    ctx.lineTo(...at(b, -1))
    ctx.lineTo(...at(Math.min(len, b + skew), 1))
    ctx.lineTo(...at(Math.min(len, a + skew), 1))
    ctx.closePath()
    ctx.fill()
  }
}

/**
 * 从正上方看的潜艇，艇首朝右、门那一舷朝下，按每格 ppu 像素画在框 f 里：黄漆的耐压艇身，背上一道防滑甲板、几道焊缝与铆钉，两舷有锈迹和附着的藤壶；
 * 艇首一扇透着暖光的圆观察窗与两盏探照灯，背上偏前一座水滴形的指挥塔（顶上舱盖、潜望镜，两侧伸出水平舵），艇尾收尖、伸出十字舵与带导流罩的螺旋桨；
 * 左舷一盏红灯、右舷一盏绿灯；门那一舷的舷边一扇关着的舱门，门框围一圈黑黄警示条。明暗按头顶的光：背脊最亮、两舷往下暗
 */
export function drawSub(ctx: CanvasRenderingContext2D, h: Hull, f: SubFrame, ppu: number): void {
  const m = mapper(f, ppu)
  const k = ppu
  const r = h.r
  const tipU = h.tail - h.tailR
  // 艇尾的水平舵压在艇身底下先画
  for (const side of [-1, 1]) {
    plate(
      ctx,
      m,
      [
        [h.tail + 0.65, side * h.tailR * 0.6],
        [h.tail - 0.05, side * (r * 0.98)],
        [h.tail - 0.42, side * (r * 0.98)],
        [h.tail - 0.28, side * h.tailR * 0.6],
      ],
      '#c48700',
    )
  }
  // 带导流罩的螺旋桨：从上往下看是一截短粗的罩子，罩里一根轴、几片桨叶的边
  const pu = tipU - 0.3
  ctx.fillStyle = '#2b2f36'
  rounded(ctx, m.x(pu - 0.22), m.y(-0.5), 0.44 * k, 1 * k, 0.12 * k)
  ctx.fill()
  ctx.fillStyle = '#596270'
  rounded(ctx, m.x(pu - 0.16), m.y(-0.42), 0.32 * k, 0.84 * k, 0.08 * k)
  ctx.fill()
  ctx.strokeStyle = '#1a1d22'
  ctx.lineWidth = 0.045 * k
  for (const v of [-0.26, 0, 0.26]) {
    ctx.beginPath()
    ctx.moveTo(m.x(pu - 0.12), m.y(v - 0.06))
    ctx.lineTo(m.x(pu + 0.12), m.y(v + 0.06))
    ctx.stroke()
  }
  ctx.fillStyle = '#3a3f46'
  ctx.fillRect(m.x(pu + 0.15), m.y(-0.06), (tipU - pu + 0.05) * k, 0.12 * k)
  // 艇身：背脊亮、两舷暗
  const hull = hullPath(h, m)
  const paint = ctx.createLinearGradient(0, m.y(-r), 0, m.y(r))
  paint.addColorStop(0, '#4f3200')
  paint.addColorStop(0.1, '#9a6200')
  paint.addColorStop(0.3, '#e09c00')
  paint.addColorStop(0.47, '#ffd23f')
  paint.addColorStop(0.53, '#ffd23f')
  paint.addColorStop(0.7, '#e09c00')
  paint.addColorStop(0.9, '#9a6200')
  paint.addColorStop(1, '#4f3200')
  ctx.fillStyle = paint
  ctx.fill(hull)
  ctx.save()
  ctx.clip(hull)
  // 艇首与艇尾往下弯，压暗一圈
  const bowShade = ctx.createRadialGradient(m.x(h.bow), m.y(0), r * 0.35 * k, m.x(h.bow), m.y(0), r * 1.02 * k)
  bowShade.addColorStop(0, 'rgba(30, 15, 0, 0)')
  bowShade.addColorStop(1, 'rgba(30, 15, 0, 0.55)')
  ctx.fillStyle = bowShade
  ctx.fillRect(m.x(h.bow), 0, (r + 0.3) * k, f.h * k)
  const sternShade = ctx.createLinearGradient(m.x(h.neck), 0, m.x(tipU), 0)
  sternShade.addColorStop(0, 'rgba(30, 15, 0, 0)')
  sternShade.addColorStop(1, 'rgba(30, 15, 0, 0.45)')
  ctx.fillStyle = sternShade
  ctx.fillRect(m.x(tipU), 0, (h.neck - tipU) * k, f.h * k)
  // 背上的防滑甲板与焊缝、铆钉
  ctx.fillStyle = 'rgba(120, 75, 0, 0.35)'
  ctx.fillRect(m.x(h.neck - 0.3), m.y(-0.22), (h.bow - h.neck + 0.1) * k, 0.44 * k)
  ctx.strokeStyle = 'rgba(90, 55, 0, 0.35)'
  ctx.lineWidth = 0.02 * k
  for (let u = h.neck - 0.25; u < h.bow - 0.2; u += 0.12) {
    ctx.beginPath()
    ctx.moveTo(m.x(u), m.y(-0.22))
    ctx.lineTo(m.x(u), m.y(0.22))
    ctx.stroke()
  }
  for (const u of [h.neck - 0.9, h.neck, -0.35 + h.door, 2]) {
    ctx.strokeStyle = 'rgba(60, 35, 0, 0.55)'
    ctx.lineWidth = 0.03 * k
    ctx.beginPath()
    ctx.moveTo(m.x(u), m.y(-r))
    ctx.lineTo(m.x(u), m.y(r))
    ctx.stroke()
    for (let v = -r + 0.12; v < r; v += 0.2) {
      ctx.fillStyle = 'rgba(50, 30, 0, 0.6)'
      ctx.beginPath()
      ctx.arc(m.x(u + 0.06), m.y(v), 0.022 * k, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  // 两舷的锈迹与藤壶
  for (let i = 0; i < 18; i++) {
    const u = tipU + 0.5 + ((i * 0.618) % 1) * (h.bow - tipU)
    const side = i % 2 === 0 ? -1 : 1
    const v = side * (r - 0.05 - ((i * 0.37) % 1) * 0.35)
    const rust = ctx.createLinearGradient(m.x(u), m.y(v), m.x(u), m.y(v - side * 0.35))
    rust.addColorStop(0, 'rgba(120, 50, 10, 0.55)')
    rust.addColorStop(1, 'rgba(120, 50, 10, 0)')
    ctx.strokeStyle = rust
    ctx.lineWidth = (0.03 + ((i * 0.43) % 1) * 0.04) * k
    ctx.beginPath()
    ctx.moveTo(m.x(u), m.y(v))
    ctx.lineTo(m.x(u + 0.03), m.y(v - side * 0.35))
    ctx.stroke()
  }
  for (let i = 0; i < 40; i++) {
    const u = tipU + 0.3 + ((i * 0.754) % 1) * (h.bow - tipU)
    const side = i % 2 === 0 ? -1 : 1
    const v = side * (r - 0.04 - ((i * 0.29) % 1) * 0.16)
    ctx.fillStyle = `rgba(205, 210, 200, ${0.35 + ((i * 0.53) % 1) * 0.3})`
    ctx.beginPath()
    ctx.arc(m.x(u), m.y(v), (0.025 + ((i * 0.31) % 1) * 0.03) * k, 0, Math.PI * 2)
    ctx.fill()
  }
  // 背脊上一道反光
  ctx.strokeStyle = 'rgba(255, 250, 215, 0.55)'
  ctx.lineWidth = 0.05 * k
  ctx.beginPath()
  ctx.moveTo(m.x(h.neck - 0.6), m.y(-0.05))
  ctx.lineTo(m.x(h.bow + 0.2), m.y(-0.05))
  ctx.stroke()
  // 门那一舷的舷边：关着的舱门，门框一圈警示条
  const du0 = h.door - 0.42
  const du1 = h.door + 0.42
  const dv0 = r - 0.62
  const dv1 = r - 0.06
  hazard(ctx, m, du0 - 0.06, dv0 - 0.04, du1 + 0.06, dv0 - 0.04, 0.09)
  hazard(ctx, m, du0 - 0.06, dv0 - 0.04, du0 - 0.06, dv1, 0.09)
  hazard(ctx, m, du1 + 0.06, dv0 - 0.04, du1 + 0.06, dv1, 0.09)
  ctx.fillStyle = '#b97c00'
  rounded(ctx, m.x(du0), m.y(dv0), (du1 - du0) * k, (dv1 - dv0) * k, 0.06 * k)
  ctx.fill()
  ctx.strokeStyle = 'rgba(30, 18, 0, 0.85)'
  ctx.lineWidth = 0.035 * k
  ctx.stroke()
  ctx.restore()
  ctx.lineWidth = 0.045 * k
  ctx.strokeStyle = 'rgba(25, 14, 0, 0.92)'
  ctx.stroke(hull)
  // 指挥塔：先压一圈影子，再画塔身、舱盖、潜望镜与两侧的水平舵
  const s0 = 0.2
  const s1 = 1.95
  const half = 0.42
  for (const side of [-1, 1]) {
    plate(
      ctx,
      m,
      [
        [s1 - 0.62, side * half * 0.8],
        [s1 - 0.55, side * 1.0],
        [s1 - 0.3, side * 1.0],
        [s1 - 0.28, side * half * 0.7],
      ],
      '#d89a00',
    )
  }
  const sail = sailPath(m, s0, s1, half)
  ctx.save()
  ctx.shadowColor = 'rgba(20, 10, 0, 0.6)'
  ctx.shadowBlur = 0.18 * k
  ctx.fillStyle = '#c48700'
  ctx.fill(sail)
  ctx.restore()
  const tower = ctx.createLinearGradient(0, m.y(-half), 0, m.y(half))
  tower.addColorStop(0, '#8a5600')
  tower.addColorStop(0.35, '#f2b400')
  tower.addColorStop(0.5, '#ffe07a')
  tower.addColorStop(0.65, '#f2b400')
  tower.addColorStop(1, '#8a5600')
  ctx.fillStyle = tower
  ctx.fill(sail)
  ctx.lineWidth = 0.04 * k
  ctx.strokeStyle = 'rgba(25, 14, 0, 0.92)'
  ctx.stroke(sail)
  ctx.fillStyle = '#5b5f66'
  ctx.beginPath()
  ctx.arc(m.x(s0 + 0.62), m.y(0), 0.19 * k, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#9aa1ab'
  ctx.beginPath()
  ctx.arc(m.x(s0 + 0.62), m.y(0), 0.14 * k, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#2b2f36'
  ctx.lineWidth = 0.035 * k
  ctx.beginPath()
  ctx.moveTo(m.x(s0 + 0.52), m.y(0))
  ctx.lineTo(m.x(s0 + 0.72), m.y(0))
  ctx.stroke()
  for (const [u, rr] of [
    [s0 + 1.05, 0.07],
    [s0 + 1.25, 0.05],
  ] as const) {
    ctx.fillStyle = '#26292e'
    ctx.beginPath()
    ctx.arc(m.x(u), m.y(0), rr * k, 0, Math.PI * 2)
    ctx.fill()
  }
  // 艇首：一扇透着暖光的圆观察窗，两盏探照灯
  const wu = h.bow + r * 0.5
  ctx.fillStyle = '#3a2a10'
  ctx.beginPath()
  ctx.ellipse(m.x(wu), m.y(0), r * 0.36 * k, r * 0.5 * k, 0, 0, Math.PI * 2)
  ctx.fill()
  const glass = ctx.createRadialGradient(m.x(wu - 0.05), m.y(0), 0.02 * k, m.x(wu), m.y(0), r * 0.42 * k)
  glass.addColorStop(0, '#ffe2a0')
  glass.addColorStop(0.45, '#d08a30')
  glass.addColorStop(1, '#1a1208')
  ctx.fillStyle = glass
  ctx.beginPath()
  ctx.ellipse(m.x(wu), m.y(0), r * 0.29 * k, r * 0.42 * k, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)'
  ctx.lineWidth = 0.035 * k
  ctx.beginPath()
  ctx.ellipse(m.x(wu), m.y(0), r * 0.2 * k, r * 0.32 * k, 0, Math.PI * 1.1, Math.PI * 1.45)
  ctx.stroke()
  for (const side of [-1, 1]) {
    const lu = h.bow + r * 0.12
    const lv = side * r * 0.74
    ctx.fillStyle = '#1d1f23'
    ctx.beginPath()
    ctx.arc(m.x(lu), m.y(lv), 0.14 * k, 0, Math.PI * 2)
    ctx.fill()
    const lamp = ctx.createRadialGradient(m.x(lu), m.y(lv), 0, m.x(lu), m.y(lv), 0.1 * k)
    lamp.addColorStop(0, '#ffffff')
    lamp.addColorStop(1, '#f4f1dc')
    ctx.fillStyle = lamp
    ctx.beginPath()
    ctx.arc(m.x(lu), m.y(lv), 0.095 * k, 0, Math.PI * 2)
    ctx.fill()
  }
  // 航行灯：左舷红、右舷绿
  for (const [side, color] of [
    [-1, '#ff3b30'],
    [1, '#30d158'],
  ] as const) {
    const glow = ctx.createRadialGradient(m.x(s0 + 0.3), m.y(side * (r - 0.18)), 0, m.x(s0 + 0.3), m.y(side * (r - 0.18)), 0.16 * k)
    glow.addColorStop(0, color)
    glow.addColorStop(0.45, color)
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(m.x(s0 + 0.3), m.y(side * (r - 0.18)), 0.16 * k, 0, Math.PI * 2)
    ctx.fill()
  }
}

/**
 * 开着的门，按每格 ppu 像素画在框 f 里（与艇身同一套潜艇坐标）：舷边的门洞透出暖光，门板翻下来平放在谷底上当踏板，踏板上有防滑纹、两边一道警示条，
 * 门洞的光顺着踏板往外铺
 */
export function drawDoor(ctx: CanvasRenderingContext2D, h: Hull, f: SubFrame, ppu: number): void {
  const m = mapper(f, ppu)
  const k = ppu
  const r = h.r
  const du0 = h.door - 0.42
  const du1 = h.door + 0.42
  const spill = ctx.createLinearGradient(0, m.y(r - 0.3), 0, m.y(r + 1.0))
  spill.addColorStop(0, 'rgba(255, 228, 160, 0.55)')
  spill.addColorStop(1, 'rgba(255, 228, 160, 0)')
  ctx.fillStyle = spill
  ctx.beginPath()
  ctx.moveTo(m.x(du0), m.y(r - 0.1))
  ctx.lineTo(m.x(du1), m.y(r - 0.1))
  ctx.lineTo(m.x(du1 + 0.3), m.y(r + 1.0))
  ctx.lineTo(m.x(du0 - 0.3), m.y(r + 1.0))
  ctx.closePath()
  ctx.fill()
  // 翻下来的门板
  ctx.fillStyle = '#7d828a'
  rounded(ctx, m.x(du0), m.y(r - 0.04), (du1 - du0) * k, 0.82 * k, 0.05 * k)
  ctx.fill()
  ctx.strokeStyle = 'rgba(30, 32, 36, 0.9)'
  ctx.lineWidth = 0.03 * k
  ctx.stroke()
  ctx.strokeStyle = 'rgba(40, 42, 46, 0.6)'
  ctx.lineWidth = 0.02 * k
  for (let v = r + 0.1; v < r + 0.74; v += 0.1) {
    ctx.beginPath()
    ctx.moveTo(m.x(du0 + 0.14), m.y(v))
    ctx.lineTo(m.x(du1 - 0.14), m.y(v))
    ctx.stroke()
  }
  hazard(ctx, m, du0 + 0.05, r + 0.02, du0 + 0.05, r + 0.74, 0.08)
  hazard(ctx, m, du1 - 0.05, r + 0.02, du1 - 0.05, r + 0.74, 0.08)
  // 门洞：透出艇里的暖光，靠艇心那一边压一道暗边
  const hole = ctx.createRadialGradient(m.x(h.door), m.y(r - 0.3), 0.02 * k, m.x(h.door), m.y(r - 0.3), 0.5 * k)
  hole.addColorStop(0, '#fff6d6')
  hole.addColorStop(0.6, '#ffcf6a')
  hole.addColorStop(1, '#d9861f')
  ctx.fillStyle = hole
  rounded(ctx, m.x(du0), m.y(r - 0.62), (du1 - du0) * k, 0.56 * k, 0.06 * k)
  ctx.fill()
  const lip = ctx.createLinearGradient(0, m.y(r - 0.62), 0, m.y(r - 0.42))
  lip.addColorStop(0, 'rgba(60, 30, 0, 0.6)')
  lip.addColorStop(1, 'rgba(60, 30, 0, 0)')
  ctx.fillStyle = lip
  ctx.fillRect(m.x(du0), m.y(r - 0.62), (du1 - du0) * k, 0.2 * k)
  ctx.fillStyle = '#26292e'
  ctx.fillRect(m.x(du0 - 0.02), m.y(r - 0.08), (du1 - du0 + 0.04) * k, 0.07 * k)
}

/** 艇身落在谷底上的影子：艇身的剪影往外晕开，按每格 ppu 像素画在框 f 里 */
export function drawSubShadow(ctx: CanvasRenderingContext2D, h: Hull, f: SubFrame, ppu: number): void {
  const m = mapper(f, ppu)
  const far = f.w * ppu * 2
  ctx.save()
  ctx.translate(-far, 0)
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)'
  ctx.shadowBlur = 0.35 * ppu
  ctx.shadowOffsetX = far
  ctx.fillStyle = '#000'
  ctx.fill(hullPath(h, m))
  ctx.restore()
}

/** 一个气泡：透明的球，边上一圈亮、靠太阳那边一个高光点，靠着色得到颜色 */
export function drawBubble(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2
  const R = size / 2 - 1
  const g = ctx.createRadialGradient(c, c, R * 0.55, c, c, R)
  g.addColorStop(0, 'rgba(255, 255, 255, 0.08)')
  g.addColorStop(0.8, 'rgba(255, 255, 255, 0.45)')
  g.addColorStop(1, 'rgba(255, 255, 255, 0.9)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(c, c, R, 0, Math.PI * 2)
  ctx.fill()
  const lx = SUN.x / Math.hypot(SUN.x, SUN.y)
  const ly = SUN.y / Math.hypot(SUN.x, SUN.y)
  const h = ctx.createRadialGradient(c + lx * R * 0.45, c + ly * R * 0.45, 0, c + lx * R * 0.45, c + ly * R * 0.45, R * 0.35)
  h.addColorStop(0, 'rgba(255, 255, 255, 1)')
  h.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = h
  ctx.beginPath()
  ctx.arc(c, c, R, 0, Math.PI * 2)
  ctx.fill()
}

/** 柔和的光团：中间亮、往外淡，叠加着画，灯的光晕、海雪、冷光都用它 */
export function drawHalo(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2
  const g = ctx.createRadialGradient(c, c, 0, c, c, c)
  g.addColorStop(0, 'rgba(255, 255, 255, 1)')
  g.addColorStop(0.25, 'rgba(255, 255, 255, 0.55)')
  g.addColorStop(0.6, 'rgba(255, 255, 255, 0.12)')
  g.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
}

/** 海雪的一片：一小团不规则的絮 */
export function drawFlake(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2
  for (let i = 0; i < 5; i++) {
    const a = i * 2.4
    const r = size * (0.12 + 0.05 * Math.sin(i * 1.7))
    const g = ctx.createRadialGradient(c + Math.cos(a) * size * 0.12, c + Math.sin(a) * size * 0.1, 0, c + Math.cos(a) * size * 0.12, c + Math.sin(a) * size * 0.1, r)
    g.addColorStop(0, 'rgba(255, 255, 255, 0.85)')
    g.addColorStop(1, 'rgba(255, 255, 255, 0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
  }
}
