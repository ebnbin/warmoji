import Phaser from 'phaser'
import { EcsLayer, LayerType } from './layer'
import { packTint } from './tint'
import { newScratch, resetScratch } from './tri'
import type { Scratch } from './tri'

/** 圆周按弦高不过这么多设备像素来分段 */
const MAX_SAG = 0.25
const MIN_SEGS = 6
const MAX_SEGS = 128
/** 一个形状记几个数：种类、x、y、rx、ry、转角、起角、止角、线宽、颜色、透明度 */
const STRIDE = 11

enum Kind {
  Fill,
  Stroke,
  Line,
}

/** 屏幕上半径 r 设备像素的整圆分几段 */
function segments(r: number): number {
  if (r <= MAX_SAG) return MIN_SEGS
  const n = Math.ceil(Math.PI / Math.acos(1 - MAX_SAG / r))
  return n < MIN_SEGS ? MIN_SEGS : n > MAX_SEGS ? MAX_SEGS : n
}

/**
 * 一层平涂的圆、椭圆、弧和线段，写法同 Graphics：每帧 clear 后重记，渲染时按这台镜头的缩放决定圆分几段。
 * Graphics 每帧每台镜头都把每个圆展开成约 101 个新建的点再三角剖分；这里不剖分、不新建对象
 */
export class ShapeLayer extends EcsLayer {
  private rec = new Float64Array(STRIDE * 64)
  private count = 0
  private fill = 0xffffff
  private fillAlpha = 1
  private lineWidth = 1
  private line = 0xffffff
  private lineAlpha = 1
  private layerAlpha = 1
  private readonly camMatrix = new Phaser.GameObjects.Components.TransformMatrix()
  private readonly out: Scratch = newScratch()

  constructor(scene: Phaser.Scene, depth: number) {
    super(scene, LayerType.Shape, depth)
    scene.add.existing(this)
  }

  setDepth(depth: number): this {
    this.depth = depth
    return this
  }

  setBlendMode(mode: Phaser.BlendModes): this {
    this.blendMode = mode
    return this
  }

  setVisible(on: boolean): this {
    this.renderFlags = on ? this.renderFlags | 1 : this.renderFlags & ~1
    return this
  }

  get visible(): boolean {
    return (this.renderFlags & 1) !== 0
  }

  setAlpha(alpha: number): this {
    this.layerAlpha = alpha
    return this
  }

  clear(): this {
    this.count = 0
    return this
  }

  fillStyle(color: number, alpha = 1): this {
    this.fill = color
    this.fillAlpha = alpha
    return this
  }

  lineStyle(width: number, color: number, alpha = 1): this {
    this.lineWidth = width
    this.line = color
    this.lineAlpha = alpha
    return this
  }

  fillCircle(x: number, y: number, r: number): this {
    return this.push(Kind.Fill, x, y, r, r, 0, 0, Math.PI * 2, 0, this.fill, this.fillAlpha)
  }

  /** w、h 是整个椭圆的宽高，同 Graphics；rotation 是绕中心转的角 */
  fillEllipse(x: number, y: number, w: number, h: number, rotation = 0): this {
    return this.push(Kind.Fill, x, y, w / 2, h / 2, rotation, 0, Math.PI * 2, 0, this.fill, this.fillAlpha)
  }

  strokeCircle(x: number, y: number, r: number): this {
    return this.push(Kind.Stroke, x, y, r, r, 0, 0, Math.PI * 2, this.lineWidth, this.line, this.lineAlpha)
  }

  strokeEllipse(x: number, y: number, w: number, h: number, rotation = 0): this {
    return this.push(Kind.Stroke, x, y, w / 2, h / 2, rotation, 0, Math.PI * 2, this.lineWidth, this.line, this.lineAlpha)
  }

  /** 椭圆上从 a0 到 a1 的一段弧，按线宽描出来；圆弧时 rx、ry 相等 */
  strokeArc(x: number, y: number, rx: number, ry: number, a0: number, a1: number, rotation = 0): this {
    return this.push(Kind.Stroke, x, y, rx, ry, rotation, a0, a1, this.lineWidth, this.line, this.lineAlpha)
  }

  lineBetween(x0: number, y0: number, x1: number, y1: number): this {
    return this.push(Kind.Line, x0, y0, x1, y1, 0, 0, 0, this.lineWidth, this.line, this.lineAlpha)
  }

  private push(kind: Kind, x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number, width: number, color: number, alpha: number): this {
    if (alpha <= 0) return this
    let rec = this.rec
    const o = this.count * STRIDE
    if (o + STRIDE > rec.length) {
      const grown = new Float64Array(rec.length * 2)
      grown.set(rec)
      this.rec = rec = grown
    }
    rec[o] = kind
    rec[o + 1] = x
    rec[o + 2] = y
    rec[o + 3] = rx
    rec[o + 4] = ry
    rec[o + 5] = rot
    rec[o + 6] = a0
    rec[o + 7] = a1
    rec[o + 8] = width
    rec[o + 9] = color
    rec[o + 10] = alpha
    this.count++
    return this
  }

  renderWebGL(renderer: Phaser.Renderer.WebGL.WebGLRenderer, self: ShapeLayer, drawingContext: Phaser.Renderer.WebGL.DrawingContext): void {
    const camera = drawingContext.camera
    if (!camera || self.count === 0) return
    const node = renderer.renderNodes.getNode('BatchHandlerTriFlat') as { batch: (ctx: unknown, i: number[], v: number[], c: number[], l: null) => void } | null
    if (!node) return
    const m = self.camMatrix.copyFrom(camera.getViewMatrix(!drawingContext.useCanvas))
    const scale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c))
    const o = self.out
    resetScratch(o)
    const rec = self.rec
    for (let k = 0; k < self.count; k++) {
      const b = k * STRIDE
      const color = packTint(rec[b + 9]!, rec[b + 10]! * self.layerAlpha)
      const kind = rec[b] as Kind
      if (kind === Kind.Line) self.line4(o, m, rec[b + 1]!, rec[b + 2]!, rec[b + 3]!, rec[b + 4]!, rec[b + 8]!, color)
      else self.ellipse(o, m, scale, kind, b, color)
    }
    if (o.i.length > 0) node.batch(drawingContext, o.i, o.v, o.c, null)
  }

  private ellipse(o: Scratch, m: Phaser.GameObjects.Components.TransformMatrix, scale: number, kind: Kind, b: number, color: number): void {
    const rec = this.rec
    const x = rec[b + 1]!
    const y = rec[b + 2]!
    const rx = rec[b + 3]!
    const ry = rec[b + 4]!
    const cr = Math.cos(rec[b + 5]!)
    const sr = Math.sin(rec[b + 5]!)
    const a0 = rec[b + 6]!
    const span = rec[b + 7]! - a0
    const full = Math.abs(span) >= Math.PI * 2 - 1e-9
    const n = Math.max(1, Math.ceil((segments(Math.max(rx, ry) * scale) * Math.abs(span)) / (Math.PI * 2)))
    const d = span / n
    const base = o.c.length
    if (kind === Kind.Fill) {
      o.v.push(m.getX(x, y), m.getY(x, y))
      o.c.push(color)
      for (let k = 0; k < n; k++) {
        const t = a0 + k * d
        const ex = Math.cos(t) * rx
        const ey = Math.sin(t) * ry
        const px = x + cr * ex - sr * ey
        const py = y + sr * ex + cr * ey
        o.v.push(m.getX(px, py), m.getY(px, py))
        o.c.push(color)
        o.i.push(base, base + 1 + k, base + 1 + ((k + 1) % n))
      }
      return
    }
    const half = rec[b + 8]! / 2
    const ends = full ? n : n + 1
    for (let k = 0; k < ends; k++) {
      const t = a0 + k * d
      const c = Math.cos(t)
      const s = Math.sin(t)
      // 椭圆上这一点的外法向，没转之前是 (ry·cos t, rx·sin t)
      const nx0 = ry * c
      const ny0 = rx * s
      const nl = Math.sqrt(nx0 * nx0 + ny0 * ny0) || 1
      const ux = (cr * nx0 - sr * ny0) / nl
      const uy = (sr * nx0 + cr * ny0) / nl
      const px = x + cr * c * rx - sr * s * ry
      const py = y + sr * c * rx + cr * s * ry
      o.v.push(m.getX(px - ux * half, py - uy * half), m.getY(px - ux * half, py - uy * half))
      o.v.push(m.getX(px + ux * half, py + uy * half), m.getY(px + ux * half, py + uy * half))
      o.c.push(color, color)
    }
    for (let k = 0; k < n; k++) {
      const i0 = base + k * 2
      const i1 = base + ((k + 1) % ends) * 2
      o.i.push(i0, i0 + 1, i1 + 1, i0, i1 + 1, i1)
    }
  }

  private line4(o: Scratch, m: Phaser.GameObjects.Components.TransformMatrix, x0: number, y0: number, x1: number, y1: number, width: number, color: number): void {
    const dx = x1 - x0
    const dy = y1 - y0
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len === 0) return
    const nx = (-dy / len) * (width / 2)
    const ny = (dx / len) * (width / 2)
    const base = o.c.length
    o.v.push(m.getX(x0 + nx, y0 + ny), m.getY(x0 + nx, y0 + ny), m.getX(x0 - nx, y0 - ny), m.getY(x0 - nx, y0 - ny))
    o.v.push(m.getX(x1 - nx, y1 - ny), m.getY(x1 - nx, y1 - ny), m.getX(x1 + nx, y1 + ny), m.getY(x1 + nx, y1 + ny))
    o.c.push(color, color, color, color)
    o.i.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
}
