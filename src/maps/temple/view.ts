import Phaser from 'phaser'
import { UNIT } from '../../util/units'
import { FRAME } from '../frame'
import { wallLoops } from '../basin'
import { templeOf } from './world'
import { toMap } from './layout'
import type { MapView, ViewCtx } from '../../ecs/views'
import type { Framing } from '../../ecs/lens'
import type { Sim } from '../../ecs/sim'
import type { Point } from '../../util/vec'

export class TempleView implements MapView {
  private visuals: Phaser.GameObjects.GameObject[] = []
  private g?: Phaser.GameObjects.Graphics

  layout(): { w: number; h: number; origin: Point } {
    return { w: FRAME.w, h: FRAME.h, origin: { x: FRAME.w / 2, y: FRAME.h / 2 } }
  }

  build(v: ViewCtx): void {
    this.visuals.push(v.lens.screen.cover(v.scene.add.rectangle(0, 0, 1, 1, 0x10201a).setDepth(-2)))
  }

  framing(): Framing {
    return { map: FRAME, edge: 'frame' }
  }

  decor(): void {}

  onSimReady(v: ViewCtx, sim: Sim): void {
    const s = templeOf(sim)
    const g = v.scene.add.graphics().setDepth(-1)
    g.fillStyle(0x203018, 1).fillRect(0, 0, FRAME.w, FRAME.h)
    for (const loop of wallLoops(s.plan.basin)) {
      g.lineStyle(4, 0xa89080, 1)
      g.strokePoints(loop as unknown as Phaser.Math.Vector2[], true)
    }
    this.visuals.push(g)
    this.g = v.scene.add.graphics().setDepth(0.9)
    this.visuals.push(this.g)
  }

  step(_v: ViewCtx, sim: Sim): void {
    const g = this.g
    if (!g) return
    const s = templeOf(sim)
    const f = s.plan.frame
    g.clear()
    const quad = (r: { a0: number; a1: number; b0: number; b1: number }, color: number, alpha: number): void => {
      const pts = [toMap(f, r.a0, r.b0), toMap(f, r.a1, r.b0), toMap(f, r.a1, r.b1), toMap(f, r.a0, r.b1)].map((p) => ({ x: p.x * UNIT, y: p.y * UNIT }))
      g.fillStyle(color, alpha).fillPoints(pts as unknown as Phaser.Math.Vector2[], true)
    }
    s.plan.traps.forEach((t, k) => {
      const run = s.runs[k]!
      const on = run.phase === 'firing' ? 0.8 : run.phase === 'primed' ? 0.5 : 0.25
      if (t.kind === 'spikes' || t.kind === 'pit') quad(t.rect, t.kind === 'pit' ? 0x000000 : 0xff4400, on)
      if (t.kind === 'darts') quad({ a0: t.a - 0.8, a1: t.a + 0.8, b0: -s.plan.court.half, b1: s.plan.court.half }, 0xffff00, on * 0.4)
      if (t.kind === 'boulder') {
        quad({ a0: -s.plan.court.back, a1: s.plan.court.front, b0: t.b - 1.6, b1: t.b + 1.6 }, 0x664422, 0.3)
        if (run.phase === 'firing') {
          const p = toMap(f, run.roll, t.b)
          g.fillStyle(0x555555, 1).fillCircle(p.x * UNIT, p.y * UNIT, 1.35 * UNIT)
        }
      }
      quad({ a0: t.plate.a - 0.55, a1: t.plate.a + 0.55, b0: t.plate.b - 0.55, b1: t.plate.b + 0.55 }, run.phase === 'armed' ? 0xffcc00 : 0x333333, 1)
    })
    for (const d of s.darts) {
      const p = toMap(f, d.a, d.b)
      g.fillStyle(0xffffff, 1).fillCircle(p.x * UNIT, p.y * UNIT, 0.1 * UNIT)
    }
  }

  resize(): void {}

  destroy(v: ViewCtx): void {
    for (const o of this.visuals) o.destroy()
    this.visuals = []
    this.g = undefined
    v.decor.length = 0
  }
}
