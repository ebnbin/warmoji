import Phaser from 'phaser'
import { UNIT } from '../../core/units'
import { InfiniteScene } from './InfiniteScene'
import { MAP, MAPS } from '../../data/maps'
import type { SpaceConfig } from '../../data/maps'
import { ringPoint } from '../../war/world/world'
import { emojiImage } from '../../emoji/textures'
import { enemyOf } from '../enemy/enemies'
import { clampToDisc, confineVelocity, meteorSweep } from '../../war/world/space'
import type { Point } from '../../core/vec'
import type { ArcadeBody, ImageObj } from '../ArcadeBattleScene'

// 天体横扫的一次实例（同一时刻至多一个）
interface Meteor {
  phase: 'warn' | 'travel'
  sx: number
  sy: number
  ex: number
  ey: number
  /** 预警结束（= 起划）时刻 */
  until: number
  /** 划行进度 0..1 */
  t: number
  sphere?: Phaser.GameObjects.Image
  tele: Phaser.GameObjects.Graphics
  /** 本次已结算过的实体（每次横扫对同一实体只砸一次） */
  hit: Set<object>
}

// 深空（kind='space'）：整张地图 = 一个固定的圆形禁锢星域（黑洞引力场），从第一波起常驻。
// 复用无限世界的底层（相机跟随 / 分块星海 / 环带刷怪），但一切都被困在圆内：
// · 禁锢圈：以地图中心为圆心、半径 this.spaceCfg.blackholeRadiusU（12.5 格，直径 25 ≈ 标准方形内切圆）。
//   越靠边缘、向外的运动阻力越大（中心 0、边缘 100%），再加硬边界兜底——队员/敌人/Boss 谁也逃不出去；
//   玩家与敌人全在圈内生成。相机跟随队伍、bounds 钳在圆的外接框内。
// · 天体横扫：平均每 ~15 秒，一颗球形天体先给出直线预警轨迹，随后沿该线匀速划过战场，
//   压到（进入球体半径）的所有实体——队员 / 敌人 / Boss 一律照打（敌我通吃）。
export class SpaceScene extends InfiniteScene {
  private nextMeteorAt = 0
  private meteor?: Meteor
  // 禁锢圈（全程常驻）：圆心 = 地图中心，半径固定
  private fieldCx = 0
  private fieldCy = 0
  private fieldR = 0

  constructor() {
    super('arenaSpace')
  }

  /** 深空特性配置（来自 MapDef 数据；深空图必配 space） */
  private get spaceCfg(): SpaceConfig {
    return MAPS[this.run.mapId].space!
  }

  protected resetWorldFields(): void {
    super.resetWorldFields()
    // 首颗天体来得早一点（~7 秒），确保玩家第一波就见识到横扫
    this.nextMeteorAt = 7000
    this.meteor = undefined
    this.fieldCx = 0
    this.fieldCy = 0
    this.fieldR = 0
  }

  /** 创建世界：复用无限世界地基（星海/底色/缩放），再张开常驻禁锢圈（居中、全程生效） */
  protected createWorld(): void {
    super.createWorld()
    const c = this.spawnCenter()
    this.fieldCx = c.x
    this.fieldCy = c.y
    this.fieldR = this.spaceCfg.blackholeRadiusU * UNIT
    // 禁锢边界：亮紫环 + 内侧渐隐提示（静态，一次绘制，世界坐标）
    const g = this.add.graphics().setDepth(2)
    g.lineStyle(5, 0x9c6bff, 0.7)
    g.strokeCircle(this.fieldCx, this.fieldCy, this.fieldR)
    g.lineStyle(18, 0x6a3fbf, 0.13)
    g.strokeCircle(this.fieldCx, this.fieldCy, this.fieldR - 9)
  }

  /** 相机：跟随队伍，但 bounds 钳在圆的外接框内（圆是有界的，别飘到圈外空白） */
  protected attachCamera(target: Phaser.GameObjects.Zone): void {
    this.cameras.main.startFollow(target)
    const half = this.fieldR + MAP.cameraMargin * UNIT
    this.cameras.main.setBounds(this.fieldCx - half, this.fieldCy - half, half * 2, half * 2)
  }


  /** 终波无专属变化：禁锢圈本就全程常驻（覆盖基类的毒雾缩圈，避免叠一层毒圈） */
  protected onFinalWaveSetup(): void {}

  /** 出怪落点收进圈内（环带随机点，超出即投影到圈边内侧） */
  protected spawnPoint(): Point {
    const p = ringPoint(this.rng, this.center, this.infCfg.spawnRingMin * UNIT, this.infCfg.spawnRingMax * UNIT)
    return clampToDisc(p.x, p.y, this.fieldCx, this.fieldCy, this.fieldR - UNIT)
  }

  /** Boss 落在圈内、圆心附近的环带上 */
  protected bossSpawnPoint(): Point {
    const p = ringPoint(this.rng, { x: this.fieldCx, y: this.fieldCy }, 6 * UNIT, 8 * UNIT)
    return clampToDisc(p.x, p.y, this.fieldCx, this.fieldCy, this.fieldR - UNIT)
  }

  /** 队伍移动的禁锢：向外分量按到中心距离衰减（边缘 100%），再硬钳进圆内兜底 */
  protected constrainTeam(next: Point): Point {
    const dx = next.x - this.center.x
    const dy = next.y - this.center.y
    const v = confineVelocity(this.center.x, this.center.y, this.fieldCx, this.fieldCy, dx, dy, this.fieldR)
    return clampToDisc(this.center.x + v.x, this.center.y + v.y, this.fieldCx, this.fieldCy, this.fieldR)
  }

  /** 敌人生成/落点钳进圈内（留出敌人半径，别探出圈边） */
  protected constrainEnemyPos(p: Point, radius: number): Point {
    return clampToDisc(p.x, p.y, this.fieldCx, this.fieldCy, this.fieldR - radius)
  }

  /** 金币掉落钳进圈内（否则圈边的掉落隔着禁锢边界捡不到） */
  constrainCoinPos(p: Point): Point {
    return clampToDisc(p.x, p.y, this.fieldCx, this.fieldCy, this.fieldR - UNIT * 0.5)
  }

  protected updateWorld(delta: number): void {
    super.updateWorld(delta) // 无限世界地基：星海分块流式增删（毒雾 zone 未启用，早退）
    this.updateMeteor(delta)
    this.applyFieldDrag()
  }

  /** 敌人 / Boss 的禁锢：削掉向外的速度分量（在 steerEnemies 之后、物理步之前生效） */
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

  // ── 天体横扫 ────────────────────────────────────────────────

  private updateMeteor(delta: number): void {
    const now = this.elapsedMs
    const m = this.meteor
    if (!m) {
      if (now >= this.nextMeteorAt) this.startMeteorWarn()
      return
    }
    if (m.phase === 'warn') {
      // 预警脉动：轨迹一明一暗，提醒"这条线要来球"
      m.tele.setAlpha(0.28 + 0.24 * Math.abs(Math.sin(now / 110)))
      if (now >= m.until) this.launchMeteor(m)
      return
    }
    // 划行：沿预警直线匀速推进，压到的实体敌我通吃
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
    // 危险车道：宽半透明带 + 亮芯线 + 入口标记（球体从此侧划入）
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
    m.tele.setAlpha(0.22) // 划行期间轨迹淡下去，只留车道感
  }

  private endMeteor(m: Meteor): void {
    m.sphere?.destroy()
    m.tele.destroy()
    this.meteor = undefined
    // 下一颗：平均 15 秒，±5 秒抖动
    this.nextMeteorAt =
      this.elapsedMs + this.spaceCfg.meteor.intervalMs + (this.rng.next() * 2 - 1) * this.spaceCfg.meteor.intervalJitterMs
  }
}
