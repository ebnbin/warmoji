import Phaser from 'phaser'
import { UNIT } from '../util/units'
import { rollDecor } from '../data/maps'
import { mainCameraOnly } from '../util/camera'
import { Rng } from '../util/rng'
import { decorSprite } from './decor'
import type { EcsAtlas } from './atlas'
import type { EcsWorld } from './world'
import type { MapDef } from '../types/maps'
import type { Point } from '../util/vec'
import type { LocalLight, PaintSprite } from './render/sprites'
import type { RunState } from '../run/state'
import type { Sim } from './sim'
import type { Framing, Lens, Screen } from './lens'

const FOG_COLOR = 0x0a0a1a
const FOG_DEPTH = 90
/** 黑幕比镜头拍到的范围多铺一点，取整时不露缝 */
const FOG_SLACK = 1.02

export function setOverlayFill(rect: Phaser.GameObjects.Rectangle, color: number, alpha: number): void {
  rect.setFillStyle(color, alpha).setVisible(alpha > 0.001)
}

export interface ViewCtx {
  readonly scene: Phaser.Scene
  readonly world: EcsWorld
  readonly run: RunState
  readonly def: MapDef
  /** 战斗镜头：地图不自己动镜头；跟着屏幕走的东西（底色与遮罩、暗角、闪屏、震屏、按镜头撒的粒子）都经它的屏幕层 */
  readonly lens: Lens
  /** 地上的布景：不是实体，地图往里放、删、挪；场景的布景层按列表的次序、按地图的光画在躺着的精灵那一层 */
  readonly decor: PaintSprite[]
  w: number
  h: number
  atlas?: EcsAtlas
}

export interface MapView {
  /** 地图多大、队伍从哪出发：开局定一次，屏幕变了也不变 */
  layout(v: ViewCtx): { w: number; h: number; origin: Point }
  build(v: ViewCtx): void
  /** 这张图怎么被拍：开局与屏幕变了时各取一次 */
  framing(v: ViewCtx): Framing
  /** 跟随时的缩放倍率，1 是标准；每帧取一次，不写就是 1 */
  followZoom?(v: ViewCtx): number
  decor(v: ViewCtx, atlas: EcsAtlas): void
  /** 要画很久的地图可以返回 Promise：画完之前战斗不开始 */
  onSimReady(v: ViewCtx, sim: Sim): void | Promise<void>
  step(v: ViewCtx, sim: Sim, delta: number): void
  /** (x, y) 处的单位受的光：out 里先填着太阳，地图可以换掉主光的方向、加一层补光 */
  lightAt?(x: number, y: number, out: LocalLight): void
  resize(v: ViewCtx): void
  /** 战斗场景关闭时也会调：那时主镜头连同它的滤镜已被 Phaser 拆掉，不能再碰镜头 */
  destroy(v: ViewCtx): void
}

/** 地图的视图大多从这里起：自己定布局、底图与取景，地面装饰按地图写的撒，离场时收走自己画的 */
export abstract class BoundedView implements MapView {
  protected visuals: Phaser.GameObjects.GameObject[] = []

  abstract layout(v: ViewCtx): { w: number; h: number; origin: Point }

  abstract build(v: ViewCtx): void

  abstract framing(v: ViewCtx): Framing

  decor(v: ViewCtx, atlas: EcsAtlas): void {
    const rng = new Rng(v.run.decorSeed)
    const cols = Math.round(v.w / UNIT)
    const rows = Math.round(v.h / UNIT)
    for (const d of rollDecor(v.def.decor, () => rng.next(), cols, rows)) {
      v.decor.push(decorSprite(atlas, d.emoji, d.xU * UNIT, d.yU * UNIT, d.sizeU * UNIT, d.rotation, d.alpha))
    }
  }

  onSimReady(_v: ViewCtx, _sim: Sim): void {}

  step(_v: ViewCtx, _sim: Sim, _delta: number): void {}

  resize(_v: ViewCtx): void {}

  destroy(v: ViewCtx): void {
    for (const o of this.visuals) o.destroy()
    this.visuals = []
    v.decor.length = 0
  }
}

/** 视野外的黑幕：属于屏幕层，铺满镜头拍到的范围，只在一个圆里透出来 */
export class Fog {
  private readonly rect: Phaser.GameObjects.Rectangle
  private readonly shape: Phaser.GameObjects.Graphics

  constructor(
    scene: Phaser.Scene,
    private readonly screen: Screen,
  ) {
    // Phaser 4 的 GeometryMask 在 WebGL 无实现，须走 filters.internal.addMask
    this.rect = mainCameraOnly(scene.add.rectangle(0, 0, 1, 1, FOG_COLOR, 0).setDepth(FOG_DEPTH).setVisible(false))
    this.shape = scene.add.graphics().setVisible(false)
    this.rect.enableFilters()
    this.rect.filters?.internal.addMask(this.shape, true)
  }

  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.rect, this.shape]
  }

  /** 以 (x, y) 为圆心、radius 为半径透出来，镜头拍到的其余地方盖上 alpha 的黑 */
  show(x: number, y: number, radius: number, alpha: number): void {
    if (alpha <= 0.001) return void this.rect.setVisible(false)
    this.shape.clear()
    this.shape.fillStyle(0xffffff)
    this.shape.fillCircle(x, y, radius)
    const r = this.screen.view()
    // 按整格放大，镜头慢慢缩放时不必每帧改尺寸
    const w = Math.ceil((r.w * FOG_SLACK) / UNIT) * UNIT
    const h = Math.ceil((r.h * FOG_SLACK) / UNIT) * UNIT
    if (w !== this.rect.width || h !== this.rect.height) this.rect.setSize(w, h)
    this.rect.setPosition(r.x + r.w / 2, r.y + r.h / 2).setFillStyle(FOG_COLOR, alpha).setVisible(true)
  }
}
