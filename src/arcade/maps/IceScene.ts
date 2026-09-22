import Phaser from 'phaser'
import { UNIT } from '../../util/units'
import { SPAWN } from '../../data/enemies'
import { PICKUPS } from '../../data/pickups'
import { MAPS, rollDecor } from '../../data/maps'
import { Rng } from '../../util/rng'
import { randomMapPoint } from '../../arcade/enemy/ai'
import { emojiImage } from '../../emoji/textures'
import { viewport } from '../../util/apply'
import { enemyOf } from '../enemy/enemies'
import { approach, onFloe } from '../../arcade/maps/ice'
import type { IceConfig } from '../../types/maps'
import { ArcadeBattleScene } from '../ArcadeBattleScene'
import type { ArcadeBody, ImageObj } from '../ArcadeBattleScene'
import type { Enemy } from '../enemy/enemies'
import type { Point } from '../../util/vec'

const WATER_COLOR = 0x0b2a45

// 相机无边界，滑进水里也跟随
export class IceScene extends ArcadeBattleScene {
  // 世界像素/秒
  private tvx = 0
  private tvy = 0
  // teamDrift 每帧最先调用，在此捕获 dt 供后续钩子用
  private frameDt = 16
  private nextWaterTickAt = 0
  private slide = new WeakMap<Enemy, { x: number; y: number }>()
  private waterVignette?: Phaser.GameObjects.Rectangle

  constructor() {
    super('arenaIce')
  }

  private get iceCfg(): IceConfig {
    return MAPS[this.run.mapId].ice!
  }

  private get floePx(): number {
    return this.iceCfg.floeU * UNIT
  }

  protected resetWorldFields(): void {
    this.tvx = 0
    this.tvy = 0
    this.frameDt = 16
    this.nextWaterTickAt = this.iceCfg.waterTickMs
    this.slide = new WeakMap()
    this.waterVignette = undefined
  }

  protected createWorld(): void {
    const size = this.floePx
    this.add
      .rectangle(viewport.logicalWidth / 2, viewport.logicalHeight / 2, 8000, 8000, WATER_COLOR)
      .setScrollFactor(0)
      .setDepth(-2)
    const g = this.add.graphics().setDepth(-1)
    const so = 0.25 * UNIT
    g.fillStyle(this.palette.shadow, 1)
    g.fillRect(so, so, size, size)
    g.fillStyle(this.palette.map, 1)
    g.fillRect(0, 0, size, size)
    g.lineStyle(3, 0xdff3ff, 0.85)
    g.strokeRect(0, 0, size, size)
    this.drawDecor()
    this.waterVignette = this.add
      .rectangle(viewport.logicalWidth / 2, viewport.logicalHeight / 2, 8000, 8000, 0x1e6fd0, 0)
      .setScrollFactor(0)
      .setDepth(90)
    // 不设 physics/camera bounds
    this.cameras.main.setZoom(viewport.renderScale)
  }

  protected attachCamera(target: Phaser.GameObjects.Zone): void {
    this.cameras.main.startFollow(target)
  }

  protected spawnCenter(): Point {
    return { x: this.floePx / 2, y: this.floePx / 2 }
  }

  protected spawnPoint(): Point {
    return randomMapPoint(
      this.rng,
      this.floePx,
      this.floePx,
      SPAWN.edgeInset * UNIT,
      this.center,
      SPAWN.minPlayerDist * UNIT,
    )
  }

  protected bossSpawnPoint(): Point {
    return randomMapPoint(
      this.rng,
      this.floePx,
      this.floePx,
      2 * UNIT,
      this.center,
      SPAWN.minPlayerDist * UNIT * 1.6,
    )
  }

  protected spawnCapCount(): number {
    return this.enemies.countActive(true)
  }

  /** 只捕获本帧 dt */
  protected teamDrift(delta: number): Point {
    this.frameDt = delta
    return { x: 0, y: 0 }
  }

  /** 不钳制，可滑出浮冰落水 */
  protected constrainTeam(next: Point): Point {
    const dt = this.frameDt / 1000
    if (dt <= 0) return { x: this.center.x, y: this.center.y }
    const desVx = (next.x - this.center.x) / dt
    const desVy = (next.y - this.center.y) / dt
    const ice = onFloe(this.center.x, this.center.y, this.floePx)
    const tau = ice ? this.iceCfg.teamTauIce : this.iceCfg.teamTauWater
    const mul = ice ? 1 : this.iceCfg.waterSpeedMul
    this.tvx = approach(this.tvx, desVx * mul, dt, tau)
    this.tvy = approach(this.tvy, desVy * mul, dt, tau)
    return { x: this.center.x + this.tvx * dt, y: this.center.y + this.tvy * dt }
  }

  protected knockbackTauMul(): number {
    return this.iceCfg.knockbackTauMul
  }

  protected postSteerEnemy(e: ImageObj, body: ArcadeBody): void {
    this.slideEntity(e, body)
  }

  protected postSteerBoss(e: ImageObj, body: ArcadeBody): void {
    this.slideEntity(e, body)
  }

  private slideEntity(e: ImageObj, body: ArcadeBody): void {
    const dt = this.frameDt / 1000
    if (dt <= 0) return
    const a = enemyOf(e)
    let sv = this.slide.get(a)
    if (!sv) {
      sv = { x: 0, y: 0 }
      this.slide.set(a, sv)
    }
    // 击退不进低通，只对行为速度打滑
    const kx = a.kvx
    const ky = a.kvy
    const ice = onFloe(e.x, e.y, this.floePx)
    const tau = ice ? this.iceCfg.enemyTauIce : this.iceCfg.teamTauWater
    const mul = ice ? 1 : this.iceCfg.waterSpeedMul
    sv.x = approach(sv.x, (body.velocity.x - kx) * mul, dt, tau)
    sv.y = approach(sv.y, (body.velocity.y - ky) * mul, dt, tau)
    body.setVelocity(sv.x + kx, sv.y + ky)
  }

  constrainCoinPos(p: Point): Point {
    const r = PICKUPS.coin.radius * UNIT
    return {
      x: Phaser.Math.Clamp(p.x, r, this.floePx - r),
      y: Phaser.Math.Clamp(p.y, r, this.floePx - r),
    }
  }

  cullEnemyProjectile(s: ImageObj): boolean {
    const m = 6 * UNIT
    return s.x < -m || s.x > this.floePx + m || s.y < -m || s.y > this.floePx + m
  }

  protected updateWorld(delta: number): void {
    this.frameDt = delta
    this.updateWater()
  }

  /** 敌我通吃 */
  private updateWater(): void {
    const teamInWater = !onFloe(this.center.x, this.center.y, this.floePx)
    if (this.waterVignette) {
      const a = teamInWater ? 0.18 + 0.06 * Math.sin(this.elapsedMs / 140) : 0
      this.waterVignette.setFillStyle(0x1e6fd0, a)
    }
    if (this.elapsedMs < this.nextWaterTickAt) return
    this.nextWaterTickAt = this.elapsedMs + this.iceCfg.waterTickMs
    const frac = this.iceCfg.waterTickMs / 1000
    if (teamInWater) {
      const dmg = Math.round(this.iceCfg.waterTeamDps * frac)
      for (const m of this.members) if (m.alive) this.hurtMember(m, dmg, 0x4fc3f7, '寒水')
    }
    const edmg = Math.round(this.iceCfg.waterEnemyDps * frac)
    for (const e of this.enemies.getChildren() as ImageObj[]) {
      if (!e.active) continue
      const a = enemyOf(e)
      if (a.dormant) continue
      if (!onFloe(e.x, e.y, this.floePx)) this.applyDamage(e, edmg)
    }
  }

  /** 只铺在冰面上 */
  private drawDecor(): void {
    const rng = new Rng(this.run.decorSeed)
    for (const d of rollDecor(MAPS[this.run.mapId].decor, () => rng.next(), this.iceCfg.floeU, this.iceCfg.floeU)) {
      emojiImage(this, d.xU * UNIT, d.yU * UNIT, d.emoji, d.sizeU * UNIT, 'player')
        .setAlpha(d.alpha)
        .setRotation(d.rotation)
        .setDepth(0)
    }
  }
}
