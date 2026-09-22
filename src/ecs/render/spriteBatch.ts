import Phaser from 'phaser'
import { query } from 'bitecs'
import { Depth, Quad, Sprite, Tint, Transform, RENDERABLE } from '../components'
import type { EcsWorld } from '../world'
import type { EcsAtlas } from '../atlas'
import { EcsLayer } from './layer'
import { packTint } from './tint'
export { SPRITE_BANDS } from './bands'

// Phaser 4 要点：批次入口是 BatchHandlerQuad；renderWebGL 由 RenderSteps 以裸函数调用，无 this 绑定；
// 第三个形参是 DrawingContext；视图矩阵已含 scroll；四角顺序为 TL, BL, TR, BR



export class EcsSpriteBatch extends EcsLayer {
  private readonly world: EcsWorld
  private readonly atlas: EcsAtlas
  private readonly uv = new Float32Array(4)
  private readonly spriteMatrix = new Phaser.GameObjects.Components.TransformMatrix()
  private readonly camMatrix = new Phaser.GameObjects.Components.TransformMatrix()
  private readonly calc = new Phaser.GameObjects.Components.TransformMatrix()
  /** 深度排序用的 eid 缓冲（避免每帧分配） */
  private order: number[] = []
  /** 须是复用的持久对象；multiTexturing 须显式开，缺省为单纹理且会与核心逐帧互相翻转 */
  private readonly renderOptions = {
    multiTexturing: true,
  } as Phaser.Types.Renderer.WebGL.RenderNodes.BatchHandlerQuadRenderOptions
  /** 本对象只画 Depth.z ∈ [zMin, zMax) 的实体 */
  private readonly zMin: number
  private readonly zMax: number

  constructor(scene: Phaser.Scene, world: EcsWorld, atlas: EcsAtlas, depth: number, zMin: number, zMax: number) {
    super(scene, 'EcsSpriteBatch', depth)
    this.world = world
    this.atlas = atlas
    this.zMin = zMin
    this.zMax = zMax
    scene.add.existing(this)
  }

  // 无 this 绑定，状态一律走 src
  renderWebGL(
    renderer: Phaser.Renderer.WebGL.WebGLRenderer,
    src: Phaser.GameObjects.GameObject,
    drawingContext: Phaser.Renderer.WebGL.DrawingContext,
  ): void {
    const self = src as EcsSpriteBatch
    const camera = drawingContext.camera
    if (!camera) return

    const eids = query(self.world, RENDERABLE as unknown as object[])
    if (eids.length === 0) return

    const node = renderer.renderNodes.getNode(
      'BatchHandlerQuad',
    ) as Phaser.Renderer.WebGL.RenderNodes.BatchHandlerQuad | null
    if (!node) return

    // z 小者先画，稳定于 eid
    const order = self.order
    order.length = 0
    for (const eid of eids) {
      const z = Depth.z[eid]!
      if (z >= self.zMin && z < self.zMax) order.push(eid)
    }
    if (order.length === 0) return
    order.sort((a, b) => Depth.z[a]! - Depth.z[b]! || a - b)

    // 视图矩阵已含 scroll；实参与核心 Transformer 一致（!useCanvas），缺省实参会把 camera.x/y 又叠一遍
    const camMatrix = self.camMatrix.copyFrom(camera.getViewMatrix(!drawingContext.useCanvas))
    const spriteMatrix = self.spriteMatrix
    const calc = self.calc

    for (let i = 0; i < order.length; i++) {
      const eid = order[i]!
      const frame = Sprite.frame[eid]!
      if (frame < 0) continue

      spriteMatrix.applyITRS(Transform.x[eid]!, Transform.y[eid]!, Transform.rot[eid]!, 1, 1)
      camMatrix.multiply(spriteMatrix, calc)

      // 翻转走几何镜像，不动 UV
      const hw = (Sprite.flipX[eid]! ? -1 : 1) * Transform.w[eid]! * 0.5
      const hh = Transform.h[eid]! * 0.5
      // 顺序必须是 TL, BL, TR, BR
      const x0 = calc.getX(-hw, -hh)
      const y0 = calc.getY(-hw, -hh)
      const x1 = calc.getX(-hw, hh)
      const y1 = calc.getY(-hw, hh)
      const x2 = calc.getX(hw, -hh)
      const y2 = calc.getY(hw, -hh)
      const x3 = calc.getX(hw, hh)
      const y3 = calc.getY(hw, hh)

      self.atlas.uvInto(frame, self.uv)
      let u0 = self.uv[0]!
      let v0 = self.uv[1]!
      let u1 = self.uv[2]!
      let v1 = self.uv[3]!
      // v 轴为 GL 朝向，v0 是上
      const quad = Quad.v[eid]!
      if (quad !== 0) {
        const um = (u0 + u1) / 2
        const vm = (v0 + v1) / 2
        if (quad === 1 || quad === 3) u1 = um
        else u0 = um
        if (quad === 1 || quad === 2) v1 = vm
        else v0 = vm
      }

      // 不乘 camera.alpha：v4 在合成阶段统一施加
      const tint = packTint(Tint.color[eid]!, Tint.alpha[eid]!)
      // Tint.effect 的 0/1 与 v4 的 TintModes.MULTIPLY/FILL 同值同义
      const tintMode = Tint.effect[eid]!
      const tex = self.atlas.pageGlTexture(self.atlas.page(frame))
      node.batch(
        drawingContext,
        tex,
        x0, y0, x1, y1, x2, y2, x3, y3,
        // 按起点 + 尺寸给；v 轴为 GL 朝向，texHeight 为负
        u0, v0, u1 - u0, v1 - v0,
        tintMode,
        tint, tint, tint, tint,
        self.renderOptions,
      )
    }
  }
}
