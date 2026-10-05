import Phaser from 'phaser'
import type { EcsAtlas } from '../atlas'
import type { UnitLight } from '../../types/maps'
import { AWAY } from '../../data/light'
import { paintedEmojiOn } from '../../emoji/style'
import { EcsLayer } from './layer'
import type { LayerType } from './layer'
import { packTint, TINT_FILL } from './tint'

/** 补光里不论朝向、整个身体都吃到的那一份 */
const FILL_AMBIENT = 0.15

/**
 * 一个单位此刻受的光，由地图按它的位置写入：k 指向主光，长 1 时明暗按 sun 到 shade 分满，短些就淡些，为 0 就是四面一样亮；
 * f 是指向补光的单位向量，补光是在精灵上再叠一层 color 的剪影，朝着它的一角浓度是 fill，0 就是没有补光
 */
export interface LocalLight {
  kx: number
  ky: number
  fx: number
  fy: number
  color: number
  fill: number
}

/** 地图按位置给单位的光：可以把主光换个方向，也可以加一层补光 */
export type LightAt = (x: number, y: number, out: LocalLight) => void

/** 状态色乘上一个角受的光：t 从迎光的 0 到背光的 1，在 sun 与 shade 之间插 */
function litTint(color: number, sun: number, shade: number, t: number, alpha: number): number {
  const r = (((sun >> 16) & 0xff) * (1 - t) + ((shade >> 16) & 0xff) * t) * ((color >> 16) & 0xff)
  const g = (((sun >> 8) & 0xff) * (1 - t) + ((shade >> 8) & 0xff) * t) * ((color >> 8) & 0xff)
  const b = ((sun & 0xff) * (1 - t) + (shade & 0xff) * t) * (color & 0xff)
  return packTint((Math.round(r / 255) << 16) | (Math.round(g / 255) << 8) | Math.round(b / 255), alpha)
}

/** 不属于实体的一张图：(x, y) 为中心转 rot；和实体的精灵按 z 排在一起画时，z 相同的画在实体之后 */
export interface PaintSprite {
  readonly z: number
  readonly frame: number
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly rot?: number
  readonly color: number
  readonly alpha: number
}

type QuadNode = Phaser.Renderer.WebGL.RenderNodes.BatchHandlerQuad
type Camera = NonNullable<Phaser.Renderer.WebGL.DrawingContext['camera']>

/** 画四边形的批处理节点 */
export function quadNode(renderer: Phaser.Renderer.WebGL.WebGLRenderer): QuadNode | null {
  return renderer.renderNodes.getNode('BatchHandlerQuad') as QuadNode | null
}

/** 一层图集里的图，按地图给的光画，按 paint 的次序画；不碰实体 */
export class SpriteBatch extends EcsLayer {
  private readonly atlas: EcsAtlas
  private readonly uv = new Float32Array(4)
  private readonly spriteMatrix = new Phaser.GameObjects.Components.TransformMatrix()
  private readonly camMatrix = new Phaser.GameObjects.Components.TransformMatrix()
  private readonly calc = new Phaser.GameObjects.Components.TransformMatrix()
  /** 须是复用的持久对象；multiTexturing 须显式开，缺省为单纹理且会与核心逐帧互相翻转 */
  private readonly renderOptions = {
    multiTexturing: true,
  } as Phaser.Types.Renderer.WebGL.RenderNodes.BatchHandlerQuadRenderOptions
  protected readonly paint: readonly PaintSprite[]
  private readonly light: UnitLight | undefined
  private readonly lightAt: LightAt | undefined
  /** 这一帧打不打光：新画风随时能在设置里关掉 */
  private lit = false
  private readonly local: LocalLight = { kx: 0, ky: 0, fx: 0, fy: 0, color: 0, fill: 0 }
  /** 四个角按 TL、BL、TR、BR 的染色 */
  private readonly tints = new Uint32Array(4)

  constructor(scene: Phaser.Scene, type: LayerType, depth: number, atlas: EcsAtlas, paint: readonly PaintSprite[], light: UnitLight | undefined, lightAt: LightAt | undefined) {
    super(scene, type, depth)
    this.atlas = atlas
    this.paint = paint
    this.light = light
    this.lightAt = lightAt
    scene.add.existing(this)
  }

  renderWebGL(
    renderer: Phaser.Renderer.WebGL.WebGLRenderer,
    self: SpriteBatch,
    drawingContext: Phaser.Renderer.WebGL.DrawingContext,
  ): void {
    const camera = drawingContext.camera
    if (!camera || self.paint.length === 0) return
    const node = quadNode(renderer)
    if (!node) return
    self.aim(camera, drawingContext)
    for (const s of self.paint) self.drawPaint(node, drawingContext, s)
  }

  /** 这台镜头这一帧怎么画：镜头的矩阵，打不打光 */
  protected aim(camera: Camera, drawingContext: Phaser.Renderer.WebGL.DrawingContext): void {
    this.camMatrix.copyFrom(camera.getViewMatrix(!drawingContext.useCanvas))
    this.lit = this.light !== undefined && paintedEmojiOn()
  }

  protected drawPaint(node: QuadNode, drawingContext: Phaser.Renderer.WebGL.DrawingContext, s: PaintSprite): void {
    if (s.frame < 0) return
    this.draw(node, drawingContext, s.x, s.y, s.rot ?? 0, s.w, s.h, 0, s.frame, 0, s.color, s.alpha, 0)
  }

  /** 画一张图：(x, y) 为中心转 rot，宽高 w×h，flipX 水平翻转，quad 非零时只取四分之一格 */
  protected draw(
    node: QuadNode,
    drawingContext: Phaser.Renderer.WebGL.DrawingContext,
    x: number, y: number, rot: number, w: number, h: number, flipX: number, frame: number, quad: number,
    color: number, alpha: number, effect: number,
  ): void {
    const spriteMatrix = this.spriteMatrix
    const calc = this.calc
    spriteMatrix.applyITRS(x, y, rot, 1, 1)
    this.camMatrix.multiply(spriteMatrix, calc)

    let hw = (flipX ? -1 : 1) * w * 0.5
    const hh = h * 0.5

    this.atlas.uvInto(frame, this.uv, quad)
    let u0 = this.uv[0]!
    const v0 = this.uv[1]!
    let u1 = this.uv[2]!
    const v1 = this.uv[3]!

    const light = this.lit && effect === 0 ? this.light : undefined
    const l = this.local
    // 背光与补光的方向转进精灵自己的坐标，按对角线的一半归一
    let ax = 0
    let ay = 0
    let fx = 0
    let fy = 0
    if (light) {
      l.kx = -AWAY.x
      l.ky = -AWAY.y
      l.fx = l.fy = l.fill = 0
      this.lightAt?.(x, y, l)
      const c = Math.cos(rot)
      const s = Math.sin(rot)
      const r = Math.hypot(hw, hh) || 1
      ax = -(c * l.kx + s * l.ky) / r
      ay = -(c * l.ky - s * l.kx) / r
      fx = (c * l.fx + s * l.fy) / r
      fy = (c * l.fy - s * l.fx) / r
      // 四边形沿 TL–BR 剖成两个三角形：这条对角线顺着光时，几何与贴图一起左右镜像，换成横着光的那条，暗面才压得进背光的一角
      if (Math.abs(hw * ax + hh * ay) > Math.abs(hw * ax - hh * ay)) {
        hw = -hw
        const u = u0
        u0 = u1
        u1 = u
      }
    }

    const x0 = calc.getX(-hw, -hh)
    const y0 = calc.getY(-hw, -hh)
    const x1 = calc.getX(-hw, hh)
    const y1 = calc.getY(-hw, hh)
    const x2 = calc.getX(hw, -hh)
    const y2 = calc.getY(hw, -hh)
    const x3 = calc.getX(hw, hh)
    const y3 = calc.getY(hw, hh)
    const tex = this.atlas.pageGlTexture(this.atlas.page(frame))
    if (!light) {
      const tint = packTint(color, alpha)
      node.batch(drawingContext, tex, x0, y0, x1, y1, x2, y2, x3, y3, u0, v0, u1 - u0, v1 - v0, effect, tint, tint, tint, tint, this.renderOptions)
      return
    }
    // 每个角偏离中心的那段投到背光方向上：迎光的一半保持 sun，过了中心才往背光的一角渐渐乘到 shade
    const { sun, shade } = light
    const tints = this.tints
    for (let i = 0; i < 4; i++) {
      const cx = i < 2 ? -hw : hw
      const cy = i % 2 === 0 ? -hh : hh
      tints[i] = litTint(color, sun, shade, Math.max(0, cx * ax + cy * ay), alpha)
    }
    node.batch(drawingContext, tex, x0, y0, x1, y1, x2, y2, x3, y3, u0, v0, u1 - u0, v1 - v0, effect, tints[0]!, tints[1]!, tints[2]!, tints[3]!, this.renderOptions)
    if (l.fill * alpha * 255 < 1) return
    // 补光：同一张剪影填成光的颜色叠上去，越朝着光的角越浓
    for (let i = 0; i < 4; i++) {
      const cx = i < 2 ? -hw : hw
      const cy = i % 2 === 0 ? -hh : hh
      tints[i] = packTint(l.color, alpha * l.fill * (FILL_AMBIENT + (1 - FILL_AMBIENT) * Math.max(0, cx * fx + cy * fy)))
    }
    node.batch(drawingContext, tex, x0, y0, x1, y1, x2, y2, x3, y3, u0, v0, u1 - u0, v1 - v0, TINT_FILL, tints[0]!, tints[1]!, tints[2]!, tints[3]!, this.renderOptions)
  }
}
