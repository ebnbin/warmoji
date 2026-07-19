import { UNIT } from '../lib/units'
import type Phaser from 'phaser'
import { ACQUIRE } from './registry'
import type { ProjectileSpec } from './spec'
import type { SfxId } from '../audio/sfx'

export interface EnemyTarget {
  x: number
  y: number
  radius: number
  ref: Phaser.GameObjects.Image
}

/** 武器的行为主体：位置 + 视觉偏移（自体攻击类武器用它驱动角色本体动作） */
export interface WeaponOwner {
  readonly x: number
  readonly y: number
  setVisualOffset(dx: number, dy: number): void
}

/** 战场为武器提供的查询与效果注入，由 ArenaScene 实现 */
export interface WeaponContext {
  scene: Phaser.Scene
  /** 当前帧的存活敌人快照（每帧重建一次，武器间共享） */
  enemyTargets(): readonly EnemyTarget[]
  /** knockback：击退冲量（px/秒），方向 = 源点 (srcX, srcY) 指向敌人中心 */
  damageEnemy(
    enemy: Phaser.GameObjects.Image,
    damage: number,
    knockback?: number,
    srcX?: number,
    srcY?: number,
  ): void
  spawnProjectile(x: number, y: number, angle: number, spec: ProjectileSpec, damage: number): void
  /** 队伍中心（光环类武器的锚点） */
  teamCenter(): { x: number; y: number }
  /** 登记一个仅本帧生效的减速区域（光环每帧重新登记），索敌时叠乘敌人移速 */
  applySlow(x: number, y: number, radius: number, factor: number): void
  /** 给单个敌人施加限时减速（factor=0 即冻结），到时自动恢复 */
  slowEnemy(enemy: Phaser.GameObjects.Image, factor: number, durationMs: number): void
  /** 在地面生成灼烧区：期间内周期性烧伤区域内敌人（伤害归属出招角色） */
  spawnBurnZone(x: number, y: number, radius: number, dps: number, durationMs: number): void
  /** 登记一个仅本帧生效的金币吸取点（回旋镖沿途收币） */
  attractCoins(x: number, y: number, radius: number): void
  /** 给持有本武器的角色授予短暂无敌（刺客出手帧；基座 ctx 为空实现） */
  grantMemberInvuln(ms: number): void
  /** 播放持有者本体的一次性动画 clip：durMs 传行为的真实间隔（攻速越快
   * 动画越快的绑定入口）。clip 未落地/未烘焙时静默保持静态（基座 ctx 空实现） */
  playOwnerClip(clipId: string, durMs: number): void
  /** 治疗队友：all=false 治范围内血量比例最低的一名、true 范围内全体；
   * 返回实际被治疗的人数（满血者不计） */
  healAllies(x: number, y: number, range: number, amount: number, all: boolean): number
  /** 电击起搏：给范围内复活倒计时最长的阵亡队友减 ms；无阵亡者返回 false */
  cutReviveTimer(x: number, y: number, range: number, ms: number): boolean
  damageMul(): number
  cooldownMul(): number
  /** 出手/爆炸等武器音效（内部已节流） */
  sfx(id: SfxId): void
}

/** 武器运行时：每（角色×武器）一个实例，自管冷却/视觉/攻击行为 */
export interface WeaponRuntime {
  update(delta: number, owner: WeaponOwner): void
  setVisible(on: boolean): void
  destroy(): void
}

/** 瞄准索敌上限内离 owner 最近的敌人；无敌人或全部超出上限返回 null。
 * 上限缺省 ACQUIRE.range——索敌必须有界，无限地图上不能瞄到无穷远 */
export function nearestAngle(
  owner: WeaponOwner,
  targets: readonly EnemyTarget[],
  maxRange = ACQUIRE.range * UNIT,
): number | null {
  let best = maxRange * maxRange
  let angle: number | null = null
  for (const t of targets) {
    const dx = t.x - owner.x
    const dy = t.y - owner.y
    const d = dx * dx + dy * dy
    if (d < best) {
      best = d
      angle = Math.atan2(dy, dx)
    }
  }
  return angle
}
