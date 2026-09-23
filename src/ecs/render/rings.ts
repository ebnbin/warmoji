import Phaser from 'phaser'
import { query } from 'bitecs'
import { Ring, RING_SET, Tint, Transform } from '../components'
import { fan, newScratch, resetScratch, ringStrip } from './tri'
import type { Scratch } from './tri'
import type { EcsWorld } from '../world'
import { EcsLayer } from './layer'
import { packTint } from './tint'

interface Breath {
  /** 半周期（ms） */
  ms: number
  scaleLo: number
  scaleHi: number
  alphaLo: number
  alphaHi: number
}

/** 按 Ring.breathe 取：0 静止，1 待拾光圈，2 携带者光环 */
const BREATHS: readonly Breath[] = [
  { ms: 1, scaleLo: 1, scaleHi: 1, alphaLo: 1, alphaHi: 1 },
  { ms: 700, scaleLo: 0.82, scaleHi: 1.12, alphaLo: 0.35, alphaHi: 0.9 },
  { ms: 650, scaleLo: 0.85, scaleHi: 1.12, alphaLo: 0.4, alphaHi: 0.85 },
]

/** 地面区 2 最底、待拾光圈 2.5 压在金币（3）之下、携带者光环 4 压在敌人（5）之下 */
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
  /** 本帧视觉钟 */
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
    for (const eid of query(this.world, RING_SET as unknown as object[])) {
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
    return o
  }
}

/** renderWebGL 无 this 绑定，状态一律走 src */
class EcsRingBatch extends EcsLayer {
  private readonly camMatrix = new Phaser.GameObjects.Components.TransformMatrix()

  constructor(scene: Phaser.Scene, private readonly layer: RingLayer, private readonly band: number) {
    super(scene, 'EcsRingBatch', BANDS[band]!.depth)
    scene.add.existing(this)
  }

  renderWebGL(
    renderer: Phaser.Renderer.WebGL.WebGLRenderer,
    src: Phaser.GameObjects.GameObject,
    drawingContext: Phaser.Renderer.WebGL.DrawingContext,
  ): void {
    const self = src as EcsRingBatch
    const camera = drawingContext.camera
    if (!camera) return
    const node = renderer.renderNodes.getNode('BatchHandlerTriFlat') as
      | { batch: (ctx: unknown, i: number[], v: number[], c: number[], l: null) => void }
      | null
    if (!node) return
    // v4 的视图矩阵已含 scroll；实参与核心各 Transformer 一致（!useCanvas）
    const m = self.camMatrix.copyFrom(camera.getViewMatrix(!drawingContext.useCanvas))
    const o = self.layer.buildBand(self.band, m)
    if (o.i.length === 0) return
    node.batch(drawingContext, o.i, o.v, o.c, null)
  }
}
