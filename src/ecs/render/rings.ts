import Phaser from 'phaser'
import { query } from 'bitecs'
import { Ring, RING_SET, Tint, Transform } from '../components'
import { fan, newScratch, resetScratch, ringStrip } from './tri'
import type { Scratch } from './tri'
import type { EcsWorld } from '../world'
import { EcsLayer } from './layer'
import { packTint } from './tint'



/** 呼吸半周期（ms） */
const BREATH_MS = 700
const SCALE_LO = 0.82
const SCALE_HI = 1.12
const ALPHA_LO = 0.35
const ALPHA_HI = 0.9
/** 地面区 2 最底、待拾光圈 3 压在金币之下、携带者光环 4 压在敌人之下 */
const BANDS: readonly { depth: number; zMin: number; zMax: number }[] = [
  { depth: 2, zMin: -Infinity, zMax: 3 },
  { depth: 3, zMin: 3, zMax: 4 },
  { depth: 4, zMin: 4, zMax: Infinity },
]

function breath(age: number): number {
  const t = (age % (BREATH_MS * 2)) / BREATH_MS
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
      const breathing = Ring.breathe[eid] === 1
      const t = breathing ? breath(this.now - Ring.born[eid]!) : 0
      const r = Ring.radius[eid]! * (breathing ? SCALE_LO + (SCALE_HI - SCALE_LO) * t : 1)
      const a = (breathing ? ALPHA_HI + (ALPHA_LO - ALPHA_HI) * t : 1) * Tint.alpha[eid]!
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
