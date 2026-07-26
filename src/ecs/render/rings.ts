import Phaser from 'phaser'
import { query } from 'bitecs'
import { Ring, RING_SET, Tint, Transform } from '../components'
import { fan, newScratch, resetScratch, ringStrip } from './tri'
import type { Scratch } from './tri'
import type { EcsWorld } from '../world'

// 实体圆圈：画在实体位置上的填充圆 + 描边（待拾脉冲、携带者光环、地面效果区、寒气光环）。
// **全场就这一个画圆的地方**——从前地面区是每块一个 Phaser Graphics + 两条 tween，
// 寒气光环是场景侧一池 Circle 按帧表对帐，各画各的。
//
// 与 cues.ts 的分工：那边是「放完即弃」的一次性特效，数据在投放队列里；
// 这边的圈是实体的一个属性——实体在圈就在，实体没了圈自然跟着没，
// 所以数据就是 Ring 组件本身，不需要任何注册/销毁配对。旧实现里
// 「携带者死了要记得 destroy 光环」那类对帐，在这里根本不存在。
//
// 绘制同样自己三角化 + 一次批提交（见 tri.ts），不是 Phaser 的 Arc：
// 一个 Arc 铺 ~300 个三角形还各带一条 yoyo tween，这里全场两个批绘对象、零 tween。

const { getTintAppendFloatAlpha } = Phaser.Renderer.WebGL.Utils

/** 呼吸半周期（ms）：scale/alpha 在 lo↔hi 之间线性往返（镜像旧 tween 的 yoyo + Linear） */
const BREATH_MS = 700
const SCALE_LO = 0.82
const SCALE_HI = 1.12
const ALPHA_LO = 0.35
const ALPHA_HI = 0.9
/** 深度分带：一个批绘对象只有一个 Phaser depth，故按 Ring.z 分开三带
 * （地面区 2 铺在最底、待拾光圈 3 压在金币之下、携带者光环 4 压在敌人之下） */
const BANDS: readonly { depth: number; zMin: number; zMax: number }[] = [
  { depth: 2, zMin: -Infinity, zMax: 3 },
  { depth: 3, zMin: 3, zMax: 4 },
  { depth: 4, zMin: 4, zMax: Infinity },
]

/** 三角形的呼吸相位：0..1 往返 */
function breath(age: number): number {
  const t = (age % (BREATH_MS * 2)) / BREATH_MS
  return t <= 1 ? t : 2 - t
}

export class RingLayer {
  private readonly batches: EcsRingBatch[] = []
  private readonly scratch: Scratch = newScratch()
  /** 本帧视觉钟（sim.fxMs）：批绘对象在 renderWebGL 里按它算呼吸相位 */
  private now = 0

  constructor(scene: Phaser.Scene, private readonly world: EcsWorld) {
    for (let b = 0; b < BANDS.length; b++) this.batches.push(new EcsRingBatch(scene, this, b))
  }

  destroy(): void {
    for (const b of this.batches) b.destroy()
    this.batches.length = 0
  }

  /** 逐帧对时（与 CueLayer.step 同一个钟：过场冻结期照旧呼吸） */
  step(fxMs: number): void {
    this.now = fxMs
  }

  /** 把某一带的全部光圈三角化到暂存里（批绘对象在 renderWebGL 里调） */
  buildBand(band: number, m: Phaser.GameObjects.Components.TransformMatrix): Scratch {
    const o = this.scratch
    resetScratch(o)
    const { zMin, zMax } = BANDS[band]!
    for (const eid of query(this.world, RING_SET as unknown as object[])) {
      const z = Ring.z[eid]!
      if (z < zMin || z >= zMax) continue
      // 呼吸档：缩放与透明度往返；静止档：半径与透明度全由持有它的系统写
      const breathing = Ring.breathe[eid] === 1
      const t = breathing ? breath(this.now - Ring.born[eid]!) : 0
      const r = Ring.radius[eid]! * (breathing ? SCALE_LO + (SCALE_HI - SCALE_LO) * t : 1)
      // 叠上实体自身的 alpha:待拾物到期渐隐、敌人入场渐显、地面区淡出，圈跟着一起
      const a = (breathing ? ALPHA_HI + (ALPHA_LO - ALPHA_HI) * t : 1) * Tint.alpha[eid]!
      const x = Transform.x[eid]!
      const y = Transform.y[eid]! + Ring.dy[eid]!
      const color = Ring.color[eid]!
      fan(o, m, x, y, r, getTintAppendFloatAlpha(color, Ring.fillAlpha[eid]! * a))
      ringStrip(o, m, x, y, r, Ring.lineWidth[eid]!, getTintAppendFloatAlpha(color, Ring.lineAlpha[eid]! * a))
    }
    return o
  }
}

/** 一条深度带的光圈批绘：与 cues.ts 的 EcsShapeBatch 同构（裸 GameObject 只为占一个
 * depth，renderWebGL 里把本带三角形一次提交给 BatchHandlerTriFlat）。
 * 注意 renderWebGL 由 RenderSteps 以裸函数方式调用，无 this 绑定，状态一律走 src。 */
class EcsRingBatch extends Phaser.GameObjects.GameObject {
  private readonly camMatrix = new Phaser.GameObjects.Components.TransformMatrix()
  // 裸 GameObject 无 BlendMode 组件，显式给正常混合，否则 setBlendMode(undefined) 报错
  blendMode = Phaser.BlendModes.NORMAL
  depth: number

  constructor(scene: Phaser.Scene, private readonly layer: RingLayer, private readonly band: number) {
    super(scene, 'EcsRingBatch')
    this.depth = BANDS[band]!.depth
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
