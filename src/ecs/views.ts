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
import { captureRadiusU } from './worlds/nebula'
import { ringPoint } from './worlds/space'
import { leaderX, leaderY } from './utils/team'
import { spawnDriftDecor } from './entities/decor'
import { fogAlphaAt, fogRadiusAt, hourAt, visionGridsAt } from './worlds/daynight'
import { onFloe } from './worlds/ice'
import { driftSpeed, riverRect } from './worlds/river'
import { fitAspectRect } from './worlds/torus'
import { drawBomb, drawPuff, drawSpark, encodeLava, fumaroles, GROUND_PPC, GROUND_TILE, LAVA_FRAG, markGround, paintGround, rockMasks } from './render/volcano'
import type { RockMasks } from './render/volcano'
import { effusion } from './worlds/volcano'
import { roomAt } from './worlds/basin'
import type { EruptionPhase, VolcanoState } from './worlds/volcano'
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
  onSimReady(v: ViewCtx, sim: Sim): void
  step(v: ViewCtx, sim: Sim, delta: number): void
  resize(v: ViewCtx): void
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
function nebulaRadii(v: ViewCtx): { wall: number; rim: number } {
  const s = v.def.nebula!.shell
  return { wall: s.innerU * UNIT, rim: s.outerU * UNIT }
}

const GAS_COLORS = [0xff5fa2, 0x7c4dff, 0x40c4ff, 0xb388ff, 0xff8a65]
const SHELL_INNER = 0x4fc3f7
const SHELL_OUTER = 0xff5f8f

/**
 * 星云：圆心在原点的空腔里飘着一团团气体，壳层按俯视的柱密度着色，内壁最亮、往外渐暗到外缘为零；
 * 黑洞画出视界、光子球与吸积盘，虚线圈是当前队长走路逃不出的范围，流星的预警沿引力弯曲的轨迹
 */
class NebulaView extends BoundedView {
  private capture?: Phaser.GameObjects.Graphics
  private captureU = -1
  private meteorFx?: { of: number; tele: Phaser.GameObjects.Graphics }

  layout(v: ViewCtx): { w: number; h: number; origin: Point } {
    const d = nebulaRadii(v).rim * 2
    return { w: d, h: d, origin: { x: 0, y: 0 } }
  }

  build(v: ViewCtx): void {
    this.visuals.push(
      v.scene.add
        .rectangle(viewport.logicalWidth / 2, viewport.logicalHeight / 2, 8000, 8000, v.def.palette.map)
        .setScrollFactor(0)
        .setDepth(-1),
    )
    const { wall, rim } = nebulaRadii(v)
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
    const { rim } = nebulaRadii(v)
    return new Phaser.Geom.Rectangle(-rim, -rim, rim * 2, rim * 2)
  }

  /** 装饰只撒在空腔里 */
  decor(v: ViewCtx, atlas: EcsAtlas): void {
    const rng = new Rng(v.run.decorSeed)
    const rU = nebulaRadii(v).wall / UNIT
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
    const h = v.def.nebula!.hole.horizonU * UNIT
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
    const cfg = v.def.nebula!
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
      const rr = v.def.nebula!.meteor.radiusU * UNIT
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
  private ground?: { tex: Phaser.Textures.CanvasTexture; img: ImageData; seen: Float32Array; dirty: Uint8Array; vents: Point[] }
  private data?: { lava: Phaser.Textures.CanvasTexture; aux: Phaser.Textures.CanvasTexture; lavaImg: ImageData; auxImg: ImageData; glow: Float32Array; soft: Float32Array }
  private rockAt = 0
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

  onSimReady(v: ViewCtx, sim: Sim): void {
    const s = sim.worldState.volcano
    if (!s) return
    const f = s.field
    const cfg = v.def.volcano!
    const scene = v.scene
    const vents = fumaroles(f, cfg, 5)
    const gw = f.cols * GROUND_PPC
    const gh = f.rows * GROUND_PPC
    const groundTex = canvasTexture(scene, GROUND_KEY, gw, gh)
    const img = groundTex.getContext().createImageData(gw, gh)
    paintGround(f, cfg, GROUND_PPC, vents, rockMasks(f), img.data, 0, 0, f.cols, f.rows)
    groundTex.getContext().putImageData(img, 0, 0)
    groundTex.refresh()
    const dirty = new Uint8Array(Math.ceil(f.cols / GROUND_TILE) * Math.ceil(f.rows / GROUND_TILE))
    this.ground = { tex: groundTex, img, seen: f.rockAt.slice(), dirty, vents }
    this.visuals.push(scene.add.image(f.x0, f.y0, GROUND_KEY).setOrigin(0, 0).setDisplaySize(f.cols * f.cell, f.rows * f.cell).setDepth(-1))
    const lava = canvasTexture(scene, LAVA_KEY, f.cols, f.rows)
    const aux = canvasTexture(scene, AUX_KEY, f.cols, f.rows)
    this.data = {
      lava,
      aux,
      lavaImg: lava.getContext().createImageData(f.cols, f.rows),
      auxImg: aux.getContext().createImageData(f.cols, f.rows),
      glow: new Float32Array(f.cols * f.rows),
      soft: new Float32Array(f.cols * f.rows),
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
    encodeLava(s.field, v.def.volcano!, now, d.lavaImg.data, d.auxImg.data, d.glow, d.soft)
    d.lava.getContext().putImageData(d.lavaImg, 0, 0)
    d.lava.refresh()
    d.aux.getContext().putImageData(d.auxImg, 0, 0)
    d.aux.refresh()
  }

  /** 新凝固的岩石改变了地表：把受影响的块记下，每隔一会儿重画两块，免得一帧里画太多 */
  private repaintRock(v: ViewCtx, s: VolcanoState, now: number): void {
    const g = this.ground
    if (!g) return
    const f = s.field
    const cfg = v.def.volcano!
    for (let i = 0; i < f.rockAt.length; i++) {
      if (f.rockAt[i] === g.seen[i]) continue
      g.seen[i] = f.rockAt[i]!
      markGround(f, cfg, i, g.dirty)
    }
    if (now < this.rockAt) return
    this.rockAt = now + 100
    const tiles = Math.ceil(f.cols / GROUND_TILE)
    let masks: RockMasks | undefined
    let done = 0
    for (let k = 0; k < g.dirty.length && done < 2; k++) {
      if (!g.dirty[k]) continue
      g.dirty[k] = 0
      done++
      masks ??= rockMasks(f)
      const c0 = (k % tiles) * GROUND_TILE
      const r0 = Math.floor(k / tiles) * GROUND_TILE
      const c1 = Math.min(f.cols, c0 + GROUND_TILE)
      const r1 = Math.min(f.rows, r0 + GROUND_TILE)
      paintGround(f, cfg, GROUND_PPC, g.vents, masks, g.img.data, c0, r0, c1, r1)
      g.tex.getContext().putImageData(g.img, 0, 0, c0 * GROUND_PPC, r0 * GROUND_PPC, (c1 - c0) * GROUND_PPC, (r1 - r0) * GROUND_PPC)
    }
    if (done > 0) g.tex.refresh()
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
    if (this.vignette) v.scene.cameras.main.filters?.internal.remove(this.vignette)
    this.vignette = undefined
    super.destroy(v)
    this.ground = undefined
    this.data = undefined
    this.bombs = []
    this.spare = []
    this.splats = []
    for (const key of [GROUND_KEY, LAVA_KEY, AUX_KEY]) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
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
  nebula: () => new NebulaView(),
  volcano: () => new VolcanoView(),
}
