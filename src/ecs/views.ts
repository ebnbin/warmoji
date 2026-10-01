import Phaser from 'phaser'
import { removeEntity } from 'bitecs'
import { UNIT } from '../util/units'
import { MAP, MAPS, rollDecor } from '../data/maps'
import { safeInsets, viewport } from '../util/apply'
import { Rng } from '../util/rng'
import { spawnDecor } from './entities/decor'
import type { EcsAtlas } from './atlas'
import type { EcsWorld } from './world'
import type { MapDef, MapId } from '../types/maps'
import type { Point } from '../util/vec'
import type { RunState } from '../run/state'
import type { Sim } from './sim'
import { clockSec } from './fight/clock'
import type { TorusConfig } from '../types/maps'
import { query } from 'bitecs'
import { Due, Meteor, Phys, Stats, Transform } from './components'
import { meteorPath } from './store'
import { captureRadiusU } from './worlds/nebulaOld'
import { ringPoint } from './worlds/space'
import { leaderX, leaderY } from './utils/team'
import { spawnDriftDecor } from './entities/decor'
import { fogAlphaAt, fogRadiusAt, hourAt, visionGridsAt } from './worlds/daynight'
import { onFloe } from './worlds/ice'
import { driftSpeed, riverRect } from './worlds/river'
import { fitAspectRect } from './worlds/torus'
import { drawBomb, drawPuff, drawSpark, encodeLava, fumaroles, GROUND_TILE, groundPpc, LAVA_FRAG, lavaShown, markGround } from './render/volcano'
import type { CellRect, GroundPiece, LavaShown } from './render/volcano'
import { GroundPainter } from './render/groundPainter'
import { effusion } from './worlds/volcano'
import { roomAt } from './worlds/basin'
import { DECK_PPU, deckFrame, drawEdgeField, drawRig, EDGE_PPU, drawRigShadow, drawWaveTile, paintDeck, paintWet, rigOf, SEA_FRAG, SHADOW_PER_U, WAVE_TILE, WET_PPU } from './render/ship'
import { SUN } from '../data/light'
import { deckPoint, makeDeck as makeDeckFrame, shipSizeU } from './worlds/ship'
import type { ShipState } from './worlds/ship'
import { GRAVITY, halfBeamAt } from '../data/ship'
import type { ShipConfig } from '../types/maps'
import type { EruptionPhase, VolcanoState } from './worlds/volcano'
import { drawCloud, drawGlint, drawHalo, NEBULA_FRAG, NEBULA_PPU, sheetPx } from './render/nebula'
import type { NebulaSheet, SheetBand } from './render/nebula'
import { NebulaPainter } from './render/nebulaPainter'
import { gravityAt, inHorizon as inNebulaHorizon, luminosity, MAX_FLARES, nebulaHalfU, nebulaLayout } from './worlds/nebula'
import type { NebulaState } from './worlds/nebula'
import { SHADOW_RS } from '../data/nebula'
import { playSfx } from '../audio/sfx'
import { loadSettings } from '../save/settings'
import { browserStorage } from '../util/storage'

const FOG_COLOR = 0x0a0a1a
const FOG_DEPTH = 90
const FOG_SPAN = 9000
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
  readonly anchor: Phaser.GameObjects.Zone
  w: number
  h: number
  atlas?: EcsAtlas
}

export interface MapView {
  layout(v: ViewCtx): { w: number; h: number; origin: Point }
  build(v: ViewCtx): void
  camera(v: ViewCtx): void
  decor(v: ViewCtx, atlas: EcsAtlas): void
  /** 要画很久的地图可以返回 Promise：画完之前战斗不开始 */
  onSimReady(v: ViewCtx, sim: Sim): void | Promise<void>
  step(v: ViewCtx, sim: Sim, delta: number): void
  resize(v: ViewCtx): void
  /** 战斗场景关闭时也会调：那时主镜头连同它的滤镜已被 Phaser 拆掉，不能再碰镜头 */
  destroy(v: ViewCtx): void
}

class BoundedView implements MapView {
  protected visuals: Phaser.GameObjects.GameObject[] = []
  protected decorEids: number[] = []

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

  /** 镜头最多看到范围外多远：默认边距，再加上这一边的设备安全区 */
  camera(v: ViewCtx): void {
    const cam = v.scene.cameras.main
    const f = this.field(v)
    const m = MAP.cameraMargin * UNIT
    const s = safeInsets
    cam.setZoom(viewport.renderScale)
    cam.setBounds(f.x - m - s.left, f.y - m - s.top, f.width + m * 2 + s.left + s.right, f.height + m * 2 + s.top + s.bottom)
    cam.startFollow(v.anchor)
  }

  decor(v: ViewCtx, atlas: EcsAtlas): void {
    const rng = new Rng(v.run.decorSeed)
    const cols = Math.round(v.w / UNIT)
    const rows = Math.round(v.h / UNIT)
    for (const d of rollDecor(v.def.decor, () => rng.next(), cols, rows)) {
      this.decorEids.push(
        spawnDecor(v.world, atlas, {
          id: d.emoji,
          outline: 'player',
          x: d.xU * UNIT,
          y: d.yU * UNIT,
          size: d.sizeU * UNIT,
          rot: d.rotation,
          alpha: d.alpha,
          z: 1,
        }),
      )
    }
  }

  onSimReady(_v: ViewCtx, _sim: Sim): void {}

  step(_v: ViewCtx, _sim: Sim, _delta: number): void {}

  resize(v: ViewCtx): void {
    this.camera(v)
  }

  destroy(v: ViewCtx): void {
    for (const o of this.visuals) o.destroy()
    for (const eid of this.decorEids) removeEntity(v.world, eid)
    this.visuals = []
    this.decorEids = []
  }
}

abstract class SingleScreenView extends BoundedView {
  resize(v: ViewCtx): void {
    this.destroy(v)
    this.build(v)
    this.camera(v)
    if (v.atlas) this.decor(v, v.atlas)
  }
}


/** 一片盖住全场的黑幕，只在一个圆里透出来 */
export class Fog {
  private readonly rect: Phaser.GameObjects.Rectangle
  private readonly shape: Phaser.GameObjects.Graphics

  constructor(scene: Phaser.Scene) {
    // Phaser 4 的 GeometryMask 在 WebGL 无实现，须走 filters.internal.addMask
    this.rect = scene.add.rectangle(0, 0, FOG_SPAN, FOG_SPAN, FOG_COLOR, 0).setDepth(FOG_DEPTH).setVisible(false)
    this.shape = scene.add.graphics().setVisible(false)
    this.rect.enableFilters()
    this.rect.filters?.internal.addMask(this.shape, true)
  }

  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.rect, this.shape]
  }

  /** 以 (x, y) 为圆心、radius 为半径透出来，其余盖上 alpha 的黑 */
  show(x: number, y: number, radius: number, alpha: number): void {
    if (alpha <= 0.001) return void this.rect.setVisible(false)
    this.shape.clear()
    this.shape.fillStyle(0xffffff)
    this.shape.fillCircle(x, y, radius)
    this.rect.setPosition(x, y).setFillStyle(FOG_COLOR, alpha).setVisible(true)
  }
}

class DayNightView extends BoundedView {
  private fog?: Fog

  build(v: ViewCtx): void {
    super.build(v)
    this.fog = new Fog(v.scene)
    this.visuals.push(...this.fog.objects)
  }

  step(v: ViewCtx, sim: Sim, _delta: number): void {
    const dn = v.def.dayNight!
    const hour = hourAt(clockSec(sim), dn)
    v.scene.cameras.main.setZoom((viewport.renderScale * dn.visionMid) / visionGridsAt(hour, dn))
    this.fog?.show(leaderX(sim), leaderY(sim), fogRadiusAt(hour, dn) * UNIT, fogAlphaAt(hour, dn))
  }
}

class IceView extends BoundedView {
  private vignette?: Phaser.GameObjects.Rectangle

  layout(v: ViewCtx): { w: number; h: number; origin: Point } {
    const px = v.def.ice!.floeU * UNIT
    return { w: px, h: px, origin: { x: px / 2, y: px / 2 } }
  }

  build(v: ViewCtx): void {
    this.visuals.push(
      v.scene.add
        .rectangle(viewport.logicalWidth / 2, viewport.logicalHeight / 2, 8000, 8000, WATER_COLOR)
        .setScrollFactor(0)
        .setDepth(-2),
    )
    super.build(v)
    const g = v.scene.add.graphics().setDepth(-1)
    g.lineStyle(3, 0xdff3ff, 0.85)
    g.strokeRect(0, 0, v.w, v.h)
    this.visuals.push(g)
    this.vignette = v.scene.add
      .rectangle(viewport.logicalWidth / 2, viewport.logicalHeight / 2, 8000, 8000, WATER_VIGNETTE, 0)
      .setScrollFactor(0)
      .setDepth(90)
    this.visuals.push(this.vignette)
  }

  camera(v: ViewCtx): void {
    v.scene.cameras.main.setZoom(viewport.renderScale)
    v.scene.cameras.main.startFollow(v.anchor)
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
class SpaceView extends BoundedView {
  private meteorFx?: { of: number; tele: Phaser.GameObjects.Graphics }

  layout(v: ViewCtx): { w: number; h: number; origin: Point } {
    const d = fieldRadius(v) * 2
    return { w: d, h: d, origin: { x: 0, y: 0 } }
  }

  build(v: ViewCtx): void {
    this.visuals.push(
      v.scene.add
        .rectangle(viewport.logicalWidth / 2, viewport.logicalHeight / 2, 8000, 8000, v.def.palette.map)
        .setScrollFactor(0)
        .setDepth(-1),
    )
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
      this.decorEids.push(
        spawnDecor(v.world, atlas, {
          id: d.emoji,
          outline: 'player',
          x: xU * UNIT,
          y: yU * UNIT,
          size: d.sizeU * UNIT,
          rot: d.rotation,
          alpha: d.alpha,
          z: 1,
        }),
      )
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
class NebulaOldView extends BoundedView {
  private capture?: Phaser.GameObjects.Graphics
  private captureU = -1
  private meteorFx?: { of: number; tele: Phaser.GameObjects.Graphics }

  layout(v: ViewCtx): { w: number; h: number; origin: Point } {
    const d = nebulaOldRadii(v).rim * 2
    return { w: d, h: d, origin: { x: 0, y: 0 } }
  }

  build(v: ViewCtx): void {
    this.visuals.push(
      v.scene.add
        .rectangle(viewport.logicalWidth / 2, viewport.logicalHeight / 2, 8000, 8000, v.def.palette.map)
        .setScrollFactor(0)
        .setDepth(-1),
    )
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
      this.decorEids.push(
        spawnDecor(v.world, atlas, {
          id: d.emoji,
          outline: 'player',
          x: xU * UNIT,
          y: yU * UNIT,
          size: d.sizeU * UNIT,
          rot: d.rotation,
          alpha: d.alpha,
          z: 1,
        }),
      )
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

class RuinsView extends BoundedView {
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

class RiverView extends SingleScreenView {
  private waveTiles: { tile: Phaser.GameObjects.TileSprite; speed: number }[] = []

  layout(v: ViewCtx): { w: number; h: number; origin: Point } {
    const s = v.def.river!.viewScale
    const w = viewport.logicalWidth * s
    const h = viewport.logicalHeight * s
    return { w, h, origin: { x: w / 2, y: h / 2 } }
  }

  build(v: ViewCtx): void {
    const cfg = v.def.river!
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

  camera(v: ViewCtx): void {
    const cam = v.scene.cameras.main
    cam.setZoom(viewport.renderScale / v.def.river!.viewScale)
    cam.centerOn(v.w / 2, v.h / 2)
  }

  decor(v: ViewCtx, atlas: EcsAtlas): void {
    const cfg = v.def.river!
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
        this.decorEids.push(
          spawnDecor(v.world, atlas, {
            id: def.emojis[Math.floor(decorRng.next() * def.emojis.length)]!,
            outline: 'player',
            x: horizontal ? along : cross,
            y: horizontal ? cross : along,
            size,
            rot: (decorRng.next() * 2 - 1) * 0.6,
            alpha: def.alpha[0] + decorRng.next() * (def.alpha[1] - def.alpha[0]),
            z: 0.8,
          }),
        )
      }
    }

    const pool = v.def.drift ?? ['1f343']
    const halfCross = (horizontal ? r.h : r.w) / 2
    const mid = horizontal ? r.y + r.h / 2 : r.x + r.w / 2
    for (let i = 0; i < cfg.driftCount; i++) {
      const cross = (Math.random() * 2 - 1) * halfCross * 0.92
      const u = Math.random() * alongLen
      this.decorEids.push(
        spawnDriftDecor(
          v.world,
          atlas,
          {
            id: pool[Math.floor(Math.random() * pool.length)]!,
            outline: 'player',
            x: horizontal ? v.w - u : mid + cross,
            y: horizontal ? mid + cross : u,
            size: (0.35 + Math.random() * 0.25) * UNIT,
            alpha: 0.5,
            z: 1.5,
            spin: (Math.random() * 2 - 1) * 0.5,
          },
          {
            u,
            cross,
            speedMul: driftSpeed(cross / halfCross, cfg, Math.random),
            swayPhase: Math.random() * Math.PI * 2,
            swayAmp: (0.06 + Math.random() * 0.12) * UNIT,
          },
        ),
      )
    }
  }

  step(v: ViewCtx, _sim: Sim, delta: number): void {
    const cfg = v.def.river!
    const dt = delta / 1000
    const r = riverRect(v.w, v.h, cfg.width * UNIT)
    for (const w of this.waveTiles) {
      if (r.horizontal) w.tile.tilePositionX += w.speed * dt
      else w.tile.tilePositionY -= w.speed * dt
    }
  }

  destroy(v: ViewCtx): void {
    this.waveTiles = []
    super.destroy(v)
  }
}

class TorusView extends SingleScreenView {
  private mirrorCams: Phaser.Cameras.Scene2D.Camera[] = []
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
  }

  camera(v: ViewCtx): void {
    const cw = Math.round(viewport.cssWidth * viewport.dpr)
    const ch = Math.round(viewport.cssHeight * viewport.dpr)
    const rect = fitAspectRect(cw, ch, v.w, v.h)
    const zoom = rect.w / v.w
    const cam = v.scene.cameras.main
    cam.setViewport(Math.round(rect.x), Math.round(rect.y), Math.round(rect.w), Math.round(rect.h))
    cam.setZoom(zoom)
    cam.centerOn(v.w / 2, v.h / 2)
    const W = v.w
    const H = v.h
    for (const dx of [-1, 0, 1]) {
      for (const dy of [-1, 0, 1]) {
        if (dx === 0 && dy === 0) continue
        const c = v.scene.cameras.add(Math.round(rect.x), Math.round(rect.y), Math.round(rect.w), Math.round(rect.h))
        c.setZoom(zoom)
        c.centerOn(W / 2 + dx * W, H / 2 + dy * H)
        this.mirrorCams.push(c)
      }
    }
    for (const c of this.mirrorCams) c.ignore(this.visuals)
  }

  decor(v: ViewCtx, atlas: EcsAtlas): void {
    const def = v.def.decor
    const rng = new Rng(v.run.decorSeed)
    const cells = (v.w / UNIT) * (v.h / UNIT)
    const density = def.density[0] + rng.next() * (def.density[1] - def.density[0])
    for (let i = 0; i < Math.round(cells * density); i++) {
      const sizeU = def.sizeU[0] + rng.next() * (def.sizeU[1] - def.sizeU[0])
      this.decorEids.push(
        spawnDecor(v.world, atlas, {
          id: def.emojis[Math.floor(rng.next() * def.emojis.length)]!,
          outline: 'player',
          x: rng.next() * v.w,
          y: rng.next() * v.h,
          size: sizeU * UNIT,
          rot: (rng.next() * 2 - 1) * Math.PI,
          alpha: def.alpha[0] + rng.next() * (def.alpha[1] - def.alpha[0]),
          z: 0.5,
        }),
      )
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
    for (const c of this.mirrorCams) v.scene.cameras.remove(c)
    this.mirrorCams = []
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

const VOLCANO_BG = 0x150d0b
const PUFF_KEY = 'volcano-puff'
const SPARK_KEY = 'volcano-spark'
const BOMB_KEY = 'volcano-bomb'
/** 火山弹落地后那块发红的地面多久暗下去 */
const SPLAT_MS = 2600
const GROUND_KEY = 'volcano-ground'
/** 开局最多几个线程分着画地面 */
const PAINT_THREADS = 4
/** 岩石新凝固后至少隔这么久才交一批补画，毫秒 */
const REPAINT_MS = 500
const LAVA_KEY = 'volcano-lava'
const AUX_KEY = 'volcano-aux'
/** 风把烟和灰往哪吹，像素/秒 */
const WIND = { x: 22, y: -9 }
const GRAVITY_PX = 12 * UNIT

interface Bomb {
  x: number
  y: number
  vx: number
  vy: number
  z: number
  vz: number
  r: number
  spin: number
  rock: Phaser.GameObjects.Image
  glow: Phaser.GameObjects.Image
}

interface Splat {
  x: number
  y: number
  r: number
  at: number
}

/** 画好的一块地面的像素，和它在地面贴图上的左上角 */
function pieceImage(p: GroundPiece, ppc: number): { img: ImageData; x: number; y: number } {
  return { img: new ImageData(p.pixels, (p.rect.c1 - p.rect.c0) * ppc, (p.rect.r1 - p.rect.r0) * ppc), x: p.rect.c0 * ppc, y: p.rect.r0 * ppc }
}

/** 贴图上换一块像素：画布跟着换（显卡丢了上下文时 Phaser 拿整张画布重建），显卡上只重传这一块 */
function patchTexture(scene: Phaser.Scene, tex: Phaser.Textures.CanvasTexture, img: ImageData, x: number, y: number): void {
  tex.getContext().putImageData(img, x, y)
  const r = scene.renderer
  const gt = tex.source[0]!.glTexture
  if (!(r instanceof Phaser.Renderer.WebGL.WebGLRenderer) || !gt || r.gl.isContextLost()) return
  const gl = r.gl
  r.glTextureUnits.bind(gt, 0)
  r.glWrapper.updateTexturing({ texturing: { flipY: gt.flipY, premultiplyAlpha: gt.pma } })
  gl.texSubImage2D(gl.TEXTURE_2D, 0, x, gt.flipY ? gt.height - y - img.height : y, gl.RGBA, gl.UNSIGNED_BYTE, img)
}

function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw?: (ctx: CanvasRenderingContext2D) => void): Phaser.Textures.CanvasTexture {
  if (scene.textures.exists(key)) scene.textures.remove(key)
  const tex = scene.textures.createCanvas(key, w, h)!
  if (draw) draw(tex.getContext())
  tex.refresh()
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR)
  return tex
}

/**
 * 火山：盆地的边不画线，靠崖壁、高地与岩壁脚下的碎石看出来；地表按高度场打光，熔岩由着色器按每格的厚度、温度画出结壳与流动；
 * 火山口冒着烟，熔岩上飘火星，天上落灰，喷气孔冒蒸汽。预兆时浓烟翻滚、地面抖动、天色发红，
 * 喷发时熔岩湖涨过口沿，火山弹随流量从火山口飞出，画面一闪一震。
 */
class VolcanoView extends BoundedView {
  private painter?: GroundPainter
  private ground?: { tex: Phaser.Textures.CanvasTexture; ppc: number; seen: Float32Array; dirty: Uint8Array; busy: boolean }
  private data?: { lava: Phaser.Textures.CanvasTexture; aux: Phaser.Textures.CanvasTexture; lavaImg: ImageData; auxImg: ImageData; glow: Float32Array; soft: Float32Array; shown: LavaShown }
  private repaintAt = 0
  private readonly u = { time: 0, erupt: 0, warn: 0 }
  private plume?: Phaser.GameObjects.Particles.ParticleEmitter
  private column?: Phaser.GameObjects.Particles.ParticleEmitter
  private embers?: Phaser.GameObjects.Particles.ParticleEmitter
  private ash?: Phaser.GameObjects.Particles.ParticleEmitter
  private sparks?: Phaser.GameObjects.Particles.ParticleEmitter
  private trail?: Phaser.GameObjects.Particles.ParticleEmitter
  private bombGfx?: Phaser.GameObjects.Graphics
  private splatGfx?: Phaser.GameObjects.Graphics
  private light?: Phaser.GameObjects.Rectangle
  private vignette?: Phaser.Filters.Vignette
  private bombs: Bomb[] = []
  private spare: Bomb[] = []
  private splats: Splat[] = []
  private bombAcc = 0
  private emberAcc = 0
  private phase: EruptionPhase = 'dormant'
  private shakeAt = 0
  private shake = true

  build(v: ViewCtx): void {
    this.visuals.push(
      v.scene.add
        .rectangle(viewport.logicalWidth / 2, viewport.logicalHeight / 2, 8000, 8000, VOLCANO_BG)
        .setScrollFactor(0)
        .setDepth(-2),
    )
    if (!v.scene.textures.exists(PUFF_KEY)) canvasTexture(v.scene, PUFF_KEY, 64, 64, (ctx) => drawPuff(ctx, 64))
    if (!v.scene.textures.exists(SPARK_KEY)) canvasTexture(v.scene, SPARK_KEY, 16, 16, (ctx) => drawSpark(ctx, 16))
    if (!v.scene.textures.exists(BOMB_KEY)) canvasTexture(v.scene, BOMB_KEY, 32, 32, (ctx) => drawBomb(ctx, 32))
    this.light = v.scene.add
      .rectangle(viewport.logicalWidth / 2, viewport.logicalHeight / 2, 8000, 8000, 0xff4a1a, 0)
      .setScrollFactor(0)
      .setDepth(85)
      .setVisible(false)
    this.visuals.push(this.light)
    this.shake = loadSettings(browserStorage()).hitShake
  }

  async onSimReady(v: ViewCtx, sim: Sim): Promise<void> {
    const s = sim.worldState.volcano
    if (!s) return
    const f = s.field
    const cfg = v.def.volcano!
    const scene = v.scene
    const vents = fumaroles(f, cfg, 5)
    const ppc = groundPpc(cfg)
    const field = { basin: f.basin, cols: f.cols, rows: f.rows, cell: f.cell, x0: f.x0, y0: f.y0, ground: f.ground, rockAt: f.rockAt, craterX: f.craterX, craterY: f.craterY, seed: f.seed }
    const painter = new GroundPainter(field, cfg, vents, ppc, Math.max(1, Math.min(PAINT_THREADS, navigator.hardwareConcurrency - 1)))
    this.painter = painter
    const tex = canvasTexture(scene, GROUND_KEY, f.cols * ppc, f.rows * ppc)
    const rows = Array.from({ length: f.rows }, (_, r): CellRect => ({ c0: 0, r0: r, c1: f.cols, r1: r + 1 }))
    await painter.paint(rows, f.ground.slice(), f.rockAt.slice(), (p) => {
      const { img, x, y } = pieceImage(p, ppc)
      tex.getContext().putImageData(img, x, y)
    })
    if (this.painter !== painter) return
    tex.refresh()
    painter.trim(1)
    this.visuals.push(scene.add.image(f.x0, f.y0, GROUND_KEY).setOrigin(0, 0).setDisplaySize(f.cols * f.cell, f.rows * f.cell).setDepth(-1))
    const dirty = new Uint8Array(Math.ceil(f.cols / GROUND_TILE) * Math.ceil(f.rows / GROUND_TILE))
    this.ground = { tex, ppc, seen: f.rockAt.slice(), dirty, busy: false }
    const lava = canvasTexture(scene, LAVA_KEY, f.cols, f.rows)
    const aux = canvasTexture(scene, AUX_KEY, f.cols, f.rows)
    this.data = {
      lava,
      aux,
      lavaImg: lava.getContext().createImageData(f.cols, f.rows),
      auxImg: aux.getContext().createImageData(f.cols, f.rows),
      glow: new Float32Array(f.cols * f.rows),
      soft: new Float32Array(f.cols * f.rows),
      shown: lavaShown(f, sim.elapsedMs),
    }
    this.encode(v, s, sim.elapsedMs)
    const u = this.u
    const crater = [(f.craterX - f.x0) / f.cell, (f.craterY - f.y0) / f.cell, (cfg.cone.craterU * UNIT) / f.cell]
    const shader = scene.add
      .shader(
        {
          name: 'VolcanoLava',
          fragmentSource: LAVA_FRAG,
          setupUniforms: (set: (name: string, value: unknown) => void) => {
            set('uLava', 0)
            set('uAux', 1)
            set('uTime', u.time)
            set('uGrid', [f.cols, f.rows])
            set('uCrater', crater)
            set('uWarn', u.warn)
            set('uErupt', u.erupt)
          },
        },
        f.x0,
        f.y0,
        f.cols * f.cell,
        f.rows * f.cell,
        [LAVA_KEY, AUX_KEY],
      )
      .setOrigin(0, 0)
      .setDepth(1.5)
    this.visuals.push(shader)
    this.decorEids = this.decorEids.filter((eid) => {
      const keep = roomAt(f.basin, Transform.x[eid]!, Transform.y[eid]!) >= 0.5 * UNIT
      if (!keep) removeEntity(v.world, eid)
      return keep
    })
    this.plume = scene.add
      .particles(f.craterX, f.craterY, PUFF_KEY, {
        lifespan: { min: 3000, max: 4800 },
        frequency: 120,
        speedX: { min: WIND.x * 0.5, max: WIND.x * 1.3 },
        speedY: { min: WIND.y * 1.4 - 14, max: WIND.y * 0.6 - 5 },
        scale: { start: 0.7, end: 2.8 },
        alpha: { start: 0.3, end: 0 },
        rotate: { min: 0, max: 360 },
        tint: [0x8a8480, 0x9c9591, 0x7a7471],
      })
      .setDepth(35)
    this.column = scene.add
      .particles(f.craterX, f.craterY, PUFF_KEY, {
        lifespan: { min: 1800, max: 3000 },
        frequency: 55,
        speedX: { min: WIND.x * 0.8, max: WIND.x * 2 },
        speedY: { min: -70, max: -30 },
        scale: { start: 0.8, end: 3.2 },
        alpha: { start: 0.42, end: 0 },
        rotate: { min: 0, max: 360 },
        tint: [0x57504d, 0x6a615d, 0x9a4a2c],
        emitting: false,
      })
      .setDepth(36)
    this.embers = scene.add
      .particles(0, 0, SPARK_KEY, {
        lifespan: { min: 700, max: 1700 },
        speedX: { min: -14, max: 18 },
        speedY: { min: -70, max: -25 },
        scale: { start: 0.4, end: 0 },
        alpha: { start: 0.9, end: 0 },
        tint: [0xffe082, 0xffa726, 0xff5722],
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(37)
    const cam = scene.cameras.main
    this.ash = scene.add
      .particles(0, 0, SPARK_KEY, {
        lifespan: 7000,
        frequency: 70,
        speedX: { min: WIND.x * 0.8, max: WIND.x * 1.6 },
        speedY: { min: 8, max: 22 },
        scale: { min: 0.18, max: 0.42 },
        alpha: { start: 0.55, end: 0 },
        tint: [0x9e9690, 0x7d7571, 0xbdb4ad],
        emitZone: {
          type: 'random',
          source: {
            getRandomPoint: (p: Phaser.Types.Math.Vector2Like): void => {
              p.x = (Math.random() - 0.5) * cam.worldView.width * 1.4
              p.y = (Math.random() - 0.5) * cam.worldView.height * 1.4
            },
          },
        },
      })
      .setDepth(38)
    this.sparks = scene.add
      .particles(0, 0, SPARK_KEY, {
        lifespan: { min: 300, max: 800 },
        speed: { min: 60, max: 220 },
        scale: { start: 0.7, end: 0 },
        alpha: { start: 1, end: 0 },
        tint: [0xffe082, 0xff9800, 0xff3d00],
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(37)
    for (const p of vents) {
      this.visuals.push(
        scene.add
          .particles(p.x, p.y, PUFF_KEY, {
            lifespan: { min: 1600, max: 2600 },
            frequency: 260,
            speedX: { min: WIND.x * 0.3, max: WIND.x * 0.8 },
            speedY: { min: -26, max: -12 },
            scale: { start: 0.2, end: 0.9 },
            alpha: { start: 0.32, end: 0 },
            tint: [0xf2eee6, 0xe0dccf],
          })
          .setDepth(34),
      )
    }
    this.trail = scene.add
      .particles(0, 0, PUFF_KEY, {
        lifespan: { min: 500, max: 900 },
        speedX: { min: -8, max: 8 },
        speedY: { min: -14, max: -4 },
        scale: { start: 0.18, end: 0.6 },
        alpha: { start: 0.4, end: 0 },
        tint: [0x3a3230, 0x4d4441],
        emitting: false,
      })
      .setDepth(33)
    this.bombGfx = scene.add.graphics().setDepth(1.7)
    this.splatGfx = scene.add.graphics().setDepth(1.6).setBlendMode(Phaser.BlendModes.ADD)
    this.visuals.push(this.plume, this.column, this.embers, this.ash, this.sparks, this.trail, this.bombGfx, this.splatGfx)
    this.vignette = scene.cameras.main.filters?.internal.addVignette(0.5, 0.5, 0.7, 0.22, 0x000000)
  }

  /** 把熔岩场编码进两张数据图 */
  private encode(v: ViewCtx, s: VolcanoState, now: number): void {
    const d = this.data
    if (!d) return
    encodeLava(s.field, v.def.volcano!, now, d.shown, d.lavaImg.data, d.auxImg.data, d.glow, d.soft)
    d.lava.getContext().putImageData(d.lavaImg, 0, 0)
    d.lava.refresh()
    d.aux.getContext().putImageData(d.auxImg, 0, 0)
    d.aux.refresh()
  }

  /** 新凝固的岩石改变了地表：把受影响的块记下，上一批补画完了就把记下的块整批交出去重画，画好一块重传一块 */
  private repaintRock(v: ViewCtx, s: VolcanoState, now: number): void {
    const g = this.ground
    const painter = this.painter
    if (!g || !painter) return
    const f = s.field
    const cfg = v.def.volcano!
    for (let i = 0; i < f.rockAt.length; i++) {
      if (f.rockAt[i] === g.seen[i]) continue
      g.seen[i] = f.rockAt[i]!
      markGround(f, cfg, i, g.dirty)
    }
    if (g.busy || now < this.repaintAt) return
    const tiles = Math.ceil(f.cols / GROUND_TILE)
    const rects: CellRect[] = []
    for (let k = 0; k < g.dirty.length; k++) {
      if (!g.dirty[k]) continue
      g.dirty[k] = 0
      const c0 = (k % tiles) * GROUND_TILE
      const r0 = Math.floor(k / tiles) * GROUND_TILE
      rects.push({ c0, r0, c1: Math.min(f.cols, c0 + GROUND_TILE), r1: Math.min(f.rows, r0 + GROUND_TILE) })
    }
    if (rects.length === 0) return
    this.repaintAt = now + REPAINT_MS
    g.busy = true
    void painter
      .paint(rects, f.ground.slice(), f.rockAt.slice(), (p) => {
        const { img, x, y } = pieceImage(p, g.ppc)
        if (this.ground === g) patchTexture(v.scene, g.tex, img, x, y)
      })
      .then(() => {
        g.busy = false
      })
  }


  step(v: ViewCtx, sim: Sim, delta: number): void {
    const s = sim.worldState.volcano
    if (!s || !this.data) return
    const cfg = v.def.volcano!
    const f = s.field
    const now = sim.elapsedMs
    this.encode(v, s, now)
    this.repaintRock(v, s, now)
    const e = cfg.eruption
    const warn = s.phase === 'warn' ? Math.min(1, (now - s.since) / e.warnMs) : 0
    const erupt = s.phase === 'erupt' ? effusion(e, now - s.since) / e.rate : 0
    this.u.time = now / 1000
    this.u.warn = warn
    this.u.erupt = erupt
    if (s.phase !== this.phase) this.enterPhase(v, s)
    this.phase = s.phase
    const cam = v.scene.cameras.main
    if (s.phase === 'warn' && this.shake && now >= this.shakeAt) {
      this.shakeAt = now + 280
      cam.shake(300, 0.0005 + 0.0022 * warn)
    }
    if (this.light) {
      const a = s.phase === 'warn' ? warn * (0.03 + 0.02 * Math.sin(now / 90)) : s.phase === 'erupt' ? 0.02 + 0.06 * erupt * (0.8 + 0.2 * Math.sin(now / 70)) : 0
      setOverlayFill(this.light, 0xff4a1a, a)
    }
    if (this.vignette) this.vignette.strength = 0.22 + 0.1 * Math.max(warn, erupt)
    this.emitEmbers(f, cam, delta)
    this.ash?.setPosition(cam.midPoint.x, cam.midPoint.y)
    this.stepBombs(v, s, delta, now)
  }

  /** 换阶段时改烟和灰的密度：发射频率一改就从头计时，所以只在这时改 */
  private enterPhase(v: ViewCtx, s: VolcanoState): void {
    const cam = v.scene.cameras.main
    this.plume?.setFrequency(s.phase === 'dormant' ? 110 : s.phase === 'warn' ? 45 : 30)
    this.ash?.setFrequency(s.phase === 'erupt' ? 18 : 70)
    if (s.phase === 'warn') playSfx('rumble')
    if (s.phase === 'erupt') {
      playSfx('erupt')
      cam.flash(260, 255, 150, 70)
      if (this.shake) cam.shake(750, 0.007)
      this.column?.start()
      this.sparks?.explode(40, s.field.craterX, s.field.craterY)
      this.bombAcc = 6
    }
    if (s.phase === 'dormant') this.column?.stop()
  }

  /** 镜头里随机挑几处热熔岩冒火星：每秒按镜头面积撒点，落在越热的熔岩上越容易冒 */
  private emitEmbers(f: VolcanoState['field'], cam: Phaser.Cameras.Scene2D.Camera, delta: number): void {
    const em = this.embers
    if (!em) return
    const view = cam.worldView
    this.emberAcc += (delta / 1000) * ((view.width * view.height) / (UNIT * UNIT)) * 0.35
    for (; this.emberAcc >= 1; this.emberAcc--) {
      const x = view.x + Math.random() * view.width
      const y = view.y + Math.random() * view.height
      const cx = Math.floor((x - f.x0) / f.cell)
      const cy = Math.floor((y - f.y0) / f.cell)
      if (cx < 0 || cy < 0 || cx >= f.cols || cy >= f.rows) continue
      const i = cy * f.cols + cx
      if (f.lava[i]! > 0.01 && Math.random() < f.heat[i]! ** 3 * 0.6) em.emitParticleAt(x, y, 1)
    }
  }

  private bomb(scene: Phaser.Scene): Bomb {
    const b = this.spare.pop()
    if (b) {
      b.rock.setVisible(true)
      b.glow.setVisible(true)
      return b
    }
    const glow = scene.add.image(0, 0, SPARK_KEY).setDepth(34).setBlendMode(Phaser.BlendModes.ADD).setTint(0xff7a1a)
    const rock = scene.add.image(0, 0, BOMB_KEY).setDepth(34.1)
    this.visuals.push(glow, rock)
    return { x: 0, y: 0, vx: 0, vy: 0, z: 0, vz: 0, r: 0, spin: 0, rock, glow }
  }

  /** 火山弹：喷发时从火山口抛出，按重力画弧，影子留在地上；落地溅起火星，砸出一小片渐暗的红光 */
  private stepBombs(v: ViewCtx, s: VolcanoState, delta: number, now: number): void {
    const g = this.bombGfx
    const sg = this.splatGfx
    if (!g || !sg) return
    const f = s.field
    const dt = delta / 1000
    if (s.phase === 'erupt') {
      this.bombAcc += dt * 13 * this.u.erupt
      while (this.bombAcc >= 1) {
        this.bombAcc -= 1
        const b = this.bomb(v.scene)
        const a = Math.atan2(f.inY, f.inX) + (Math.random() * 2 - 1) * 2.2
        const sp = (1.2 + Math.random() * 3.6) * UNIT
        b.x = f.craterX + (Math.random() - 0.5) * UNIT
        b.y = f.craterY + (Math.random() - 0.5) * UNIT
        b.vx = Math.cos(a) * sp
        b.vy = Math.sin(a) * sp
        b.z = 0.2 * UNIT
        b.vz = (7 + Math.random() * 5) * UNIT
        b.r = 7 + Math.random() * 9
        b.spin = (Math.random() * 2 - 1) * 8
        b.rock.setRotation(Math.random() * Math.PI * 2)
        this.bombs.push(b)
      }
    }
    g.clear()
    const kept: Bomb[] = []
    for (const b of this.bombs) {
      b.x += b.vx * dt
      b.y += b.vy * dt
      b.vz -= GRAVITY_PX * dt
      b.z += b.vz * dt
      if (b.z <= 0) {
        this.sparks?.explode(10, b.x, b.y)
        this.trail?.explode(3, b.x, b.y)
        this.splats.push({ x: b.x, y: b.y, r: b.r * 1.6, at: now })
        b.rock.setVisible(false)
        b.glow.setVisible(false)
        this.spare.push(b)
        continue
      }
      kept.push(b)
      const lift = Math.min(1, b.z / (4 * UNIT))
      const scale = (b.r * 2 * (1 + lift * 0.5)) / 32
      g.fillStyle(0x000000, 0.3 * (1 - lift * 0.55))
      g.fillEllipse(b.x, b.y, b.r * 2.4 * (1 - lift * 0.3), b.r * 1.2 * (1 - lift * 0.3))
      b.rock.setPosition(b.x, b.y - b.z).setScale(scale).setRotation(b.rock.rotation + b.spin * dt)
      b.glow.setPosition(b.x, b.y - b.z).setScale(scale * 2.6).setAlpha(0.55)
      if (Math.random() < dt * 30) this.trail?.emitParticleAt(b.x, b.y - b.z, 1)
    }
    this.bombs = kept
    sg.clear()
    this.splats = this.splats.filter((p) => now - p.at < SPLAT_MS)
    for (const p of this.splats) {
      const k = 1 - (now - p.at) / SPLAT_MS
      for (let i = 0; i < 5; i++) {
        const a = p.r * 7.3 + i * 2.4
        const d = p.r * (0.2 + ((i * 0.37 + p.r) % 1) * 0.8)
        sg.fillStyle(i === 0 ? 0xffb040 : 0xff5a14, 0.55 * k * k)
        sg.fillCircle(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d * 0.7, (i === 0 ? 0.32 : 0.16) * p.r * (0.6 + 0.4 * k))
      }
    }
  }

  destroy(v: ViewCtx): void {
    this.vignette = undefined
    this.painter?.close()
    this.painter = undefined
    super.destroy(v)
    this.ground = undefined
    this.data = undefined
    this.bombs = []
    this.spare = []
    this.splats = []
    for (const key of [GROUND_KEY, LAVA_KEY, AUX_KEY]) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
  }
}

const SHIP_BG = 0x04121a
const WAVE_KEY = 'ship-wave'
const EDGE_KEY = 'ship-edge'
const WET_KEY = 'ship-wet'
/** 每局都是同一艘船：甲板、海面的波纹与船形的距离场按横竖屏各画一次，之后一直留着 */
const SHIP_SEED = 0x5eaf
const DECK_KEY = 'ship-deck'
const BALL_KEY = 'ship-ball'
const GULL_KEY = 'ship-gull'
const LANTERN_KEY = 'ship-lantern'
const SHIP_PUFF_KEY = 'ship-puff'
const SHIP_GLOW_KEY = 'ship-glow'
/** 风从左舷偏船尾吹来，往右舷偏船头吹：船上的方向（沿船长、横过船宽） */
const SHIP_WIND = { s: 0.3, t: 0.95 }
const GULL_SCALE = (1.4 * UNIT) / 96
/** 船壳上端到水面有多高才画出一圈船舷，米 */
const HULL_BAND_M = 0.16

/** 一盏吊灯：挂钩在船上 (s, t) 格、离甲板 hook 米，灯绳 cord 米；灯按单摆摆，角度相对铅垂线 */
interface Lantern {
  readonly s: number
  readonly t: number
  readonly hook: number
  readonly cord: number
  across: number
  along: number
  vAcross: number
  vAlong: number
  readonly body: Phaser.GameObjects.Image
  readonly glow: Phaser.GameObjects.Image
  readonly pool: Phaser.GameObjects.Image
  readonly flicker: number
}

/** 一只海鸥绕着船上空的一点盘旋，偶尔扇几下翅膀 */
interface Gull {
  s: number
  t: number
  readonly r: number
  a: number
  readonly w: number
  readonly img: Phaser.GameObjects.Image
  flapAt: number
}

/** 甲板上的铁炮弹：暗铁色的球，左上方一点高光 */
function drawBall(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2
  const g = ctx.createRadialGradient(c * 0.7, c * 0.62, size * 0.04, c, c, c * 0.98)
  g.addColorStop(0, '#8d8c96')
  g.addColorStop(0.25, '#43424a')
  g.addColorStop(0.8, '#17161a')
  g.addColorStop(1, '#070709')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(c, c, c * 0.96, 0, Math.PI * 2)
  ctx.fill()
}

/** 从上往下看的海鸥：白身子，灰翅膀，翅尖发黑 */
function drawGull(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const cx = w / 2
  const cy = h * 0.46
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#b9bec4'
    ctx.beginPath()
    ctx.moveTo(cx, cy - h * 0.06)
    ctx.quadraticCurveTo(cx + side * w * 0.22, cy - h * 0.3, cx + side * w * 0.48, cy - h * 0.04)
    ctx.quadraticCurveTo(cx + side * w * 0.26, cy - h * 0.02, cx, cy + h * 0.12)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#2a2b2f'
    ctx.beginPath()
    ctx.moveTo(cx + side * w * 0.38, cy - h * 0.1)
    ctx.quadraticCurveTo(cx + side * w * 0.44, cy - h * 0.12, cx + side * w * 0.48, cy - h * 0.04)
    ctx.quadraticCurveTo(cx + side * w * 0.42, cy - h * 0.03, cx + side * w * 0.36, cy - h * 0.04)
    ctx.closePath()
    ctx.fill()
  }
  ctx.fillStyle = '#f2f1ec'
  ctx.beginPath()
  ctx.ellipse(cx, cy + h * 0.05, w * 0.045, h * 0.3, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#e8b54a'
  ctx.beginPath()
  ctx.arc(cx, cy - h * 0.26, w * 0.018, 0, Math.PI * 2)
  ctx.fill()
}

/** 从上往下看的吊灯：黑铁的灯罩顶，四周透出暖黄的光 */
function drawLantern(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2
  const glow = ctx.createRadialGradient(c, c, size * 0.05, c, c, c)
  glow.addColorStop(0, 'rgba(255,236,170,1)')
  glow.addColorStop(0.45, 'rgba(255,190,90,0.9)')
  glow.addColorStop(1, 'rgba(255,150,60,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = '#1b1612'
  ctx.beginPath()
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2
    const x = c + Math.cos(a) * size * 0.2
    const y = c + Math.sin(a) * size * 0.2
    if (k === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#6a5436'
  ctx.beginPath()
  ctx.arc(c, c, size * 0.07, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * 船：海面由着色器画，风浪两层交错、夕照、白浪、船舷、水线白沫、船头浪与尾流；甲板是一张程序画出的木板贴图；
 * 桅杆、帆桁、索具与帆按高度随船的横摇纵摇甩开，影子背着夕阳投在甲板上；吊灯按单摆挂着，灯光在甲板上跟着晃；
 * 炮弹顺坡滚，低的一侧舷边溅浪花，海鸥在桅顶上空盘旋。船长沿进场时屏幕的长边摆，之后不再随屏幕转
 */
class ShipView extends BoundedView {
  private size?: { w: number; h: number; origin: Point }
  private readonly u = { time: 0, roll: 0, pitch: 0 }
  private rig?: Phaser.GameObjects.Graphics
  private shade?: Phaser.GameObjects.Graphics
  private ballShade?: Phaser.GameObjects.Graphics
  private deckImg?: Phaser.GameObjects.Image
  private balls: Phaser.GameObjects.Image[] = []
  private lanterns: Lantern[] = []
  private gulls: Gull[] = []
  private spray?: Phaser.GameObjects.Particles.ParticleEmitter
  /** 两舷的湿甲板：溅上浪花就湿，慢慢晾干 */
  private wet: { side: number; img: Phaser.GameObjects.Image; level: number }[] = []
  private rate = { roll: 0, pitch: 0 }
  private sprayAt = 0
  private creakAt = 0

  layout(v: ViewCtx): { w: number; h: number; origin: Point } {
    if (!this.size) {
      const cfg = v.def.ship!
      const sz = shipSizeU(cfg)
      const across = viewport.logicalWidth >= viewport.logicalHeight
      const w = (across ? sz.long : sz.short) * UNIT
      const h = (across ? sz.short : sz.long) * UNIT
      const deck = makeDeckFrame(cfg, w, h)
      const at = [...cfg.hull.masts].sort((a, b) => a - b)
      const s = ((at[at.length - 2]! + at[at.length - 1]!) / 2) * cfg.hull.lengthU
      this.size = { w, h, origin: deckPoint(deck, s, 0) }
    }
    return this.size
  }

  build(v: ViewCtx): void {
    this.visuals.push(
      v.scene.add
        .rectangle(viewport.logicalWidth / 2, viewport.logicalHeight / 2, 8000, 8000, SHIP_BG)
        .setScrollFactor(0)
        .setDepth(-3),
    )
    const scene = v.scene
    if (!scene.textures.exists(SHIP_PUFF_KEY)) canvasTexture(scene, SHIP_PUFF_KEY, 64, 64, (ctx) => drawPuff(ctx, 64))
    if (!scene.textures.exists(SHIP_GLOW_KEY)) canvasTexture(scene, SHIP_GLOW_KEY, 64, 64, (ctx) => drawSpark(ctx, 64))
    if (!scene.textures.exists(BALL_KEY)) canvasTexture(scene, BALL_KEY, 48, 48, (ctx) => drawBall(ctx, 48))
    if (!scene.textures.exists(GULL_KEY)) canvasTexture(scene, GULL_KEY, 96, 48, (ctx) => drawGull(ctx, 96, 48))
    if (!scene.textures.exists(LANTERN_KEY)) canvasTexture(scene, LANTERN_KEY, 48, 48, (ctx) => drawLantern(ctx, 48))
  }

  onSimReady(v: ViewCtx, sim: Sim): void {
    const s = sim.worldState.ship
    if (!s) return
    const cfg = v.def.ship!
    const scene = v.scene
    const deck = s.deck
    const seed = v.run.decorSeed
    const toWorld = (ls: number, lt: number): Point => ({ x: deck.bx * ls + deck.sx * lt, y: deck.by * ls + deck.sy * lt })
    const sunH = Math.hypot(SUN.x, SUN.y)
    const light = { s: (SUN.x * deck.bx + SUN.y * deck.by) / sunH, t: (SUN.x * deck.sx + SUN.y * deck.sy) / sunH }
    const wl = Math.hypot(SHIP_WIND.s, SHIP_WIND.t)
    const wind = toWorld(SHIP_WIND.s / wl, SHIP_WIND.t / wl)
    const turn = deck.bx !== 0 ? 'h' : 'v'
    const waveKey = `${WAVE_KEY}-${turn}`
    const edgeKey = `${EDGE_KEY}-${turn}`
    const deckKey = `${DECK_KEY}-${turn}`
    if (!scene.textures.exists(waveKey)) canvasTexture(scene, waveKey, WAVE_TILE, WAVE_TILE, (ctx) => drawWaveTile(ctx, wind, SHIP_SEED ^ 0x3a7)).setWrap(Phaser.Textures.WrapMode.REPEAT, Phaser.Textures.WrapMode.REPEAT)
    const ec = Math.ceil((v.w / UNIT) * EDGE_PPU)
    const er = Math.ceil((v.h / UNIT) * EDGE_PPU)
    if (!scene.textures.exists(edgeKey)) canvasTexture(scene, edgeKey, ec, er, (ctx) => drawEdgeField(ctx, cfg, deck, ec, er))
    const h = cfg.hull
    const pad = (MAP.cameraMargin + 8) * UNIT
    const rect = [-pad, -pad, v.w + pad * 2, v.h + pad * 2]
    const freeU = (cfg.hydro.depthM - cfg.hydro.draftM) / cfg.meterPerU
    const shadowU = freeU * SHADOW_PER_U
    const away = { x: -SUN.x / sunH, y: -SUN.y / sunH }
    const shadowPx = [away.x * shadowU * UNIT, away.y * shadowU * UNIT]
    const u = this.u
    const speedU = cfg.sea.speedMs / cfg.meterPerU
    const sunLen = Math.hypot(SUN.x, SUN.y, SUN.z)
    const sunDir = [SUN.x / sunLen, SUN.y / sunLen, SUN.z / sunLen]
    this.visuals.push(
      scene.add
        .shader(
          {
            name: 'ShipSea',
            fragmentSource: SEA_FRAG,
            setupUniforms: (set: (name: string, value: unknown) => void) => {
              set('uWave', 0)
              set('uEdge', 1)
              set('uTime', u.time)
              set('uRect', rect)
              set('uUnit', UNIT)
              set('uGrid', [(ec * UNIT) / EDGE_PPU, (er * UNIT) / EDGE_PPU, UNIT / EDGE_PPU])
              set('uShip', [deck.ox, deck.oy, deck.bx, deck.by])
              set('uHullA', [h.lengthU, h.beamU, h.bow * h.lengthU, h.bowPow])
              set('uHullB', [h.stern * h.lengthU, h.sternPow, (h.beamU / 2) * h.transom, h.transomBulge * h.beamU])
              set('uHullC', [h.bulwarkU, freeU, speedU, HULL_BAND_M / cfg.meterPerU + 0.12])
              set('uTilt', [Math.sin(u.roll), Math.sin(u.pitch), 0, 0])
              set('uWind', [wind.x, wind.y, shadowPx[0], shadowPx[1]])
              set('uSun', sunDir)
            },
          },
          rect[0]!,
          rect[1]!,
          rect[2]!,
          rect[3]!,
          [waveKey, edgeKey],
        )
        .setOrigin(0, 0)
        .setDepth(-2),
    )
    const fr = deckFrame(cfg)
    const dw = Math.ceil((fr.s1 - fr.s0) * DECK_PPU)
    const dh = Math.ceil(2 * fr.t1 * DECK_PPU)
    if (!scene.textures.exists(deckKey)) canvasTexture(scene, deckKey, dw, dh, (ctx) => paintDeck(ctx, cfg, SHIP_SEED, light))
    const corner = deckPoint(deck, fr.s0, -fr.t1)
    this.deckImg = scene.add
      .image(corner.x, corner.y, deckKey)
      .setOrigin(0, 0)
      .setDisplaySize((dw / DECK_PPU) * UNIT, (dh / DECK_PPU) * UNIT)
      .setRotation(Math.atan2(deck.by, deck.bx))
      .setDepth(-1)
    const ww = Math.ceil((fr.s1 - fr.s0) * WET_PPU)
    const wh = Math.ceil(fr.t1 * WET_PPU)
    for (const side of [-1, 1]) {
      const key = `${WET_KEY}-${side > 0 ? 's' : 'p'}`
      if (!scene.textures.exists(key)) canvasTexture(scene, key, ww, wh, (ctx) => paintWet(ctx, cfg, side))
      const at = deckPoint(deck, fr.s0, side > 0 ? 0 : -fr.t1)
      const img = scene.add
        .image(at.x, at.y, key)
        .setOrigin(0, 0)
        .setDisplaySize((ww / WET_PPU) * UNIT, (wh / WET_PPU) * UNIT)
        .setRotation(Math.atan2(deck.by, deck.bx))
        .setDepth(-0.9)
        .setAlpha(0)
      this.wet.push({ side, img, level: 0 })
      this.visuals.push(img)
    }
    this.shade = scene.add.graphics().setDepth(-0.8)
    this.ballShade = scene.add.graphics().setDepth(-0.6)
    this.rig = scene.add.graphics().setDepth(31)
    this.visuals.push(this.deckImg, this.shade, this.ballShade, this.rig)
    this.decorEids = this.decorEids.filter((eid) => {
      const x = Transform.x[eid]!
      const y = Transform.y[eid]!
      const keep = roomAt(deck.basin, x, y) >= 0.7 * UNIT && roomAt(deck.basin, x, y) < 2.5 * UNIT
      if (!keep) removeEntity(v.world, eid)
      return keep
    })
    this.balls = s.balls.map(() => scene.add.image(0, 0, BALL_KEY).setDepth(0.9).setDisplaySize(cfg.balls.radiusU * 2 * UNIT, cfg.balls.radiusU * 2 * UNIT))
    this.visuals.push(...this.balls)
    const masts = rigOf(cfg)
    const hangs: { s: number; t: number; hook: number; cord: number }[] = [
      { s: -h.transomBulge * h.beamU - h.bulwarkU - 0.5, t: 0, hook: 1.9, cord: 0.25 },
      ...masts.map((m, i) => ({ s: m.s + (i === masts.length - 1 ? -0.7 : 0.7), t: 0, hook: 2.7, cord: 0.5 })),
    ]
    const rng = new Rng(seed ^ 0x1a77)
    for (const hg of hangs) {
      const pool = scene.add.image(0, 0, SHIP_GLOW_KEY).setDepth(-0.7).setBlendMode(Phaser.BlendModes.ADD).setTint(0xff9a3c).setAlpha(0.3).setScale((6.5 * UNIT) / 64)
      const glow = scene.add.image(0, 0, SHIP_GLOW_KEY).setDepth(32).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffb35c).setAlpha(0.55).setScale((1.6 * UNIT) / 64)
      const body = scene.add.image(0, 0, LANTERN_KEY).setDepth(32.1).setScale((0.62 * UNIT) / 48)
      this.lanterns.push({ ...hg, across: 0, along: 0, vAcross: 0, vAlong: 0, body, glow, pool, flicker: rng.next() * 10 })
      this.visuals.push(pool, glow, body)
    }
    const sky = deckPoint(deck, Math.max(1.6, h.stern * h.lengthU * 0.3) + 3.6, 0)
    this.visuals.push(scene.add.image(sky.x, sky.y, SHIP_GLOW_KEY).setDepth(-0.7).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffa850).setAlpha(0.35).setScale((3 * UNIT) / 64))
    for (let i = 0; i < 3; i++) {
      const m = masts[Math.floor(rng.next() * masts.length)]!
      const img = scene.add.image(0, 0, GULL_KEY).setDepth(37).setScale(GULL_SCALE).setAlpha(0.88)
      this.gulls.push({ s: m.s + (rng.next() * 2 - 1) * 6, t: (rng.next() * 2 - 1) * 4, r: (5 + rng.next() * 6) * UNIT, a: rng.next() * Math.PI * 2, w: (0.18 + rng.next() * 0.14) * (rng.next() < 0.5 ? -1 : 1), img, flapAt: 0 })
      this.visuals.push(img)
    }
    this.spray = scene.add
      .particles(0, 0, SHIP_PUFF_KEY, {
        lifespan: { min: 450, max: 900 },
        speed: { min: 30, max: 120 },
        scale: { start: 0.25, end: 0.9 },
        alpha: { start: 0.55, end: 0 },
        tint: [0xe8f1f0, 0xcfe0e0, 0xffffff],
        emitting: false,
      })
      .setDepth(34)
    this.visuals.push(this.spray)
    scene.cameras.main.filters?.internal.addVignette(0.5, 0.5, 0.72, 0.24, 0x000000)
  }

  step(v: ViewCtx, sim: Sim, delta: number): void {
    const s = sim.worldState.ship
    if (!s || !this.rig || !this.shade) return
    const cfg = v.def.ship!
    const deck = s.deck
    const dt = Math.min(delta, 50) / 1000
    const now = sim.elapsedMs
    const roll = s.roll.angle
    const pitch = s.pitch.angle
    const rollAcc = dt > 0 ? (s.roll.rate - this.rate.roll) / dt : 0
    const pitchAcc = dt > 0 ? (s.pitch.rate - this.rate.pitch) / dt : 0
    this.rate.roll = s.roll.rate
    this.rate.pitch = s.pitch.rate
    this.u.time = now / 1000
    this.u.roll = roll
    this.u.pitch = pitch
    const pose = { roll, pitch }
    const wind = { s: SHIP_WIND.s, t: SHIP_WIND.t }
    this.rig.clear()
    drawRig(this.rig, cfg, deck, pose, now / 1000, wind)
    this.shade.clear()
    drawRigShadow(this.shade, cfg, deck, pose)
    // 甲板的法线随倾斜偏向低的一侧，朝着太阳偏就亮一点
    const sunLen = Math.hypot(SUN.x, SUN.y, SUN.z)
    const nx = Math.sin(pitch) * deck.bx + Math.sin(roll) * deck.sx
    const ny = Math.sin(pitch) * deck.by + Math.sin(roll) * deck.sy
    const lambert = (nx * SUN.x + ny * SUN.y + Math.cos(roll) * Math.cos(pitch) * SUN.z) / sunLen
    const lit = Math.round(255 * Math.min(1, Math.max(0.6, 0.9 + (lambert - SUN.z / sunLen) * 1.1)))
    this.deckImg?.setTint((lit << 16) | (lit << 8) | lit)
    const bs = this.ballShade
    bs?.clear()
    const r = cfg.balls.radiusU * UNIT
    s.balls.forEach((b, i) => {
      this.balls[i]?.setPosition(b.x, b.y)
      bs?.fillStyle(0x000000, 0.35)
      bs?.fillEllipse(b.x - SUN.x * r * 0.9, b.y - SUN.y * r * 0.9, r * 2.3, r * 2)
    })
    const mpu = cfg.meterPerU
    const g = GRAVITY
    // 吊灯是单摆：相对铅垂线的角度按 θ'' = −(g/l)·sinθ − (r·φ''/l)·cosθ − cθ' 推进，挂钩随船横摇纵摇的角加速度甩它
    for (const l of this.lanterns) {
      const arm = l.hook + (cfg.hydro.depthM - cfg.hydro.draftM)
      const steps = Math.max(1, Math.ceil(dt / 0.008))
      const h2 = dt / steps
      for (let k = 0; k < steps; k++) {
        const aA = -(g / l.cord) * Math.sin(l.across) - ((arm * rollAcc) / l.cord) * Math.cos(l.across) - 1.2 * l.vAcross
        const aL = -(g / l.cord) * Math.sin(l.along) - ((arm * pitchAcc) / l.cord) * Math.cos(l.along) - 1.2 * l.vAlong
        l.vAcross += aA * h2
        l.vAlong += aL * h2
        l.across += l.vAcross * h2
        l.along += l.vAlong * h2
      }
      const hookUp = l.hook / mpu
      const ls = l.s + hookUp * Math.sin(pitch) + (l.cord * Math.sin(l.along)) / mpu
      const lt = l.t + hookUp * Math.sin(roll) + (l.cord * Math.sin(l.across)) / mpu
      const p = deckPoint(deck, ls, lt)
      const f = 0.92 + 0.08 * Math.sin(now / 90 + l.flicker) * Math.sin(now / 37 + l.flicker * 3)
      l.body.setPosition(p.x, p.y)
      l.glow.setPosition(p.x, p.y).setAlpha(0.5 * f)
      l.pool.setPosition(p.x, p.y).setAlpha(0.28 * f)
    }
    for (const gl of this.gulls) {
      gl.a += gl.w * dt
      gl.s += 0.15 * dt * Math.sin(now / 7000 + gl.r)
      const c = deckPoint(deck, gl.s, gl.t)
      const x = c.x + Math.cos(gl.a) * gl.r
      const y = c.y + Math.sin(gl.a) * gl.r * 0.8
      const heading = gl.a + (gl.w > 0 ? Math.PI / 2 : -Math.PI / 2)
      if (now > gl.flapAt + 2600 && Math.random() < dt * 0.4) gl.flapAt = now
      const flap = now - gl.flapAt < 900 ? 0.72 + 0.28 * Math.abs(Math.cos((now - gl.flapAt) / 60)) : 1
      gl.img.setPosition(x, y).setRotation(heading + Math.PI / 2).setScale(GULL_SCALE * flap, GULL_SCALE)
    }
    this.splash(cfg, s, now, roll, pitch)
    for (const w of this.wet) {
      const low = Math.max(0, Math.sin(roll) * w.side)
      w.level = Math.max(0, w.level - dt / 7)
      w.img.setAlpha(Math.min(1, w.level * (0.45 + low * 6)))
    }
  }

  /** 低的一侧舷边往下压得快时溅起浪花，船头往下扎时船头也溅；船摇到头时木头吱呀一声 */
  private splash(cfg: ShipConfig, s: ShipState, now: number, roll: number, pitch: number): void {
    const em = this.spray
    if (!em) return
    const deck = s.deck
    const h = cfg.hull
    const dip = Math.abs(s.roll.rate) * (Math.sign(s.roll.rate) === Math.sign(roll) ? 1 : 0)
    if (now >= this.sprayAt && (dip > 0.012 || (s.pitch.rate > 0.02 && pitch > 0.008))) {
      this.sprayAt = now + 160
      const side = Math.sign(roll) || 1
      const n = Math.min(7, Math.round(dip * 110 + Math.abs(roll) * 18))
      for (let k = 0; k < n; k++) {
        const at = h.stern * h.lengthU + Math.random() * h.lengthU * 0.7
        const p = deckPoint(deck, at, side * (halfBeamAt(h, at) + h.bulwarkU + 0.35))
        em.emitParticleAt(p.x, p.y, 1)
      }
      if (s.pitch.rate > 0.02 && pitch > 0.008) {
        const p = deckPoint(deck, h.lengthU + 0.4, (Math.random() * 2 - 1) * 0.6)
        em.emitParticleAt(p.x, p.y, 3)
      }
      if (n > 3) playSfx('wash')
      for (const w of this.wet) if (w.side === side) w.level = Math.min(1, w.level + n * 0.05)
    }
    if (now >= this.creakAt && Math.abs(roll) > 0.03 && Math.abs(s.roll.rate) < 0.004) {
      this.creakAt = now + 2600
      playSfx('creak')
    }
  }

  destroy(v: ViewCtx): void {
    super.destroy(v)
    this.balls = []
    this.lanterns = []
    this.gulls = []
    this.wet = []
    this.rig = undefined
    this.shade = undefined
    this.ballShade = undefined
    this.deckImg = undefined
    this.spray = undefined
  }
}

const NEBULA_BG = 0x030205
const NEBULA_SHEET_KEY = 'nebula-sheet'
const NEBULA_CLOUD_KEY = 'nebula-cloud'
const NEBULA_GLINT_KEY = 'nebula-glint'
const NEBULA_HALO_KEY = 'nebula-halo'
/** 光晕贴图的半径是阴影半径的几倍 */
const HALO_EDGE = 4
/** 开局最多几个线程分着画星云 */
const NEBULA_THREADS = 4
/** 着色器的曝光：光的强度乘它再按 1 − e^(−x) 压进画面 */
const NEBULA_EXPOSURE = 1.9
/** 星尘：多少粒，终端漂移 g·t 的停止时间（秒） */
const DUST_COUNT = 240
const DUST_STOP_S = 0.35
/** 被吞的身体拉成一条细流绕进黑洞，要多久，毫秒 */
const STREAM_MS = 750
/** 流星的尾巴：被吸积盘照着时多长、最长多长，格 */
const TAIL_U = 2.4
const TAIL_MAX_U = 7
/** 流星身后的热迹多久冷却到看不见，毫秒 */
const TRAIL_MS = 450

/** 流星飞过的一点，像素与经过的时刻 */
interface TrailPoint {
  readonly x: number
  readonly y: number
  readonly at: number
}

/** 一粒星尘，像素与像素/秒 */
interface Speck {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  tint: number
}

/** 一条被潮汐拉长、绕进黑洞的细流 */
interface Stream {
  readonly x: number
  readonly y: number
  readonly at: number
  readonly gm: number
  readonly spin: number
}

/**
 * 星云：没有太阳。底下是球壳下半部的内壁、壳层的尘埃与外面的深空，由着色器按黑洞的引力透镜、吸积盘的光与光回波画出来；
 * 黑洞是一块阴影，外面一圈光子环和正对着看的吸积盘，周围那圈被弯过来的星云光就是走不出来的地方。
 * 星尘按同一套引力往里漂，越近越快；被吞的身体拉成细流绕进去，吸积盘随之一亮。流星在内壁上先亮起来再冲进空腔，
 * 身后拖着冷却变红的热迹与背向黑洞的尾巴，照亮它经过的星云，扎进对面的壳层就碎掉
 */
class NebulaView extends BoundedView {
  private size?: { w: number; h: number; origin: Point }
  private painter?: NebulaPainter
  private readonly u = {
    time: 0,
    rs: 0,
    base: 1,
    flareT: [0, 0, 0, 0, 0, 0, 0, 0],
    flareK: [0, 0, 0, 0, 0, 0, 0, 0],
    meteor: [0, 0, 0, 0],
    glow: 1,
  }
  private halo?: Phaser.GameObjects.Image
  private dust: Speck[] = []
  private dustGfx?: Phaser.GameObjects.Graphics
  private streams: Stream[] = []
  private streamGfx?: Phaser.GameObjects.Graphics
  private tailGfx?: Phaser.GameObjects.Graphics
  private core?: Phaser.GameObjects.Image
  private coma?: Phaser.GameObjects.Image
  private trail: TrailPoint[] = []
  private knot?: Phaser.GameObjects.Image
  private wake?: Phaser.GameObjects.Particles.ParticleEmitter
  private sparks?: Phaser.GameObjects.Particles.ParticleEmitter
  private debris?: Phaser.GameObjects.Particles.ParticleEmitter
  private phase: 'none' | 'warn' | 'fly' = 'none'
  private shake = true

  layout(v: ViewCtx): { w: number; h: number; origin: Point } {
    if (!this.size) {
      const cfg = v.def.nebula!
      const half = nebulaHalfU(cfg, MAP.cameraMargin) * UNIT
      const L = nebulaLayout(cfg, v.run.decorSeed, half)
      this.size = { w: half * 2, h: half * 2, origin: { x: L.sx, y: L.sy } }
    }
    return this.size
  }

  build(v: ViewCtx): void {
    this.visuals.push(
      v.scene.add
        .rectangle(viewport.logicalWidth / 2, viewport.logicalHeight / 2, 8000, 8000, NEBULA_BG)
        .setScrollFactor(0)
        .setDepth(-3),
    )
    const scene = v.scene
    if (!scene.textures.exists(NEBULA_CLOUD_KEY)) canvasTexture(scene, NEBULA_CLOUD_KEY, 64, 64, (ctx) => drawCloud(ctx, 64))
    if (!scene.textures.exists(NEBULA_GLINT_KEY)) canvasTexture(scene, NEBULA_GLINT_KEY, 32, 32, (ctx) => drawGlint(ctx, 32))
    if (!scene.textures.exists(NEBULA_HALO_KEY)) canvasTexture(scene, NEBULA_HALO_KEY, 256, 256, (ctx) => drawHalo(ctx, 256, HALO_EDGE))
    this.shake = loadSettings(browserStorage()).hitShake
  }

  /** 空腔里漂着的只有星尘，不撒布景 */
  decor(): void {}

  async onSimReady(v: ViewCtx, sim: Sim): Promise<void> {
    const s = sim.worldState.nebula
    if (!s) return
    const cfg = v.def.nebula!
    const scene = v.scene
    const L = s.layout
    const reach = v.w / 2 / UNIT + MAP.cameraMargin + 1
    const sheet: NebulaSheet = {
      x0: -reach,
      y0: -reach,
      sizeU: reach * 2,
      innerU: cfg.shell.innerU,
      outerU: cfg.shell.outerU,
      holeX: (L.hx - L.cx) / UNIT,
      holeY: (L.hy - L.cy) / UNIT,
      seed: (v.run.decorSeed ^ 0x2b7) >>> 0,
      ppu: NEBULA_PPU,
    }
    const px = sheetPx(sheet)
    const tex = canvasTexture(scene, NEBULA_SHEET_KEY, px, px)
    const painter = new NebulaPainter(sheet, Math.max(1, Math.min(NEBULA_THREADS, navigator.hardwareConcurrency - 1)))
    this.painter = painter
    const bands: SheetBand[] = []
    for (let r = 0; r < px; r += 8) bands.push({ r0: r, r1: Math.min(px, r + 8) })
    await painter.paint(bands, (p) => {
      tex.getContext().putImageData(new ImageData(p.pixels, px, p.band.r1 - p.band.r0), 0, p.band.r0)
    })
    if (this.painter !== painter) return
    tex.refresh()
    const u = this.u
    const x0 = L.cx - reach * UNIT
    const y0 = L.cy - reach * UNIT
    const side = reach * 2 * UNIT
    this.visuals.push(
      scene.add
        .shader(
          {
            name: 'NebulaSky',
            fragmentSource: NEBULA_FRAG,
            setupUniforms: (set: (name: string, value: unknown) => void) => {
              set('uNeb', 0)
              set('uTime', u.time)
              set('uRect', [x0, y0, side, side])
              set('uUnit', UNIT)
              set('uCenter', [L.cx, L.cy])
              set('uSheet', [sheet.x0, sheet.y0, sheet.sizeU, sheet.sizeU])
              set('uShell', [cfg.shell.innerU, cfg.shell.outerU])
              set('uHole', [sheet.holeX, sheet.holeY, u.rs, cfg.disk.outerRs])
              set('uLight', [cfg.hole.lightU, u.base, NEBULA_EXPOSURE, cfg.disk.innerK])
              set('uShape', [cfg.accretion.riseMs / 1000, cfg.accretion.viscousMs / 1000])
              set('uFlareT', u.flareT.slice(0, 4))
              set('uFlareT2', u.flareT.slice(4, 8))
              set('uFlareK', u.flareK.slice(0, 4))
              set('uFlareK2', u.flareK.slice(4, 8))
              set('uMeteor', u.meteor)
              set('uSeed', (v.run.decorSeed % 997) + 0.5)
              set('uGlow', u.glow)
            },
          },
          x0,
          y0,
          side,
          side,
          [NEBULA_SHEET_KEY],
        )
        .setOrigin(0, 0)
        .setDepth(-2),
    )
    this.dustGfx = scene.add.graphics().setDepth(0.5).setBlendMode(Phaser.BlendModes.ADD)
    this.streamGfx = scene.add.graphics().setDepth(29.5).setBlendMode(Phaser.BlendModes.ADD)
    this.tailGfx = scene.add.graphics().setDepth(33.5).setBlendMode(Phaser.BlendModes.ADD)
    this.halo = scene.add.image(L.hx, L.hy, NEBULA_HALO_KEY).setDepth(29).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffb27a)
    this.knot = scene.add.image(0, 0, NEBULA_GLINT_KEY).setDepth(33).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffa860).setVisible(false)
    this.coma = scene.add.image(0, 0, NEBULA_GLINT_KEY).setDepth(34).setBlendMode(Phaser.BlendModes.ADD).setTint(0xff9a4a).setVisible(false)
    this.core = scene.add.image(0, 0, NEBULA_GLINT_KEY).setDepth(34.1).setBlendMode(Phaser.BlendModes.ADD).setTint(0xfff1d6).setVisible(false)
    this.wake = scene.add
      .particles(0, 0, NEBULA_CLOUD_KEY, {
        lifespan: { min: 900, max: 1600 },
        speed: { min: 2, max: 14 },
        scale: { start: 0.12, end: 0.55 },
        alpha: { start: 0.32, end: 0 },
        tint: [0xff8a4d, 0xd6604e, 0x8a4a5a],
        blendMode: Phaser.BlendModes.ADD,
        frequency: 45,
        emitting: false,
      })
      .setDepth(32)
    this.wake.startFollow(this.core)
    this.sparks = scene.add
      .particles(0, 0, NEBULA_GLINT_KEY, {
        lifespan: { min: 350, max: 900 },
        speed: { min: 60, max: 260 },
        scale: { start: 0.5, end: 0 },
        alpha: { start: 1, end: 0 },
        tint: [0xffe0a8, 0xffa04a, 0xff5a3a],
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(35)
    this.debris = scene.add
      .particles(0, 0, NEBULA_CLOUD_KEY, {
        lifespan: { min: 700, max: 1400 },
        speed: { min: 20, max: 90 },
        scale: { start: 0.25, end: 0.9 },
        alpha: { start: 0.4, end: 0 },
        tint: [0x5a3f4a, 0x7a4a52, 0x3d2c38],
        emitting: false,
      })
      .setDepth(33.2)
    this.visuals.push(this.dustGfx, this.streamGfx, this.tailGfx, this.halo, this.knot, this.coma, this.core, this.wake, this.sparks, this.debris)
    this.dust = []
    for (let i = 0; i < DUST_COUNT; i++) this.dust.push(this.speck(s, cfg, scene.cameras.main, true))
    scene.cameras.main.filters?.internal.addVignette(0.5, 0.5, 0.72, 0.26, 0x000000)
    this.syncUniforms(s, cfg, sim.elapsedMs)
  }

  /** 新撒一粒星尘：多半撒在镜头附近，免得都漂在看不见的地方 */
  private speck(s: NebulaState, cfg: NonNullable<MapDef['nebula']>, cam: Phaser.Cameras.Scene2D.Camera, anywhere: boolean): Speck {
    const L = s.layout
    const lim = (cfg.shell.innerU - 0.3) * UNIT
    let x = 0
    let y = 0
    for (let k = 0; k < 8; k++) {
      if (anywhere || Math.random() < 0.3) {
        const r = Math.sqrt(Math.random()) * lim
        const a = Math.random() * Math.PI * 2
        x = L.cx + Math.cos(a) * r
        y = L.cy + Math.sin(a) * r
      } else {
        const view = cam.worldView
        x = view.x - UNIT * 2 + Math.random() * (view.width + UNIT * 4)
        y = view.y - UNIT * 2 + Math.random() * (view.height + UNIT * 4)
      }
      if (Math.hypot(x - L.cx, y - L.cy) < lim && !inNebulaHorizon(s, x, y)) break
    }
    const warm = Math.random()
    return { x, y, vx: 0, vy: 0, size: 0.6 + Math.random() * 1.1, tint: warm < 0.6 ? 0xffc89a : warm < 0.9 ? 0xffa88e : 0xd9b6ff }
  }

  /** 把黑洞此刻的大小、光度与最近几次闪耀交给着色器；时间都按对局的秒 */
  private syncUniforms(s: NebulaState, cfg: NonNullable<MapDef['nebula']>, now: number): void {
    const u = this.u
    u.time = now / 1000
    u.rs = s.rs
    u.base = (s.gm / cfg.hole.gm) ** 2
    u.glow = luminosity(s, cfg, now) ** 0.25
    for (let i = 0; i < MAX_FLARES; i++) {
      const f = s.flares[i]
      u.flareT[i] = f ? f.at / 1000 : 0
      u.flareK[i] = f ? f.k : 0
    }
  }

  step(v: ViewCtx, sim: Sim, delta: number): void {
    const s = sim.worldState.nebula
    if (!s || !this.dustGfx) return
    const cfg = v.def.nebula!
    const now = sim.elapsedMs
    const dt = Math.min(delta, 50) / 1000
    const cam = v.scene.cameras.main
    this.syncUniforms(s, cfg, now)
    const lum = luminosity(s, cfg, now)
    const shadow = SHADOW_RS * s.rs * UNIT
    if (this.halo) this.halo.setDisplaySize(shadow * HALO_EDGE * 2, shadow * HALO_EDGE * 2).setAlpha(Math.min(0.5, 0.1 * Math.sqrt(lum)))
    this.stepDust(s, cfg, cam, dt, lum)
    this.stepStreams(s, now)
    this.stepMeteor(v, s, cfg, now, lum)
  }

  /** 星尘在气体里被拖着漂：终速是引力乘停止时间，越靠近黑洞流得越快；漂进视界或出了空腔就在别处重撒。离黑洞或飞过的流星越近被照得越亮 */
  private stepDust(s: NebulaState, cfg: NonNullable<MapDef['nebula']>, cam: Phaser.Cameras.Scene2D.Camera, dt: number, lum: number): void {
    const g = this.dustGfx!
    g.clear()
    const L = s.layout
    const lim = cfg.shell.innerU * UNIT
    const mw = this.u.meteor[3]! * this.u.meteor[2]!
    const mx = L.cx + this.u.meteor[0]! * UNIT
    const my = L.cy + this.u.meteor[1]! * UNIT
    for (let i = 0; i < this.dust.length; i++) {
      let p = this.dust[i]!
      let left = dt
      for (let k = 0; k < 8 && left > 1e-5; k++) {
        const a = gravityAt(s, cfg, p.x, p.y)
        p.vx = a.x * DUST_STOP_S
        p.vy = a.y * DUST_STOP_S
        const sp = Math.hypot(p.vx, p.vy)
        const h = sp > 0 ? Math.min(left, (0.25 * UNIT) / sp) : left
        p.x += p.vx * h
        p.y += p.vy * h
        left -= h
        if (inNebulaHorizon(s, p.x, p.y)) break
      }
      if (inNebulaHorizon(s, p.x, p.y) || Math.hypot(p.x - L.cx, p.y - L.cy) > lim) {
        p = this.speck(s, cfg, cam, false)
        this.dust[i] = p
      }
      const dU = Math.hypot(p.x - L.hx, p.y - L.hy) / UNIT
      const dm = Math.hypot(p.x - mx, p.y - my) / UNIT
      const light = Math.min(1, (lum * 9) / (dU * dU + 4) + (mw * 2) / (dm * dm + 1))
      const sp = Math.hypot(p.vx, p.vy)
      const tail = Math.min(sp * 0.045, 1.6 * UNIT)
      const alpha = Math.min(0.85, 0.12 + 0.75 * light)
      const across = p.size * (1 + light)
      g.lineStyle(across, p.tint, (alpha * across) / (across + tail))
      if (tail > 1) g.lineBetween(p.x - (p.vx / sp) * tail, p.y - (p.vy / sp) * tail, p.x, p.y)
      else {
        g.fillStyle(p.tint, alpha)
        g.fillCircle(p.x, p.y, p.size * (1 + light) * 0.8)
      }
    }
  }

  /** 被吞的身体拉成细流，绕着黑洞转进视界；越靠近视界引力红移越重，越暗 */
  private stepStreams(s: NebulaState, now: number): void {
    const g = this.streamGfx!
    for (const e of s.swallows.splice(0)) {
      if (e.gm < 0.3) continue
      this.streams.push({ x: e.x, y: e.y, at: e.at, gm: e.gm, spin: Math.random() < 0.5 ? -1 : 1 })
      playSfx('gulp')
    }
    g.clear()
    const L = s.layout
    this.streams = this.streams.filter((st) => now - st.at < STREAM_MS)
    const rh = s.rs * UNIT
    for (const st of this.streams) {
      const t = (now - st.at) / STREAM_MS
      const r0 = Math.hypot(st.x - L.hx, st.y - L.hy)
      const a0 = Math.atan2(st.y - L.hy, st.x - L.hx)
      const head = Math.pow(t, 0.6)
      const width = Math.max(1.5, Math.cbrt(st.gm) * 2.2)
      const radius = (w: number): number => rh + Math.max(0, r0 - rh) * (1 - w) ** 1.6
      const at = (w: number): Point => {
        const r = radius(w)
        const a = a0 + st.spin * w * 2.4
        return { x: L.hx + Math.cos(a) * r, y: L.hy + Math.sin(a) * r }
      }
      for (let k = 0; k < 10; k++) {
        const u0 = Math.max(0, head - 0.35 + (k * 0.35) / 10)
        const u1 = Math.max(0, head - 0.35 + ((k + 1) * 0.35) / 10)
        const p0 = at(u0)
        const p1 = at(u1)
        const redshift = (1 - rh / radius((u0 + u1) / 2)) ** 2
        g.lineStyle(width * (0.4 + (0.6 * k) / 10), 0xffd2a0, (1 - t) * ((k + 1) / 10) * 0.9 * redshift)
        g.lineBetween(p0.x, p0.y, p1.x, p1.y)
      }
    }
  }

  /** 流星：预兆时内壁上的团块渐渐亮起、朝要飞的方向冒出一截；飞的时候团块迎着气体的那一面被冲压烧得发亮，身后留下一道冷却变红的热迹，被吸积盘的光推出一条背向黑洞的尾巴；碎掉时溅出火星与烟 */
  private stepMeteor(v: ViewCtx, s: NebulaState, cfg: NonNullable<MapDef['nebula']>, now: number, lum: number): void {
    const m = s.meteor
    const g = this.tailGfx!
    g.clear()
    const L = s.layout
    const mc = cfg.meteor
    for (const e of s.ends.splice(0)) {
      if (e.kind === 'swallow') continue
      if (e.kind === 'shatter') {
        this.sparks?.explode(36, e.x, e.y)
        this.debris?.explode(10, e.x, e.y)
        playSfx('shatter')
        const view = v.scene.cameras.main.worldView
        if (this.shake && view.contains(e.x, e.y)) v.scene.cameras.main.shake(260, 0.003)
      } else this.debris?.explode(5, e.x, e.y)
    }
    const phase = m ? m.phase : 'none'
    if (phase !== this.phase && phase === 'warn') playSfx('streak')
    this.phase = phase
    this.u.meteor[3] = 0
    this.trail = this.trail.filter((p) => now - p.at < TRAIL_MS)
    if (m?.phase === 'fly') this.trail.push({ x: m.x, y: m.y, at: now })
    this.drawTrail(g, now, mc.radiusU * UNIT)
    if (m?.phase !== 'fly') this.wake?.stop()
    else if (!this.wake?.emitting) this.wake?.start()
    if (!m) {
      this.knot?.setVisible(false)
      this.core?.setVisible(false)
      this.coma?.setVisible(false)
      return
    }
    if (m.phase === 'warn') {
      const k = Math.min(1, (now - m.since) / mc.warnMs)
      this.core?.setVisible(false)
      this.coma?.setVisible(false)
      this.knot?.setVisible(true).setPosition(m.x, m.y).setScale((0.5 + 1.6 * k) * (UNIT / 32)).setAlpha(0.35 + 0.65 * k * (0.85 + 0.15 * Math.sin(now / 60)))
      const len = 1.8 * UNIT * k
      for (let i = 0; i < 6; i++) {
        const a = i / 6
        const b = (i + 1) / 6
        g.lineStyle((1 - a) * 0.5 * UNIT * k, 0xffb070, 0.45 * k * (1 - a))
        g.lineBetween(m.x + m.ux * len * a, m.y + m.uy * len * a, m.x + m.ux * len * b, m.y + m.uy * len * b)
      }
      this.u.meteor[0] = (m.x - L.cx) / UNIT
      this.u.meteor[1] = (m.y - L.cy) / UNIT
      this.u.meteor[2] = 0.6 * k
      this.u.meteor[3] = 1
      return
    }
    const speed = Math.hypot(m.vx, m.vy)
    const heat = Math.min(4, Math.max(0.3, (speed / (mc.speedU * UNIT)) ** 3))
    const size = mc.radiusU * 2 * UNIT
    this.knot?.setVisible(false)
    this.core?.setVisible(true).setPosition(m.x, m.y).setDisplaySize(size * 0.9, size * 0.9).setAlpha(Math.min(1, 0.6 + 0.2 * heat))
    this.coma?.setVisible(true).setPosition(m.x, m.y).setDisplaySize(size * (1.8 + 0.5 * heat), size * (1.8 + 0.5 * heat)).setAlpha(Math.min(0.9, 0.35 + 0.15 * heat))
    this.u.meteor[0] = (m.x - L.cx) / UNIT
    this.u.meteor[1] = (m.y - L.cy) / UNIT
    this.u.meteor[2] = heat
    this.u.meteor[3] = 1
    const ax = m.x - L.hx
    const ay = m.y - L.hy
    const dU = Math.hypot(ax, ay) / UNIT || 1
    const away = { x: ax / (dU * UNIT), y: ay / (dU * UNIT) }
    const tail = Math.min(TAIL_MAX_U, 0.8 + (TAIL_U * lum * 40) / (dU * dU + 10)) * UNIT
    const side = { x: -away.y, y: away.x }
    const halfW = mc.radiusU * UNIT * 0.9
    for (let layer = 0; layer < 3; layer++) {
      const w = halfW * (1 - layer * 0.28)
      const len = tail * (1 - layer * 0.22)
      g.fillStyle(layer === 2 ? 0xffe2c0 : 0xff9a66, 0.12 + layer * 0.08)
      g.fillPoints(
        [
          new Phaser.Math.Vector2(m.x + side.x * w, m.y + side.y * w),
          new Phaser.Math.Vector2(m.x + away.x * len * 0.55 + side.x * w * 0.55, m.y + away.y * len * 0.55 + side.y * w * 0.55),
          new Phaser.Math.Vector2(m.x + away.x * len, m.y + away.y * len),
          new Phaser.Math.Vector2(m.x + away.x * len * 0.55 - side.x * w * 0.55, m.y + away.y * len * 0.55 - side.y * w * 0.55),
          new Phaser.Math.Vector2(m.x - side.x * w, m.y - side.y * w),
        ],
        true,
      )
    }
  }

  /** 流星身后被冲热的气体：刚经过的地方最宽最亮、发白，冷却着变窄、变红，TRAIL_MS 后看不见 */
  private drawTrail(g: Phaser.GameObjects.Graphics, now: number, radius: number): void {
    const pts = this.trail
    if (pts.length < 2) return
    const edge = (i: number, w: number, sign: number): Phaser.Math.Vector2 => {
      const p = pts[i]!
      const a = pts[Math.max(0, i - 1)]!
      const b = pts[Math.min(pts.length - 1, i + 1)]!
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = Math.hypot(dx, dy) || 1
      return new Phaser.Math.Vector2(p.x - (dy / len) * w * sign, p.y + (dx / len) * w * sign)
    }
    for (const [widthK, alphaK] of [
      [0.8, 0.2],
      [0.32, 0.45],
    ] as const) {
      for (let i = 0; i + 1 < pts.length; i++) {
        const age0 = (now - pts[i]!.at) / TRAIL_MS
        const age1 = (now - pts[i + 1]!.at) / TRAIL_MS
        const w0 = radius * widthK * (1 - age0)
        const w1 = radius * widthK * (1 - age1)
        g.fillStyle(mix(0xffcf9a, 0xa83a28, Math.min(1, (age0 + age1) / 1.4)), alphaK * (1 - (age0 + age1) / 2))
        g.fillPoints([edge(i, w0, 1), edge(i + 1, w1, 1), edge(i + 1, w1, -1), edge(i, w0, -1)], true)
      }
    }
  }

  destroy(v: ViewCtx): void {
    this.painter?.close()
    this.painter = undefined
    super.destroy(v)
    this.dust = []
    this.streams = []
    this.dustGfx = undefined
    this.streamGfx = undefined
    this.tailGfx = undefined
    this.halo = undefined
    this.knot = undefined
    this.core = undefined
    this.coma = undefined
    this.trail = []
    this.wake = undefined
    this.sparks = undefined
    this.debris = undefined
    if (v.scene.textures.exists(NEBULA_SHEET_KEY)) v.scene.textures.remove(NEBULA_SHEET_KEY)
  }
}

function mix(from: number, to: number, t: number): number {
  const ch = (at: number): number => {
    const a = (from >> at) & 0xff
    return Math.round(a + (((to >> at) & 0xff) - a) * t)
  }
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

function shade(color: number, mul: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * mul))
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * mul))
  const b = Math.min(255, Math.round((color & 0xff) * mul))
  return (r << 16) | (g << 8) | b
}

export function viewFor(mapId: MapId): MapView {
  return MAKE[MAPS[mapId].kind]()
}

const MAKE: Record<MapDef['kind'], () => MapView> = {
  bounded: () => new BoundedView(),
  daynight: () => new DayNightView(),
  ruins: () => new RuinsView(),
  ice: () => new IceView(),
  river: () => new RiverView(),
  void: () => new TorusView(),
  space: () => new SpaceView(),
  nebulaOld: () => new NebulaOldView(),
  nebula: () => new NebulaView(),
  volcano: () => new VolcanoView(),
  ship: () => new ShipView(),
}
