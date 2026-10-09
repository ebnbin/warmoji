import Phaser from 'phaser'
import { query } from 'bitecs'
import { Depth, Quad, RENDERABLE, Sprite, Tint, Transform, VisOff } from '../components'
import type { EcsWorld } from '../world'
import type { EcsAtlas } from '../atlas'
import { LYING_Z } from './bands'
import { EcsLayer, LayerType } from './layer'
import { packTint, TINT_FILL } from './tint'

/** 立着的东西在世界的一块范围里盖住哪些地方：把它们的剪影画进一张离屏的图，地面的光照按它把这些地方当作立着的身体来照 */
export class UprightMask extends EcsLayer {
  private readonly world: EcsWorld
  private readonly atlas: EcsAtlas
  private readonly tex: Phaser.Textures.DynamicTexture
  /** 这张图盖住的世界范围：左上角与宽高，像素 */
  readonly rect = [0, 0, 1, 1]
  private readonly uv = new Float32Array(4)
  private readonly m = new Phaser.GameObjects.Components.TransformMatrix()
  private readonly xy = new Float32Array(8)
  /** 须是复用的持久对象；multiTexturing 须显式开，缺省为单纹理且会与核心逐帧互相翻转 */
  private readonly renderOptions = {
    multiTexturing: true,
  } as Phaser.Types.Renderer.WebGL.RenderNodes.BatchHandlerQuadRenderOptions

  /** 不进显示列表：只画进 tex */
  constructor(scene: Phaser.Scene, world: EcsWorld, atlas: EcsAtlas, tex: Phaser.Textures.DynamicTexture) {
    super(scene, LayerType.Upright, 0)
    this.world = world
    this.atlas = atlas
    this.tex = tex
  }

  /** 重画 (x, y) 起 w×h 这块世界里立着的东西 */
  paint(x: number, y: number, w: number, h: number): void {
    this.rect[0] = x
    this.rect[1] = y
    this.rect[2] = w
    this.rect[3] = h
    this.tex.clear()
    this.tex.draw(this)
    this.tex.render()
  }

  renderWebGL(
    renderer: Phaser.Renderer.WebGL.WebGLRenderer,
    self: UprightMask,
    drawingContext: Phaser.Renderer.WebGL.DrawingContext,
  ): void {
    const node = renderer.renderNodes.getNode('BatchHandlerQuad') as Phaser.Renderer.WebGL.RenderNodes.BatchHandlerQuad | null
    if (!node) return
    const [rx, ry, rw, rh] = self.rect as [number, number, number, number]
    const sx = self.tex.width / rw
    const sy = self.tex.height / rh
    const m = self.m
    const xy = self.xy
    for (const eid of query(self.world, RENDERABLE)) {
      const frame = Sprite.frame[eid]!
      const alpha = Tint.alpha[eid]!
      if (Depth.z[eid]! < LYING_Z || frame < 0 || alpha <= 0) continue
      const hh = Transform.h[eid]! * 0.5
      const hw = (Sprite.flipX[eid] ? -1 : 1) * Transform.w[eid]! * 0.5
      m.applyITRS(Transform.x[eid]! + VisOff.x[eid]!, Transform.y[eid]! + VisOff.y[eid]!, Transform.rot[eid]!, 1, 1)
      // 四个角按 TL、BL、TR、BR
      for (let i = 0; i < 4; i++) {
        const lx = i < 2 ? -hw : hw
        const ly = i % 2 === 0 ? -hh : hh
        xy[i * 2] = (m.getX(lx, ly) - rx) * sx
        xy[i * 2 + 1] = (m.getY(lx, ly) - ry) * sy
      }
      self.atlas.uvInto(frame, self.uv, Quad.v[eid]!)
      const u0 = self.uv[0]!
      const v0 = self.uv[1]!
      const tint = packTint(0xffffff, alpha)
      node.batch(
        drawingContext,
        self.atlas.pageGlTexture(self.atlas.page(frame)),
        xy[0]!, xy[1]!, xy[2]!, xy[3]!, xy[4]!, xy[5]!, xy[6]!, xy[7]!,
        u0, v0, self.uv[2]! - u0, self.uv[3]! - v0,
        TINT_FILL,
        tint, tint, tint, tint,
        self.renderOptions,
      )
    }
  }
}
