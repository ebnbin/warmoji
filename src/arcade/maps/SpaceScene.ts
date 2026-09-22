import Phaser from 'phaser'
import { UNIT } from '../../util/units'
import { InfiniteScene } from './InfiniteScene'
import { MAP, MAPS } from '../../data/maps'
import type { SpaceConfig } from '../../types/maps'
import { ringPoint } from '../../arcade/maps/world'
import { emojiImage } from '../../emoji/textures'
import { enemyOf } from '../enemy/enemies'
import { clampToDisc, confineVelocity, meteorSweep } from '../../arcade/maps/space'
import type { Point } from '../../util/vec'
import type { ArcadeBody, ImageObj } from '../ArcadeBattleScene'

// 同一时刻至多一个
interface Meteor {
  phase: 'warn' | 'travel'
  sx: number
  sy: number
  ex: number
  ey: number
  /** 起划时刻 */
  until: number
  /** 划行进度 0..1 */
  t: number
  sphere?: Phaser.GameObjects.Image
  tele: Phaser.GameObjects.Graphics
  /** 同一实体只砸一次 */
  hit: Set<object>
}

// 无限世界 + 圆形禁锢；天体横扫敌我通吃
export class SpaceScene extends InfiniteScene {
  private nextMeteorAt = 0
  private meteor?: Meteor
  // 圆心 = 地图中心
  private fieldCx = 0
  private fieldCy = 0
  private fieldR = 0

  constructor() {
    super('arenaSpace')
  }

  private get spaceCfg(): SpaceConfig {
    return MAPS[this.run.mapId].space!
  }

  protected resetWorldFields(): void {
    super.resetWorldFields()
    this.nextMeteorAt = 7000
    this.meteor = undefined
    this.fieldCx = 0
    this.fieldCy = 0
    this.fieldR = 0
  }

  protected createWorld(): void {
    super.createWorld()
    const c = this.spawnCenter()
    this.fieldCx = c.x
    this.fieldCy = c.y
    this.fieldR = this.spaceCfg.blackholeRadiusU * UNIT
    const g = this.add.graphics().setDepth(2)
    g.lineStyle(5, 0x9c6bff, 0.7)
    g.strokeCircle(this.fieldCx, this.fieldCy, this.fieldR)
    g.lineStyle(18, 0x6a3fbf, 0.13)
    g.strokeCircle(this.fieldCx, this.fieldCy, this.fieldR - 9)
  }

  /** bounds 钳在圆的外接框内 */
  protected attachCamera(target: Phaser.GameObjects.Zone): void {
    this.cameras.main.startFollow(target)
    const half = this.fieldR + MAP.cameraMargin * UNIT
    this.cameras.main.setBounds(this.fieldCx - half, this.fieldCy - half, half * 2, half * 2)
  }

  /** 覆盖基类的缩圈，终波不叠 */
  protected onFinalWaveSetup(): void {}

  /** 落点收进圈内 */
  protected spawnPoint(): Point {
    const p = ringPoint(this.rng, this.center, this.infCfg.spawnRingMin * UNIT, this.infCfg.spawnRingMax * UNIT)
    return clampToDisc(p.x, p.y, this.fieldCx, this.fieldCy, this.fieldR - UNIT)
  }

  protected bossSpawnPoint(): Point {
    const p = ringPoint(this.rng, { x: this.fieldCx, y: this.fieldCy }, 6 * UNIT, 8 * UNIT)
    return clampToDisc(p.x, p.y, this.fieldCx, this.fieldCy, this.fieldR - UNIT)
  }

  /** 引力削速后再硬钳兜底 */
  protected constrainTeam(next: Point): Point {
    const dx = next.x - this.center.x
    const dy = next.y - this.center.y
    const v = confineVelocity(this.center.x, this.center.y, this.fieldCx, this.fieldCy, dx, dy, this.fieldR)
    return clampToDisc(this.center.x + v.x, this.center.y + v.y, this.fieldCx, this.fieldCy, this.fieldR)
  }

  protected constrainEnemyPos(p: Point, radius: number): Point {
    return clampToDisc(p.x, p.y, this.fieldCx, this.fieldCy, this.fieldR - radius)
  }

  constrainCoinPos(p: Point): Point {
    return clampToDisc(p.x, p.y, this.fieldCx, this.fieldCy, this.fieldR - UNIT * 0.5)
  }

  protected updateWorld(delta: number): void {
    super.updateWorld(delta)
    this.updateMeteor(delta)
    this.applyFieldDrag()
  }

  /** 须在 steerEnemies 之后、物理步之前 */
  private applyFieldDrag(): void {
    for (const e of this.enemies.getChildren() as ImageObj[]) {
      if (!e.active) continue
      const a = enemyOf(e)
      if (a.dormant) continue
      const body = e.body as ArcadeBody
      const v = confineVelocity(e.x, e.y, this.fieldCx, this.fieldCy, body.velocity.x, body.velocity.y, this.fieldR)
      body.setVelocity(v.x, v.y)
    }
  }

  // ── 天体横扫 ──

  private updateMeteor(delta: number): void {
    const now = this.elapsedMs
    const m = this.meteor
    if (!m) {
      if (now >= this.nextMeteorAt) this.startMeteorWarn()
      return
    }
    if (m.phase === 'warn') {
      m.tele.setAlpha(0.28 + 0.24 * Math.abs(Math.sin(now / 110)))
      if (now >= m.until) this.launchMeteor(m)
      return
    }
    const len = Math.hypot(m.ex - m.sx, m.ey - m.sy) || 1
    m.t += ((this.spaceCfg.meteor.speedU * UNIT) * (delta / 1000)) / len
    const x = m.sx + (m.ex - m.sx) * m.t
    const y = m.sy + (m.ey - m.sy) * m.t
    if (m.sphere) {
      m.sphere.setPosition(x, y)
      m.sphere.rotation += (delta / 1000) * 1.4
    }
    const rr = this.spaceCfg.meteor.radiusU * UNIT
    for (const mem of this.members) {
      if (!mem.alive || m.hit.has(mem)) continue
      if (Math.hypot(mem.image.x - x, mem.image.y - y) < rr) {
        this.hurtMember(mem, this.spaceCfg.meteor.damage, 0xffaa33, '天体')
        m.hit.add(mem)
      }
    }
    for (const e of this.enemies.getChildren() as ImageObj[]) {
      if (!e.active || m.hit.has(e)) continue
      const a = enemyOf(e)
      if (a.dormant) continue
      if (Math.hypot(e.x - x, e.y - y) < rr) {
        this.applyDamage(e, this.spaceCfg.meteor.damage)
        m.hit.add(e)
      }
    }
    if (m.t >= 1) this.endMeteor(m)
  }

  private startMeteorWarn(): void {
    const angle = this.rng.next() * Math.PI * 2
    const offset = (this.rng.next() * 2 - 1) * this.spaceCfg.meteor.offsetU * UNIT
    const half = (this.spaceCfg.meteor.travelU * UNIT) / 2
    const s = meteorSweep(this.center.x, this.center.y, angle, offset, half)
    const tele = this.add.graphics().setDepth(3)
    const bandW = this.spaceCfg.meteor.radiusU * 2 * UNIT
    tele.lineStyle(bandW, 0xff5252, 0.16)
    tele.lineBetween(s.sx, s.sy, s.ex, s.ey)
    tele.lineStyle(3, 0xff8a80, 0.8)
    tele.lineBetween(s.sx, s.sy, s.ex, s.ey)
    tele.fillStyle(0xff5252, 0.35)
    tele.fillCircle(s.sx, s.sy, this.spaceCfg.meteor.radiusU * UNIT)
    this.meteor = {
      phase: 'warn',
      sx: s.sx,
      sy: s.sy,
      ex: s.ex,
      ey: s.ey,
      until: this.elapsedMs + this.spaceCfg.meteor.warnMs,
      t: 0,
      tele,
      hit: new Set(),
    }
  }

  private launchMeteor(m: Meteor): void {
    m.phase = 'travel'
    m.t = 0
    m.sphere = emojiImage(this, m.sx, m.sy, '1fa90', this.spaceCfg.meteor.radiusU * 2 * UNIT).setDepth(60)
    m.tele.setAlpha(0.22)
  }

  private endMeteor(m: Meteor): void {
    m.sphere?.destroy()
    m.tele.destroy()
    this.meteor = undefined
    this.nextMeteorAt =
      this.elapsedMs + this.spaceCfg.meteor.intervalMs + (this.rng.next() * 2 - 1) * this.spaceCfg.meteor.intervalJitterMs
  }
}
