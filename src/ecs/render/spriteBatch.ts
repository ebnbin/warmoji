import type Phaser from 'phaser'
import { query } from 'bitecs'
import { Depth, Floor, Quad, Sprite, Tint, Transform, VisOff, RENDERABLE } from '../components'
import { LIFT_PER_M } from '../../util/units'
import { ART } from '../utils/ground'
import type { EcsWorld } from '../world'
import type { EcsAtlas } from '../atlas'
import type { UnitLight } from '../../types/maps'
import { LayerType } from './layer'
import { quadNode, SpriteBatch } from './sprites'
import type { CutAt, LightAt, LocalCut, PaintSprite, SpriteCut, SunkAt } from './sprites'
export { SPRITE_BANDS } from './bands'

/** 一张精灵最多切成这么多份 */
const MAX_CUTS = 2
const CUTS: SpriteCut[] = Array.from({ length: MAX_CUTS }, (): SpriteCut => ({ dx: 0, dy: 0, axis: 0, at: 0, keep: 1 }))
const LOCAL: LocalCut = { axis: 0, at: 0, keep: 1 }

/** z 在 [zMin, zMax) 里的实体精灵，与 paint 里同一段 z 的图按 z 排在一起画；站在高处的按脚下的地面抬起来，地图要切的精灵（正穿过传送门的）按份画，陷进地面的往下沉、只画露在地面上的那一截 */
export class EcsSpriteBatch extends SpriteBatch {
  private readonly world: EcsWorld
  private order: number[] = []
  private readonly zMin: number
  private readonly zMax: number
  private readonly cutAt: CutAt | undefined
  private readonly sunkAt: SunkAt | undefined

  /** paint 须按 z 从小到大排好 */
  constructor(scene: Phaser.Scene, world: EcsWorld, atlas: EcsAtlas, depth: number, zMin: number, zMax: number, paint: readonly PaintSprite[], light: UnitLight | undefined, lightAt: LightAt | undefined, cutAt: CutAt | undefined, sunkAt: SunkAt | undefined) {
    super(scene, LayerType.Sprite, depth, atlas, paint, light, lightAt)
    this.world = world
    this.zMin = zMin
    this.zMax = zMax
    this.cutAt = cutAt
    this.sunkAt = sunkAt
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
      const w = Transform.w[eid]!
      const h = Transform.h[eid]!
      const lift = Floor.z[eid]! * LIFT_PER_M
      let n = self.cutAt ? self.cutAt(gx, gy, w * 0.5, h * 0.5, CUTS) : 0
      const sunk = n === 0 && self.sunkAt ? self.sunkAt(eid) : 0
      if (sunk > 0) {
        // 整张往下沉 sunk 个画框高，脚下那条线以下的不画：落在地上的位置不动
        const c = CUTS[0]!
        c.dx = 0
        c.dy = sunk * h * ART
        c.axis = 1
        c.at = gy + (h * ART) / 2 - c.dy
        c.keep = -1
        n = 1
      }
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
          Tint.color[eid]!, Tint.alpha[eid]!, Tint.effect[eid]!, c ? LOCAL : undefined,
        )
      }
    }
    for (; p < paint.length && paint[p]!.z < self.zMax; p++) self.drawPaint(node, drawingContext, paint[p]!)
  }
}
