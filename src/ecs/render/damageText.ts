import Phaser from 'phaser'
import { query } from 'bitecs'
import { UI_FONT } from '../../util/fonts'
import { DamageNumber, Fx, Transform } from '../components'
import type { EcsWorld } from '../world'
import { EcsLayer } from './layer'
import { packTint } from './tint'


const TEX_KEY = 'ecs-damage-digits'
const CHARS = 10
/** 字形按 2 倍显示尺寸渲染 */
const CHAR_W = 24
const CHAR_H = 36



/** 幂等，纹理跨局有效 */
function bakeDigits(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX_KEY)) return
  const canvas = document.createElement('canvas')
  canvas.width = CHAR_W * CHARS
  canvas.height = CHAR_H
  const ctx = canvas.getContext('2d')!
  ctx.font = `bold 26px ${UI_FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 5
  ctx.fillStyle = '#ffffff'
  for (let i = 0; i < CHARS; i++) {
    const cx = i * CHAR_W + CHAR_W / 2
    ctx.strokeText(String(i), cx, CHAR_H / 2)
    ctx.fillText(String(i), cx, CHAR_H / 2)
  }
  scene.textures.addCanvas(TEX_KEY, canvas)
}

export class DamageTextLayer {
  private readonly batch: DamageTextBatch
  /** 本帧视觉钟 */
  private now = 0

  constructor(scene: Phaser.Scene, private readonly world: EcsWorld, private readonly enabled: boolean) {
    bakeDigits(scene)
    this.batch = new DamageTextBatch(scene, this)
  }

  destroy(): void {
    this.batch.destroy()
  }

  step(fxMs: number): void {
    this.now = fxMs
  }

  emit(
    node: {
      batch: (
        ctx: unknown, tex: unknown,
        x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number,
        u: number, v: number, uw: number, vh: number,
        tintMode: number, t0: number, t1: number, t2: number, t3: number,
        opts: unknown,
      ) => void
    },
    ctx: unknown,
    tex: unknown,
    m: Phaser.GameObjects.Components.TransformMatrix,
    opts: unknown,
  ): void {
    if (!this.enabled) return
    const fx = this.now
    for (const eid of query(this.world, [Fx, DamageNumber, Transform])) {
      const t = (fx - Fx.bornMs[eid]!) / Fx.durMs[eid]!
      const crit = DamageNumber.crit[eid] === 1
      const size = crit ? 34 : 24
      const gh = size
      const gw = (CHAR_W * size) / CHAR_H
      const cy = Transform.y[eid]! - 26 * t
      const tint = packTint(crit ? 0xffdc5d : 0xffffff, 1 - t)

      const n = DamageNumber.value[eid]!
      let digits = 1
      for (let v = n; v >= 10; v = Math.floor(v / 10)) digits++
      let left = Transform.x[eid]! - (digits * gw) / 2

      for (let d = digits - 1; d >= 0; d--) {
        let p = 1
        for (let k = 0; k < d; k++) p *= 10
        const digit = Math.floor(n / p) % 10
        const x0 = left
        const x1 = left + gw
        const y0 = cy - gh / 2
        const y1 = cy + gh / 2
        // v 轴取 GL 朝向，vh 为负
        const u = digit / CHARS
        node.batch(
          ctx, tex,
          m.getX(x0, y0), m.getY(x0, y0), // TL
          m.getX(x0, y1), m.getY(x0, y1), // BL
          m.getX(x1, y0), m.getY(x1, y0), // TR
          m.getX(x1, y1), m.getY(x1, y1), // BR
          u, 1, 1 / CHARS, -1,
          0, // TintModes.MULTIPLY
          tint, tint, tint, tint,
          opts,
        )
        left = x1
      }
    }
  }
}

/** 占 depth 50；renderWebGL 无 this 绑定，状态一律走 src */
class DamageTextBatch extends EcsLayer {
  private readonly camMatrix = new Phaser.GameObjects.Components.TransformMatrix()
  /** 须是复用的持久对象；multiTexturing 须显式开 */
  private readonly renderOptions = { multiTexturing: true }

  constructor(scene: Phaser.Scene, private readonly layer: DamageTextLayer) {
    super(scene, 'DamageTextBatch', 50)
    scene.add.existing(this)
  }

  renderWebGL(
    renderer: Phaser.Renderer.WebGL.WebGLRenderer,
    src: Phaser.GameObjects.GameObject,
    drawingContext: Phaser.Renderer.WebGL.DrawingContext,
  ): void {
    const self = src as DamageTextBatch
    const camera = drawingContext.camera
    if (!camera) return
    const node = renderer.renderNodes.getNode('BatchHandlerQuad')
    if (!node) return
    const tex = self.scene.textures.get(TEX_KEY).get().source.glTexture
    if (!tex) return
    // v4 的视图矩阵已含 scroll；实参与核心各 Transformer 一致（!useCanvas）
    const m = self.camMatrix.copyFrom(camera.getViewMatrix(!drawingContext.useCanvas))
    self.layer.emit(node as never, drawingContext, tex, m, self.renderOptions)
  }
}
