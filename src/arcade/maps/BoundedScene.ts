import Phaser from 'phaser'
import { MEMBER, TEAM } from '../../data/characters'
import { AI, SPAWN } from '../../data/enemies'
import type { EnemyMixEntry } from '../../types/enemies'
import { PICKUPS } from '../../data/pickups'
import { UNIT } from '../../util/units'
import { MAP } from '../../data/maps'

import { MAPS, rollDecor } from '../../data/maps'
import type { DayNightConfig, WallsConfig } from '../../types/maps'
import { fogAlphaAt, fogRadiusAt, hourAt, isDayAt, visionGridsAt } from '../../arcade/maps/daynight'
import { FlowField, WallGrid, generateRuins, reachableCells } from '../../arcade/maps/ruins'
import { enemyOf } from '../enemy/enemies'
import { abilityPiercesWalls } from '../../data/abilities'
import type { AbilityDef } from '../../types/abilityDefs'
import type { AbilityContext } from '../abilities/types'
import { Rng } from '../../util/rng'
import { randomMapPoint } from '../../arcade/enemy/ai'
import type { Point } from '../../util/vec'
import { emojiImage } from '../../emoji/textures'
import { viewport } from '../../util/apply'
import { ArcadeBattleScene } from '../ArcadeBattleScene'
import type { ArcadeBody, ImageObj } from '../ArcadeBattleScene'
import type { Enemy } from '../enemy/enemies'
import { enemyMixAt, fleeSteer } from '../../arcade/enemy/ai'

const FOG_COLOR = 0x0a0a1a
const FOG_DEPTH = 90
// 须大于最大视野；世界坐标
const FOG_SPAN = 9000

export class BoundedScene extends ArcadeBattleScene {
  private fogRect?: Phaser.GameObjects.Rectangle
  private fogMaskShape?: Phaser.GameObjects.Graphics
  private lastDay = true

  private wallGrid?: WallGrid
  private flow?: FlowField
  private flowCellX = -1
  private flowCellY = -1
  private reflowAcc = 0
  private spawnCells: number[] = []
  private wallGroup?: Phaser.Physics.Arcade.StaticGroup
  private readonly wallTiles = new Map<number, Phaser.GameObjects.GameObject[]>()
  private wallCols = 0
  private wallRows = 0

  constructor(key = 'arena') {
    super(key)
  }

  protected get mapDef() {
    return MAPS[this.run.mapId]
  }
  /** 存在即启用 */
  private get dayNight(): DayNightConfig | undefined {
    return this.mapDef.dayNight
  }
  /** 存在即启用 */
  private get wallsCfg(): WallsConfig | undefined {
    return this.mapDef.walls
  }

  protected get mapW(): number {
    return (MAPS[this.run.mapId].size?.w ?? MAP.width) * UNIT
  }
  protected get mapH(): number {
    return (MAPS[this.run.mapId].size?.h ?? MAP.height) * UNIT
  }
  protected get margin(): number {
    return MAP.cameraMargin * UNIT
  }

  protected createWorld(): void {
    this.physics.world.setBounds(0, 0, this.mapW, this.mapH)
    this.drawFloor()
    this.drawDecor()
    const cam = this.cameras.main
    cam.setZoom(viewport.renderScale)
    cam.setBounds(
      -this.margin,
      -this.margin,
      this.mapW + this.margin * 2,
      this.mapH + this.margin * 2,
    )
    if (this.dayNight) this.createFog()
    if (this.wallsCfg) this.createWalls()
  }

  protected postCreate(): void {
    super.postCreate()
    // 穿墙与破墙的敌人不吃墙碰撞
    if (this.wallGroup) {
      this.physics.add.collider(this.enemies, this.wallGroup, undefined, (e) => {
        const a = enemyOf(e as ImageObj)
        return !a.def.phasesWalls && !a.def.breaksWalls
      })
    }
  }

  protected resetWorldFields(): void {
    this.fogRect = undefined
    this.fogMaskShape = undefined
    this.lastDay = true
    this.wallGrid = undefined
    this.flow = undefined
    this.flowCellX = -1
    this.flowCellY = -1
    this.reflowAcc = 0
    this.spawnCells = []
    this.wallGroup = undefined
    this.wallTiles.clear()
  }

  protected attachCamera(target: Phaser.GameObjects.Zone): void {
    this.cameras.main.startFollow(target)
  }

  protected spawnCenter(): Point {
    return { x: this.mapW / 2, y: this.mapH / 2 }
  }

  protected spawnPoint(): Point {
    // 刷怪点须从中心可达
    const cfg = this.wallsCfg
    if (cfg) return this.pickSpawn(cfg.spawnMinCellDist)
    return randomMapPoint(
      this.rng,
      this.mapW,
      this.mapH,
      SPAWN.edgeInset * UNIT,
      this.center,
      SPAWN.minPlayerDist * UNIT,
    )
  }

  protected bossSpawnPoint(): Point {
    const cfg = this.wallsCfg
    if (cfg) return this.pickSpawn(cfg.spawnMinCellDist + 2)
    return randomMapPoint(
      this.rng,
      this.mapW,
      this.mapH,
      2 * UNIT,
      this.center,
      SPAWN.minPlayerDist * UNIT * 1.6,
    )
  }

  // ── dayNight 特性 ──

  private createFog(): void {
    const dn = this.dayNight!
    this.fogRect = this.add
      .rectangle(0, 0, FOG_SPAN, FOG_SPAN, FOG_COLOR, 0)
      .setDepth(FOG_DEPTH)
      .setVisible(false)
    // Phaser 4 的 GeometryMask 在 WebGL 无实现，须走 filters.internal.addMask
    this.fogMaskShape = this.add.graphics().setVisible(false)
    this.fogRect.enableFilters()
    this.fogRect.filters?.internal.addMask(this.fogMaskShape, true)
    this.lastDay = isDayAt(hourAt(this.run.combatMs / 1000, dn))
  }

  private clockHour(): number {
    return hourAt((this.run.combatMs + this.elapsedMs) / 1000, this.dayNight!)
  }

  protected buildEnemyMix(): EnemyMixEntry[] {
    const dn = this.dayNight
    if (!dn) return super.buildEnemyMix()
    const m = this.mapDef
    const rows = (isDayAt(this.clockHour()) ? m.dayMix : m.nightMix) ?? m.mix
    return enemyMixAt(rows, this.sandbox ? 10 : this.run.wave)
  }

  protected spawnIntervalScale(): number {
    const dn = this.dayNight
    return dn ? (isDayAt(this.clockHour()) ? dn.daySpawnScale : dn.nightSpawnScale) : 1
  }

  protected updateWorld(delta: number): void {
    const dn = this.dayNight
    if (dn) {
      const hour = this.clockHour()
      this.cameras.main.setZoom((viewport.renderScale * dn.visionMid) / visionGridsAt(hour, dn))
      this.updateFog(hour)
      const day = isDayAt(hour)
      if (day !== this.lastDay) {
        this.lastDay = day
        this.enemyMix = this.buildEnemyMix()
      }
    }
    this.reflowWalls(delta)
  }

  private updateFog(hour: number): void {
    const rect = this.fogRect
    const shape = this.fogMaskShape
    const dn = this.dayNight
    if (!rect || !shape || !dn) return
    const alpha = fogAlphaAt(hour, dn)
    if (alpha <= 0.001) {
      rect.setVisible(false)
      return
    }
    const r = fogRadiusAt(hour, dn) * UNIT
    shape.clear()
    shape.fillStyle(0xffffff)
    shape.fillCircle(this.center.x, this.center.y, r)
    rect.setPosition(this.center.x, this.center.y).setFillStyle(FOG_COLOR, alpha).setVisible(true)
  }

  // ── walls 特性 ──

  private createWalls(): void {
    const cfg = this.wallsCfg!
    this.wallCols = Math.round(this.mapW / UNIT)
    this.wallRows = Math.round(this.mapH / UNIT)
    const rng = new Rng(this.run.decorSeed ^ 0x5eed)
    const blocked = generateRuins(() => rng.next(), this.wallCols, this.wallRows, {
      blocks: cfg.blocks,
      maxLen: cfg.maxLen,
      centerClearU: cfg.centerClearU,
    })
    this.wallGrid = new WallGrid(this.wallCols, this.wallRows, UNIT, blocked)
    // 刷怪点须从中心可达
    const midCx = Math.floor(this.wallCols / 2)
    const midCy = Math.floor(this.wallRows / 2)
    this.spawnCells = [...reachableCells(this.wallGrid, midCx, midCy)]
    this.drawWalls(blocked)
  }

  /** 逐格存引用供碾墙单格销毁 */
  private drawWalls(blocked: readonly boolean[]): void {
    const cols = this.wallCols
    const rows = this.wallRows
    const base = Phaser.Display.Color.IntegerToColor(this.palette.map).darken(38).color
    const top = Phaser.Display.Color.IntegerToColor(this.palette.map).darken(18).color
    const capH = Math.max(3, UNIT * 0.22)
    this.wallGroup = this.physics.add.staticGroup()
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        if (!blocked[cy * cols + cx]) continue
        const cxp = cx * UNIT + UNIT / 2
        const cyp = cy * UNIT + UNIT / 2
        const body = this.add.rectangle(cxp, cyp, UNIT - 2, UNIT - 2, base).setDepth(2)
        const cap = this.add.rectangle(cxp, cy * UNIT + 1 + capH / 2, UNIT - 2, capH, top).setDepth(2.1)
        const z = this.add.zone(cxp, cyp, UNIT, UNIT)
        this.wallGroup.add(z)
        this.wallTiles.set(cy * cols + cx, [body, cap, z])
      }
    }
  }

  smashWallAt(x: number, y: number): void {
    const grid = this.wallGrid
    if (!grid) return
    const cx = grid.cellX(x)
    const cy = grid.cellY(y)
    if (!grid.isBlockedCell(cx, cy)) return
    grid.setBlocked(cx, cy, false)
    const idx = cy * this.wallCols + cx
    const objs = this.wallTiles.get(idx)
    if (objs) {
      for (const o of objs) o.destroy()
      this.wallTiles.delete(idx)
    }
    this.dust((cx + 0.5) * UNIT, (cy + 0.5) * UNIT)
    this.flowCellX = -1 // 逼下帧重算流场
  }

  private dust(x: number, y: number): void {
    const c = this.add.circle(x, y, UNIT * 0.4, 0xbcae95, 0.6).setDepth(5)
    this.tweens.add({ targets: c, scale: 1.8, alpha: 0, duration: 320, onComplete: () => c.destroy() })
  }

  private pickSpawn(minCellDist: number): Point {
    const grid = this.wallGrid!
    if (this.spawnCells.length === 0) return this.spawnCenter()
    const ccx = grid.cellX(this.center.x)
    const ccy = grid.cellY(this.center.y)
    const min2 = minCellDist * minCellDist
    let fallback = this.cellCenter(this.spawnCells[0]!)
    for (let i = 0; i < 24; i++) {
      const idx = this.spawnCells[Math.floor(this.rng.next() * this.spawnCells.length)]!
      const cx = idx % this.wallCols
      const cy = Math.floor(idx / this.wallCols)
      const p = this.cellCenter(idx)
      fallback = p
      const dx = cx - ccx
      const dy = cy - ccy
      if (dx * dx + dy * dy >= min2) return p
    }
    return fallback
  }

  private cellCenter(idx: number): Point {
    const cx = idx % this.wallCols
    const cy = Math.floor(idx / this.wallCols)
    return { x: (cx + 0.5) * UNIT, y: (cy + 0.5) * UNIT }
  }

  /** 不可达时回退直线 */
  chaseDir(a: Enemy, to: Point): Point {
    const grid = this.wallGrid
    if (!grid || a.def.phasesWalls) return super.chaseDir(a, to)
    const dir = this.flow?.sampleDir(a.image.x, a.image.y)
    if (dir && (dir.x !== 0 || dir.y !== 0)) return dir
    return super.chaseDir(a, to)
  }

  wallHit(a: Point, b: Point): Point | null {
    return this.wallGrid?.segmentHit(a.x, a.y, b.x, b.y) ?? null
  }

  protected wallAwareCtx(def: AbilityDef, base: AbilityContext, slot: number): AbilityContext {
    const grid = this.wallGrid
    if (!grid || abilityPiercesWalls(def)) return base
    return {
      ...base,
      targets: () => {
        const m = this.members[slot]
        const all = base.targets()
        if (!m) return all
        const from = m.image
        return all.filter((t) => grid.segmentHit(from.x, from.y, t.x, t.y) === null)
      },
    }
  }

  private reflowWalls(delta: number): void {
    const grid = this.wallGrid
    if (!grid) return
    this.reflowAcc += delta
    const cx = grid.cellX(this.center.x)
    const cy = grid.cellY(this.center.y)
    if (cx !== this.flowCellX || cy !== this.flowCellY || this.reflowAcc >= this.wallsCfg!.reflowMs) {
      this.flow = new FlowField(grid, cx, cy)
      this.flowCellX = cx
      this.flowCellY = cy
      this.reflowAcc = 0
    }
  }

  protected spawnCapCount(): number {
    return this.enemies.countActive(true)
  }

  protected constrainTeam(next: Point): Point {
    // 整环都留在图内
    const clampMin = (TEAM.ringRadius + MEMBER.radius) * UNIT
    const box = {
      x: Phaser.Math.Clamp(next.x, clampMin, this.mapW - clampMin),
      y: Phaser.Math.Clamp(next.y, clampMin, this.mapH - clampMin),
    }
    // 先盒子钳制，再贴墙滑动
    return this.wallGrid ? this.wallGrid.resolveMove(this.center.x, this.center.y, box.x, box.y) : box
  }

  protected configureEnemyBody(enemy: ImageObj): void {
    ;(enemy.body as ArcadeBody).setCollideWorldBounds(true)
  }

  protected configureBossBody(enemy: ImageObj): void {
    ;(enemy.body as ArcadeBody).setCollideWorldBounds(true)
  }

  protected constrainEnemyPos(p: Point): Point {
    return {
      x: Phaser.Math.Clamp(p.x, 0, this.mapW),
      y: Phaser.Math.Clamp(p.y, 0, this.mapH),
    }
  }

  constrainCoinPos(p: Point): Point {
    const r = PICKUPS.coin.radius * UNIT // 整枚币都留在图内
    return {
      x: Phaser.Math.Clamp(p.x, r, this.mapW - r),
      y: Phaser.Math.Clamp(p.y, r, this.mapH - r),
    }
  }

  constrainShardTarget(p: Point): Point {
    return {
      x: Phaser.Math.Clamp(p.x, 0, this.mapW),
      y: Phaser.Math.Clamp(p.y, 0, this.mapH),
    }
  }

  wanderDir(a: Enemy): Point {
    if (this.elapsedMs >= a.turnAt) {
      const ang = this.rng.next() * Math.PI * 2
      a.dirX = Math.cos(ang)
      a.dirY = Math.sin(ang)
      a.turnAt = this.elapsedMs + AI.wander.turnMinMs + this.rng.next() * AI.wander.turnJitterMs
    }
    const e = a.image
    let dx = a.dirX
    let dy = a.dirY
    const margin = 0.6 * UNIT
    if ((e.x < margin && dx < 0) || (e.x > this.mapW - margin && dx > 0)) dx = -dx
    if ((e.y < margin && dy < 0) || (e.y > this.mapH - margin && dy > 0)) dy = -dy
    a.dirX = dx
    a.dirY = dy
    const grid = this.wallGrid
    if (grid && grid.pointBlocked(e.x + dx * 0.8 * UNIT, e.y + dy * 0.8 * UNIT)) {
      a.dirX = -dx
      a.dirY = -dy
      return { x: -dx, y: -dy }
    }
    return { x: dx, y: dy }
  }

  fleeDir(a: Enemy, away: Point): Point {
    return fleeSteer(a.image.x, a.image.y, away.x, away.y, this.mapW, this.mapH, 1.5 * UNIT)
  }

  cullEnemyProjectile(s: ImageObj): boolean {
    const off = s.x < -UNIT || s.x > this.mapW + UNIT || s.y < -UNIT || s.y > this.mapH + UNIT
    // 进墙也销毁
    return off || (this.wallGrid ? this.wallGrid.pointBlocked(s.x, s.y) : false)
  }

  private drawFloor(): void {
    const g = this.add.graphics()
    const shadowOffset = 0.25 * UNIT
    g.fillStyle(this.palette.shadow, 1)
    g.fillRect(shadowOffset, shadowOffset, this.mapW, this.mapH)
    g.fillStyle(this.palette.map, 1)
    g.fillRect(0, 0, this.mapW, this.mapH)
  }

  /** 按 run 种子生成，同局各波不变；depth 1 在毒液池（2）之下 */
  private drawDecor(): void {
    const rng = new Rng(this.run.decorSeed)
    const cols = Math.round(this.mapW / UNIT)
    const rows = Math.round(this.mapH / UNIT)
    for (const d of rollDecor(MAPS[this.run.mapId].decor, () => rng.next(), cols, rows)) {
      emojiImage(this, d.xU * UNIT, d.yU * UNIT, d.emoji, d.sizeU * UNIT, 'player')
        .setAlpha(d.alpha)
        .setRotation(d.rotation)
        .setDepth(1)
    }
  }
}
