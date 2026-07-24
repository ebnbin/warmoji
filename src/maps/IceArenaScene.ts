import Phaser from 'phaser'
import { UNIT } from '../core/units'
import { SPAWN } from '../enemies/registry'
import { PICKUPS } from '../pickups/registry'
import { MAPS, rollDecor } from './registry'
import { Rng } from '../core/rng'
import { randomMapPoint } from '../enemies/spawn'
import { emojiImage } from '../emoji/textures'
import { viewport } from '../core/apply'
import { enemyOf } from '../enemies/enemies'
import { approach, onFloe } from './ice'
import type { IceConfig } from './registry'
import { BaseArenaScene } from '../battle/BaseArenaScene'
import type { ArcadeBody, ImageObj } from '../battle/BaseArenaScene'
import type { Enemy } from '../enemies/enemies'
import type { Point } from '../core/vec'

// 深水（浮冰四周）的底色
const WATER_COLOR = 0x0b2a45

// 浮冰（kind='ice'）：一块 25×25 的方形浮冰，四周是水；相机永远跟随玩家、无边界。
// 世界规则：
// · 全局打滑——队伍与所有敌人的移动都走一阶低通（ice.ts），不跟手、刹不住、会过冲；
//   低摩擦令击退滑得更远（速度衰减慢）。打滑程度由 this.iceCfg.teamTauIce 一个参数控制。
// · 出浮冰即落水：水里每秒较快掉血（敌我通吃）+ 移动被拖慢（难游回）；掉出去谁都跑不掉惩罚。
//   因此"把敌人击退下水淹死"成为这张图的签名打法。
// · 相机只管跟人：滑进水里/滑到旁边，视角照旧跟随（别的图掉出去没意义，这张图有意义）。
export class IceArenaScene extends BaseArenaScene {
  // 队伍滑行速度（世界像素/秒）：由 constrainTeam 的动量积分器维护
  private tvx = 0
  private tvy = 0
  // 本帧 dt（ms）：teamDrift 每帧最先被调用，在此捕获供 constrainTeam / postSteer 用
  private frameDt = 16
  private nextWaterTickAt = 0
  // 每个敌人的滑行速度（低通状态），不动共享 Enemy 类型
  private slide = new WeakMap<Enemy, { x: number; y: number }>()
  private waterVignette?: Phaser.GameObjects.Rectangle

  constructor() {
    super('arenaIce')
  }

  /** 浮冰特性配置（来自 MapDef 数据；浮冰图必配 ice） */
  private get iceCfg(): IceConfig {
    return MAPS[this.run.mapId].ice!
  }

  /** 浮冰为方形，世界像素边长 */
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
    // 水底色（相机锁定满屏）：世界无边界，看到哪都是水
    this.add
      .rectangle(viewport.logicalWidth / 2, viewport.logicalHeight / 2, 8000, 8000, WATER_COLOR)
      .setScrollFactor(0)
      .setDepth(-2)
    // 浮冰（世界坐标方块）：冰面 + 右下阴影 + 冰缘描边（读得出边界）
    const g = this.add.graphics().setDepth(-1)
    const so = 0.25 * UNIT
    g.fillStyle(this.palette.shadow, 1)
    g.fillRect(so, so, size, size)
    g.fillStyle(this.palette.map, 1)
    g.fillRect(0, 0, size, size)
    g.lineStyle(3, 0xdff3ff, 0.85)
    g.strokeRect(0, 0, size, size)
    this.drawDecor()
    // 落水蓝渐晕（相机锁定）：队伍在水里时提示
    this.waterVignette = this.add
      .rectangle(viewport.logicalWidth / 2, viewport.logicalHeight / 2, 8000, 8000, 0x1e6fd0, 0)
      .setScrollFactor(0)
      .setDepth(90)
    // 无边界：不设 physics bounds、不设 camera bounds
    this.cameras.main.setZoom(viewport.renderScale)
  }

  /** 相机：只管跟随队伍、永不设 bounds（滑进水里也跟着走） */
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


  /** 刷怪上限按实时活跃数（本图无休眠，全场敌人都算） */
  protected spawnCapCount(): number {
    return this.enemies.countActive(true)
  }

  /** 位移交给 constrainTeam 的动量积分器；这里只捕获本帧 dt 供后续钩子用 */
  protected teamDrift(delta: number): Point {
    this.frameDt = delta
    return { x: 0, y: 0 }
  }

  /** 队伍打滑：next-center 即本帧输入想走的位移，反推"想要的速度"，
   * 再以时间常数 tau 缓慢趋近（冰上大 tau=滑、水中小 tau+限速=迟滞游得慢）。不钳制——可滑出浮冰落水。 */
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

  /** 低摩擦让击退持久（衰减更慢）→ 敌人被击退滑得远、格外突出 */
  protected knockbackTauMul(): number {
    return this.iceCfg.knockbackTauMul
  }

  /** 敌人打滑：行为速度走低通（追击也滑/过冲），冰上滑、水中迟滞限速 */
  protected postSteerEnemy(e: ImageObj, body: ArcadeBody): void {
    this.slideEntity(e, body)
  }

  /** Boss 也打滑（全局：所有实体一视同仁） */
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
    // 击退冲量本帧已被基类叠进 body.velocity。把它拆出来单独处理：击退不进低通——
    // 要脆、要即时（否则慢低通会把击退峰值吃掉，看不出效果）；只对"行为速度"打滑平滑。
    // 击退靠 knockbackTauMul 持久，叠加后滑得又快又远。
    const kx = a.kvx
    const ky = a.kvy
    const ice = onFloe(e.x, e.y, this.floePx)
    const tau = ice ? this.iceCfg.enemyTauIce : this.iceCfg.teamTauWater
    const mul = ice ? 1 : this.iceCfg.waterSpeedMul
    sv.x = approach(sv.x, (body.velocity.x - kx) * mul, dt, tau)
    sv.y = approach(sv.y, (body.velocity.y - ky) * mul, dt, tau)
    body.setVelocity(sv.x + kx, sv.y + ky)
  }

  /** 金币钳在浮冰内（否则漂进水里，隔着掉血区捡不回） */
  constrainCoinPos(p: Point): Point {
    const r = PICKUPS.coin.radius
    return {
      x: Phaser.Math.Clamp(p.x, r, this.floePx - r),
      y: Phaser.Math.Clamp(p.y, r, this.floePx - r),
    }
  }

  /** 敌弹飞出浮冰一段距离即回收（无界世界防泄漏） */
  cullEnemyProjectile(s: ImageObj): boolean {
    const m = 6 * UNIT
    return s.x < -m || s.x > this.floePx + m || s.y < -m || s.y > this.floePx + m
  }

  protected updateWorld(delta: number): void {
    this.frameDt = delta
    this.updateWater()
  }

  /** 落水结算：队伍（按中心是否落水）与各敌人（按各自位置）在水里每 tick 掉血 + 蓝渐晕提示 */
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

  /** 浮冰装饰：按 run 内种子随机散布的低透明度 emoji（只铺在冰面上） */
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
