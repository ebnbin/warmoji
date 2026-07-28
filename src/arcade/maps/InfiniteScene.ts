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

// 无限竞技场（kind='infinite'）：世界没有边，出生在原点、负坐标合法。
// 世界规则：
// · 地面：相机锁定的满屏底色；装饰按 8×8 格分块随视野滚动增删（core/world.ts
//   纯函数按种子重建同一摆放，回头看到的景不变）
// · 休眠：以队伍中心为锚的活跃方形（按轴距离，半边长 this.infCfg.activeHalf），
//   出界敌人冻结（关物理体、不索敌、不占刷怪上限），回到范围自动唤醒
// · 刷怪：队伍中心外的环带（this.infCfg.spawnRingMin~Max）随机落点
// · 终波缩圈：以进波瞬间队伍位置为心，16 格缓缩到 12 格停（防风筝 Boss），
//   圈外队员按 tick 掉血 + 满屏红渐晕警示
export class InfiniteScene extends ArcadeBattleScene {
  // 装饰分块：活跃块 → 该块的装饰精灵；视野块范围变化才增删
  private decorChunks = new Map<string, ImageObj[]>()
  private decorRangeKey = ''
  // 终波缩圈（仅 Boss 波存在）
  private zoneCenter?: Point
  private zoneRadius = 0
  private zoneGfx?: Phaser.GameObjects.Graphics
  private zoneVignette?: Phaser.GameObjects.Rectangle
  private nextZoneTickAt = 0

  // 场景键可覆写：深空图复用整套无限世界规则（相机/分块/休眠/环带刷怪），叠加太空机制
  constructor(key = 'arenaInfinite') {
    super(key)
  }

  /** 无限世界特性配置（来自 MapDef 数据；无限/深空图必配 infinite）。protected 供深空子类复用 */
  protected get infCfg(): InfiniteConfig {
    return MAPS[this.run.mapId].infinite!
  }

  /** 终波缩圈配置（来自 MapDef 数据；荒漠图必配 shrinkRing） */
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
    // 无边界世界：物理世界不设边界（无任何 collideWorldBounds 消费者）
    this.drawFloor()
    this.cameras.main.setZoom(viewport.renderScale)
  }

  /** 相机：跟随但不设 bounds——世界没有边 */
  protected attachCamera(target: Phaser.GameObjects.Zone): void {
    this.cameras.main.startFollow(target)
  }

  protected spawnCenter(): Point {
    return { x: 0, y: 0 }
  }

  /** 环带随机点；终波把落点收进当前圈内（圈外刷怪毫无意义） */
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

  /** Boss 落在初始圈内的环带上 */
  protected bossSpawnPoint(): Point {
    return ringPoint(this.rng, this.zoneCenter ?? this.center, 6 * UNIT, 8 * UNIT)
  }

  /** 终波：缩圈以此刻队伍位置为圆心张开 */
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

  /** 休眠分区：冻结/唤醒 + 活跃计数 + 本帧攻击目标（休眠怪不可被索敌） */
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

  // ── 地面与装饰分块 ──────────────────────────────────────────

  /** 无限地面 = 相机锁定的满屏底色（世界没有边，也就没有影子边缘） */
  private drawFloor(): void {
    this.add
      .rectangle(viewport.logicalWidth / 2, viewport.logicalHeight / 2, 6000, 6000, this.palette.map)
      .setScrollFactor(0)
      .setDepth(0)
  }

  /** 装饰分块滚动：视野覆盖的块集合变化时增删（core/world.ts 纯函数按
   * 种子重建同一摆放；块整组建/销毁，软渲染下避免逐帧细碎增删） */
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

  // ── 终波缩圈 ────────────────────────────────────────────────

  private updateZone(): void {
    const center = this.zoneCenter
    if (!center || !this.zoneGfx) return
    this.zoneRadius = zoneRadiusAt(this.elapsedMs, this.ringCfg) * UNIT
    // 圈渲染：亮边界环 + 内侧安全提示描边
    const g = this.zoneGfx
    g.clear()
    g.lineStyle(5, 0xef5350, 0.85)
    g.strokeCircle(center.x, center.y, this.zoneRadius)
    g.lineStyle(14, 0xd32f2f, 0.16)
    g.strokeCircle(center.x, center.y, this.zoneRadius + 9)
    // 圈外队员：红色渐晕 + 按 tick 掉血（敌人不受圈伤）
    const anyOutside = this.members.some(
      (m) => m.alive && outsideZone({ x: m.image.x, y: m.image.y }, center, this.zoneRadius),
    )
    if (this.zoneVignette) {
      const pulse = 0.16 + 0.08 * Math.sin(this.elapsedMs / 130)
      this.zoneVignette.setFillStyle(0xd32f2f, anyOutside ? pulse : 0)
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
