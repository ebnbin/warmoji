import Phaser from 'phaser'
import { query } from 'bitecs'
import { Depth, Sprite, Tint, Transform, RENDERABLE } from '../components'
import type { EcsWorld } from '../world'
import type { EcsAtlas } from './atlas'

// 统一自绘:一个自定义 GameObject,renderWebGL 里把全场 renderable 实体(Transform+Sprite+
// Tint+Depth)一次性经 MultiPipeline 批量画出。每个实体的四角按「相机变换 × 位姿」CPU 侧
// 算好(与 Phaser 自带 Sprite 渲染同一套数学),UV 取自 atlas 页,tint/alpha/翻转逐实体。
// 全场共用 atlas 的少数页纹理 → 多纹理批处理,entity 数与 GameObject 数彻底解绑。

const { getTintAppendFloatAlpha } = Phaser.Renderer.WebGL.Utils

export class EcsSpriteBatch extends Phaser.GameObjects.GameObject {
  private readonly world: EcsWorld
  private readonly atlas: EcsAtlas
  private readonly uv = new Float32Array(4)
  private readonly spriteMatrix = new Phaser.GameObjects.Components.TransformMatrix()
  private readonly camMatrix = new Phaser.GameObjects.Components.TransformMatrix()
  private readonly calc = new Phaser.GameObjects.Components.TransformMatrix()
  /** 深度排序用的 eid 缓冲(避免每帧分配) */
  private order: number[] = []
  // WebGLRenderer.render 渲染每个子对象前会读 child.blendMode 设混合模式;
  // 裸 GameObject 无 BlendMode 组件,显式给正常混合,否则 setBlendMode(undefined) 报错。
  blendMode = Phaser.BlendModes.NORMAL
  // DisplayList 按 .depth 排序:全场实体作为一整个对象居于地面效果(2)之上、血条(11)之下,
  // 保证毒液/灼烧区在脚下、血条压在头顶(裸 GameObject 无 Depth 组件,显式给定值参与排序)。
  depth = 5

  constructor(scene: Phaser.Scene, world: EcsWorld, atlas: EcsAtlas) {
    super(scene, 'EcsSpriteBatch')
    this.world = world
    this.atlas = atlas
    scene.add.existing(this)
  }

  // Phaser DisplayList 每帧对本对象调用(camera = 主相机)
  renderWebGL(
    renderer: Phaser.Renderer.WebGL.WebGLRenderer,
    _src: Phaser.GameObjects.GameObject,
    camera: Phaser.Cameras.Scene2D.Camera,
  ): void {
    const eids = query(this.world, RENDERABLE as unknown as object[])
    const n = eids.length
    if (n === 0) return

    // 深度排序:z 小者先画(压在下层),稳定于 eid
    const order = this.order
    order.length = n
    for (let i = 0; i < n; i++) order[i] = eids[i]!
    order.sort((a, b) => Depth.z[a]! - Depth.z[b]! || a - b)

    const pipeline = renderer.pipelines.setMulti()
    // camera.matrix 是相机的世界→屏幕变换(含 zoom/居中/旋转),运行时存在但类型标私有
    const cameraMatrix = (camera as unknown as { matrix: Phaser.GameObjects.Components.TransformMatrix }).matrix
    const camMatrix = this.camMatrix.copyFrom(cameraMatrix)
    const spriteMatrix = this.spriteMatrix
    const calc = this.calc
    const camAlpha = camera.alpha

    for (let i = 0; i < n; i++) {
      const eid = order[i]!
      const frame = Sprite.frame[eid]!
      if (frame < 0) continue

      // 位姿 → calcMatrix = 相机矩阵 × (平移(世界坐标−滚动) × 旋转)。scale=1,尺寸用四角表达。
      spriteMatrix.applyITRS(Transform.x[eid]!, Transform.y[eid]!, Transform.rot[eid]!, 1, 1)
      spriteMatrix.e -= camera.scrollX
      spriteMatrix.f -= camera.scrollY
      camMatrix.multiply(spriteMatrix, calc)

      const hw = Transform.w[eid]! * 0.5
      const hh = Transform.h[eid]! * 0.5
      // 局部四角:TL(-hw,-hh) BL(-hw,hh) BR(hw,hh) TR(hw,-hh) → 经 calc 变到屏幕
      const x0 = calc.getX(-hw, -hh)
      const y0 = calc.getY(-hw, -hh)
      const x1 = calc.getX(-hw, hh)
      const y1 = calc.getY(-hw, hh)
      const x2 = calc.getX(hw, hh)
      const y2 = calc.getY(hw, hh)
      const x3 = calc.getX(hw, -hh)
      const y3 = calc.getY(hw, -hh)

      this.atlas.uvInto(frame, this.uv)
      let u0 = this.uv[0]!
      const v0 = this.uv[1]!
      let u1 = this.uv[2]!
      const v1 = this.uv[3]!
      if (Sprite.flipX[eid]!) {
        const t = u0
        u0 = u1
        u1 = t
      }

      const tint = getTintAppendFloatAlpha(Tint.color[eid]!, Tint.alpha[eid]! * camAlpha)
      const effect = Tint.effect[eid]!
      const tex = this.atlas.pageGlTexture(this.atlas.page(frame))
      const unit = pipeline.setTexture2D(tex)
      pipeline.batchQuad(
        null,
        x0, y0, x1, y1, x2, y2, x3, y3,
        u0, v0, u1, v1,
        tint, tint, tint, tint,
        effect,
        tex,
        unit,
      )
    }
    pipeline.flush()
  }
}
