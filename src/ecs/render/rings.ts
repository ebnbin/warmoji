import Phaser from 'phaser'
import { query } from 'bitecs'
import { Echo, Ring, RING_SET, Tint, Transform } from '../components'
import { echoPts } from '../store'
import { fan, newScratch, resetScratch, ringStrip, segment } from './tri'
import type { Scratch } from './tri'
import type { EcsWorld } from '../world'
import { EcsLayer, LayerType } from './layer'
import { packTint } from './tint'

interface Breath {
  ms: number
  scaleLo: number
  scaleHi: number
  alphaLo: number
  alphaHi: number
}

const BREATHS: readonly Breath[] = [
  { ms: 1, scaleLo: 1, scaleHi: 1, alphaLo: 1, alphaHi: 1 },
  { ms: 700, scaleLo: 0.82, scaleHi: 1.12, alphaLo: 0.35, alphaHi: 0.9 },
  { ms: 650, scaleLo: 0.85, scaleHi: 1.12, alphaLo: 0.4, alphaHi: 0.85 },
]

const TRAIL_WIDTH = 5
const TRAIL_ALPHA_OLD = 0.16
const TRAIL_ALPHA_NEW = 0.34

const BANDS: readonly { depth: number; zMin: number; zMax: number }[] = [
  { depth: 2, zMin: -Infinity, zMax: 3 },
  { depth: 2.5, zMin: 3, zMax: 4 },
  { depth: 4, zMin: 4, zMax: Infinity },
]

function breath(age: number, ms: number): number {
  const t = (age % (ms * 2)) / ms
  return t <= 1 ? t : 2 - t
}

export class RingLayer {
  private readonly batches: EcsRingBatch[] = []
  private readonly scratch: Scratch = newScratch()
  private now = 0

  constructor(scene: Phaser.Scene, private readonly world: EcsWorld) {
    for (let b = 0; b < BANDS.length; b++) this.batches.push(new EcsRingBatch(scene, this, b))
  }

  destroy(): void {
    for (const b of this.batches) b.destroy()
    this.batches.length = 0
  }

  step(fxMs: number): void {
    this.now = fxMs
  }

  buildBand(band: number, m: Phaser.GameObjects.Components.TransformMatrix): Scratch {
    const o = this.scratch
    resetScratch(o)
    const { zMin, zMax } = BANDS[band]!
    for (const eid of query(this.world, RING_SET)) {
      const z = Ring.z[eid]!
      if (z < zMin || z >= zMax) continue
      const b = BREATHS[Ring.breathe[eid]!]!
      const t = Ring.breathe[eid] ? breath(this.now - Ring.born[eid]!, b.ms) : 0
      const r = Ring.radius[eid]! * (b.scaleLo + (b.scaleHi - b.scaleLo) * t)
      const a = (b.alphaHi + (b.alphaLo - b.alphaHi) * t) * Tint.alpha[eid]!
      const x = Transform.x[eid]!
      const y = Transform.y[eid]! + Ring.dy[eid]!
      const color = Ring.color[eid]!
      fan(o, m, x, y, r, packTint(color, Ring.fillAlpha[eid]! * a))
      ringStrip(o, m, x, y, r, Ring.lineWidth[eid]!, packTint(color, Ring.lineAlpha[eid]! * a))
    }
    if (zMin === -Infinity) this.trails(o, m)
    return o
  }

  /** 残影底下的那段路：贴着地面，越新越清楚，冷却中一起淡下去 */
  private trails(o: Scratch, m: Phaser.GameObjects.Components.TransformMatrix): void {
    for (const eid of query(this.world, [Echo, Tint])) {
      const pts = echoPts[eid]
      if (!pts) continue
      const n = pts.length / 2
      const color = Tint.color[eid]!
      for (let i = 1; i < n; i++) {
        const a = (TRAIL_ALPHA_OLD + ((TRAIL_ALPHA_NEW - TRAIL_ALPHA_OLD) * i) / (n - 1)) * Echo.dim[eid]!
        segment(o, m, pts[i * 2 - 2]!, pts[i * 2 - 1]!, pts[i * 2]!, pts[i * 2 + 1]!, TRAIL_WIDTH, packTint(color, a))
      }
    }
  }
}

class EcsRingBatch extends EcsLayer {
  private readonly camMatrix = new Phaser.GameObjects.Components.TransformMatrix()

  constructor(scene: Phaser.Scene, private readonly layer: RingLayer, private readonly band: number) {
    super(scene, LayerType.Ring, BANDS[band]!.depth)
    scene.add.existing(this)
  }

  renderWebGL(
    renderer: Phaser.Renderer.WebGL.WebGLRenderer,
    self: EcsRingBatch,
    drawingContext: Phaser.Renderer.WebGL.DrawingContext,
  ): void {
    const camera = drawingContext.camera
    if (!camera) return
    const node = renderer.renderNodes.getNode('BatchHandlerTriFlat') as
      | { batch: (ctx: unknown, i: number[], v: number[], c: number[], l: null) => void }
      | null
    if (!node) return
    const m = self.camMatrix.copyFrom(camera.getViewMatrix(!drawingContext.useCanvas))
    const o = self.layer.buildBand(self.band, m)
    if (o.i.length === 0) return
    node.batch(drawingContext, o.i, o.v, o.c, null)
  }
}
