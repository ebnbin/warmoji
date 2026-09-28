import Phaser from 'phaser'
import { query } from 'bitecs'
import { Depth, Quad, Sprite, Tint, Transform, VisOff, RENDERABLE } from '../components'
import type { EcsWorld } from '../world'
import type { EcsAtlas } from '../atlas'
import { EcsLayer, LayerType } from './layer'
import { packTint } from './tint'
export { SPRITE_BANDS } from './bands'

/** 不属于实体的一张图：和实体的精灵按 z 排在一起画，z 相同时画在实体之后 */
export interface PaintSprite {
  readonly z: number
  readonly frame: number
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly color: number
  readonly alpha: number
}

export class EcsSpriteBatch extends EcsLayer {
  private readonly world: EcsWorld
  private readonly atlas: EcsAtlas
  private readonly uv = new Float32Array(4)
  private readonly spriteMatrix = new Phaser.GameObjects.Components.TransformMatrix()
  private readonly camMatrix = new Phaser.GameObjects.Components.TransformMatrix()
  private readonly calc = new Phaser.GameObjects.Components.TransformMatrix()
  private order: number[] = []
  /** 须是复用的持久对象；multiTexturing 须显式开，缺省为单纹理且会与核心逐帧互相翻转 */
  private readonly renderOptions = {
    multiTexturing: true,
  } as Phaser.Types.Renderer.WebGL.RenderNodes.BatchHandlerQuadRenderOptions
  private readonly zMin: number
  private readonly zMax: number
  /** 按 z 从小到大排好 */
  private readonly paint: readonly PaintSprite[]

  constructor(scene: Phaser.Scene, world: EcsWorld, atlas: EcsAtlas, depth: number, zMin: number, zMax: number, paint: readonly PaintSprite[]) {
    super(scene, LayerType.Sprite, depth)
    this.world = world
    this.atlas = atlas
    this.zMin = zMin
    this.zMax = zMax
    this.paint = paint
    scene.add.existing(this)
  }

  renderWebGL(
    renderer: Phaser.Renderer.WebGL.WebGLRenderer,
    self: EcsSpriteBatch,
    drawingContext: Phaser.Renderer.WebGL.DrawingContext,
  ): void {
    const camera = drawingContext.camera
    if (!camera) return

    const node = renderer.renderNodes.getNode(
      'BatchHandlerQuad',
    ) as Phaser.Renderer.WebGL.RenderNodes.BatchHandlerQuad | null
    if (!node) return

    const order = self.order
    order.length = 0
    for (const eid of query(self.world, RENDERABLE)) {
      const z = Depth.z[eid]!
      if (z >= self.zMin && z < self.zMax) order.push(eid)
    }
    const paint = self.paint
    let p = 0
    while (p < paint.length && paint[p]!.z < self.zMin) p++
    if (order.length === 0 && (p === paint.length || paint[p]!.z >= self.zMax)) return
    order.sort((a, b) => Depth.z[a]! - Depth.z[b]! || a - b)

    self.camMatrix.copyFrom(camera.getViewMatrix(!drawingContext.useCanvas))

    for (let i = 0; i < order.length; i++) {
      const eid = order[i]!
      for (; p < paint.length && paint[p]!.z < Depth.z[eid]!; p++) self.drawPaint(node, drawingContext, paint[p]!)
      const frame = Sprite.frame[eid]!
      if (frame < 0) continue
      self.draw(
        node, drawingContext,
        Transform.x[eid]! + VisOff.x[eid]!, Transform.y[eid]! + VisOff.y[eid]!, Transform.rot[eid]!,
        Transform.w[eid]!, Transform.h[eid]!, Sprite.flipX[eid]!, frame, Quad.v[eid]!,
        Tint.color[eid]!, Tint.alpha[eid]!, Tint.effect[eid]!,
      )
    }
    for (; p < paint.length && paint[p]!.z < self.zMax; p++) self.drawPaint(node, drawingContext, paint[p]!)
  }

  private drawPaint(node: Phaser.Renderer.WebGL.RenderNodes.BatchHandlerQuad, drawingContext: Phaser.Renderer.WebGL.DrawingContext, s: PaintSprite): void {
    if (s.frame < 0) return
    this.draw(node, drawingContext, s.x, s.y, 0, s.w, s.h, 0, s.frame, 0, s.color, s.alpha, 0)
  }

  /** 画一张图：(x, y) 为中心转 rot，宽高 w×h，flipX 水平翻转，quad 非零时只取四分之一格 */
  private draw(
    node: Phaser.Renderer.WebGL.RenderNodes.BatchHandlerQuad,
    drawingContext: Phaser.Renderer.WebGL.DrawingContext,
    x: number, y: number, rot: number, w: number, h: number, flipX: number, frame: number, quad: number,
    color: number, alpha: number, effect: number,
  ): void {
    const spriteMatrix = this.spriteMatrix
    const calc = this.calc
    spriteMatrix.applyITRS(x, y, rot, 1, 1)
    this.camMatrix.multiply(spriteMatrix, calc)

    const hw = (flipX ? -1 : 1) * w * 0.5
    const hh = h * 0.5
    const x0 = calc.getX(-hw, -hh)
    const y0 = calc.getY(-hw, -hh)
    const x1 = calc.getX(-hw, hh)
    const y1 = calc.getY(-hw, hh)
    const x2 = calc.getX(hw, -hh)
    const y2 = calc.getY(hw, -hh)
    const x3 = calc.getX(hw, hh)
    const y3 = calc.getY(hw, hh)

    this.atlas.uvInto(frame, this.uv)
    let u0 = this.uv[0]!
    let v0 = this.uv[1]!
    let u1 = this.uv[2]!
    let v1 = this.uv[3]!
    if (quad !== 0) {
      const um = (u0 + u1) / 2
      const vm = (v0 + v1) / 2
      if (quad === 1 || quad === 3) u1 = um
      else u0 = um
      if (quad === 1 || quad === 2) v1 = vm
      else v0 = vm
    }

    const tint = packTint(color, alpha)
    const tex = this.atlas.pageGlTexture(this.atlas.page(frame))
    node.batch(
      drawingContext,
      tex,
      x0, y0, x1, y1, x2, y2, x3, y3,
      u0, v0, u1 - u0, v1 - v0,
      effect,
      tint, tint, tint, tint,
      this.renderOptions,
    )
  }
}
