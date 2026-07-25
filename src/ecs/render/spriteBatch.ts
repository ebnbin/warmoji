import Phaser from 'phaser'
import { query } from 'bitecs'
import { Depth, Sprite, Tint, Transform, RENDERABLE } from '../components'
import type { EcsWorld } from '../world'
import type { EcsAtlas } from './atlas'

// 统一自绘：一个自定义 GameObject，renderWebGL 里把全场 renderable 实体（Transform+Sprite+
// Tint+Depth）一次性经 BatchHandlerQuad 批量画出。每个实体的四角按「相机变换 × 位姿」CPU 侧
// 算好（与 Phaser 自带 Sprite 渲染同一套数学），UV 取自 atlas 页，tint/alpha/翻转逐实体。
// 全场共用 atlas 的少数页纹理 → 多纹理批处理，entity 数与 GameObject 数彻底解绑。
//
// Phaser 4 要点（与 v3 的差异都在这里，改动前务必先读）：
// · v3 的 Pipeline 体系已整体移除，批次入口是 renderNodes 的 BatchHandlerQuad，
//   纹理单元与 flush 都由它内部管理（不再需要 setTexture2D / flush）。
// · renderWebGL 由 RenderSteps 以「裸函数」方式调用，没有 this 绑定——
//   所有状态必须走 src，不能用 this。
// · 第三个形参不再是 camera，而是 DrawingContext，相机从 drawingContext.camera 取。
// · camera 的视图矩阵已包含 scroll（v3 不含，需手动扣减），故这里不再减 scrollX/Y。
// · 四角顺序 v3 是 TL,BL,BR,TR，v4 是 TL,BL,TR,BR（照搬 v3 顺序会画出扭曲四边形）。

const { getTintAppendFloatAlpha } = Phaser.Renderer.WebGL.Utils

export class EcsSpriteBatch extends Phaser.GameObjects.GameObject {
  private readonly world: EcsWorld
  private readonly atlas: EcsAtlas
  private readonly uv = new Float32Array(4)
  private readonly spriteMatrix = new Phaser.GameObjects.Components.TransformMatrix()
  private readonly camMatrix = new Phaser.GameObjects.Components.TransformMatrix()
  private readonly calc = new Phaser.GameObjects.Components.TransformMatrix()
  /** 深度排序用的 eid 缓冲（避免每帧分配） */
  private order: number[] = []
  /** batch() 每次会往里写 alphaStrategy 并与当前 shader 配置比对，必须是复用的持久对象。
   * multiTexturing 必须显式开：BatchHandlerQuad 只读 `!!renderOptions.multiTexturing`，
   * 缺省即单纹理模式——图集一换页就 pushCurrentBatchEntry 切一刀，且因核心的
   * SubmitterQuad 恒传 true，我们传 false 会与之逐帧互相翻转、反复替换 TexCount/TEXTURE
   * 两处 shader addition。跟核心保持一致即可一次批完（页数 3 ≪ maxTexturesPerBatch 16）。 */
  private readonly renderOptions = {
    multiTexturing: true,
  } as Phaser.Types.Renderer.WebGL.RenderNodes.BatchHandlerQuadRenderOptions
  // WebGLRenderer.render 渲染每个子对象前会读 child.blendMode 设混合模式;
  // 裸 GameObject 无 BlendMode 组件，显式给正常混合，否则 setBlendMode(undefined) 报错。
  blendMode = Phaser.BlendModes.NORMAL
  // DisplayList 按 .depth 排序：全场实体作为一整个对象居于地面效果(2)之上、血条(11)之下，
  // 保证毒液/灼烧区在脚下、血条压在头顶（裸 GameObject 无 Depth 组件，显式给定值参与排序）。
  depth = 5

  constructor(scene: Phaser.Scene, world: EcsWorld, atlas: EcsAtlas) {
    super(scene, 'EcsSpriteBatch')
    this.world = world
    this.atlas = atlas
    scene.add.existing(this)
  }

  // Phaser DisplayList 每帧对本对象调用；注意无 this 绑定，状态一律走 src
  renderWebGL(
    renderer: Phaser.Renderer.WebGL.WebGLRenderer,
    src: Phaser.GameObjects.GameObject,
    drawingContext: Phaser.Renderer.WebGL.DrawingContext,
  ): void {
    const self = src as EcsSpriteBatch
    const camera = drawingContext.camera
    if (!camera) return

    const eids = query(self.world, RENDERABLE as unknown as object[])
    const n = eids.length
    if (n === 0) return

    const node = renderer.renderNodes.getNode(
      'BatchHandlerQuad',
    ) as Phaser.Renderer.WebGL.RenderNodes.BatchHandlerQuad | null
    if (!node) return

    // 深度排序：z 小者先画（压在下层），稳定于 eid
    const order = self.order
    order.length = n
    for (let i = 0; i < n; i++) order[i] = eids[i]!
    order.sort((a, b) => Depth.z[a]! - Depth.z[b]! || a - b)

    // v4 的视图矩阵已含 scroll。实参与核心各 Transformer 一致（!useCanvas）：
    // WebGL 路径取 matrix（相机在屏幕上的位移由 DrawingContext 的 viewport 负责），
    // 缺省实参会拿到 matrixCombined（把 camera.x/y 又叠一遍）——本作相机恒在 (0,0)
    // 故当前无差别，但相机一旦带 viewport 偏移就会整体错位。
    const camMatrix = self.camMatrix.copyFrom(camera.getViewMatrix(!drawingContext.useCanvas))
    const spriteMatrix = self.spriteMatrix
    const calc = self.calc

    for (let i = 0; i < n; i++) {
      const eid = order[i]!
      const frame = Sprite.frame[eid]!
      if (frame < 0) continue

      // 位姿 → calcMatrix = 视图矩阵 × (平移(世界坐标) × 旋转)。scale=1，尺寸用四角表达。
      spriteMatrix.applyITRS(Transform.x[eid]!, Transform.y[eid]!, Transform.rot[eid]!, 1, 1)
      camMatrix.multiply(spriteMatrix, calc)

      // 水平翻转走几何镜像（与 v4 官方 TransformerImage 的 flipX = -1 同源），不动 UV
      const hw = (Sprite.flipX[eid]! ? -1 : 1) * Transform.w[eid]! * 0.5
      const hh = Transform.h[eid]! * 0.5
      // 局部四角 → 经 calc 变到屏幕；顺序必须是 TL, BL, TR, BR
      const x0 = calc.getX(-hw, -hh)
      const y0 = calc.getY(-hw, -hh)
      const x1 = calc.getX(-hw, hh)
      const y1 = calc.getY(-hw, hh)
      const x2 = calc.getX(hw, -hh)
      const y2 = calc.getY(hw, -hh)
      const x3 = calc.getX(hw, hh)
      const y3 = calc.getY(hw, hh)

      self.atlas.uvInto(frame, self.uv)
      const u0 = self.uv[0]!
      const v0 = self.uv[1]!
      const u1 = self.uv[2]!
      const v1 = self.uv[3]!

      // 不再乘 camera.alpha：v4 在合成阶段统一施加相机透明度（核心的 SubmitterQuad /
      // TransformerImage 同样不碰它），v3 那样逐顶点再乘一次会双重变淡
      const tint = getTintAppendFloatAlpha(Tint.color[eid]!, Tint.alpha[eid]!)
      // Tint.effect 的 0/1 与 v4 的 TintModes.MULTIPLY/FILL 同值同义
      const tintMode = Tint.effect[eid]!
      const tex = self.atlas.pageGlTexture(self.atlas.page(frame))
      node.batch(
        drawingContext,
        tex,
        x0, y0, x1, y1, x2, y2, x3, y3,
        // 纹理坐标按「起点 + 尺寸」给（v 轴为 GL 朝向，texHeight 为负属预期）
        u0, v0, u1 - u0, v1 - v0,
        tintMode,
        tint, tint, tint, tint,
        self.renderOptions,
      )
    }
  }
}
