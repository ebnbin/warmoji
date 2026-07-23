import Phaser from 'phaser'
import { MEMBER, TEAM } from '../characters/registry'
import { SPAWN } from '../enemies/registry'
import { PICKUPS } from '../pickups/registry'
import { UNIT } from '../core/units'
import { MAP } from './registry'
import { fleeSteer } from '../enemies/registry'
import { MAPS, rollDecor } from './registry'
import { Rng } from '../core/rng'
import { randomMapPoint } from '../enemies/spawn'
import type { Point } from '../core/vec'
import { waveDurationMs } from '../run/waves'
import { emojiImage } from '../emoji/textures'
import { viewport } from '../core/apply'
import { BaseArenaScene } from '../battle/BaseArenaScene'
import type { ArcadeBody, ImageObj } from '../battle/BaseArenaScene'
import type { Enemy } from '../enemies/enemies'

// 有界竞技场（kind='bounded'）：矩形地图（缺省 25×25，按 map.size 可放大）+ 相机跟随。
// 世界规则：四周硬墙——队伍/敌人/Boss 钳制在图内，游荡撞边折返、
// 逃跑贴边沿墙滑行，敌弹与金币不出图。战斗引擎全在 BaseArenaScene。
export class ArenaScene extends BaseArenaScene {
  // 场景键可覆写：残垣图复用整套有界世界规则（盒子边界/相机/落点），只叠加断壁机制
  constructor(key = 'arena') {
    super(key)
  }

  // 地图尺寸按图取（map.size 缺省用 MAP.width/height=25×25；昼夜图 30×30）——
  // 每帧访问（钳制/游荡/逃跑），走 getter 现算即可，重启换图自动跟随
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
  }

  protected attachCamera(target: Phaser.GameObjects.Zone): void {
    this.cameras.main.startFollow(target)
  }

  protected spawnCenter(): Point {
    return { x: this.mapW / 2, y: this.mapH / 2 }
  }

  protected spawnPoint(): Point {
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
    return randomMapPoint(
      this.rng,
      this.mapW,
      this.mapH,
      2 * UNIT,
      this.center,
      SPAWN.minPlayerDist * UNIT * 1.6,
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
      x: Phaser.Math.Clamp(next.x, clampMin, this.mapW - clampMin),
      y: Phaser.Math.Clamp(next.y, clampMin, this.mapH - clampMin),
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
      x: Phaser.Math.Clamp(p.x, 0, this.mapW),
      y: Phaser.Math.Clamp(p.y, 0, this.mapH),
    }
  }

  constrainCoinPos(p: Point): Point {
    return {
      x: Phaser.Math.Clamp(p.x, PICKUPS.coin.radius, this.mapW - PICKUPS.coin.radius),
      y: Phaser.Math.Clamp(p.y, PICKUPS.coin.radius, this.mapH - PICKUPS.coin.radius),
    }
  }

  constrainShardTarget(p: Point): Point {
    return {
      x: Phaser.Math.Clamp(p.x, 0, this.mapW),
      y: Phaser.Math.Clamp(p.y, 0, this.mapH),
    }
  }

  /** 游荡撞边折返：接近地图边缘时翻转对应方向分量 */
  wanderDir(a: Enemy): Point {
    if (this.elapsedMs >= a.turnAt) {
      const ang = this.rng.next() * Math.PI * 2
      a.dirX = Math.cos(ang)
      a.dirY = Math.sin(ang)
      a.turnAt = this.elapsedMs + 800 + this.rng.next() * 1200
    }
    const e = a.image
    let dx = a.dirX
    let dy = a.dirY
    const margin = 0.6 * UNIT
    if ((e.x < margin && dx < 0) || (e.x > this.mapW - margin && dx > 0)) dx = -dx
    if ((e.y < margin && dy < 0) || (e.y > this.mapH - margin && dy > 0)) dy = -dy
    a.dirX = dx
    a.dirY = dy
    return { x: dx, y: dy }
  }

  /** 逃离方向贴边时沿墙滑行，不顶出地图 */
  fleeDir(a: Enemy, away: Point): Point {
    return fleeSteer(a.image.x, a.image.y, away.x, away.y, this.mapW, this.mapH, 1.5 * UNIT)
  }

  cullEnemyProjectile(s: ImageObj): boolean {
    return s.x < -UNIT || s.x > this.mapW + UNIT || s.y < -UNIT || s.y > this.mapH + UNIT
  }

  /** 地面 = 纯色面 + 右下阴影；地表纹理交给 emoji 装饰层（不再画网格线） */
  private drawFloor(): void {
    const g = this.add.graphics()
    const shadowOffset = 0.25 * UNIT
    g.fillStyle(this.palette.shadow, 1)
    g.fillRect(shadowOffset, shadowOffset, this.mapW, this.mapH)
    g.fillStyle(this.palette.map, 1)
    g.fillRect(0, 0, this.mapW, this.mapH)
  }

  /** 地图装饰：按 run 内种子随机散布的低透明度 emoji（一局一景，同局各波不变）。
   * 静态贴地（depth 1）：在地面/网格之上、毒液池（2）与所有战斗实体之下 */
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
