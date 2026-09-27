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
import type { TorusConfig } from '../types/maps'
import { query } from 'bitecs'
import { Due, Meteor } from './components'
import { leaderX, leaderY } from './utils/team'
import { spawnDriftDecor } from './entities/decor'
import { fogAlphaAt, fogRadiusAt, hourAt, visionGridsAt } from './worlds/daynight'
import { onFloe } from './worlds/ice'
import { driftSpeed, riverRect } from './worlds/river'
import { fitAspectRect } from './worlds/torus'

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
    const hour = hourAt((v.run.combatMs + sim.elapsedMs) / 1000, dn)
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
}
