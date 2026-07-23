import Phaser from 'phaser'
import { UNIT } from '../core/units'
import { InfiniteArenaScene } from './InfiniteArenaScene'
import { emojiImage } from '../emoji/textures'
import { enemyOf } from '../enemies/enemies'
import { BLACKHOLE, METEOR, confineVelocity, meteorSweep } from './space'
import type { Point } from '../core/vec'
import type { ArcadeBody, ImageObj } from '../battle/BaseArenaScene'

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

// 深空（kind='space'）：复用无限世界（相机跟随/分块装饰/休眠/环带刷怪），叠加两套太空机制：
// · 天体横扫：平均每 ~15 秒，一颗球形天体先给出直线预警轨迹，随后沿该线匀速划过战场，
//   压到（进入球体半径）的所有实体——队员 / 敌人 / Boss 一律照打（敌我通吃）。
// · 黑洞禁锢场（终波）：以进波瞬间队伍位置为心张开半径 R 的力场；越靠边缘、向外的运动
//   阻力越大（按速度百分比，中心 0、边缘 100%），场内所有实体谁也逃不出去。
export class SpaceArenaScene extends InfiniteArenaScene {
  private nextMeteorAt = 0
  private meteor?: Meteor
  private fieldActive = false
  private fieldCx = 0
  private fieldCy = 0
  private fieldR = 0

  constructor() {
    super('arenaSpace')
  }

  protected resetWorldFields(): void {
    super.resetWorldFields()
    // 首颗天体来得早一点（~7 秒），确保玩家第一波就见识到横扫
    this.nextMeteorAt = 7000
    this.meteor = undefined
    this.fieldActive = false
    this.fieldCx = 0
    this.fieldCy = 0
    this.fieldR = 0
  }

  protected finalWaveWarningSub(): string {
    return '奇点降临，禁锢力场四合——越往外越挣不动，谁也逃不出去！'
  }

  /** 终波：以此刻队伍位置为心张开黑洞禁锢场（替代无限图的毒雾缩圈） */
  protected onFinalWaveSetup(): void {
    this.fieldActive = true
    this.fieldCx = this.center.x
    this.fieldCy = this.center.y
    this.fieldR = BLACKHOLE.fieldRadiusU * UNIT
    // 禁锢边界：亮紫环 + 内侧渐隐提示（静态，一次绘制）
    const g = this.add.graphics().setDepth(2)
    g.lineStyle(5, 0x9c6bff, 0.7)
    g.strokeCircle(this.fieldCx, this.fieldCy, this.fieldR)
    g.lineStyle(18, 0x6a3fbf, 0.13)
    g.strokeCircle(this.fieldCx, this.fieldCy, this.fieldR - 9)
  }

  /** 队伍移动的禁锢：向外分量按到中心距离衰减（边缘 100% → 出不去） */
  protected constrainTeam(next: Point): Point {
    if (!this.fieldActive) return next
    const dx = next.x - this.center.x
    const dy = next.y - this.center.y
    const v = confineVelocity(this.center.x, this.center.y, this.fieldCx, this.fieldCy, dx, dy, this.fieldR)
    return { x: this.center.x + v.x, y: this.center.y + v.y }
  }

  protected updateWorld(delta: number): void {
    super.updateWorld(delta) // 无限世界：装饰分块流式增删（无毒雾 zone）
    this.updateMeteor(delta)
    this.applyFieldDrag()
  }

  /** 敌人 / Boss 的禁锢：同样削掉向外的速度分量（在 steerEnemies 之后、物理步之前生效） */
  private applyFieldDrag(): void {
    if (!this.fieldActive) return
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
    m.t += ((METEOR.speedU * UNIT) * (delta / 1000)) / len
    const x = m.sx + (m.ex - m.sx) * m.t
    const y = m.sy + (m.ey - m.sy) * m.t
    if (m.sphere) {
      m.sphere.setPosition(x, y)
      m.sphere.rotation += (delta / 1000) * 1.4
    }
    const rr = METEOR.radiusU * UNIT
    for (const mem of this.members) {
      if (!mem.alive || m.hit.has(mem)) continue
      if (Math.hypot(mem.image.x - x, mem.image.y - y) < rr) {
        this.hurtMember(mem, METEOR.damage, 0xffaa33, '天体')
        m.hit.add(mem)
      }
    }
    for (const e of this.enemies.getChildren() as ImageObj[]) {
      if (!e.active || m.hit.has(e)) continue
      const a = enemyOf(e)
      if (a.dormant) continue
      if (Math.hypot(e.x - x, e.y - y) < rr) {
        this.applyDamage(e, METEOR.damage)
        m.hit.add(e)
      }
    }
    if (m.t >= 1) this.endMeteor(m)
  }

  private startMeteorWarn(): void {
    const angle = this.rng.next() * Math.PI * 2
    const offset = (this.rng.next() * 2 - 1) * METEOR.offsetU * UNIT
    const half = (METEOR.travelU * UNIT) / 2
    const s = meteorSweep(this.center.x, this.center.y, angle, offset, half)
    const tele = this.add.graphics().setDepth(3)
    // 危险车道：宽半透明带 + 亮芯线 + 入口标记（球体从此侧划入）
    const bandW = METEOR.radiusU * 2 * UNIT
    tele.lineStyle(bandW, 0xff5252, 0.16)
    tele.lineBetween(s.sx, s.sy, s.ex, s.ey)
    tele.lineStyle(3, 0xff8a80, 0.8)
    tele.lineBetween(s.sx, s.sy, s.ex, s.ey)
    tele.fillStyle(0xff5252, 0.35)
    tele.fillCircle(s.sx, s.sy, METEOR.radiusU * UNIT)
    this.meteor = {
      phase: 'warn',
      sx: s.sx,
      sy: s.sy,
      ex: s.ex,
      ey: s.ey,
      until: this.elapsedMs + METEOR.warnMs,
      t: 0,
      tele,
      hit: new Set(),
    }
  }

  private launchMeteor(m: Meteor): void {
    m.phase = 'travel'
    m.t = 0
    m.sphere = emojiImage(this, m.sx, m.sy, '1fa90', METEOR.radiusU * 2 * UNIT).setDepth(60)
    m.tele.setAlpha(0.22) // 划行期间轨迹淡下去，只留车道感
  }

  private endMeteor(m: Meteor): void {
    m.sphere?.destroy()
    m.tele.destroy()
    this.meteor = undefined
    // 下一颗：平均 15 秒，±5 秒抖动
    this.nextMeteorAt =
      this.elapsedMs + METEOR.intervalMs + (this.rng.next() * 2 - 1) * METEOR.intervalJitterMs
  }
}
