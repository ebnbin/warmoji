import Phaser from 'phaser'
import { hasComponent, query } from 'bitecs'
import type { QueryTerm } from 'bitecs'
import { Airborne, Alive, Faction, Motion, MOTION, Radius, RENDERABLE, Sprite, Tint, Transform, VisOff } from '../components'
import type { EcsWorld } from '../world'
import type { EcsAtlas } from '../atlas'
import type { UnitLight } from '../../types/maps'
import { SUN } from '../../data/light'
import { EMOJI_BOX } from '../../emoji/pack'
import { EMOJI_PAD } from '../../emoji/svg'
import { paintedEmojiOn } from '../../emoji/style'
import { EcsLayer, LayerType } from './layer'
import { packTint } from './tint'

/** 压在地面、水面与地上的 emoji 之上，所有身体之下 */
const SHADOW_DEPTH = 2.5
/** 精灵的高里 emoji 画框占的份额：四周垫了 EMOJI_PAD */
const ART = EMOJI_BOX / (EMOJI_BOX + 2 * EMOJI_PAD)
/** 影子在精灵顶上那一头淡到脚下的几成 */
const TIP = 0.45
/** 精灵画在影子层里的样子：整块填成一种颜色 */
const FILL = 1
/** 投影的是身体：角色、敌人与召出来的东西 */
const CASTERS: QueryTerm[] = [Faction, Radius, Alive, ...RENDERABLE]

/** 身体投在地上的影子：剪影从脚底顺着太阳的方位铺出去，先画进一层再按浓度整层叠上去，重叠处不会越叠越黑 */
export class EcsShadowBatch extends EcsLayer {
  private readonly world: EcsWorld
  private readonly atlas: EcsAtlas
  private readonly color: number
  /** 精灵上的一点每比脚底高一个像素，影子往外铺多少 */
  private readonly kx: number
  private readonly ky: number
  /** 画这一层的镜头：影子在它的画面上算，跟着它一起震 */
  private outer?: Phaser.Cameras.Scene2D.Camera
  private readonly uv = new Float32Array(4)
  private readonly spriteMatrix = new Phaser.GameObjects.Components.TransformMatrix()
  private readonly camMatrix = new Phaser.GameObjects.Components.TransformMatrix()
  private readonly xy = new Float32Array(8)
  /** 须是复用的持久对象；multiTexturing 须显式开，缺省为单纹理且会与核心逐帧互相翻转 */
  private readonly renderOptions = {
    multiTexturing: true,
  } as Phaser.Types.Renderer.WebGL.RenderNodes.BatchHandlerQuadRenderOptions

  constructor(scene: Phaser.Scene, world: EcsWorld, atlas: EcsAtlas, light: UnitLight) {
    super(scene, LayerType.Shadow, SHADOW_DEPTH)
    this.world = world
    this.atlas = atlas
    const s = light.shadow
    this.color = s.color
    const away = Math.hypot(SUN.x, SUN.y)
    this.kx = (-SUN.x / away) * s.length
    this.ky = (-SUN.y / away) * s.length
    scene.add.existing(this)
    this.enableFilters()
    this.filtersForceComposite = true
    this.filterCamera!.setAlpha(s.alpha)
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
    const m = self.spriteMatrix
    const xy = self.xy
    for (const eid of query(w, CASTERS)) {
      if (!Alive.v[eid]) continue
      const frame = Sprite.frame[eid]!
      const alpha = Tint.alpha[eid]!
      if (frame < 0 || alpha <= 0) continue
      const x = Transform.x[eid]! + VisOff.x[eid]!
      const y = Transform.y[eid]! + VisOff.y[eid]!
      // 弧线与悬空把身体在画面上抬起来，影子留在原处的地上；扑刺只是贴着地往前冲
      const lifted = hasComponent(w, eid, Airborne) || (hasComponent(w, eid, Motion) && Motion.kind[eid] === MOTION.arc)
      const hh = Transform.h[eid]! * 0.5
      const hw = (Sprite.flipX[eid] ? -1 : 1) * Transform.w[eid]! * 0.5
      const ground = (lifted ? Transform.y[eid]! : y) + hh * ART
      m.applyITRS(x, y, Transform.rot[eid]!, 1, 1)
      // 四个角按 TL、BL、TR、BR：精灵上的一点比脚底高多少，影子就顺着太阳的方位往外铺多远
      for (let i = 0; i < 4; i++) {
        const lx = i < 2 ? -hw : hw
        const ly = i % 2 === 0 ? -hh : hh
        const up = ground - m.getY(lx, ly)
        const gx = m.getX(lx, ly) + self.kx * up
        const gy = ground + self.ky * up
        xy[i * 2] = self.camMatrix.getX(gx, gy)
        xy[i * 2 + 1] = self.camMatrix.getY(gx, gy)
      }
      self.atlas.uvInto(frame, self.uv)
      const u0 = self.uv[0]!
      const v0 = self.uv[1]!
      const foot = packTint(self.color, alpha)
      const tip = packTint(self.color, alpha * TIP)
      node.batch(
        drawingContext,
        self.atlas.pageGlTexture(self.atlas.page(frame)),
        xy[0]!, xy[1]!, xy[2]!, xy[3]!, xy[4]!, xy[5]!, xy[6]!, xy[7]!,
        u0, v0, self.uv[2]! - u0, self.uv[3]! - v0,
        FILL,
        tip, foot, tip, foot,
        self.renderOptions,
      )
    }
  }
}
