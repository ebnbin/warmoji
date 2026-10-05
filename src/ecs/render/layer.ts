import Phaser from 'phaser'
import { newScratch, resetScratch } from './tri'
import type { Scratch } from './tri'

export enum LayerType {
  Sprite = 'EcsSpriteBatch',
  Shadow = 'EcsShadowBatch',
  Upright = 'EcsUprightMask',
  Ring = 'EcsRingBatch',
  Shape = 'EcsShapeBatch',
  DamageText = 'DamageTextBatch',
  Paint = 'EcsPaintBatch',
}

// 裸 GameObject 须自己声明 _depth，否则排序得 NaN 而深度带整体失效
export abstract class EcsLayer extends Phaser.GameObjects.GameObject {
  _depth: number
  // 渲染前会读 child.blendMode；裸 GameObject 须显式给，否则报错
  blendMode = Phaser.BlendModes.NORMAL

  constructor(scene: Phaser.Scene, type: LayerType, depth: number) {
    super(scene, type)
    this._depth = depth
  }

  get depth(): number {
    return this._depth
  }

  set depth(v: number) {
    this._depth = v
    this.displayList?.queueDepthSort()
  }
}

type Matrix = Phaser.GameObjects.Components.TransformMatrix

/** 一层平涂的三角形：每次渲染由 fill 按这台镜头往 o 里画 */
export class TriBatch extends EcsLayer {
  private readonly camMatrix = new Phaser.GameObjects.Components.TransformMatrix()
  private readonly out: Scratch = newScratch()

  constructor(scene: Phaser.Scene, type: LayerType, depth: number, private readonly fill: (o: Scratch, m: Matrix) => void) {
    super(scene, type, depth)
    scene.add.existing(this)
  }

  renderWebGL(
    renderer: Phaser.Renderer.WebGL.WebGLRenderer,
    self: TriBatch,
    drawingContext: Phaser.Renderer.WebGL.DrawingContext,
  ): void {
    const camera = drawingContext.camera
    if (!camera) return
    const node = renderer.renderNodes.getNode('BatchHandlerTriFlat') as
      | { batch: (ctx: unknown, i: number[], v: number[], c: number[], l: null) => void }
      | null
    if (!node) return
    const m = self.camMatrix.copyFrom(camera.getViewMatrix(!drawingContext.useCanvas))
    const o = self.out
    resetScratch(o)
    self.fill(o, m)
    if (o.i.length === 0) return
    node.batch(drawingContext, o.i, o.v, o.c, null)
  }
}
