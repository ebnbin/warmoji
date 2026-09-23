import Phaser from 'phaser'
import { UNIT } from '../../util/units'
import { MAPS } from '../../data/maps'
import type { InfiniteConfig, ShrinkRingConfig } from '../../types/maps'
import { norm } from '../../util/vec'
import type { Point } from '../../util/vec'
import {
  chunkDecor,
  chunkKey,
  chunksInRect,
  outsideZone,
  ringPoint,
  zoneRadiusAt,
} from '../../arcade/maps/world'
import { emojiImage } from '../../emoji/textures'
import { viewport } from '../../util/apply'
import { ArcadeBattleScene } from '../ArcadeBattleScene'
import type { ImageObj } from '../ArcadeBattleScene'
import { setOverlayFill } from '../../util/fx'

// 没有边，出生在原点，负坐标合法
export class InfiniteScene extends ArcadeBattleScene {
  private decorChunks = new Map<string, ImageObj[]>()
  private decorRangeKey = ''
  private zoneCenter?: Point
  private zoneRadius = 0
  private zoneGfx?: Phaser.GameObjects.Graphics
  private zoneVignette?: Phaser.GameObjects.Rectangle
  private nextZoneTickAt = 0

  constructor(key = 'arenaInfinite') {
    super(key)
  }

  protected get infCfg(): InfiniteConfig {
    return MAPS[this.run.mapId].infinite!
  }

  private get ringCfg(): ShrinkRingConfig {
    return MAPS[this.run.mapId].shrinkRing!
  }

  protected resetWorldFields(): void {
    this.decorChunks = new Map()
    this.decorRangeKey = ''
    this.zoneCenter = undefined
    this.zoneRadius = 0
    this.zoneGfx = undefined
    this.zoneVignette = undefined
    this.nextZoneTickAt = 0
  }

  protected createWorld(): void {
    this.drawFloor()
    this.cameras.main.setZoom(viewport.renderScale)
  }

  /** 不设 bounds */
  protected attachCamera(target: Phaser.GameObjects.Zone): void {
    this.cameras.main.startFollow(target)
  }

  protected spawnCenter(): Point {
    return { x: 0, y: 0 }
  }

  /** 终波落点收进圈内 */
  protected spawnPoint(): Point {
    const p = ringPoint(this.rng, this.center, this.infCfg.spawnRingMin * UNIT, this.infCfg.spawnRingMax * UNIT)
    if (this.zoneCenter) {
      const limit = this.zoneRadius - UNIT
      if (limit > 0 && outsideZone(p, this.zoneCenter, limit)) {
        const dir = norm(p.x - this.zoneCenter.x, p.y - this.zoneCenter.y)
        return { x: this.zoneCenter.x + dir.x * limit, y: this.zoneCenter.y + dir.y * limit }
      }
    }
    return p
  }

  protected bossSpawnPoint(): Point {
    return ringPoint(this.rng, this.zoneCenter ?? this.center, 6 * UNIT, 8 * UNIT)
  }

  /** 以此刻队伍位置为圆心 */
  protected onFinalWaveSetup(): void {
    this.zoneCenter = { x: this.center.x, y: this.center.y }
    this.zoneRadius = this.ringCfg.r0 * UNIT
    this.zoneGfx = this.add.graphics().setDepth(2)
    this.zoneVignette = this.add
      .rectangle(viewport.logicalWidth / 2, viewport.logicalHeight / 2, 6000, 6000, 0xd32f2f, 0)
      .setScrollFactor(0)
      .setDepth(90)
    this.nextZoneTickAt = this.ringCfg.tickMs
  }

  /** 休眠者不可被索敌 */
  protected buildFrameTargets(): void {
    this.dormancyFrameTargets(this.infCfg.activeHalf * UNIT)
  }

  protected updateWorld(_delta: number): void {
    void _delta
    this.ensureChunks()
    this.updateZone()
  }

  protected postCreate(): void {
    this.ensureChunks()
  }

  protected debugExtras(): { dormant?: number; zoneRadius?: number } {
    return {
      dormant: this.dormantCount,
      zoneRadius: this.zoneCenter ? this.zoneRadius : undefined,
    }
  }

  // ── 地面与装饰分块 ──

  private drawFloor(): void {
    this.add
      .rectangle(viewport.logicalWidth / 2, viewport.logicalHeight / 2, 6000, 6000, this.palette.map)
      .setScrollFactor(0)
      .setDepth(0)
  }

  /** 摆放由 (种子, 块) 纯函数决定；块整组建/销毁 */
  private ensureChunks(): void {
    const view = this.cameras.main.worldView
    const cells = this.infCfg.chunkCells
    const need = chunksInRect(
      view.x / UNIT,
      view.y / UNIT,
      view.right / UNIT,
      view.bottom / UNIT,
      cells,
      this.infCfg.chunkPad,
    )
    const rangeKey = `${need[0]!.cx},${need[0]!.cy}:${need[need.length - 1]!.cx},${need[need.length - 1]!.cy}`
    if (rangeKey === this.decorRangeKey) return
    this.decorRangeKey = rangeKey
    const def = MAPS[this.run.mapId].decor
    const needKeys = new Set(need.map((c) => chunkKey(c.cx, c.cy)))
    for (const [key, sprites] of this.decorChunks) {
      if (needKeys.has(key)) continue
      for (const s of sprites) s.destroy()
      this.decorChunks.delete(key)
    }
    for (const c of need) {
      const key = chunkKey(c.cx, c.cy)
      if (this.decorChunks.has(key)) continue
      const sprites = chunkDecor(def, this.run.decorSeed, c.cx, c.cy, cells).map((d) =>
        emojiImage(this, d.xU * UNIT, d.yU * UNIT, d.emoji, d.sizeU * UNIT, 'player')
          .setAlpha(d.alpha)
          .setRotation(d.rotation)
          .setDepth(1),
      )
      this.decorChunks.set(key, sprites)
    }
  }

  // ── 终波缩圈 ──

  private updateZone(): void {
    const center = this.zoneCenter
    if (!center || !this.zoneGfx) return
    this.zoneRadius = zoneRadiusAt(this.elapsedMs, this.ringCfg) * UNIT
    const g = this.zoneGfx
    g.clear()
    g.lineStyle(5, 0xef5350, 0.85)
    g.strokeCircle(center.x, center.y, this.zoneRadius)
    g.lineStyle(14, 0xd32f2f, 0.16)
    g.strokeCircle(center.x, center.y, this.zoneRadius + 9)
    // 圈外只有队员掉血
    const anyOutside = this.members.some(
      (m) => m.alive && outsideZone({ x: m.image.x, y: m.image.y }, center, this.zoneRadius),
    )
    if (this.zoneVignette) {
      const pulse = 0.16 + 0.08 * Math.sin(this.elapsedMs / 130)
      setOverlayFill(this.zoneVignette, 0xd32f2f, anyOutside ? pulse : 0)
    }
    if (this.elapsedMs >= this.nextZoneTickAt) {
      this.nextZoneTickAt = this.elapsedMs + this.ringCfg.tickMs
      if (anyOutside) {
        for (const m of this.members) {
          if (!m.alive) continue
          if (outsideZone({ x: m.image.x, y: m.image.y }, center, this.zoneRadius)) {
            this.hurtMember(m, this.ringCfg.tickDamage, 0xef5350, '毒雾')
          }
        }
      }
    }
  }
}
