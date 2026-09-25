import Phaser from 'phaser'
import { UI_FONT } from '../../util/fonts'
import { DAMAGE_NUMBER_RISE_MS } from '../damageNumbers'
import type { DamageNumbers } from '../damageNumbers'
import { EcsLayer } from './layer'
import { packTint } from './tint'


const TEX_KEY = 'ecs-damage-digits'
const CHARS = 10
const CHAR_W = 24
const CHAR_H = 36



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
  private now = 0

  constructor(scene: Phaser.Scene, private readonly nums: DamageNumbers) {
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
    const fx = this.now
    const buf = this.nums
    const cap = buf.born.length
    for (let j = 0; j < cap; j++) {
      const i = (buf.head + j) % cap
      const t = (fx - buf.born[i]!) / DAMAGE_NUMBER_RISE_MS
      if (!(t >= 0 && t < 1)) continue
      const crit = buf.crit[i] === 1
      const size = crit ? 34 : 24
      const gh = size
      const gw = (CHAR_W * size) / CHAR_H
      const cy = buf.y[i]! - 26 * t
      const tint = packTint(crit ? 0xffdc5d : 0xffffff, 1 - t)

      const n = buf.value[i]!
      let digits = 1
      for (let v = n; v >= 10; v = Math.floor(v / 10)) digits++
      let left = buf.x[i]! - (digits * gw) / 2

      for (let d = digits - 1; d >= 0; d--) {
        let p = 1
        for (let k = 0; k < d; k++) p *= 10
        const digit = Math.floor(n / p) % 10
        const x0 = left
        const x1 = left + gw
        const y0 = cy - gh / 2
        const y1 = cy + gh / 2
        const u = digit / CHARS
        node.batch(
          ctx, tex,
          m.getX(x0, y0), m.getY(x0, y0),
          m.getX(x0, y1), m.getY(x0, y1),
          m.getX(x1, y0), m.getY(x1, y0),
          m.getX(x1, y1), m.getY(x1, y1),
          u, 1, 1 / CHARS, -1,
          0,
          tint, tint, tint, tint,
          opts,
        )
        left = x1
      }
    }
  }
}

class DamageTextBatch extends EcsLayer {
  private readonly camMatrix = new Phaser.GameObjects.Components.TransformMatrix()
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
    const m = self.camMatrix.copyFrom(camera.getViewMatrix(!drawingContext.useCanvas))
    self.layer.emit(node as never, drawingContext, tex, m, self.renderOptions)
  }
}
