import Phaser from 'phaser'
import { UNIT } from '../../util/units'
import { GROUND_PPU } from '../../data/texel'
import { SUN } from '../../data/light'
import { canvasTexture, drawSpark } from '../textures'
import { FRAME } from '../frame'
import { GROUND_AREA, textureSize } from './ground'
import { PetriPainter } from './painter'
import { COLONY_FRAG, encodeColony, LYSIN_SCALE } from './shader'
import { petriPlanFor } from './world'
import type { PetriState } from './world'
import type { PaintScene, PixelRect } from './ground'
import type { ColonyField, PetriPlan } from './model'
import type { EcsAtlas } from '../../ecs/atlas'
import type { MapView, ViewCtx } from '../../ecs/views'
import type { Framing } from '../../ecs/lens'
import type { Sim } from '../../ecs/sim'
import type { Point } from '../../util/vec'

/** 方框外的底色：灯箱边上的灰 */
const BG = 0xc9d2d8
const GROUND_KEY = 'petri-ground'
const COLONY_KEY = 'petri-colony'
const SPARK_KEY = 'petri-spark'
/** 开局最多几个线程分着画；贴图按这么多像素高的条分块交给线程 */
const PAINT_THREADS = 4
const STRIP_PX = 64
/** 溶出抑菌圈时那一圈光往外扩多久（毫秒）、什么颜色，溅出几滴 */
const POP_MS = 520
const POP_COLOR = 0xffd27a
const POP_DROPS = 10
/** 菌落层画在躺着的布景之上、身体的影子之下 */
const COLONY_DEPTH = 1.6
const RING_DEPTH = 1.7

/** 正在画的一圈溶菌的光：在哪、最大多大（像素），什么时候溶出的 */
interface Pop {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly at: number
}

/** 把画布传上显卡并按线性插值采样：每次上传都会把过滤重设成游戏的默认值，所以上传完要重新设 */
function upload(tex: Phaser.Textures.CanvasTexture): void {
  tex.refresh()
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR)
}

/**
 * 培养皿：灯箱、玻璃皿壁、琼脂和皿底的记号笔是开局在后台线程画好的贴图；菌落按菌落场编成的数据图由着色器画在琼脂上，
 * 菌落场一变就重传。身体死在哪里，那里先亮起一圈金色的光往外扩、溅出几滴，之后由着色器画出慢慢缩小的抑菌圈
 */
export class PetriView implements MapView {
  private visuals: Phaser.GameObjects.GameObject[] = []
  private plan?: PetriPlan
  private painter?: PetriPainter
  private colony?: { readonly tex: Phaser.Textures.CanvasTexture; readonly img: ImageData; readonly field: ColonyField; version: number }
  private rings?: Phaser.GameObjects.Graphics
  private drops?: Phaser.GameObjects.Particles.ParticleEmitter
  private pops: Pop[] = []
  private plaqueSeen = 0

  private planOf(v: ViewCtx): PetriPlan {
    if (!this.plan) this.plan = petriPlanFor(v.def.petri!, v.run.decorSeed)
    return this.plan
  }

  layout(v: ViewCtx): { w: number; h: number; origin: Point } {
    const p = this.planOf(v)
    return { w: FRAME.w, h: FRAME.h, origin: { x: p.cx * UNIT, y: p.cy * UNIT } }
  }

  build(v: ViewCtx): void {
    this.visuals.push(v.lens.screen.cover(v.scene.add.rectangle(0, 0, 1, 1, BG).setDepth(-2)))
    if (!v.scene.textures.exists(SPARK_KEY)) canvasTexture(v.scene, SPARK_KEY, 32, 32, (ctx) => drawSpark(ctx, 32))
  }

  framing(): Framing {
    return { map: FRAME, edge: 'frame' }
  }

  /** 琼脂上不撒 emoji */
  decor(_v: ViewCtx, _atlas: EcsAtlas): void {}

  async onSimReady(v: ViewCtx, sim: Sim): Promise<void> {
    const st = sim.worldState.petri
    if (!st) return
    const scene = v.scene
    const sc: PaintScene = { cfg: v.def.petri!, plan: this.planOf(v) }
    const size = textureSize()
    const tex = canvasTexture(scene, GROUND_KEY, size.w, size.h)
    const painter = new PetriPainter(sc, Math.max(1, Math.min(PAINT_THREADS, navigator.hardwareConcurrency - 1)))
    this.painter = painter
    const rects: PixelRect[] = []
    for (let y = 0; y < size.h; y += STRIP_PX) rects.push({ x0: 0, y0: y, x1: size.w, y1: Math.min(size.h, y + STRIP_PX) })
    await painter.paint(rects, (p) => {
      tex.getContext().putImageData(new ImageData(p.pixels, p.rect.x1 - p.rect.x0, p.rect.y1 - p.rect.y0), p.rect.x0, p.rect.y0)
    })
    painter.close()
    if (this.painter !== painter) return
    this.painter = undefined
    upload(tex)
    const ga = GROUND_AREA
    this.visuals.push(scene.add.image(ga.x0 * UNIT, ga.y0 * UNIT, GROUND_KEY).setOrigin(0, 0).setDisplaySize((size.w / GROUND_PPU) * UNIT, (size.h / GROUND_PPU) * UNIT).setDepth(-1))
    this.colonyLayer(v, st)
    this.rings = scene.add.graphics().setDepth(RING_DEPTH)
    this.drops = scene.add
      .particles(0, 0, SPARK_KEY, {
        lifespan: { min: 280, max: 620 },
        speed: { min: 40, max: 150 },
        scale: { start: 0.26, end: 0 },
        alpha: { start: 0.95, end: 0 },
        tint: [0xfff4dc, 0xffe6a8, 0xffcf6a],
        emitting: false,
      })
      .setDepth(9)
    this.visuals.push(this.rings, this.drops)
    this.plaqueSeen = st.plaqueCount
    v.lens.screen.vignette(0.78, 0.15, 0x1c252c)
  }

  /** 菌落层：菌落场编成数据图，着色器铺满菌落场的范围画 */
  private colonyLayer(v: ViewCtx, st: PetriState): void {
    const scene = v.scene
    const f = st.field
    const tex = canvasTexture(scene, COLONY_KEY, f.cols, f.rows)
    const img = tex.getContext().createImageData(f.cols, f.rows)
    this.colony = { tex, img, field: f, version: -1 }
    this.encode(v, st)
    const plan = st.plan
    const dish = [(plan.cx * UNIT - f.x0) / f.cell, (plan.cy * UNIT - f.y0) / f.cell, (plan.radius * UNIT) / f.cell]
    const light = [SUN.x, SUN.y, SUN.z]
    this.visuals.push(
      scene.add
        .shader(
          {
            name: 'PetriColony',
            fragmentSource: COLONY_FRAG,
            setupUniforms: (set: (name: string, value: unknown) => void) => {
              set('uData', 0)
              set('uGrid', [f.cols, f.rows])
              set('uDish', dish)
              set('uLight', light)
              set('uLysin', LYSIN_SCALE)
            },
          },
          f.x0,
          f.y0,
          f.cols * f.cell,
          f.rows * f.cell,
          [COLONY_KEY],
        )
        .setOrigin(0, 0)
        .setDepth(COLONY_DEPTH),
    )
  }

  /** 菌落场变过就重编数据图、重传 */
  private encode(v: ViewCtx, st: PetriState): void {
    const c = this.colony
    if (!c || c.version === st.version) return
    c.version = st.version
    encodeColony(c.field, v.def.petri!.colony.matureS, c.img.data)
    c.tex.getContext().putImageData(c.img, 0, 0)
    upload(c.tex)
  }

  step(v: ViewCtx, sim: Sim, _delta: number): void {
    const st = sim.worldState.petri
    if (!st || !this.rings) return
    this.encode(v, st)
    const fresh = Math.min(st.plaqueCount - this.plaqueSeen, st.plaques.length)
    this.plaqueSeen = st.plaqueCount
    for (let k = st.plaques.length - fresh; k < st.plaques.length; k++) {
      const p = st.plaques[k]!
      this.pops.push(p)
      this.drops?.explode(POP_DROPS, p.x, p.y)
    }
    const now = sim.elapsedMs
    const g = this.rings
    g.clear()
    this.pops = this.pops.filter((p) => now - p.at < POP_MS)
    for (const p of this.pops) {
      const t = Math.max(0, (now - p.at) / POP_MS)
      const ease = 1 - (1 - t) ** 3
      g.lineStyle(0.1 * UNIT * (1 - t * 0.6), POP_COLOR, 0.85 * (1 - t))
      g.strokeCircle(p.x, p.y, p.r * (0.3 + 0.7 * ease))
      g.fillStyle(POP_COLOR, 0.18 * (1 - t))
      g.fillCircle(p.x, p.y, p.r * (0.3 + 0.7 * ease))
    }
  }

  resize(): void {}

  destroy(v: ViewCtx): void {
    this.painter?.close()
    this.painter = undefined
    for (const o of this.visuals) o.destroy()
    this.visuals = []
    this.colony = undefined
    this.rings = undefined
    this.drops = undefined
    this.pops = []
    for (const key of [GROUND_KEY, COLONY_KEY]) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
  }
}
