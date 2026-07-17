import Phaser from 'phaser'
import { COIN, MAP, MEMBER, SPAWN, TEAM, UNIT } from '../core/config'
import { fleeSteer } from '../core/enemies'
import { MAPS, rollDecor } from '../core/maps'
import { Rng } from '../core/rng'
import { randomMapPoint } from '../core/spawn'
import type { Point } from '../core/vec'
import { waveDurationMs } from '../core/waves'
import { emojiImage } from '../ui/emoji'
import { viewport } from '../ui/viewport'
import { BaseArenaScene } from './BaseArenaScene'
import type { ArcadeBody, ImageObj } from './BaseArenaScene'

// 有界竞技场（kind='bounded'）：25×25 格矩形地图 + 相机跟随。
// 世界规则：四周硬墙——队伍/敌人/Boss 钳制在图内，游荡撞边折返、
// 逃跑贴边沿墙滑行，敌弹与金币不出图。战斗引擎全在 BaseArenaScene。
export class ArenaScene extends BaseArenaScene {
  constructor() {
    super('arena')
  }

  protected createWorld(): void {
    this.physics.world.setBounds(0, 0, MAP.width, MAP.height)
    this.drawFloor()
    this.drawDecor()
    const cam = this.cameras.main
    cam.setZoom(viewport.renderScale)
    cam.setBounds(
      -MAP.cameraMargin,
      -MAP.cameraMargin,
      MAP.width + MAP.cameraMargin * 2,
      MAP.height + MAP.cameraMargin * 2,
    )
  }

  protected attachCamera(target: Phaser.GameObjects.Zone): void {
    this.cameras.main.startFollow(target)
  }

  protected spawnCenter(): Point {
    return { x: MAP.width / 2, y: MAP.height / 2 }
  }

  protected spawnPoint(): Point {
    return randomMapPoint(
      this.rng,
      MAP.width,
      MAP.height,
      SPAWN.edgeInset,
      this.center,
      SPAWN.minPlayerDist,
    )
  }

  protected bossSpawnPoint(): Point {
    return randomMapPoint(
      this.rng,
      MAP.width,
      MAP.height,
      2 * UNIT,
      this.center,
      SPAWN.minPlayerDist * 1.6,
    )
  }

  protected finalWaveWarningSub(): string {
    return `击败它，或撑过 ${Math.round(waveDurationMs(this.run.wave) / 1000)} 秒！`
  }

  /** 刷怪上限按实时活跃数（有界图无休眠，全场敌人都算） */
  protected spawnCapCount(): number {
    return this.enemies.countActive(true)
  }

  protected constrainTeam(next: Point): Point {
    const clampMin = TEAM.ringRadius + MEMBER.radius
    return {
      x: Phaser.Math.Clamp(next.x, clampMin, MAP.width - clampMin),
      y: Phaser.Math.Clamp(next.y, clampMin, MAP.height - clampMin),
    }
  }

  protected configureEnemyBody(enemy: ImageObj): void {
    ;(enemy.body as ArcadeBody).setCollideWorldBounds(true)
  }

  protected configureBossBody(enemy: ImageObj): void {
    ;(enemy.body as ArcadeBody).setCollideWorldBounds(true)
  }

  protected constrainEnemyPos(p: Point): Point {
    return {
      x: Phaser.Math.Clamp(p.x, 0, MAP.width),
      y: Phaser.Math.Clamp(p.y, 0, MAP.height),
    }
  }

  protected constrainCoinPos(p: Point): Point {
    return {
      x: Phaser.Math.Clamp(p.x, COIN.radius, MAP.width - COIN.radius),
      y: Phaser.Math.Clamp(p.y, COIN.radius, MAP.height - COIN.radius),
    }
  }

  protected constrainShardTarget(p: Point): Point {
    return {
      x: Phaser.Math.Clamp(p.x, 0, MAP.width),
      y: Phaser.Math.Clamp(p.y, 0, MAP.height),
    }
  }

  /** 游荡撞边折返：接近地图边缘时翻转对应方向分量 */
  protected wanderDir(e: ImageObj): Point {
    if (this.elapsedMs >= (e.getData('turnAt') as number)) {
      const a = this.rng.next() * Math.PI * 2
      e.setData('dirX', Math.cos(a))
      e.setData('dirY', Math.sin(a))
      e.setData('turnAt', this.elapsedMs + 800 + this.rng.next() * 1200)
    }
    let dx = e.getData('dirX') as number
    let dy = e.getData('dirY') as number
    const margin = 0.6 * UNIT
    if ((e.x < margin && dx < 0) || (e.x > MAP.width - margin && dx > 0)) dx = -dx
    if ((e.y < margin && dy < 0) || (e.y > MAP.height - margin && dy > 0)) dy = -dy
    e.setData('dirX', dx)
    e.setData('dirY', dy)
    return { x: dx, y: dy }
  }

  /** 逃离方向贴边时沿墙滑行，不顶出地图 */
  protected fleeDir(e: ImageObj, away: Point): Point {
    return fleeSteer(e.x, e.y, away.x, away.y, MAP.width, MAP.height, 1.5 * UNIT)
  }

  protected cullEnemyShot(s: ImageObj): boolean {
    return s.x < -UNIT || s.x > MAP.width + UNIT || s.y < -UNIT || s.y > MAP.height + UNIT
  }

  /** 地面 = 纯色面 + 右下阴影；地表纹理交给 emoji 装饰层（不再画网格线） */
  private drawFloor(): void {
    const g = this.add.graphics()
    const shadowOffset = 0.25 * UNIT
    g.fillStyle(this.palette.shadow, 1)
    g.fillRect(shadowOffset, shadowOffset, MAP.width, MAP.height)
    g.fillStyle(this.palette.map, 1)
    g.fillRect(0, 0, MAP.width, MAP.height)
  }

  /** 地图装饰：按 run 内种子随机散布的低透明度 emoji（一局一景，同局各波不变）。
   * 静态贴地（depth 1）：在地面/网格之上、毒液池（2）与所有战斗实体之下 */
  private drawDecor(): void {
    const rng = new Rng(this.run.decorSeed)
    const cols = Math.round(MAP.width / UNIT)
    const rows = Math.round(MAP.height / UNIT)
    for (const d of rollDecor(MAPS[this.run.mapId].decor, () => rng.next(), cols, rows)) {
      emojiImage(this, d.xU * UNIT, d.yU * UNIT, d.emoji, d.sizeU * UNIT, 'player')
        .setAlpha(d.alpha)
        .setRotation(d.rotation)
        .setDepth(1)
    }
  }
}
