import type Phaser from 'phaser'
import { UNIT } from '../../util/units'
import { FRAME, FRAME_MID } from '../frame'
import { canvasTexture } from '../textures'
import { savannaPlanFor } from './world'
import type { MapView, ViewCtx } from '../../ecs/views'
import type { Framing } from '../../ecs/lens'
import type { Sim } from '../../ecs/sim'
import type { Point } from '../../util/vec'

export class SavannaView implements MapView {
  private visuals: Phaser.GameObjects.GameObject[] = []

  layout(): { w: number; h: number; origin: Point } {
    return { w: FRAME.w, h: FRAME.h, origin: FRAME_MID }
  }

  build(v: ViewCtx): void {
    const plan = savannaPlanFor(v.def.savanna!, v.run.decorSeed)
    const b = plan.basin
    canvasTexture(v.scene, 'sav-dbg', b.cols, b.rows, (ctx) => {
      ctx.fillStyle = '#3a2a40'
      ctx.fillRect(0, 0, b.cols, b.rows)
      ctx.fillStyle = '#c8a86a'
      for (let j = 0; j < b.rows; j += 1) for (let i = 0; i < b.cols; i += 1) if (b.room[j * b.cols + i]! > 0) ctx.fillRect(i, j, 1, 1)
    })
    this.visuals.push(v.scene.add.image(b.x0, b.y0, 'sav-dbg').setOrigin(0, 0).setDisplaySize(b.cols * b.cell, b.rows * b.cell).setDepth(-1))
    const g = v.scene.add.graphics().setDepth(-0.9)
    g.fillStyle(0x6a4c8c, 1)
    for (const m of plan.marks.kopje!) g.fillCircle(m.x, m.y, 0.2 * UNIT)
    this.visuals.push(g)
  }

  framing(): Framing {
    return { map: FRAME, edge: 'frame' }
  }

  decor(): void {}

  onSimReady(_v: ViewCtx, _sim: Sim): void {}

  step(): void {}

  resize(): void {}

  destroy(v: ViewCtx): void {
    for (const o of this.visuals) o.destroy()
    this.visuals = []
    v.decor.length = 0
  }
}
