import Phaser from 'phaser'
import { entityExists, query } from 'bitecs'
import { cubicEaseIn, cubicEaseOut, sineEaseInOut } from '../utils/ease'
import { Barrier, Depth, Fx, FxBeam, FxBolt, FxCircle, FxSlash, Link, Motion, MOTION, Radius, Tether, Transform, TRANSIT, Uid } from '../components'
import { boltPts } from '../store'
import type { EcsWorld } from '../world'
import { fan, quad, ringStrip, segment } from './tri'
import type { Scratch } from './tri'
import { SHAPE_BANDS as BANDS } from './bands'
import { LayerType, TriBatch } from './layer'
import { packTint } from './tint'


const FREE = -1


type Matrix = Phaser.GameObjects.Components.TransformMatrix

export class CueLayer {
  private readonly flash: Phaser.GameObjects.Rectangle
  private flashBorn = FREE
  private flashDur = 0
  private flashAlpha = 0

  private readonly batches: TriBatch[] = []

  private now = 0

  /** cover 让闪屏的矩形不管镜头怎么拍都盖满屏幕 */
  constructor(scene: Phaser.Scene, private readonly world: EcsWorld, cover: (rect: Phaser.GameObjects.Rectangle) => Phaser.GameObjects.Rectangle) {
    this.flash = cover(scene.add.rectangle(0, 0, 1, 1, 0xffffff, 1).setDepth(200).setVisible(false))
    for (let b = 0; b < BANDS.length; b++) this.batches.push(new TriBatch(scene, LayerType.Shape, BANDS[b]!.depth, (o, m) => this.buildBand(b, o, m)))
  }

  destroy(): void {
    this.flash.destroy()
    for (const b of this.batches) b.destroy()
    this.batches.length = 0
  }

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

  private buildBand(band: number, o: Scratch, m: Matrix): void {
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

    if (zMin === -Infinity) {
      for (const k of query(this.world, [Barrier])) {
        const color = Barrier.color[k]!
        const w = Barrier.thick[k]! * 2
        if (Barrier.shape[k] === 1) {
          ringStrip(o, m, Barrier.cx[k]!, Barrier.cy[k]!, Barrier.r[k]!, w, packTint(color, 0.7))
          continue
        }
        segment(o, m, Barrier.ax[k]!, Barrier.ay[k]!, Barrier.bx[k]!, Barrier.by[k]!, w, packTint(color, 0.8))
        segment(o, m, Barrier.ax[k]!, Barrier.ay[k]!, Barrier.bx[k]!, Barrier.by[k]!, w * 0.35, packTint(0xffffff, 0.7))
      }
      for (const k of query(this.world, [Link, Transform])) {
        const to = Link.to[k]!
        if (!entityExists(this.world, to) || Uid.v[to] !== Link.toUid[k]) continue
        segment(o, m, Transform.x[k]!, Transform.y[k]!, Transform.x[to]!, Transform.y[to]!, 3, packTint(Link.color[k]!, 0.55))
      }
      for (const k of query(this.world, [Motion, Radius])) {
        if (Motion.kind[k] !== MOTION.transit || Motion.look[k] !== TRANSIT.streak) continue
        const fx = Motion.fx[k]!
        const fy = Motion.fy[k]!
        const p = sineEaseInOut(Motion.t[k]! / Motion.ms[k]!)
        const x = fx + (Motion.tx[k]! - fx) * p
        const y = fy + (Motion.ty[k]! - fy) * p
        const w = Radius.v[k]! * 1.2
        segment(o, m, fx, fy, x, y, w, packTint(Motion.color[k]!, 0.3))
        segment(o, m, fx, fy, x, y, w * 0.3, packTint(0xffffff, 0.5))
      }
    }

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

    if (zMax === Infinity) {
      for (const k of query(this.world, [Fx, FxBolt])) {
        const color = packTint(FxBolt.color[k]!, 0.95 * (1 - age(k)))
        const pts = boltPts[k]
        if (!pts) continue
        for (let p = 1; p < FxBolt.n[k]!; p++) {
          segment(o, m, pts[(p - 1) * 2]!, pts[(p - 1) * 2 + 1]!, pts[p * 2]!, pts[p * 2 + 1]!, 3, color)
        }
      }
      const pulse = 0.55 + 0.35 * Math.sin(fx / 90)
      for (const k of query(this.world, [Tether])) {
        const a = Tether.a[k]!
        const b = Tether.b[k]!
        if (!entityExists(this.world, a) || !entityExists(this.world, b)) continue
        segment(o, m, Transform.x[a]!, Transform.y[a]!, Transform.x[b]!, Transform.y[b]!, 4, packTint(Tether.color[k]!, pulse))
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
  }


  screenFlash(color: number, alpha: number, durationMs: number): void {
    this.flash.setFillStyle(color, 1).setAlpha(alpha).setVisible(true)
    this.flashBorn = this.now
    this.flashDur = durationMs
    this.flashAlpha = alpha
  }
}
