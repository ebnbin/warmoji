import Phaser from 'phaser'
import { query } from 'bitecs'
import { UI_FONT } from '../../util/fonts'
import { DamageNumber, Fx, Transform } from '../components'
import type { EcsWorld } from '../world'

// 伤害飘字：命中点上浮淡出的数字。
//
// 与 arcade 那份的区别，也正是这份要单独存在的理由。arcade 是 64 个池化的 BitmapText
// + 每次命中 `tweens.add({...})`：而 Phaser 4 的 TweenManager **不池化 tween**
//（TweenBuilder 每次 new 一个 Tween，还要为每个属性建 TweenData），加上配置对象字面量
// 与 onComplete 闭包，**每个伤害数字至少三次堆分配**；回收槽位时的 killTweensOf 还要
// 扫一遍活动 tween 列表。这笔开销**没有上限，随战斗烈度线性涨**——8 千档一秒几百次
// 命中，全压在帧里。
//
// 这里走 ECS 侧一贯的做法，与 EcsSpriteBatch / EcsShapeBatch 同构：
//   · 飘字是**纯数据**（定长平行数组），没有任何一个 GameObject
//   · 画的活儿归一个 DamageTextBatch —— 裸 GameObject，只为在显示列表占一个 depth，
//     renderWebGL 里把全部飘字**逐字形**提交四边形给 BatchHandlerQuad
//     （与 EcsSpriteBatch 同一个批处理器，能批进同一批次）
//   · 上浮与淡出由 step(fxMs) 自己推进，不挂 tween；时钟取 sim.fxMs
//
// 字形纹理仍是启动时一次性烘好的 0-9 光栅图（这一步与框架无关），但不再注册成
// Phaser 的 RetroFont 位图字体——自绘时 UV 直接算，用不着那套。

const TEX_KEY = 'ecs-damage-digits'
const CHARS = 10
/** 字形按 2 倍显示尺寸渲染，高 DPR 下缩放依然清晰（与旧实现同参） */
const CHAR_W = 24
const CHAR_H = 36


const { getTintAppendFloatAlpha } = Phaser.Renderer.WebGL.Utils

/** 把 0-9 烘成一张 240×36 的字形图（幂等；纹理挂在游戏级 TextureManager 上跨局有效） */
function bakeDigits(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX_KEY)) return
  const canvas = document.createElement('canvas')
  canvas.width = CHAR_W * CHARS
  canvas.height = CHAR_H
  const ctx = canvas.getContext('2d')!
  ctx.font = `bold 26px ${UI_FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 5
  ctx.fillStyle = '#ffffff'
  for (let i = 0; i < CHARS; i++) {
    const cx = i * CHAR_W + CHAR_W / 2
    ctx.strokeText(String(i), cx, CHAR_H / 2)
    ctx.fillText(String(i), cx, CHAR_H / 2)
  }
  scene.textures.addCanvas(TEX_KEY, canvas)
}

export class DamageTextLayer {
  private readonly batch: DamageTextBatch
  /** 本帧视觉钟（renderWebGL 里算进度用）；关掉飘字时整层不画 */
  private now = 0

  constructor(scene: Phaser.Scene, private readonly world: EcsWorld, private readonly enabled: boolean) {
    bakeDigits(scene)
    this.batch = new DamageTextBatch(scene, this)
  }

  destroy(): void {
    this.batch.destroy()
  }

  /** 本帧视觉钟（回收在 systems/expireFx，这里不再自管过期）。fxMs = sim.fxMs */
  step(fxMs: number): void {
    this.now = fxMs
  }

  /** 把全部活动飘字三角化成字形四边形（批绘对象在 renderWebGL 里调）。
   * 与旧实现一致：暴击 34px 金色、普通 24px 白色，350ms 内从 y-14 线性升到 y-40 并淡出 */
  emit(
    node: {
      batch: (
        ctx: unknown, tex: unknown,
        x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number,
        u: number, v: number, uw: number, vh: number,
        tintMode: number, t0: number, t1: number, t2: number, t3: number,
        opts: unknown,
      ) => void
    },
    ctx: unknown,
    tex: unknown,
    m: Phaser.GameObjects.Components.TransformMatrix,
    opts: unknown,
  ): void {
    if (!this.enabled) return
    const fx = this.now
    for (const eid of query(this.world, [Fx, DamageNumber, Transform])) {
      const t = (fx - Fx.bornMs[eid]!) / Fx.durMs[eid]!
      const crit = DamageNumber.crit[eid] === 1
      const size = crit ? 34 : 24
      const gh = size
      const gw = (CHAR_W * size) / CHAR_H
      const cy = Transform.y[eid]! - 26 * t // y-14 → y-40
      const tint = getTintAppendFloatAlpha(crit ? 0xffdc5d : 0xffffff, 1 - t)

      // 位数：从高位到低位逐字形铺；整串以 x 居中（等价旧实现的 setOrigin(0.5)）
      const n = DamageNumber.value[eid]!
      let digits = 1
      for (let v = n; v >= 10; v = Math.floor(v / 10)) digits++
      let left = Transform.x[eid]! - (digits * gw) / 2

      for (let d = digits - 1; d >= 0; d--) {
        let p = 1
        for (let k = 0; k < d; k++) p *= 10
        const digit = Math.floor(n / p) % 10
        const x0 = left
        const x1 = left + gw
        const y0 = cy - gh / 2
        const y1 = cy + gh / 2
        // UV 按「起点 + 尺寸」给，v 轴取 GL 朝向（原点在下），故 vh 为负——与 atlas 同约定
        const u = digit / CHARS
        node.batch(
          ctx, tex,
          m.getX(x0, y0), m.getY(x0, y0), // TL
          m.getX(x0, y1), m.getY(x0, y1), // BL
          m.getX(x1, y0), m.getY(x1, y0), // TR
          m.getX(x1, y1), m.getY(x1, y1), // BR
          u, 1, 1 / CHARS, -1,
          0, // TintModes.MULTIPLY
          tint, tint, tint, tint,
          opts,
        )
        left = x1
      }
    }
  }
}

/** 飘字批绘：裸 GameObject，只为在显示列表里占 depth 50（与旧实现的 BitmapText 同层）。
 * renderWebGL 由 RenderSteps 以裸函数方式调用，无 this 绑定，状态一律走 src。 */
class DamageTextBatch extends Phaser.GameObjects.GameObject {
  private readonly camMatrix = new Phaser.GameObjects.Components.TransformMatrix()
  /** batch() 每次会往里写 alphaStrategy 并与当前 shader 配置比对，必须是复用的持久对象；
   * multiTexturing 必须显式开，理由同 EcsSpriteBatch */
  private readonly renderOptions = { multiTexturing: true }
  // 裸 GameObject 无 BlendMode 组件，显式给正常混合
  blendMode = Phaser.BlendModes.NORMAL
  depth = 50

  constructor(scene: Phaser.Scene, private readonly layer: DamageTextLayer) {
    super(scene, 'DamageTextBatch')
    scene.add.existing(this)
  }

  renderWebGL(
    renderer: Phaser.Renderer.WebGL.WebGLRenderer,
    src: Phaser.GameObjects.GameObject,
    drawingContext: Phaser.Renderer.WebGL.DrawingContext,
  ): void {
    const self = src as DamageTextBatch
    const camera = drawingContext.camera
    if (!camera) return
    const node = renderer.renderNodes.getNode('BatchHandlerQuad')
    if (!node) return
    const tex = self.scene.textures.get(TEX_KEY).get().source.glTexture
    if (!tex) return
    // v4 的视图矩阵已含 scroll；实参与核心各 Transformer 一致（!useCanvas）
    const m = self.camMatrix.copyFrom(camera.getViewMatrix(!drawingContext.useCanvas))
    self.layer.emit(node as never, drawingContext, tex, m, self.renderOptions)
  }
}
