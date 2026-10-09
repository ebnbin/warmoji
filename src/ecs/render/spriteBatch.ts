import type Phaser from 'phaser'
import { query } from 'bitecs'
import { Depth, Quad, Sprite, Tint, Transform, VisOff, RENDERABLE } from '../components'
import type { EcsWorld } from '../world'
import type { EcsAtlas } from '../atlas'
import type { UnitLight } from '../../types/maps'
import { LayerType } from './layer'
import { quadNode, SpriteBatch } from './sprites'
import type { LightAt, PaintSprite } from './sprites'
import { rimOf, shotOf } from './side'
import { TINT_FILL } from './tint'
export { SPRITE_BANDS } from './bands'

/** z 在 [zMin, zMax) 里的实体精灵，与 paint 里同一段 z 的图按 z 排在一起画 */
export class EcsSpriteBatch extends SpriteBatch {
  private readonly world: EcsWorld
  private order: number[] = []
  private readonly zMin: number
  private readonly zMax: number

  /** paint 须按 z 从小到大排好 */
  constructor(scene: Phaser.Scene, world: EcsWorld, atlas: EcsAtlas, depth: number, zMin: number, zMax: number, paint: readonly PaintSprite[], light: UnitLight, lightAt: LightAt | undefined) {
    super(scene, LayerType.Sprite, depth, atlas, paint, light, lightAt)
    this.world = world
    this.zMin = zMin
    this.zMax = zMax
  }

  renderWebGL(
    renderer: Phaser.Renderer.WebGL.WebGLRenderer,
    self: EcsSpriteBatch,
    drawingContext: Phaser.Renderer.WebGL.DrawingContext,
  ): void {
    const camera = drawingContext.camera
    if (!camera) return

    const node = quadNode(renderer)
    if (!node) return

    const order = self.order
    order.length = 0
    for (const eid of query(self.world, RENDERABLE)) {
      const z = Depth.z[eid]!
      if (z >= self.zMin && z < self.zMax) order.push(eid)
    }
    const paint = self.paint
    let p = 0
    while (p < paint.length && paint[p]!.z < self.zMin) p++
    if (order.length === 0 && (p === paint.length || paint[p]!.z >= self.zMax)) return
    order.sort((a, b) => Depth.z[a]! - Depth.z[b]! || a - b)

    self.aim(camera, drawingContext)

    for (let i = 0; i < order.length; i++) {
      const eid = order[i]!
      for (; p < paint.length && paint[p]!.z < Depth.z[eid]!; p++) self.drawPaint(node, drawingContext, paint[p]!)
      const frame = Sprite.frame[eid]!
      if (frame < 0) continue
      const x = Transform.x[eid]! + VisOff.x[eid]!
      const y = Transform.y[eid]! + VisOff.y[eid]!
      let w = Transform.w[eid]!
      let h = Transform.h[eid]!
      let alpha = Tint.alpha[eid]!
      const shot = shotOf(self.world, eid)
      if (shot) {
        const k = Math.max(shot.size, shot.min / (w || 1))
        w *= k
        h *= k
        alpha *= shot.alpha
        const g = shot.glow
        if (g) self.draw(node, drawingContext, x, y, 0, w * g.size, h * g.size, 0, self.atlas.glow, 0, g.color, alpha * g.alpha, TINT_FILL, null)
      }
      self.draw(
        node, drawingContext,
        x, y, Transform.rot[eid]!,
        w, h, Sprite.flipX[eid]!, frame, Quad.v[eid]!,
        Tint.color[eid]!, alpha, Tint.effect[eid]!, shot ? shot.rim : rimOf(eid),
      )
    }
    for (; p < paint.length && paint[p]!.z < self.zMax; p++) self.drawPaint(node, drawingContext, paint[p]!)
  }
}
