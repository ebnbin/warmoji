import Phaser from 'phaser'
import { removeEntity } from 'bitecs'
import { UNIT } from '../util/units'
import { MAP, MAPS, rollDecor } from '../data/maps'
import { viewport } from '../util/apply'
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
import { Alive, Due, Meteor, Transform } from './components'
import { centerX, centerY } from './utils/team'
import { spawnDriftDecor } from './entities/decor'
import { chunkDecor, chunkKey, chunksInRect, outsideZone } from '../war/maps/world'
import { fogAlphaAt, fogRadiusAt, hourAt, visionGridsAt } from '../war/maps/daynight'
import { onFloe } from '../war/maps/ice'
import { driftSpeed, riverRect } from '../war/maps/river'
import { fitAspectRect } from '../war/maps/void'
import { generateRuins, reachableCells, WallGrid } from '../war/maps/ruins'

// 各图专属的视觉常量（从 EcsBattleScene 搬来：它们只有本文件的对应视图用得上）
const FOG_COLOR = 0x0a0a1a
const FOG_DEPTH = 90
const FOG_SPAN = 9000
const WATER_COLOR = 0x0b2a45
const WATER_VIGNETTE = 0x1e6fd0
const BANK_COLOR = 0x54402a
const BANK_FAR_COLOR = 0x40301f

// 地图视觉（每张图一份，禁止 scene 认识任何一张具体的图）。
//
// 与 worlds.ts 的 WorldHooks 是同一个形状、同一套分工：那边收「本图与有界森林不同的
// **行为**」，这边收「本图与有界森林不同的**样子**」。scene 只握一个 MapView，
// 按接口调用；每张图自己实现自己需要的那几项，其余继承 BoundedView 的默认。
//
// 为什么是类而不是像 WorldHooks 那样的对象表：视觉状态是**每局一份**的（水纹贴图、
// 条带相机、传送门框、断壁石块…）。挂在模块级单例上就会跨局残留——那正是
// WorldState 当初要解决的问题。一局一个实例，状态就是实例字段，天然干净。

/** 视图能碰的东西。**不给整个 scene 的私有面**——视图只该建自己的视觉，不该反过来指挥场景 */
export interface ViewCtx {
  readonly scene: Phaser.Scene
  readonly world: EcsWorld
  readonly run: RunState
  readonly def: MapDef
  /** 队伍锚点（相机跟随目标） */
  readonly anchor: Phaser.GameObjects.Zone
  /** 世界尺寸：layout() 之后由场景回填 */
  w: number
  h: number
  /** 图集：boot 里烘好后由场景回填。视口变化早于它就位时为 undefined（装饰待 boot 铺） */
  atlas?: EcsAtlas
}

export interface MapView {
  /** 世界尺寸与出生点。**最先问**——建场、相机、makeSim 都要用 */
  layout(v: ViewCtx): { w: number; h: number; origin: Point }
  /** 建场：地面/水面/常驻视觉。此刻图集尚未就位，**不能建实体** */
  build(v: ViewCtx): void
  /** 相机：缩放 / 边界 / 跟随或居中 / 额外相机。在 anchor 就位之后 */
  camera(v: ViewCtx): void
  /** 图集就位后：铺本图的装饰实体 */
  decor(v: ViewCtx, atlas: EcsAtlas): void
  /** sim 建好后：往 worldState 写本图的世界状态（残垣在此铺断壁网格） */
  onSimReady(v: ViewCtx, sim: Sim): void
  /** 逐帧视觉（水纹滚动、夜雾、缩圈、传送门流光…） */
  step(v: ViewCtx, sim: Sim, delta: number): void
  /** 视口变化后重建（尺寸已由场景按新的 layout() 回填进 v.w/v.h） */
  resize(v: ViewCtx): void
  /** 收场 */
  destroy(v: ViewCtx): void
}

const CAM_MARGIN = () => MAP.cameraMargin * UNIT

/** 有界森林基线：纯色地面 + 右下阴影、相机外扩一圈跟人、全图按种子散布装饰。
 * 其余各图 extends 它，只覆写自己不同的那几项 */
export class BoundedView implements MapView {
  /** 本图建的 Phaser 视觉对象（视口重建时整体销毁） */
  protected visuals: Phaser.GameObjects.GameObject[] = []
  /** 本图铺的装饰实体（同上） */
  protected decorEids: number[] = []

  layout(v: ViewCtx): { w: number; h: number; origin: Point } {
    const w = (v.def.size?.w ?? MAP.width) * UNIT
    const h = (v.def.size?.h ?? MAP.height) * UNIT
    return { w, h, origin: { x: w / 2, y: h / 2 } }
  }

  build(v: ViewCtx): void {
    // 纯色面 + 右下阴影（镜像 drawFloor）
    const g = v.scene.add.graphics().setDepth(-1)
    const so = 0.25 * UNIT
    g.fillStyle(v.def.palette.shadow, 1)
    g.fillRect(so, so, v.w, v.h)
    g.fillStyle(v.def.palette.map, 1)
    g.fillRect(0, 0, v.w, v.h)
    this.visuals.push(g)
  }

  camera(v: ViewCtx): void {
    const cam = v.scene.cameras.main
    const m = CAM_MARGIN()
    cam.setZoom(viewport.renderScale)
    cam.setBounds(-m, -m, v.w + m * 2, v.h + m * 2)
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
    v.scene.cameras.main.setZoom(viewport.renderScale)
  }

  destroy(v: ViewCtx): void {
    for (const o of this.visuals) o.destroy()
    for (const eid of this.decorEids) removeEntity(v.world, eid)
    this.visuals = []
    this.decorEids = []
  }
}

/** 视口变化即整体重建的单屏图（奔流/工厂）：世界尺寸由视口推出，旧视觉全作废 */
abstract class SingleScreenView extends BoundedView {
  resize(v: ViewCtx): void {
    this.destroy(v)
    this.build(v)
    this.camera(v)
    // **destroy 把本图的装饰实体一并拆了，补回来是自己的事**——不能指望调用方接着补：
    // 世界尺寸没变时（工厂横屏内拉窗口）场景侧无事可做，就此早退，装饰便再也回不来
    if (v.atlas) this.decor(v, v.atlas)
  }
}


// ── 晨昏：有界基线 + 夜雾（反相遮罩在暗幕上挖出视野洞）──────────────
class DayNightView extends BoundedView {
  private fogRect?: Phaser.GameObjects.Rectangle
  private fogMask?: Phaser.GameObjects.Graphics

  build(v: ViewCtx): void {
    super.build(v)
    // Phaser 4 的 GeometryMask 在 WebGL 无实现，故走 filters.internal.addMask(shape, true)
    const rect = v.scene.add.rectangle(0, 0, FOG_SPAN, FOG_SPAN, FOG_COLOR, 0).setDepth(FOG_DEPTH).setVisible(false)
    const shape = v.scene.add.graphics().setVisible(false)
    rect.enableFilters()
    rect.filters?.internal.addMask(shape, true)
    this.fogRect = rect
    this.fogMask = shape
    this.visuals.push(rect, shape)
  }

  step(v: ViewCtx, sim: Sim, _delta: number): void {
    const dn = v.def.dayNight!
    const hour = hourAt((v.run.combatMs + sim.elapsedMs) / 1000, dn)
    // 视野 V 格 → zoom = 标准 ×(visionMid/V)
    v.scene.cameras.main.setZoom((viewport.renderScale * dn.visionMid) / visionGridsAt(hour, dn))
    const rect = this.fogRect
    const shape = this.fogMask
    if (!rect || !shape) return
    const alpha = fogAlphaAt(hour, dn)
    if (alpha <= 0.001) return void rect.setVisible(false)
    shape.clear()
    shape.fillStyle(0xffffff)
    shape.fillCircle(centerX(sim), centerY(sim), fogRadiusAt(hour, dn) * UNIT)
    rect.setPosition(centerX(sim), centerY(sim)).setFillStyle(FOG_COLOR, alpha).setVisible(true)
  }
}

// ── 浮冰：地图即那块方形浮冰，其外皆水；相机不设边界（滑进水里也跟着走）──
class IceView extends BoundedView {
  private vignette?: Phaser.GameObjects.Rectangle

  layout(v: ViewCtx): { w: number; h: number; origin: Point } {
    const px = v.def.ice!.floeU * UNIT
    return { w: px, h: px, origin: { x: px / 2, y: px / 2 } }
  }

  build(v: ViewCtx): void {
    // 深水底色铺满屏（相机锁定；世界无边界，看到哪都是水）
    this.visuals.push(
      v.scene.add
        .rectangle(viewport.logicalWidth / 2, viewport.logicalHeight / 2, 8000, 8000, WATER_COLOR)
        .setScrollFactor(0)
        .setDepth(-2),
    )
    super.build(v)
    // 冰缘：描出边界才读得出「哪里是浮冰」
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
    // 无边界：相机只管跟人（滑进水里、走到天边也跟着走）
    v.scene.cameras.main.setZoom(viewport.renderScale)
    v.scene.cameras.main.startFollow(v.anchor)
  }

  /** 队伍中心落水即脉冲蓝渐晕（掉血结算在纯逻辑侧的 worlds.ts tick） */
  step(v: ViewCtx, sim: Sim, _delta: number): void {
    const px = v.def.ice!.floeU * UNIT
    const inWater = !onFloe(centerX(sim), centerY(sim), px)
    this.vignette?.setFillStyle(WATER_VIGNETTE, inWater ? 0.18 + 0.06 * Math.sin(sim.elapsedMs / 140) : 0)
  }
}

// ── 无限世界：满屏底色当地面 + 出生在原点 + 装饰分块滚动 + 终波缩圈 ──────
class InfiniteView extends BoundedView {
  /** 分块装饰要在 step 里按相机位置增删，故把图集留下来 */
  protected atlas?: EcsAtlas
  private zoneGfx?: Phaser.GameObjects.Graphics
  private zoneVignette?: Phaser.GameObjects.Rectangle
  private chunks = new Map<string, number[]>()
  private rangeKey = ''

  layout(v: ViewCtx): { w: number; h: number; origin: Point } {
    const { w, h } = super.layout(v)
    return { w, h, origin: { x: 0, y: 0 } } // 无限世界出生在原点（负坐标合法）
  }

  build(v: ViewCtx): void {
    // 没有边、也就没有影子边缘——相机锁定的满屏底色即地面
    this.visuals.push(
      v.scene.add
        .rectangle(viewport.logicalWidth / 2, viewport.logicalHeight / 2, 8000, 8000, v.def.palette.map)
        .setScrollFactor(0)
        .setDepth(-1),
    )
  }

  camera(v: ViewCtx): void {
    v.scene.cameras.main.setZoom(viewport.renderScale)
    v.scene.cameras.main.startFollow(v.anchor)
  }

  /** 装饰不一次铺完（世界没有边）：留下图集，改由 step 按相机位置分块增删 */
  decor(_v: ViewCtx, atlas: EcsAtlas): void {
    this.atlas = atlas
  }

  step(v: ViewCtx, sim: Sim, _delta: number): void {
    this.ensureChunks(v)
    this.drawZone(v, sim)
  }

  /** 终波缩圈的圈线 + 圈外红渐晕（圈本体在 worldState.zone，纯逻辑侧算） */
  protected drawZone(v: ViewCtx, sim: Sim): void {
    const zone = sim.worldState.zone
    if (!zone) return
    if (!this.zoneGfx) {
      this.zoneGfx = v.scene.add.graphics().setDepth(2)
      this.zoneVignette = v.scene.add
        .rectangle(viewport.logicalWidth / 2, viewport.logicalHeight / 2, 6000, 6000, 0xd32f2f, 0)
        .setScrollFactor(0)
        .setDepth(90)
      this.visuals.push(this.zoneGfx, this.zoneVignette)
    }
    const g = this.zoneGfx
    g.clear()
    g.lineStyle(5, 0xef5350, 0.85)
    g.strokeCircle(zone.x, zone.y, zone.r)
    g.lineStyle(14, 0xd32f2f, 0.16)
    g.strokeCircle(zone.x, zone.y, zone.r + 9)
    const anyOutside = sim.characters.some(
      (m) => Alive.v[m] && outsideZone({ x: Transform.x[m]!, y: Transform.y[m]! }, zone, zone.r),
    )
    this.zoneVignette?.setFillStyle(0xd32f2f, anyOutside ? 0.16 + 0.08 * Math.sin(sim.elapsedMs / 130) : 0)
  }

  /** 视野覆盖的块集合变化时整组增删装饰实体。
   * 摆放由 chunkDecor 按 (种子, 块) 纯函数重建——回头看到的景不变 */
  private ensureChunks(v: ViewCtx): void {
    const atlas = this.atlas
    if (!atlas) return
    const cfg = v.def.infinite!
    const view = v.scene.cameras.main.worldView
    const need = chunksInRect(view.x / UNIT, view.y / UNIT, view.right / UNIT, view.bottom / UNIT, cfg.chunkCells, cfg.chunkPad)
    const first = need[0]!
    const last = need[need.length - 1]!
    const rangeKey = `${first.cx},${first.cy}:${last.cx},${last.cy}`
    if (rangeKey === this.rangeKey) return
    this.rangeKey = rangeKey
    const needKeys = new Set(need.map((c) => chunkKey(c.cx, c.cy)))
    for (const [key, eids] of this.chunks) {
      if (needKeys.has(key)) continue
      for (const eid of eids) removeEntity(v.world, eid)
      this.chunks.delete(key)
    }
    for (const c of need) {
      const key = chunkKey(c.cx, c.cy)
      if (this.chunks.has(key)) continue
      this.chunks.set(
        key,
        chunkDecor(v.def.decor, v.run.decorSeed, c.cx, c.cy, cfg.chunkCells).map((d) =>
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
        ),
      )
    }
  }

  destroy(v: ViewCtx): void {
    for (const eids of this.chunks.values()) for (const eid of eids) removeEntity(v.world, eid)
    this.chunks.clear()
    this.rangeKey = ''
    super.destroy(v)
  }
}

// ── 深空：无限地基 + 常驻黑洞禁锢圈 + 天体横扫的预警车道 ────────────────
class SpaceView extends InfiniteView {
  private meteorFx?: { of: number; tele: Phaser.GameObjects.Graphics }

  build(v: ViewCtx): void {
    super.build(v)
    const fieldR = (v.def.space?.blackholeRadiusU ?? 0) * UNIT
    if (fieldR <= 0) return
    const ring = v.scene.add.graphics().setDepth(2)
    ring.lineStyle(5, 0x9c6bff, 0.7)
    ring.strokeCircle(0, 0, fieldR)
    ring.lineStyle(18, 0x6a3fbf, 0.13)
    ring.strokeCircle(0, 0, fieldR - 9)
    this.visuals.push(ring)
  }

  camera(v: ViewCtx): void {
    super.camera(v)
    // 圆是有界的：bounds 钳在其外接框内
    const fieldR = (v.def.space?.blackholeRadiusU ?? 0) * UNIT
    if (fieldR <= 0) return
    const half = fieldR + MAP.cameraMargin * UNIT
    v.scene.cameras.main.setBounds(-half, -half, half * 2, half * 2)
  }

  step(v: ViewCtx, sim: Sim, delta: number): void {
    super.step(v, sim, delta)
    this.drawMeteorLane(v, sim)
  }

  /** 天体的预警车道。🪐 球体不在这里——它是横扫实体自己的贴图（z=60），批绘照常画。
   * 车道是一条粗线段，批绘不了，只能留作 Graphics；但它跟谁走由 **eid** 决定 */
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
      // 危险车道：宽半透明带 + 亮芯线 + 入口标记（球体从此侧划入）
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
    // 预警脉动：轨迹一明一暗；起划后淡下去，只留车道感
    cur.tele.setAlpha(sim.elapsedMs < Due.at[m]! ? 0.28 + 0.24 * Math.abs(Math.sin(sim.elapsedMs / 110)) : 0.22)
  }

  destroy(v: ViewCtx): void {
    this.meteorFx?.tele.destroy()
    this.meteorFx = undefined
    super.destroy(v)
  }
}

// ── 残垣：有界基线 + 断壁网格（逻辑）与逐格石块（视觉）────────────────
class RuinsView extends BoundedView {
  /** 格索引 → 该格的石块/顶沿视觉（碾墙时单格销毁） */
  private tiles = new Map<number, Phaser.GameObjects.Rectangle[]>()

  /** 断壁网格是**世界状态**，故在 sim 就位后铺；石块随之逐格画出 */
  onSimReady(v: ViewCtx, sim: Sim): void {
    const cfg = v.def.walls
    if (!cfg) return
    const cols = Math.round(v.w / UNIT)
    const rows = Math.round(v.h / UNIT)
    const rng = new Rng(v.run.decorSeed ^ 0x5eed)
    const blocked = generateRuins(() => rng.next(), cols, rows, {
      blocks: cfg.blocks,
      maxLen: cfg.maxLen,
      centerClearU: cfg.centerClearU,
    })
    const grid = new WallGrid(cols, rows, UNIT, blocked)
    // 只在「从中心可达」的通行格刷怪，保证敌人总能寻路到队伍
    const cells = [...reachableCells(grid, Math.floor(cols / 2), Math.floor(rows / 2))]
    sim.worldState.walls = { grid, flowCellX: -1, flowCellY: -1, reflowAcc: 0, spawnCells: cells, smashed: [] }
    // 逐格填充石块 + 顶沿提亮假高度（逐格存引用供碾墙单格销毁）
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

  /** 排空本帧被碾碎的断壁：拆石块 + 扬尘 */
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

// ── 奔流：单屏世界（世界 = 逻辑视口 × viewScale），相机居中不跟随 ──────────
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

    // 两岸暗带（河道以外的跨轴余量），外缘更暗给一点纵深
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

    // 河水：跨向「岸暗心亮」的两段渐变
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

    // 岸线浪花：贴岸白线 + 断续泡点（种子固定，同局重建不变）
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

    // 双层水纹（视差滚动）
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
    // 固定相机的单屏世界：居中锁死，不跟随
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

    // 岸上静态植被：沿长轴等距掷点（种子固定），只落在岸带内
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

    // 漂浮物（顺流循环）：会漂、会转的装饰实体，位姿逐帧由 driftDecor 从 u/cross 算出
    const pool = v.def.drift ?? ['1f343']
    const halfCross = (horizontal ? r.h : r.w) / 2
    for (let i = 0; i < cfg.driftCount; i++) {
      const cross = (Math.random() * 2 - 1) * halfCross * 0.92
      this.decorEids.push(
        spawnDriftDecor(
          v.world,
          atlas,
          {
            id: pool[Math.floor(Math.random() * pool.length)]!,
            outline: 'player',
            x: 0,
            y: 0,
            size: (0.35 + Math.random() * 0.25) * UNIT,
            alpha: 0.5,
            z: 1.5,
            spin: (Math.random() * 2 - 1) * 0.5,
          },
          {
            u: Math.random() * alongLen,
            cross,
            speedMul: driftSpeed(cross / halfCross, cfg, Math.random),
            swayPhase: Math.random() * Math.PI * 2,
            swayAmp: (0.06 + Math.random() * 0.12) * UNIT,
          },
        ),
      )
    }
  }

  /** 水纹贴图逐帧偏移。漂浮物不在此列——它们是装饰实体，归 driftDecor + spinDecor */
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

// ── 工厂（环面）：钢板地面 + 跨缝条带相机 + 传送闸口流光门框 ────────────
class TorusView extends SingleScreenView {
  private stripCams: Phaser.Cameras.Scene2D.Camera[] = []
  private frameTiles: { tile: Phaser.GameObjects.TileSprite; dx: number; dy: number }[] = []
  private frameGlow?: Phaser.GameObjects.Graphics

  layout(v: ViewCtx): { w: number; h: number; origin: Point } {
    const tc = v.def.torus!
    const landscape = viewport.logicalWidth >= viewport.logicalHeight
    const w = (landscape ? tc.arenaLong : tc.arenaShort) * UNIT
    const h = (landscape ? tc.arenaShort : tc.arenaLong) * UNIT
    return { w, h, origin: { x: w / 2, y: h / 2 } }
  }

  /** 静态视觉只画一份——条带相机全部忽略（见 camera），否则门框/地板会在缝上重影 */
  build(v: ViewCtx): void {
    const cfg = v.def.torus!
    const W = v.w
    const H = v.h
    const add = v.scene.add

    // 钢板厂房地面（中心朝亮的顶灯软渐变，避免硬边椭圆的「盘子感」）
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

    // 传送门门框：琥珀色警示光带顺时针流动（上→右→下→左）+ 脉动描边
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

  /** 主相机裁出屏内最大居中的竞技场定比矩形；四缝 + 四角各挂一台条带相机取景对侧溢出
   * ——跨缝实体两侧同时可见（渲染层的幽灵分身）。ECS 侧全场实体是同一个批绘对象，
   * 条带相机各自按自己的滚动再画一遍，天然成立 */
  camera(v: ViewCtx): void {
    const cfg = v.def.torus!
    const cw = Math.round(viewport.cssWidth * viewport.dpr)
    const ch = Math.round(viewport.cssHeight * viewport.dpr)
    const rect = fitAspectRect(cw, ch, v.w, v.h)
    const zoom = rect.w / v.w
    const cam = v.scene.cameras.main
    cam.setViewport(Math.round(rect.x), Math.round(rect.y), Math.round(rect.w), Math.round(rect.h))
    cam.setZoom(zoom)
    cam.centerOn(v.w / 2, v.h / 2)
    const s = cfg.strip * UNIT
    const sPx = Math.max(2, Math.round(s * zoom))
    const x0 = Math.round(rect.x)
    const y0 = Math.round(rect.y)
    const w = Math.round(rect.w)
    const h = Math.round(rect.h)
    const W = v.w
    const H = v.h
    const mk = (vx: number, vy: number, vw: number, vh: number, cx: number, cy: number): void => {
      const c = v.scene.cameras.add(vx, vy, vw, vh)
      c.setZoom(zoom)
      c.centerOn(cx, cy)
      this.stripCams.push(c)
    }
    // 屏幕左缘显示「越过右缝的溢出」（世界 x∈[W, W+s)），其余同理；四角为对角溢出
    mk(x0, y0, sPx, h, W + s / 2, H / 2)
    mk(x0 + w - sPx, y0, sPx, h, -s / 2, H / 2)
    mk(x0, y0, w, sPx, W / 2, H + s / 2)
    mk(x0, y0 + h - sPx, w, sPx, W / 2, -s / 2)
    mk(x0, y0, sPx, sPx, W + s / 2, H + s / 2)
    mk(x0 + w - sPx, y0, sPx, sPx, -s / 2, H + s / 2)
    mk(x0, y0 + h - sPx, sPx, sPx, W + s / 2, -s / 2)
    mk(x0 + w - sPx, y0 + h - sPx, sPx, sPx, -s / 2, -s / 2)
    // 静态视觉只画一份：条带相机全部忽略，否则门框/地板会在缝上重影。
    // **必须在建完条带相机之后**——ignore 是逐相机的，旧实现在 create 路径上先 build 后建相机，
    // 于是首次进图这一句作用在空数组上，缝上会重影，转屏重建后才正常
    for (const c of this.stripCams) c.ignore(this.visuals)
  }

  decor(v: ViewCtx, atlas: EcsAtlas): void {
    // 散落零件点缀（种子固定：同局重建不变）
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

  /** 门框逐帧动效：光带顺时针流动 + 边线脉动 */
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
    for (const c of this.stripCams) v.scene.cameras.remove(c)
    this.stripCams = []
    this.frameTiles = []
    this.frameGlow = undefined
    super.destroy(v)
  }
}

/** 无缝水纹贴图（按朝向各生成一次）：沿流向的白色弧形流痕。
 * 与「哪张图」无关的资产，全局纹理缓存，幂等 */
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

/** 门框虚线贴图（横/竖两个变体，一次生成）。同上，是资产不是视觉层 */
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
    // 一节亮虚线 + 留空（滚动后呈流动光点带）
    if (vertical) ctx.fillRect(th * 0.3, 10, th * 0.4, 14)
    else ctx.fillRect(10, th * 0.3, 14, th * 0.4)
    canvas.refresh()
  }
}

/** 颜色明暗缩放（河水跨向渐变用） */
function shade(color: number, mul: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * mul))
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * mul))
  const b = Math.min(255, Math.round((color & 0xff) * mul))
  return (r << 16) | (g << 8) | b
}

export function viewFor(mapId: MapId): MapView {
  return MAKE[MAPS[mapId].kind]()
}

/** kind → 视图工厂。**全映射**：MapDef 新增一种 kind 而不在此登记 = 编译不过 */
const MAKE: Record<MapDef['kind'], () => MapView> = {
  bounded: () => new BoundedView(),
  daynight: () => new DayNightView(),
  ruins: () => new RuinsView(),
  ice: () => new IceView(),
  river: () => new RiverView(),
  void: () => new TorusView(),
  space: () => new SpaceView(),
  infinite: () => new InfiniteView(),
}
