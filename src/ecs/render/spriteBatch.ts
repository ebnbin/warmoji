import type Phaser from 'phaser'
import { query } from 'bitecs'
import { Depth, Floor, Quad, Sprite, Tint, Transform, VisOff, RENDERABLE } from '../components'
import { LIFT_PER_M } from '../../util/units'
import type { EcsWorld } from '../world'
import type { EcsAtlas } from '../atlas'
import type { UnitLight } from '../../types/maps'
import { LayerType } from './layer'
import { mulColor, quadNode, SpriteBatch } from './sprites'
import type { BodyLook, CutAt, LightAt, LocalCut, LookOf, PaintSprite, SpriteCut } from './sprites'
export { SPRITE_BANDS } from './bands'

/** 一张精灵最多切成这么多份 */
const MAX_CUTS = 2
const CUTS: SpriteCut[] = Array.from({ length: MAX_CUTS }, (): SpriteCut => ({ dx: 0, dy: 0, axis: 0, at: 0, keep: 1 }))
const LOCAL: LocalCut = { axis: 0, at: 0, keep: 1 }
const LOOK: BodyLook = { scale: 1, tint: 0xffffff, alpha: 1 }

/** z 在 [zMin, zMax) 里的实体精灵，与 paint 里同一段 z 的图按 z 排在一起画；站在高处的按脚下的地面抬起来，地图要切的精灵（正穿过传送门的）按份画，地图要改样子的按它给的画 */
export class EcsSpriteBatch extends SpriteBatch {
  private readonly world: EcsWorld
  private order: number[] = []
  private readonly zMin: number
  private readonly zMax: number
  private readonly cutAt: CutAt | undefined
  private readonly lookOf: LookOf | undefined

  /** paint 须按 z 从小到大排好 */
  constructor(scene: Phaser.Scene, world: EcsWorld, atlas: EcsAtlas, depth: number, zMin: number, zMax: number, paint: readonly PaintSprite[], light: UnitLight | undefined, lightAt: LightAt | undefined, cutAt: CutAt | undefined, lookOf?: LookOf) {
    super(scene, LayerType.Sprite, depth, atlas, paint, light, lightAt)
    this.world = world
    this.zMin = zMin
    this.zMax = zMax
    this.cutAt = cutAt
    this.lookOf = lookOf
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
      const gx = Transform.x[eid]!
      const gy = Transform.y[eid]!
      let w = Transform.w[eid]!
      let h = Transform.h[eid]!
      let lift = Floor.z[eid]! * LIFT_PER_M
      let color = Tint.color[eid]!
      let alpha = Tint.alpha[eid]!
      if (self.lookOf) {
        LOOK.scale = 1
        LOOK.tint = 0xffffff
        LOOK.alpha = 1
        if (self.lookOf(eid, LOOK)) {
          lift -= h * 0.5 * (1 - LOOK.scale)
          w *= LOOK.scale
          h *= LOOK.scale
          color = mulColor(color, LOOK.tint)
          alpha *= LOOK.alpha
        }
      }
      const n = self.cutAt ? self.cutAt(gx, gy, w * 0.5, h * 0.5, CUTS) : 0
      for (let k = 0; k < Math.max(1, n); k++) {
        const c = n > 0 ? CUTS[k]! : null
        if (c) {
          LOCAL.axis = c.axis
          LOCAL.at = c.at - (c.axis === 0 ? gx : gy)
          LOCAL.keep = c.keep
        }
        self.draw(
          node, drawingContext,
          gx + VisOff.x[eid]! + (c?.dx ?? 0), gy + VisOff.y[eid]! - lift + (c?.dy ?? 0), Transform.rot[eid]!,
          w, h, Sprite.flipX[eid]!, frame, Quad.v[eid]!,
          color, alpha, Tint.effect[eid]!, c ? LOCAL : undefined,
        )
      }
    }
    for (; p < paint.length && paint[p]!.z < self.zMax; p++) self.drawPaint(node, drawingContext, paint[p]!)
  }
}
