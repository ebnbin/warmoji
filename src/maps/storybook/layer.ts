import Phaser from 'phaser'
import { EcsLayer, LayerType } from '../../ecs/render/layer'
import { packTint, TINT_FILL } from '../../ecs/render/tint'

/**
 * 一张贴在任意四边形上的图：四个角按左上、左下、右上、右下给世界像素坐标，取贴图上 (u0, v0) 起 uw×vh 的一块；
 * fill 为真时整块填成 color，只留剪影；fade 给了就按同样的次序给四个角各乘一个浓度，角与角之间渐变
 */
export interface Quad {
  readonly key: string
  readonly x: readonly [number, number, number, number]
  readonly y: readonly [number, number, number, number]
  readonly u0: number
  readonly v0: number
  readonly uw: number
  readonly vh: number
  readonly color: number
  readonly alpha: number
  readonly fill: boolean
  readonly fade?: readonly [number, number, number, number]
}

/** 画布贴图上 (sx, sy) 起 sw×sh 像素那一块的取样范围：画布传上显卡是上下颠倒的 */
export function canvasUv(tw: number, th: number, sx: number, sy: number, sw: number, sh: number): { u0: number; v0: number; uw: number; vh: number } {
  return { u0: sx / tw, v0: 1 - sy / th, uw: sw / tw, vh: -sh / th }
}

/**
 * 一层自己画的四边形：地图每帧把要画的列一遍放进 quads，按次序画。
 * composite 给了就先画进一层再按这个浓度整层叠上去，重叠处不越叠越深（影子用）
 */
export class QuadLayer extends EcsLayer {
  quads: Quad[] = []
  private readonly camMatrix = new Phaser.GameObjects.Components.TransformMatrix()
  private outer?: Phaser.Cameras.Scene2D.Camera
  private readonly composite: boolean
  /** 须是复用的持久对象；multiTexturing 须显式开 */
  private readonly renderOptions = {
    multiTexturing: true,
  } as Phaser.Types.Renderer.WebGL.RenderNodes.BatchHandlerQuadRenderOptions

  constructor(scene: Phaser.Scene, depth: number, composite?: number) {
    super(scene, LayerType.Paint, depth)
    scene.add.existing(this)
    this.composite = composite !== undefined
    if (composite !== undefined) {
      this.enableFilters()
      this.filtersForceComposite = true
      this.filterCamera!.setAlpha(composite)
    }
  }

  focusFiltersOnCamera(camera: Phaser.Cameras.Scene2D.Camera): this {
    this.outer = camera
    return super.focusFiltersOnCamera(camera)
  }

  renderWebGL(
    renderer: Phaser.Renderer.WebGL.WebGLRenderer,
    self: QuadLayer,
    drawingContext: Phaser.Renderer.WebGL.DrawingContext,
  ): void {
    if (self.quads.length === 0) return
    const camera = self.composite ? (self.outer ?? drawingContext.camera) : drawingContext.camera
    if (!camera) return
    const node = renderer.renderNodes.getNode('BatchHandlerQuad') as Phaser.Renderer.WebGL.RenderNodes.BatchHandlerQuad | null
    if (!node) return
    const m = self.camMatrix.copyFrom(camera.getViewMatrix(self.composite ? true : !drawingContext.useCanvas))
    const textures = self.scene.textures
    for (const q of self.quads) {
      if (!textures.exists(q.key)) continue
      const tex = textures.get(q.key).get().source.glTexture
      if (!tex) continue
      const tint = packTint(q.color, q.alpha)
      const f = q.fade
      node.batch(
        drawingContext,
        tex,
        m.getX(q.x[0], q.y[0]), m.getY(q.x[0], q.y[0]),
        m.getX(q.x[1], q.y[1]), m.getY(q.x[1], q.y[1]),
        m.getX(q.x[2], q.y[2]), m.getY(q.x[2], q.y[2]),
        m.getX(q.x[3], q.y[3]), m.getY(q.x[3], q.y[3]),
        q.u0, q.v0, q.uw, q.vh,
        q.fill ? TINT_FILL : 0,
        f ? packTint(q.color, q.alpha * f[0]) : tint,
        f ? packTint(q.color, q.alpha * f[1]) : tint,
        f ? packTint(q.color, q.alpha * f[2]) : tint,
        f ? packTint(q.color, q.alpha * f[3]) : tint,
        self.renderOptions,
      )
    }
  }
}
