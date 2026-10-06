import Phaser from 'phaser'
import { query } from 'bitecs'
import type { QueryTerm } from 'bitecs'
import { Alive, Depth, Drop, Faction, Floor, Held, Mounted, Pickup, Proj, Projectile, Prop, Radius, RENDERABLE, Sprite, Tint, Transform, VisOff } from '../components'
import { LIFT_PER_M } from '../../util/units'
import type { EcsWorld } from '../world'
import type { EcsAtlas } from '../atlas'
import type { UnitLight } from '../../types/maps'
import { AWAY } from '../../data/light'
import { paintedEmojiOn } from '../../emoji/style'
import { bottomAt, footY } from '../utils/ground'
import { UNDER_Z } from './bands'
import { EcsLayer, LayerType } from './layer'
import { packTint, TINT_FILL } from './tint'

/** 压在地面、水面与地上的 emoji 之上，所有身体之下 */
const SHADOW_DEPTH = 2.5
/** 影子上的一点每比地面高出一个精灵高，就淡掉这么多；再高也留这么一成 */
const FADE_PER_H = 0.55
const FADE_MIN = 0.25
/** 身体：角色、敌人与召出来的东西 */
const BODIES: QueryTerm[] = [Faction, Radius, Alive, ...RENDERABLE]
/** 拿在手里的武器：影子接在持有者脚下 */
const HELD: QueryTerm[] = [Held, Mounted, ...RENDERABLE]
/** 弹体：只有抛射的离地，平射的贴着它的高度飞、不投影 */
const SHOTS: QueryTerm[] = [Projectile, Proj, ...RENDERABLE]
/** 从上方落下来的东西：影子落在要砸的那一点 */
const DROPS: QueryTerm[] = [Drop, ...RENDERABLE]
/** 地上的金币与道具：一跳一跳地离地 */
const PICKUPS: QueryTerm[] = [Pickup, ...RENDERABLE]
/** 地图自己立着的东西：脚踩在精灵的画框下沿 */
const PROPS: QueryTerm[] = [Prop, ...RENDERABLE]

/** 离地的东西投在地上的影子：剪影从脚下的地面顺着太阳的方位铺出去，先画进一层再按浓度整层叠上去，重叠处不会越叠越黑；被地图上的东西挡住的不投 */
export class EcsShadowBatch extends EcsLayer {
  private readonly world: EcsWorld
  private readonly atlas: EcsAtlas
  private readonly color: number
  /** 精灵上的一点每比地面高一个像素，影子往外铺多少 */
  private readonly kx: number
  private readonly ky: number
  /** 画这一层的镜头：影子在它的画面上算，跟着它一起震 */
  private outer?: Phaser.Cameras.Scene2D.Camera
  private readonly uv = new Float32Array(4)
  private readonly spriteMatrix = new Phaser.GameObjects.Components.TransformMatrix()
  private readonly camMatrix = new Phaser.GameObjects.Components.TransformMatrix()
  private readonly xy = new Float32Array(8)
  private readonly tints = new Uint32Array(4)
  /** 须是复用的持久对象；multiTexturing 须显式开，缺省为单纹理且会与核心逐帧互相翻转 */
  private readonly renderOptions = {
    multiTexturing: true,
  } as Phaser.Types.Renderer.WebGL.RenderNodes.BatchHandlerQuadRenderOptions

  constructor(scene: Phaser.Scene, world: EcsWorld, atlas: EcsAtlas, shadow: NonNullable<UnitLight['shadow']>) {
    super(scene, LayerType.Shadow, SHADOW_DEPTH)
    this.world = world
    this.atlas = atlas
    this.color = shadow.color
    this.kx = AWAY.x * shadow.length
    this.ky = AWAY.y * shadow.length
    scene.add.existing(this)
    this.enableFilters()
    this.filtersForceComposite = true
    this.filterCamera!.setAlpha(shadow.alpha)
  }

  willRender(camera: Phaser.Cameras.Scene2D.Camera): boolean {
    return paintedEmojiOn() && super.willRender(camera)
  }

  focusFiltersOnCamera(camera: Phaser.Cameras.Scene2D.Camera): this {
    this.outer = camera
    return super.focusFiltersOnCamera(camera)
  }

  renderWebGL(
    renderer: Phaser.Renderer.WebGL.WebGLRenderer,
    self: EcsShadowBatch,
    drawingContext: Phaser.Renderer.WebGL.DrawingContext,
  ): void {
    const camera = self.outer ?? drawingContext.camera
    if (!camera) return
    const node = renderer.renderNodes.getNode('BatchHandlerQuad') as Phaser.Renderer.WebGL.RenderNodes.BatchHandlerQuad | null
    if (!node) return
    self.camMatrix.copyFrom(camera.getViewMatrix(true))
    const w = self.world
    for (const eid of query(w, BODIES)) if (Alive.v[eid]) self.cast(node, drawingContext, eid, footY(w, eid))
    for (const eid of query(w, HELD)) self.cast(node, drawingContext, eid, footY(w, Mounted.host[eid]!))
    for (const eid of query(w, SHOTS)) if (Proj.arc[eid]! > 0) self.cast(node, drawingContext, eid, bottomAt(eid, Transform.y[eid]!))
    for (const eid of query(w, DROPS)) self.cast(node, drawingContext, eid, bottomAt(eid, Drop.toY[eid]!))
    for (const eid of query(w, PICKUPS)) self.cast(node, drawingContext, eid, bottomAt(eid, Transform.y[eid]!))
    for (const eid of query(w, PROPS)) self.cast(node, drawingContext, eid, bottomAt(eid, Transform.y[eid]!))
  }

  /** 一张精灵的影子：ground 是它脚下那块地在平地上的画面纵坐标，两者都按脚下的地面抬起；精灵上的一点比地面高多少，影子就顺着太阳的方位往外铺多远、淡多少 */
  private cast(node: Phaser.Renderer.WebGL.RenderNodes.BatchHandlerQuad, drawingContext: Phaser.Renderer.WebGL.DrawingContext, eid: number, flat: number): void {
    const frame = Sprite.frame[eid]!
    const alpha = Tint.alpha[eid]!
    if (frame < 0 || alpha <= 0 || Depth.z[eid]! < UNDER_Z) return
    const lift = Floor.z[eid]! * LIFT_PER_M
    const ground = flat - lift
    const hh = Transform.h[eid]! * 0.5
    const hw = (Sprite.flipX[eid] ? -1 : 1) * Transform.w[eid]! * 0.5
    const m = this.spriteMatrix
    m.applyITRS(Transform.x[eid]! + VisOff.x[eid]!, Transform.y[eid]! + VisOff.y[eid]! - lift, Transform.rot[eid]!, 1, 1)
    const xy = this.xy
    const tints = this.tints
    // 四个角按 TL、BL、TR、BR
    for (let i = 0; i < 4; i++) {
      const lx = i < 2 ? -hw : hw
      const ly = i % 2 === 0 ? -hh : hh
      const up = ground - m.getY(lx, ly)
      const gx = m.getX(lx, ly) + this.kx * up
      const gy = ground + this.ky * up
      xy[i * 2] = this.camMatrix.getX(gx, gy)
      xy[i * 2 + 1] = this.camMatrix.getY(gx, gy)
      tints[i] = packTint(this.color, alpha * Math.max(FADE_MIN, Math.min(1, 1 - (FADE_PER_H * up) / (2 * hh || 1))))
    }
    this.atlas.uvInto(frame, this.uv)
    const u0 = this.uv[0]!
    const v0 = this.uv[1]!
    node.batch(
      drawingContext,
      this.atlas.pageGlTexture(this.atlas.page(frame)),
      xy[0]!, xy[1]!, xy[2]!, xy[3]!, xy[4]!, xy[5]!, xy[6]!, xy[7]!,
      u0, v0, this.uv[2]! - u0, this.uv[3]! - v0,
      TINT_FILL,
      tints[0]!, tints[1]!, tints[2]!, tints[3]!,
      this.renderOptions,
    )
  }
}
