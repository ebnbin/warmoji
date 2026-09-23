import Phaser from 'phaser'
import { query } from 'bitecs'
import { cubicEaseIn, cubicEaseOut } from '../utils/ease'
import { Depth, Fx, FxBeam, FxBolt, FxCircle, FxSlash, Transform } from '../components'
import { boltPts } from '../store'
import type { EcsWorld } from '../world'
import { fan, newScratch, quad, resetScratch, ringStrip, segment } from './tri'
import type { Scratch } from './tri'
import { SHAPE_BANDS as BANDS } from './bands'
import { EcsLayer } from './layer'
import { packTint } from './tint'
import { mainCameraOnly } from '../../util/camera'

// 四种形状类特效各是实体，画在 EcsShapeBatch；进度按 Fx.bornMs / durMs 在 renderWebGL 现算，时钟取 sim.fxMs


export interface CircleCue {
  readonly fill: number
  readonly fillAlpha: number
  /** 省略即无描边 */
  readonly stroke?: number
  readonly lineWidth?: number
  readonly lineAlpha?: number
  readonly fromScale: number
  readonly toScale: number
  readonly durationMs: number
  readonly depth: number
}


/** 空闲槽位标记（born 存的是 fxMs，恒 ≥ 0） */
const FREE = -1


type Matrix = Phaser.GameObjects.Components.TransformMatrix

export class CueLayer {
  // 屏幕固定，不在世界坐标里
  private readonly flash: Phaser.GameObjects.Rectangle
  private flashBorn = FREE
  private flashDur = 0
  private flashAlpha = 0

  private readonly batches: EcsShapeBatch[] = []
  private readonly scratch: Scratch = newScratch()

  /** step 每帧写入，投放取它作为起点 */
  private now = 0

  constructor(scene: Phaser.Scene, private readonly world: EcsWorld) {
    this.flash = mainCameraOnly(
      scene.add
        .rectangle(scene.scale.width / 2, scene.scale.height / 2, 6000, 6000, 0xffffff, 1)
        .setScrollFactor(0)
        .setDepth(200)
        .setVisible(false),
    )
    for (let b = 0; b < BANDS.length; b++) this.batches.push(new EcsShapeBatch(scene, this, b))
  }

  destroy(): void {
    this.flash.destroy()
    for (const b of this.batches) b.destroy()
    this.batches.length = 0
  }

  /** 须在本帧的投放之前调用 */
  step(fxMs: number): void {
    this.now = fxMs
    if (this.flashBorn !== FREE) {
      const t = (fxMs - this.flashBorn) / this.flashDur
      if (t >= 1) {
        this.flashBorn = FREE
        this.flash.setVisible(false)
      } else {
        this.flash.setAlpha(this.flashAlpha * (1 - t))
      }
    }
  }

  buildBand(band: number, m: Matrix): Scratch {
    const o = this.scratch
    resetScratch(o)
    const { zMin, zMax } = BANDS[band]!
    const fx = this.now
    const age = (k: number): number => (fx - Fx.bornMs[k]!) / Fx.durMs[k]!

    for (const k of query(this.world, [Fx, FxCircle, Transform, Depth])) {
      const d = Depth.z[k]!
      if (d < zMin || d >= zMax) continue
      const e = cubicEaseOut(age(k))
      const s = FxCircle.from[k]! + (FxCircle.to[k]! - FxCircle.from[k]!) * e
      const r = FxCircle.r[k]! * s
      const fade = 1 - e
      const x = Transform.x[k]!
      const y = Transform.y[k]!
      fan(o, m, x, y, r, packTint(FxCircle.fill[k]!, FxCircle.fillAlpha[k]! * fade))
      const stroke = FxCircle.stroke[k]!
      if (stroke >= 0) {
        ringStrip(o, m, x, y, r, FxCircle.lineW[k]! * s, packTint(stroke, FxCircle.lineAlpha[k]! * fade))
      }
    }

    // 光束外层在 7 带、白芯在 8 带
    const outer = zMin < 8
    const core = zMin >= 8 && zMax <= 9
    if (outer || core) {
      for (const k of query(this.world, [Fx, FxBeam, Transform])) {
        const e = cubicEaseIn(age(k))
        const sy = 1 - 0.85 * e
        const half = (core ? FxBeam.radius[k]! * 0.35 : FxBeam.radius[k]!) * sy
        const color = core ? 0xffffff : FxBeam.color[k]!
        const alpha = (core ? 0.95 : 0.55) * (1 - e)
        const a = Transform.rot[k]!
        const ca = Math.cos(a)
        const sa = Math.sin(a)
        const x = Transform.x[k]!
        const y = Transform.y[k]!
        const L = FxBeam.len[k]!
        quad(
          o, m,
          x - sa * half, y + ca * half,
          x + sa * half, y - ca * half,
          x + ca * L + sa * half, y + sa * L - ca * half,
          x + ca * L - sa * half, y + sa * L + ca * half,
          packTint(color, alpha),
        )
      }
    }

    // 闪电与斩击恒在最上一带
    if (zMax === Infinity) {
      for (const k of query(this.world, [Fx, FxBolt])) {
        const color = packTint(FxBolt.color[k]!, 0.95 * (1 - age(k)))
        const pts = boltPts[k]
        if (!pts) continue
        for (let p = 1; p < FxBolt.n[k]!; p++) {
          segment(o, m, pts[(p - 1) * 2]!, pts[(p - 1) * 2 + 1]!, pts[p * 2]!, pts[p * 2 + 1]!, 3, color)
        }
      }
      for (const k of query(this.world, [Fx, FxSlash, Transform])) {
        const a = Transform.rot[k]!
        ringStrip(
          o, m, Transform.x[k]!, Transform.y[k]!, FxSlash.r[k]!, 5,
          packTint(0xffffff, 0.9 * (1 - age(k))),
          a - 1.1, a + 1.1,
        )
      }
    }
    return o
  }


  screenFlash(color: number, alpha: number, durationMs: number): void {
    this.flash.setFillStyle(color, 1).setAlpha(alpha).setVisible(true)
    this.flashBorn = this.now
    this.flashDur = durationMs
    this.flashAlpha = alpha
  }
}

/** renderWebGL 由 RenderSteps 以裸函数调用，无 this 绑定，状态一律走 src */
class EcsShapeBatch extends EcsLayer {
  private readonly camMatrix = new Phaser.GameObjects.Components.TransformMatrix()

  constructor(scene: Phaser.Scene, private readonly layer: CueLayer, private readonly band: number) {
    super(scene, 'EcsShapeBatch', BANDS[band]!.depth)
    scene.add.existing(this)
  }

  renderWebGL(
    renderer: Phaser.Renderer.WebGL.WebGLRenderer,
    src: Phaser.GameObjects.GameObject,
    drawingContext: Phaser.Renderer.WebGL.DrawingContext,
  ): void {
    const self = src as EcsShapeBatch
    const camera = drawingContext.camera
    if (!camera) return
    const node = renderer.renderNodes.getNode('BatchHandlerTriFlat') as
      | { batch: (ctx: unknown, i: number[], v: number[], c: number[], l: null) => void }
      | null
    if (!node) return
    // v4 的视图矩阵已含 scroll；实参与核心各 Transformer 一致（!useCanvas）
    const m = self.camMatrix.copyFrom(camera.getViewMatrix(!drawingContext.useCanvas))
    const o = self.layer.buildBand(self.band, m)
    if (o.i.length === 0) return
    node.batch(drawingContext, o.i, o.v, o.c, null)
  }
}

