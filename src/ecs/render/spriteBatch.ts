import type Phaser from 'phaser'
import { query } from 'bitecs'
import { Depth, Floor, Quad, Sprite, Tint, Transform, VisOff, RENDERABLE } from '../components'
import { LIFT_PER_M } from '../../util/units'
import type { EcsWorld } from '../world'
import type { EcsAtlas } from '../atlas'
import type { UnitLight } from '../../types/maps'
import { LayerType } from './layer'
import { quadNode, SpriteBatch } from './sprites'
import type { LightAt, PaintSprite } from './sprites'
export { SPRITE_BANDS } from './bands'

/** z 在 [zMin, zMax) 里的实体精灵，与 paint 里同一段 z 的图按 z 排在一起画；站在高处的按脚下的地面抬起来 */
export class EcsSpriteBatch extends SpriteBatch {
  private readonly world: EcsWorld
  private order: number[] = []
  private readonly zMin: number
  private readonly zMax: number

  /** paint 须按 z 从小到大排好 */
  constructor(scene: Phaser.Scene, world: EcsWorld, atlas: EcsAtlas, depth: number, zMin: number, zMax: number, paint: readonly PaintSprite[], light: UnitLight | undefined, lightAt: LightAt | undefined) {
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
      self.draw(
        node, drawingContext,
        Transform.x[eid]! + VisOff.x[eid]!, Transform.y[eid]! + VisOff.y[eid]! - Floor.z[eid]! * LIFT_PER_M, Transform.rot[eid]!,
        Transform.w[eid]!, Transform.h[eid]!, Sprite.flipX[eid]!, frame, Quad.v[eid]!,
        Tint.color[eid]!, Tint.alpha[eid]!, Tint.effect[eid]!,
      )
    }
    for (; p < paint.length && paint[p]!.z < self.zMax; p++) self.drawPaint(node, drawingContext, paint[p]!)
  }
}
