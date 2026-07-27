import Phaser from 'phaser'
import { query } from 'bitecs'
import { cubicEaseIn, cubicEaseOut } from '../utils/ease'
import { Depth, Fx, FxBeam, FxBolt, FxCircle, FxSlash, Transform } from '../components'
import { boltPts } from '../store'
import type { EcsWorld } from '../world'
import { fan, newScratch, quad, resetScratch, ringStrip, segment } from './tri'
import type { Scratch } from './tri'
import { SHAPE_BANDS as BANDS } from './bands'
import { EcsLayer } from './layer'

// 一次性战斗特效（Cue，阵营中立）：放完即弃，与机制正交——纯逻辑侧只往队列里塞
// 「放一个什么样的特效」，绘制全在这里（GAS GameplayCue 思路：机制不依赖渲染）。
//
// 与 arcade 那份的区别，也正是这份要单独存在的理由。arcade 每放一个特效就 new 一个
// Arc/Rectangle/Graphics + 挂一条 tween：特效数 = GameObject 数 = tween 数，而且
// Phaser 的 Arc 按 iterations=0.01 铺满 ~100 个三角形（带描边约 300），全由它自己提交。
//
// 这里走 ECS 侧一贯的做法，与 EcsSpriteBatch 同构：
//   · 四种形状类特效各是一颗**实体**（几何在组件上），没有任何一个 GameObject
//   · 画的活儿归少数几个 EcsShapeBatch —— 光秃秃的 GameObject，只为在显示列表里
//     占一个 depth，renderWebGL 里把本带全部特效的三角形一次性提交给核心的
//     BatchHandlerTriFlat（与 EcsSpriteBatch 提交四边形给 BatchHandlerQuad 同理）
//   · 三角化自己做，按半径自适应取 12–48 段，比 Phaser 的定额 100 段省一个数量级
//   · 进度由 renderWebGL 按 Fx.bornMs / Fx.durMs 现算，不挂 tween；回收在 systems/expireFx。
//     时钟取 sim.fxMs（真实帧长的纯视觉钟，过场冻结期照旧推进），故特效不受时停拖慢
//
// 只剩一个例外：全屏白闪是一块 setScrollFactor(0) 的矩形——它在**屏幕坐标**里，
// 不在世界里，做不成世界实体，故仍是 GameObject，仍经 sim.out.flash 传进来。
// 💥 爆裂从前也在此列（说它「走不了三角批」是对的，但那只说明它进不了形状批；
// 它是贴图，进精灵批就好），现已是实体 FxBoom。
//
// 缓动与 Phaser 同名缓动同参（见 ../ease），观感与旧实现一致。

const { getTintAppendFloatAlpha } = Phaser.Renderer.WebGL.Utils

/** 扩散淡出的圆：填充圆（可选描边），从 fromScale 缩放到 toScale 同时淡出。
 * 命中白闪、冲击环、治疗/集结/冻结脉冲共用此一处——各自传颜色/尺度/时长/深度。 */
export interface CircleCue {
  readonly fill: number
  readonly fillAlpha: number
  /** 描边色；省略即无描边（纯填充闪光） */
  readonly stroke?: number
  readonly lineWidth?: number
  readonly lineAlpha?: number
  readonly fromScale: number
  readonly toScale: number
  readonly durationMs: number
  readonly depth: number
}


/** 空闲槽位标记（born 存的是 fxMs，恒 ≥ 0） */
const FREE = -1


type Matrix = Phaser.GameObjects.Components.TransformMatrix

export class CueLayer {
  // ── 唯一的例外：屏幕固定的矩形，不在世界坐标里，做不成实体 ──
  private readonly flash: Phaser.GameObjects.Rectangle
  private flashBorn = FREE
  private flashDur = 0
  private flashAlpha = 0

  private readonly batches: EcsShapeBatch[] = []
  private readonly scratch: Scratch = newScratch()

  /** 本帧视觉钟：step 每帧写入，随后的投放取它作为起点 */
  private now = 0

  constructor(scene: Phaser.Scene, private readonly world: EcsWorld) {
    this.flash = scene.add
      .rectangle(scene.scale.width / 2, scene.scale.height / 2, 6000, 6000, 0xffffff, 1)
      .setScrollFactor(0)
      .setDepth(200)
      .setVisible(false)
    for (let b = 0; b < BANDS.length; b++) this.batches.push(new EcsShapeBatch(scene, this, b))
  }

  destroy(): void {
    this.flash.destroy()
    for (const b of this.batches) b.destroy()
    this.batches.length = 0
  }

  /** 逐帧推进；须在本帧的投放之前调用（它同时给投放定时间起点）。fxMs = sim.fxMs。
   * 形状类只需判过期——顶点每帧由批绘对象按当前进度现算，不必在此写回 */
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

  /** 把某一带的全部活动特效三角化到暂存里（批绘对象在 renderWebGL 里调）。
   * 遍历的是查询集——四种形状类特效各是一颗实体，几何在组件上 */
  buildBand(band: number, m: Matrix): Scratch {
    const o = this.scratch
    resetScratch(o)
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
      fan(o, m, x, y, r, getTintAppendFloatAlpha(FxCircle.fill[k]!, FxCircle.fillAlpha[k]! * fade))
      const stroke = FxCircle.stroke[k]!
      if (stroke >= 0) {
        // 描边宽度随缩放走，与旧实现整体 setScale 的表现一致
        ringStrip(o, m, x, y, r, FxCircle.lineW[k]! * s, getTintAppendFloatAlpha(stroke, FxCircle.lineAlpha[k]! * fade))
      }
    }

    // 光束：外层色带在 7 带、白芯在 8 带，纵向收拢 + 淡出（同一颗实体，两带各画一层）
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
        // 原点在左中、沿 angle 铺开：局部 (0,±half) → (L,±half)
        quad(
          o, m,
          x - sa * half, y + ca * half,
          x + sa * half, y - ca * half,
          x + ca * L + sa * half, y + sa * L - ca * half,
          x + ca * L - sa * half, y + sa * L + ca * half,
          getTintAppendFloatAlpha(color, alpha),
        )
      }
    }

    // 闪电与斩击恒在最上一带
    if (zMax === Infinity) {
      for (const k of query(this.world, [Fx, FxBolt])) {
        const color = getTintAppendFloatAlpha(FxBolt.color[k]!, 0.95 * (1 - age(k)))
        const pts = boltPts[k]
        if (!pts) continue
        for (let p = 1; p < FxBolt.n[k]!; p++) {
          segment(o, m, pts[(p - 1) * 2]!, pts[(p - 1) * 2 + 1]!, pts[p * 2]!, pts[p * 2 + 1]!, 3, color)
        }
      }
      for (const k of query(this.world, [Fx, FxSlash, Transform])) {
        const a = Transform.rot[k]!
        ringStrip(
          o, m, Transform.x[k]!, Transform.y[k]!, FxSlash.r[k]!, 5,
          getTintAppendFloatAlpha(0xffffff, 0.9 * (1 - age(k))),
          a - 1.1, a + 1.1,
        )
      }
    }
    return o
  }


  /** 全屏白闪：一块盖满视口的定屏矩形淡出（天罚全域打击） */
  screenFlash(color: number, alpha: number, durationMs: number): void {
    this.flash.setFillStyle(color, 1).setAlpha(alpha).setVisible(true)
    this.flashBorn = this.now
    this.flashDur = durationMs
    this.flashAlpha = alpha
  }
}

/** 一条深度带的形状批绘：光秃秃的 GameObject，只为在显示列表里占一个 depth。
 * 与 EcsSpriteBatch 同构——那边提交四边形给 BatchHandlerQuad，这边提交三角形给
 * BatchHandlerTriFlat。注意 renderWebGL 由 RenderSteps 以裸函数方式调用，无 this
 * 绑定，状态一律走 src。 */
class EcsShapeBatch extends EcsLayer {
  private readonly camMatrix = new Phaser.GameObjects.Components.TransformMatrix()

  constructor(scene: Phaser.Scene, private readonly layer: CueLayer, private readonly band: number) {
    super(scene, 'EcsShapeBatch', BANDS[band]!.depth)
    scene.add.existing(this)
  }

  renderWebGL(
    renderer: Phaser.Renderer.WebGL.WebGLRenderer,
    src: Phaser.GameObjects.GameObject,
    drawingContext: Phaser.Renderer.WebGL.DrawingContext,
  ): void {
    const self = src as EcsShapeBatch
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

