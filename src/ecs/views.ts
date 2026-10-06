import Phaser from 'phaser'
import { UNIT } from '../util/units'
import { MAP, rollDecor } from '../data/maps'
import { viewport } from '../util/apply'
import { mainCameraOnly } from '../util/camera'
import { Rng } from '../util/rng'
import { decorSprite } from './decor'
import type { Decor } from './decor'
import type { EcsAtlas } from './atlas'
import type { EcsWorld } from './world'
import type { MapDef, TorusConfig } from '../types/maps'
import type { Point } from '../util/vec'
import type { LocalLight, PaintSprite, SpriteCut } from './render/sprites'
import type { RunState } from '../run/state'
import type { Sim } from './sim'
import { clockSec } from './fight/clock'
import { query } from 'bitecs'
import { Due, Meteor, Phys, Stats } from './components'
import { meteorPath } from './store'
import { captureRadiusU } from './worlds/nebulaOld'
import { ringPoint } from './worlds/space'
import { leaderX, leaderY } from './utils/team'
import { fogAlphaAt, fogRadiusAt, hourAt, visionGridsAt } from './worlds/daynight'
import { onFloe } from './worlds/ice'
import { driftSpeed, riverRect } from './worlds/oldRiver'
import { mix } from '../maps/color'
import type { Framing, Lens, Screen } from './lens'

const FOG_COLOR = 0x0a0a1a
const FOG_DEPTH = 90
/** 黑幕比镜头拍到的范围多铺一点，取整时不露缝 */
const FOG_SLACK = 1.02
const WATER_COLOR = 0x0b2a45
const WATER_VIGNETTE = 0x1e6fd0
const BANK_COLOR = 0x54402a
const BANK_FAR_COLOR = 0x40301f

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
  /** 开战时屏幕是竖的：按屏幕摆向的地图据此定朝向，之后不随屏幕转 */
  readonly portrait: boolean
  /** 地上的布景：不是实体，地图往里放、删、挪；场景的布景层按列表的次序、按地图的光画在躺着的精灵那一层 */
  readonly decor: PaintSprite[]
  w: number
  h: number
  atlas?: EcsAtlas
}

export interface MapView {
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
  /** 新画风下 (x, y) 处的单位受的光：out 里先填着太阳，地图可以换掉主光的方向、加一层补光 */
  lightAt?(x: number, y: number, out: LocalLight): void
  /** 身体在地上的 (x, y)、精灵半宽半高 hw×hh：要切成几份画（正穿过传送门的一份在门这边、一份在门那边），写进 out 返回份数，0 是整张画 */
  cutAt?(x: number, y: number, hw: number, hh: number, out: SpriteCut[]): number
  /** 这个实体陷进地面多深，按它精灵的画框高的比例（0 是没陷）：画的时候整张往下沉这么多，没进地面的那一截不画，影子也只投露在外面的；不写就都不陷 */
  sunkAt?(eid: number): number
  resize(v: ViewCtx): void
  /** 战斗场景关闭时也会调：那时主镜头连同它的滤镜已被 Phaser 拆掉，不能再碰镜头 */
  destroy(v: ViewCtx): void
}

export class BoundedView implements MapView {
  protected visuals: Phaser.GameObjects.GameObject[] = []

  layout(v: ViewCtx): { w: number; h: number; origin: Point } {
    const w = (v.def.size?.w ?? MAP.width) * UNIT
    const h = (v.def.size?.h ?? MAP.height) * UNIT
    return { w, h, origin: { x: w / 2, y: h / 2 } }
  }

  build(v: ViewCtx): void {
    const g = v.scene.add.graphics().setDepth(-1)
    const so = 0.25 * UNIT
    g.fillStyle(v.def.palette.shadow, 1)
    g.fillRect(so, so, v.w, v.h)
    g.fillStyle(v.def.palette.map, 1)
    g.fillRect(0, 0, v.w, v.h)
    this.visuals.push(g)
  }

  /** 队伍能走到的范围 */
  protected field(v: ViewCtx): Phaser.Geom.Rectangle {
    return new Phaser.Geom.Rectangle(0, 0, v.w, v.h)
  }

  framing(v: ViewCtx): Framing {
    const f = this.field(v)
    return { map: { x: f.x, y: f.y, w: f.width, h: f.height }, edge: 'clamp' }
  }

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

/** 地图按屏幕的大小定，整张一屏放下；屏幕变了就整张重画 */
abstract class SingleScreenView extends BoundedView {
  framing(v: ViewCtx): Framing {
    return { ...super.framing(v), fit: true }
  }

  resize(v: ViewCtx): void {
    this.destroy(v)
    this.build(v)
    if (v.atlas) this.decor(v, v.atlas)
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

export class DayNightView extends BoundedView {
  private fog?: Fog
  private zoom = 1

  build(v: ViewCtx): void {
    super.build(v)
    this.fog = new Fog(v.scene, v.lens.screen)
    this.visuals.push(...this.fog.objects)
  }

  /** 正午看得最远，午夜收窄 */
  followZoom(): number {
    return this.zoom
  }

  step(v: ViewCtx, sim: Sim, _delta: number): void {
    const dn = v.def.dayNight!
    const hour = hourAt(clockSec(sim), dn)
    this.zoom = dn.visionMid / visionGridsAt(hour, dn)
    this.fog?.show(leaderX(sim), leaderY(sim), fogRadiusAt(hour, dn) * UNIT, fogAlphaAt(hour, dn))
  }
}

export class IceView extends BoundedView {
  private vignette?: Phaser.GameObjects.Rectangle

  layout(v: ViewCtx): { w: number; h: number; origin: Point } {
    const px = v.def.ice!.floeU * UNIT
    return { w: px, h: px, origin: { x: px / 2, y: px / 2 } }
  }

  build(v: ViewCtx): void {
    this.visuals.push(v.lens.screen.cover(v.scene.add.rectangle(0, 0, 1, 1, WATER_COLOR).setDepth(-2)))
    super.build(v)
    const g = v.scene.add.graphics().setDepth(-1)
    g.lineStyle(3, 0xdff3ff, 0.85)
    g.strokeRect(0, 0, v.w, v.h)
    this.visuals.push(g)
    this.vignette = v.lens.screen.cover(v.scene.add.rectangle(0, 0, 1, 1, WATER_VIGNETTE, 0).setDepth(90))
    this.visuals.push(this.vignette)
  }

  /** 冰外是海，游得出去，镜头不设边 */
  framing(v: ViewCtx): Framing {
    return { ...super.framing(v), edge: 'open' }
  }

  step(v: ViewCtx, sim: Sim, _delta: number): void {
    const px = v.def.ice!.floeU * UNIT
    const inWater = !onFloe(leaderX(sim), leaderY(sim), px)
    if (this.vignette) setOverlayFill(this.vignette, WATER_VIGNETTE, inWater ? 0.18 + 0.06 * Math.sin(sim.elapsedMs / 140) : 0)
  }
}

function fieldRadius(v: ViewCtx): number {
  return v.def.space!.blackholeRadiusU * UNIT
}

/** 深空：圆心在原点的禁锢圈，地图是圈的外接正方形，镜头锁在圈外一点 */
export class SpaceView extends BoundedView {
  private meteorFx?: { of: number; tele: Phaser.GameObjects.Graphics }

  layout(v: ViewCtx): { w: number; h: number; origin: Point } {
    const d = fieldRadius(v) * 2
    return { w: d, h: d, origin: { x: 0, y: 0 } }
  }

  build(v: ViewCtx): void {
    this.visuals.push(v.lens.screen.cover(v.scene.add.rectangle(0, 0, 1, 1, v.def.palette.map).setDepth(-1)))
    const r = fieldRadius(v)
    const ring = v.scene.add.graphics().setDepth(2)
    ring.lineStyle(5, 0x9c6bff, 0.7)
    ring.strokeCircle(0, 0, r)
    ring.lineStyle(18, 0x6a3fbf, 0.13)
    ring.strokeCircle(0, 0, r - 9)
    this.visuals.push(ring)
  }

  protected field(v: ViewCtx): Phaser.Geom.Rectangle {
    const r = fieldRadius(v)
    return new Phaser.Geom.Rectangle(-r, -r, r * 2, r * 2)
  }

  /** 装饰只撒在圈里 */
  decor(v: ViewCtx, atlas: EcsAtlas): void {
    const rng = new Rng(v.run.decorSeed)
    const rU = fieldRadius(v) / UNIT
    const cells = Math.round(rU * 2)
    for (const d of rollDecor(v.def.decor, () => rng.next(), cells, cells)) {
      const xU = d.xU - rU
      const yU = d.yU - rU
      if (Math.hypot(xU, yU) > rU - d.sizeU / 2) continue
      v.decor.push(decorSprite(atlas, d.emoji, xU * UNIT, yU * UNIT, d.sizeU * UNIT, d.rotation, d.alpha))
    }
  }

  step(v: ViewCtx, sim: Sim, _delta: number): void {
    this.drawMeteorLane(v, sim)
  }

  private drawMeteorLane(v: ViewCtx, sim: Sim): void {
    const m = query(v.world, [Meteor])[0]
    const fx = this.meteorFx
    if (fx && fx.of !== m) {
      fx.tele.destroy()
      this.meteorFx = undefined
    }
    if (m === undefined) return
    const cfg = v.def.space!.meteor
    const rr = cfg.radiusU * UNIT
    let cur = this.meteorFx
    if (!cur) {
      const sx = Meteor.sx[m]!
      const sy = Meteor.sy[m]!
      const tele = v.scene.add.graphics().setDepth(3)
      tele.lineStyle(rr * 2, 0xff5252, 0.16)
      tele.lineBetween(sx, sy, Meteor.ex[m]!, Meteor.ey[m]!)
      tele.lineStyle(3, 0xff8a80, 0.8)
      tele.lineBetween(sx, sy, Meteor.ex[m]!, Meteor.ey[m]!)
      tele.fillStyle(0xff5252, 0.35)
      tele.fillCircle(sx, sy, rr)
      cur = { of: m, tele }
      this.meteorFx = cur
    }
    cur.tele.setAlpha(sim.elapsedMs < Due.at[m]! ? 0.28 + 0.24 * Math.abs(Math.sin(sim.elapsedMs / 110)) : 0.22)
  }

  destroy(v: ViewCtx): void {
    this.meteorFx?.tele.destroy()
    this.meteorFx = undefined
    super.destroy(v)
  }
}

/** 空腔半径与星云外缘，像素 */
function nebulaOldRadii(v: ViewCtx): { wall: number; rim: number } {
  const s = v.def.nebulaOld!.shell
  return { wall: s.innerU * UNIT, rim: s.outerU * UNIT }
}

const GAS_COLORS = [0xff5fa2, 0x7c4dff, 0x40c4ff, 0xb388ff, 0xff8a65]
const SHELL_INNER = 0x4fc3f7
const SHELL_OUTER = 0xff5f8f

/**
 * 旧星云：圆心在原点的空腔里飘着一团团气体，壳层按俯视的柱密度着色，内壁最亮、往外渐暗到外缘为零；
 * 黑洞画出视界、光子球与吸积盘，虚线圈是当前队长走路逃不出的范围，流星的预警沿引力弯曲的轨迹
 */
export class NebulaOldView extends BoundedView {
  private capture?: Phaser.GameObjects.Graphics
  private captureU = -1
  private meteorFx?: { of: number; tele: Phaser.GameObjects.Graphics }

  layout(v: ViewCtx): { w: number; h: number; origin: Point } {
    const d = nebulaOldRadii(v).rim * 2
    return { w: d, h: d, origin: { x: 0, y: 0 } }
  }

  build(v: ViewCtx): void {
    this.visuals.push(v.lens.screen.cover(v.scene.add.rectangle(0, 0, 1, 1, v.def.palette.map).setDepth(-1)))
    const { wall, rim } = nebulaOldRadii(v)
    const gas = v.scene.add.graphics().setDepth(-0.9)
    const rng = new Rng(v.run.decorSeed ^ 0x9a5)
    for (let i = 0; i < 14; i++) {
      const p = ringPoint(rng, { x: 0, y: 0 }, 0, wall * 0.85)
      gas.fillStyle(GAS_COLORS[i % GAS_COLORS.length]!, 0.05 + rng.next() * 0.06)
      gas.fillCircle(p.x, p.y, (3 + rng.next() * 4) * UNIT)
    }
    this.visuals.push(gas)
    const shell = v.scene.add.graphics().setDepth(-0.8)
    const n = 36
    const w = (rim - wall) / n
    const peak = Math.sqrt(rim * rim - wall * wall)
    for (let i = 0; i < n; i++) {
      const r = wall + (i + 0.5) * w
      shell.lineStyle(w, mix(SHELL_INNER, SHELL_OUTER, i / (n - 1)), (0.4 * Math.sqrt(rim * rim - r * r)) / peak)
      shell.strokeCircle(0, 0, r)
    }
    this.visuals.push(shell)
  }

  protected field(v: ViewCtx): Phaser.Geom.Rectangle {
    const { rim } = nebulaOldRadii(v)
    return new Phaser.Geom.Rectangle(-rim, -rim, rim * 2, rim * 2)
  }

  /** 装饰只撒在空腔里 */
  decor(v: ViewCtx, atlas: EcsAtlas): void {
    const rng = new Rng(v.run.decorSeed)
    const rU = nebulaOldRadii(v).wall / UNIT
    const cells = Math.round(rU * 2)
    for (const d of rollDecor(v.def.decor, () => rng.next(), cells, cells)) {
      const xU = d.xU - rU
      const yU = d.yU - rU
      if (Math.hypot(xU, yU) > rU - d.sizeU / 2) continue
      v.decor.push(decorSprite(atlas, d.emoji, xU * UNIT, yU * UNIT, d.sizeU * UNIT, d.rotation, d.alpha))
    }
  }

  /** 吸积盘从最内稳定圆轨道（3 倍视界）往外，光子球在 1.5 倍视界 */
  onSimReady(v: ViewCtx, sim: Sim): void {
    const hole = sim.worldState.hole
    if (!hole) return
    const h = v.def.nebulaOld!.hole.horizonU * UNIT
    const g = v.scene.add.graphics().setDepth(2.5)
    for (let i = 0; i < 6; i++) {
      g.lineStyle(h * 0.4, i % 2 === 0 ? 0xffa040 : 0xff6ec7, 0.1 - i * 0.012)
      g.strokeCircle(hole.x, hole.y, h * (3 + i * 0.35))
    }
    g.lineStyle(3, 0xfff3c4, 0.9)
    g.strokeCircle(hole.x, hole.y, h * 1.5)
    g.fillStyle(0x000000, 1)
    g.fillCircle(hole.x, hole.y, h)
    g.lineStyle(2, 0x7c4dff, 0.9)
    g.strokeCircle(hole.x, hole.y, h)
    this.visuals.push(g)
    this.capture = v.scene.add.graphics().setDepth(3)
    this.visuals.push(this.capture)
  }

  step(v: ViewCtx, sim: Sim, _delta: number): void {
    this.drawCapture(v, sim)
    this.drawMeteorPath(v, sim)
  }

  /** 当前队长走路逃不出的范围：终端漂移追上它最快速度的地方，随换人与体力变化 */
  private drawCapture(v: ViewCtx, sim: Sim): void {
    const g = this.capture
    const hole = sim.worldState.hole
    const lead = sim.leader
    if (!g || !hole || lead < 0) return
    const cfg = v.def.nebulaOld!
    const rU = captureRadiusU(cfg, Phys.mass[lead]! / Phys.drag[lead]!, Stats.moveSpeed[lead]!, cfg.shell.innerU * 2)
    if (Math.abs(rU - this.captureU) < 0.02) return
    this.captureU = rU
    g.clear()
    if (rU <= cfg.hole.horizonU) return
    const r = rU * UNIT
    const n = 48
    g.lineStyle(2, 0xffffff, 0.45)
    for (let i = 0; i < n; i += 2) {
      g.beginPath()
      g.arc(hole.x, hole.y, r, (i / n) * Math.PI * 2, ((i + 1) / n) * Math.PI * 2)
      g.strokePath()
    }
  }

  private drawMeteorPath(v: ViewCtx, sim: Sim): void {
    const m = query(v.world, [Meteor])[0]
    const fx = this.meteorFx
    if (fx && fx.of !== m) {
      fx.tele.destroy()
      this.meteorFx = undefined
    }
    if (m === undefined) return
    const path = meteorPath[m]
    if (!path) return
    let cur = this.meteorFx
    if (!cur) {
      const rr = v.def.nebulaOld!.meteor.radiusU * UNIT
      const tele = v.scene.add.graphics().setDepth(3)
      const trace = (): void => {
        tele.beginPath()
        tele.moveTo(path[0]!, path[1]!)
        for (let i = 2; i < path.length; i += 2) tele.lineTo(path[i]!, path[i + 1]!)
        tele.strokePath()
      }
      tele.lineStyle(rr * 2, 0xff5252, 0.16)
      trace()
      tele.lineStyle(3, 0xff8a80, 0.8)
      trace()
      tele.fillStyle(0xff5252, 0.35)
      tele.fillCircle(path[0]!, path[1]!, rr)
      cur = { of: m, tele }
      this.meteorFx = cur
    }
    cur.tele.setAlpha(sim.elapsedMs < Due.at[m]! ? 0.28 + 0.24 * Math.abs(Math.sin(sim.elapsedMs / 110)) : 0.22)
  }

  destroy(v: ViewCtx): void {
    this.meteorFx?.tele.destroy()
    this.meteorFx = undefined
    this.capture = undefined
    this.captureU = -1
    super.destroy(v)
  }
}

export class OldRuinsView extends BoundedView {
  private tiles = new Map<number, Phaser.GameObjects.Rectangle[]>()

  onSimReady(v: ViewCtx, sim: Sim): void {
    const w = sim.worldState.walls
    if (!w) return
    const { cols, rows, blocked } = w.grid
    const base = Phaser.Display.Color.IntegerToColor(v.def.palette.map).darken(38).color
    const top = Phaser.Display.Color.IntegerToColor(v.def.palette.map).darken(18).color
    const capH = Math.max(3, UNIT * 0.22)
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        if (!blocked[cy * cols + cx]) continue
        const px = cx * UNIT + UNIT / 2
        const py = cy * UNIT + UNIT / 2
        this.tiles.set(cy * cols + cx, [
          v.scene.add.rectangle(px, py, UNIT - 2, UNIT - 2, base).setDepth(2),
          v.scene.add.rectangle(px, cy * UNIT + 1 + capH / 2, UNIT - 2, capH, top).setDepth(2.1),
        ])
      }
    }
  }

  step(v: ViewCtx, sim: Sim, _delta: number): void {
    const w = sim.worldState.walls
    if (!w || w.smashed.length === 0) return
    for (const idx of w.smashed) {
      const objs = this.tiles.get(idx)
      if (!objs) continue
      for (const o of objs) o.destroy()
      this.tiles.delete(idx)
      const x = ((idx % w.grid.cols) + 0.5) * UNIT
      const y = (Math.floor(idx / w.grid.cols) + 0.5) * UNIT
      const c = v.scene.add.circle(x, y, UNIT * 0.4, 0xbcae95, 0.6).setDepth(5)
      v.scene.tweens.add({ targets: c, scale: 1.8, alpha: 0, duration: 320, onComplete: () => c.destroy() })
    }
    w.smashed.length = 0
  }

  destroy(v: ViewCtx): void {
    for (const objs of this.tiles.values()) for (const o of objs) o.destroy()
    this.tiles.clear()
    super.destroy(v)
  }
}

/** 河上漂着的一片叶子：沿河漂到 u，离河心 cross，按 speedMul 倍的流速漂，左右摆着、自己转着 */
interface Drifter {
  readonly s: Decor
  u: number
  cross: number
  speedMul: number
  readonly swayPhase: number
  readonly swayAmp: number
  readonly spin: number
}

export class OldRiverView extends SingleScreenView {
  private waveTiles: { tile: Phaser.GameObjects.TileSprite; speed: number }[] = []
  private drifters: Drifter[] = []

  layout(v: ViewCtx): { w: number; h: number; origin: Point } {
    const s = v.def.oldRiver!.viewScale
    const w = viewport.logicalWidth * s
    const h = viewport.logicalHeight * s
    return { w, h, origin: { x: w / 2, y: h / 2 } }
  }

  build(v: ViewCtx): void {
    const cfg = v.def.oldRiver!
    const vw = v.w
    const vh = v.h
    const r = riverRect(vw, vh, cfg.width * UNIT)
    const horizontal = r.horizontal
    const add = v.scene.add

    const gBank = add.graphics().setDepth(0)
    gBank.fillStyle(BANK_COLOR, 1)
    gBank.fillRect(0, 0, vw, vh)
    this.visuals.push(gBank)
    gBank.fillStyle(BANK_FAR_COLOR, 1)
    if (horizontal) {
      if (r.y > 24) gBank.fillRect(0, 0, vw, Math.max(0, r.y - 18))
      gBank.fillRect(0, Math.min(vh, r.y + r.h + 18), vw, vh)
    } else {
      if (r.x > 24) gBank.fillRect(0, 0, Math.max(0, r.x - 18), vh)
      gBank.fillRect(Math.min(vw, r.x + r.w + 18), 0, vw, vh)
    }

    const gWater = add.graphics().setDepth(0.2)
    this.visuals.push(gWater)
    const edge = shade(v.def.palette.map, 0.78)
    const mid = shade(v.def.palette.map, 1.12)
    if (horizontal) {
      gWater.fillGradientStyle(edge, edge, mid, mid, 1)
      gWater.fillRect(r.x, r.y, r.w, r.h / 2)
      gWater.fillGradientStyle(mid, mid, edge, edge, 1)
      gWater.fillRect(r.x, r.y + r.h / 2, r.w, r.h / 2)
    } else {
      gWater.fillGradientStyle(edge, mid, edge, mid, 1)
      gWater.fillRect(r.x, r.y, r.w / 2, r.h)
      gWater.fillGradientStyle(mid, edge, mid, edge, 1)
      gWater.fillRect(r.x + r.w / 2, r.y, r.w / 2, r.h)
    }

    const gFoam = add.graphics().setDepth(0.4)
    this.visuals.push(gFoam)
    gFoam.lineStyle(2, 0xffffff, 0.3)
    const foamRng = new Rng(v.run.decorSeed ^ 0xf0a8)
    const alongLen = horizontal ? r.w : r.h
    for (const e of horizontal ? [r.y, r.y + r.h] : [r.x, r.x + r.w]) {
      if (horizontal) gFoam.lineBetween(0, e, vw, e)
      else gFoam.lineBetween(e, 0, e, vh)
      let along = foamRng.next() * 40
      while (along < alongLen) {
        const size = 1.5 + foamRng.next() * 2.5
        const off = (foamRng.next() - 0.5) * 6
        gFoam.fillStyle(0xffffff, 0.14 + foamRng.next() * 0.14)
        if (horizontal) gFoam.fillCircle(along, e + off, size)
        else gFoam.fillCircle(e + off, along, size)
        along += 24 + foamRng.next() * 60
      }
    }

    const texKey = ensureWaveTexture(v.scene, horizontal)
    for (const [alpha, speed] of [
      [0.1, cfg.waveSlow * UNIT],
      [0.16, cfg.waveFast * UNIT],
    ] as const) {
      const tile = add.tileSprite(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, texKey).setAlpha(alpha).setDepth(0.6)
      tile.tilePositionX = Math.random() * 256
      tile.tilePositionY = Math.random() * 256
      this.waveTiles.push({ tile, speed })
      this.visuals.push(tile)
    }
  }

  decor(v: ViewCtx, atlas: EcsAtlas): void {
    const cfg = v.def.oldRiver!
    const r = riverRect(v.w, v.h, cfg.width * UNIT)
    const horizontal = r.horizontal
    const alongLen = horizontal ? v.w : v.h
    const def = v.def.decor
    const decorRng = new Rng(v.run.decorSeed)

    const bands: [number, number][] = horizontal
      ? [
          [0, r.y],
          [r.y + r.h, v.h],
        ]
      : [
          [0, r.x],
          [r.x + r.w, v.w],
        ]
    for (const [b0, b1] of bands) {
      const bandW = b1 - b0
      if (bandW < 0.3 * UNIT) continue
      for (let along = 0.5 * UNIT; along < alongLen; along += UNIT * (0.9 + decorRng.next() * 0.7)) {
        if (decorRng.next() > 0.7) continue
        const sizeU = def.sizeU[0] + decorRng.next() * (def.sizeU[1] - def.sizeU[0])
        const size = Math.min(sizeU * UNIT, bandW * 0.9)
        const cross = b0 + size / 2 + decorRng.next() * Math.max(1, bandW - size)
        const id = def.emojis[Math.floor(decorRng.next() * def.emojis.length)]!
        v.decor.push(decorSprite(atlas, id, horizontal ? along : cross, horizontal ? cross : along, size, (decorRng.next() * 2 - 1) * 0.6, def.alpha[0] + decorRng.next() * (def.alpha[1] - def.alpha[0])))
      }
    }

    const pool = v.def.drift ?? ['1f343']
    const halfCross = (horizontal ? r.h : r.w) / 2
    const mid = horizontal ? r.y + r.h / 2 : r.x + r.w / 2
    for (let i = 0; i < cfg.driftCount; i++) {
      const cross = (Math.random() * 2 - 1) * halfCross * 0.92
      const u = Math.random() * alongLen
      const id = pool[Math.floor(Math.random() * pool.length)]!
      const s = decorSprite(atlas, id, horizontal ? v.w - u : mid + cross, horizontal ? mid + cross : u, (0.35 + Math.random() * 0.25) * UNIT, 0, 0.5)
      v.decor.push(s)
      this.drifters.push({
        s,
        u,
        cross,
        speedMul: driftSpeed(cross / halfCross, cfg, Math.random),
        swayPhase: Math.random() * Math.PI * 2,
        swayAmp: (0.06 + Math.random() * 0.12) * UNIT,
        spin: (Math.random() * 2 - 1) * 0.5,
      })
    }
  }

  step(v: ViewCtx, sim: Sim, delta: number): void {
    const cfg = v.def.oldRiver!
    const dt = delta / 1000
    const r = riverRect(v.w, v.h, cfg.width * UNIT)
    for (const w of this.waveTiles) {
      if (r.horizontal) w.tile.tilePositionX += w.speed * dt
      else w.tile.tilePositionY -= w.speed * dt
    }
    // 叶子顺水漂，漂出下游就换到上游、换一道漂
    const alongLen = r.horizontal ? v.w : v.h
    const halfCross = (r.horizontal ? r.h : r.w) / 2
    const mid = r.horizontal ? r.y + r.h / 2 : r.x + r.w / 2
    for (const d of this.drifters) {
      d.u += cfg.flow * UNIT * d.speedMul * dt
      if (d.u > alongLen + UNIT) {
        d.u = -UNIT
        d.cross = (Math.random() * 2 - 1) * halfCross * 0.92
        d.speedMul = driftSpeed(d.cross / halfCross, cfg, Math.random)
      }
      const cross = mid + d.cross + Math.sin(sim.elapsedMs / 1250 + d.swayPhase) * d.swayAmp
      d.s.x = r.horizontal ? v.w - d.u : cross
      d.s.y = r.horizontal ? cross : d.u
      d.s.rot += d.spin * dt
    }
  }

  destroy(v: ViewCtx): void {
    this.waveTiles = []
    this.drifters = []
    super.destroy(v)
  }
}

export class TorusView extends SingleScreenView {
  private frameTiles: { tile: Phaser.GameObjects.TileSprite; dx: number; dy: number }[] = []
  private frameGlow?: Phaser.GameObjects.Graphics

  layout(v: ViewCtx): { w: number; h: number; origin: Point } {
    const tc = v.def.torus!
    const landscape = viewport.logicalWidth >= viewport.logicalHeight
    const w = (landscape ? tc.arenaLong : tc.arenaShort) * UNIT
    const h = (landscape ? tc.arenaShort : tc.arenaLong) * UNIT
    return { w, h, origin: { x: w / 2, y: h / 2 } }
  }

  build(v: ViewCtx): void {
    const cfg = v.def.torus!
    const W = v.w
    const H = v.h
    const add = v.scene.add

    const gFloor = add.graphics().setDepth(0)
    gFloor.fillStyle(v.def.palette.map, 1)
    gFloor.fillRect(0, 0, W, H)
    const inner = Phaser.Display.Color.IntegerToColor(v.def.palette.map).brighten(7).color
    for (const [k, a] of [
      [0.95, 0.1],
      [0.75, 0.1],
      [0.55, 0.12],
    ] as const) {
      gFloor.fillStyle(inner, a)
      gFloor.fillEllipse(W / 2, H / 2, W * k, H * k)
    }
    this.visuals.push(gFloor)

    ensureDashTexture(v.scene, cfg)
    const f = cfg.frame * UNIT
    const mkTile = (x: number, y: number, w: number, h: number, dx: number, dy: number, vertical: boolean): void => {
      const tile = add
        .tileSprite(x, y, w, h, vertical ? 'void-dash-v' : 'void-dash-h')
        .setOrigin(0)
        .setDepth(3.5)
        .setAlpha(0.42)
        .setTint(0xffb300)
      this.frameTiles.push({ tile, dx, dy })
      this.visuals.push(tile)
    }
    mkTile(0, 0, W, f, 1, 0, false)
    mkTile(W - f, 0, f, H, 0, 1, true)
    mkTile(0, H - f, W, f, -1, 0, false)
    mkTile(0, 0, f, H, 0, -1, true)

    this.frameGlow = add.graphics().setDepth(3.6)
    this.visuals.push(this.frameGlow)
    for (const o of this.visuals) v.lens.mainOnly(o)
  }

  /** 出这头即现那头：一屏正好一圈，镜像镜头把越过边的半截画到对面 */
  framing(v: ViewCtx): Framing {
    return { ...super.framing(v), edge: 'wrap' }
  }

  decor(v: ViewCtx, atlas: EcsAtlas): void {
    const def = v.def.decor
    const rng = new Rng(v.run.decorSeed)
    const cells = (v.w / UNIT) * (v.h / UNIT)
    const density = def.density[0] + rng.next() * (def.density[1] - def.density[0])
    for (let i = 0; i < Math.round(cells * density); i++) {
      const sizeU = def.sizeU[0] + rng.next() * (def.sizeU[1] - def.sizeU[0])
      const id = def.emojis[Math.floor(rng.next() * def.emojis.length)]!
      v.decor.push(decorSprite(atlas, id, rng.next() * v.w, rng.next() * v.h, sizeU * UNIT, (rng.next() * 2 - 1) * Math.PI, def.alpha[0] + rng.next() * (def.alpha[1] - def.alpha[0])))
    }
  }

  step(v: ViewCtx, sim: Sim, delta: number): void {
    if (this.frameTiles.length === 0) return
    const flow = (56 * delta) / 1000
    for (const t of this.frameTiles) {
      t.tile.tilePositionX += t.dx * flow
      t.tile.tilePositionY += t.dy * flow
    }
    const g = this.frameGlow
    if (!g) return
    const pulse = 0.4 + 0.22 * Math.sin(sim.elapsedMs / 420)
    g.clear()
    g.lineStyle(3, 0xff8f00, pulse)
    g.strokeRect(1.5, 1.5, v.w - 3, v.h - 3)
    g.lineStyle(1.5, 0xffe082, Math.min(1, pulse + 0.25))
    g.strokeRect(4, 4, v.w - 8, v.h - 8)
  }

  destroy(v: ViewCtx): void {
    this.frameTiles = []
    this.frameGlow = undefined
    super.destroy(v)
  }
}

function ensureWaveTexture(scene: Phaser.Scene, horizontal: boolean): string {
  const key = horizontal ? 'river-wave-h' : 'river-wave-v'
  if (scene.textures.exists(key)) return key
  const size = 256
  const canvas = scene.textures.createCanvas(key, size, size)
  if (!canvas) return key
  const ctx = canvas.getContext()
  ctx.clearRect(0, 0, size, size)
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.lineCap = 'round'
  const rng = new Rng(0x5117e5)
  for (let i = 0; i < 14; i++) {
    const cx = 20 + rng.next() * (size - 40)
    const cy = 20 + rng.next() * (size - 40)
    const len = 20 + rng.next() * 36
    const bow = 3 + rng.next() * 5
    ctx.lineWidth = 1.5 + rng.next() * 1.5
    ctx.beginPath()
    if (horizontal) {
      ctx.moveTo(cx - len / 2, cy)
      ctx.quadraticCurveTo(cx, cy - bow, cx + len / 2, cy)
    } else {
      ctx.moveTo(cx, cy - len / 2)
      ctx.quadraticCurveTo(cx - bow, cy, cx, cy + len / 2)
    }
    ctx.stroke()
  }
  canvas.refresh()
  return key
}

function ensureDashTexture(scene: Phaser.Scene, cfg: TorusConfig): void {
  const size = 64
  const th = Math.round(cfg.frame * UNIT)
  for (const [key, vertical] of [
    ['void-dash-h', false],
    ['void-dash-v', true],
  ] as const) {
    if (scene.textures.exists(key)) continue
    const canvas = scene.textures.createCanvas(key, vertical ? th : size, vertical ? size : th)
    if (!canvas) continue
    const ctx = canvas.getContext()
    ctx.clearRect(0, 0, vertical ? th : size, vertical ? size : th)
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    if (vertical) ctx.fillRect(th * 0.3, 10, th * 0.4, 14)
    else ctx.fillRect(10, th * 0.3, 14, th * 0.4)
    canvas.refresh()
  }
}

function shade(color: number, mul: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * mul))
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * mul))
  const b = Math.min(255, Math.round((color & 0xff) * mul))
  return (r << 16) | (g << 8) | b
}
