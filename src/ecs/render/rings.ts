import Phaser from 'phaser'
import { query } from 'bitecs'
import { Ring, RING_SET, Tint, Transform } from '../components'
import { fan, place, ringStrip } from './tri'
import type { Scratch } from './tri'
import type { EcsWorld } from '../world'
import { LayerType, TriBatch } from './layer'
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

const BANDS: readonly { depth: number; zMin: number; zMax: number }[] = [
  { depth: 2, zMin: -Infinity, zMax: 3 },
  { depth: 2.5, zMin: 3, zMax: 4 },
  { depth: 4, zMin: 4, zMax: Infinity },
]

function breath(age: number, ms: number): number {
  const t = (age % (ms * 2)) / ms
  return t <= 1 ? t : 2 - t
}

/** 地上不属于实体的圈与路，按世界坐标画好：below 压在实体的圈下面，above 盖在上面 */
export interface GroundPaint {
  readonly below: Scratch
  readonly above: Scratch
}

export class RingLayer {
  private readonly batches: TriBatch[] = []
  private now = 0

  constructor(scene: Phaser.Scene, private readonly world: EcsWorld, private readonly ground: GroundPaint) {
    for (let b = 0; b < BANDS.length; b++) this.batches.push(new TriBatch(scene, LayerType.Ring, BANDS[b]!.depth, (o, m) => this.buildBand(b, o, m)))
  }

  destroy(): void {
    for (const b of this.batches) b.destroy()
    this.batches.length = 0
  }

  step(fxMs: number): void {
    this.now = fxMs
  }

  private buildBand(band: number, o: Scratch, m: Phaser.GameObjects.Components.TransformMatrix): void {
    const { zMin, zMax } = BANDS[band]!
    if (zMin === -Infinity) place(o, m, this.ground.below)
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
    if (zMin === -Infinity) place(o, m, this.ground.above)
  }
}
