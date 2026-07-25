import type Phaser from 'phaser'
import type { ProjectileDef, ProjectileSpec } from '../../abilities/defs'
import type { GroundEffectDef } from '../../groundEffects/defs'
import type { SfxId } from '../../audio/sfx'
import type { OutlineKind } from '../../emoji/svg'

/** 敌对方单位的本帧快照（含镜像坐标；ref 指真身精灵） */
export interface TargetInfo {
  x: number
  y: number
  radius: number
  ref: Phaser.GameObjects.Image
}

/** 能力的行为主体：位置 + 视觉偏移（自体攻击类能力用它驱动角色本体动作） */
export interface AbilityOwner {
  readonly x: number
  readonly y: number
  setVisualOffset(dx: number, dy: number): void
}

/** 效果执行面（阵营中立）：applyEffects 施加一串 Effect 所需的动作集。能力持有者
 * ctx（AbilityContext）是其超集；子弹/亡语/接触等触发点用场景级实现复用同一执行器。 */
export interface EffectCtx {
  scene: Phaser.Scene
  /** 敌对方的本帧存活快照（每帧重建一次，能力间共享） */
  targets(): readonly TargetInfo[]
  /** knockback：击退冲量（px/秒），方向 = 源点 (srcX, srcY) 指向目标中心 */
  damageTarget(
    target: Phaser.GameObjects.Image,
    damage: number,
    knockback?: number,
    srcX?: number,
    srcY?: number,
  ): void
  /** 给单个目标施加限时减速（factor=0 即冻结），到时自动恢复 */
  slowTarget(target: Phaser.GameObjects.Image, factor: number, durationMs: number): void
  /** 给单个目标挂中毒 DoT：每 tickMs 造成 damage 点伤害，持续 durationMs（毒针）。敌方 ctx 缺席即 no-op */
  poisonTarget?(target: Phaser.GameObjects.Image, damage: number, tickMs: number, durationMs: number): void
  /** 在地面生成持续效果区：周期性烧伤区域内的敌对方（阵营与归属由实现注入） */
  spawnGroundEffect(x: number, y: number, def: GroundEffectDef): void
  /** 治疗我方：all=false 治范围内血量比例最低的一名、true 范围内全体；
   * 返回实际被治疗的数量（满血者不计）。exclude 排除某一单位（死亡触发时排除
   * 正在死亡的自己；队伍侧无此需求，实现可少收该参） */
  heal(x: number, y: number, range: number, amount: number, all: boolean, exclude?: TargetInfo['ref']): number
  /** 变形命中目标为无害替身（魔尘 morph 效果；敌方无此机制，缺席即 no-op） */
  morphTarget?(ref: TargetInfo['ref'], spec: { durationMs: number; morphEmoji: string; vulnMul?: number }): void
  /** 发弹（效果触发的一次性冷枪）：只带 ProjectileSpec 与伤害/寿命，无 pierce/齐射；
   * 复用弹丸投送机器。目前仅敌方死亡冷枪在用，队伍侧缺席（onHit 不含 spawnProjectile） */
  spawnBullet?(x: number, y: number, angle: number, spec: ProjectileSpec, damage: number, lifeMs: number): void
  /** 队员攻速减益（接触触发的 attackSlow 效果；敌方 ctx 实现，其余缺席即 no-op） */
  attackSlowMember?(ref: TargetInfo['ref'], mul: number, durationMs: number): void
}

/** 持有者面板 = 效果执行面（EffectCtx）+ 持有者侧接线（索敌/瞄准/冷却倍率/
 * 自体动画/队伍操作）。阵营中立，谁持有由 ctx 实现决定。 */
export interface AbilityContext extends EffectCtx {
  /** 持有方的 emoji 描边风格（持有物/召唤物视觉） */
  readonly ownerOutline: OutlineKind
  /** 目标当前血量（瞬袭索敌用；实时读，不吃帧快照） */
  targetHp(ref: TargetInfo['ref']): number
  /** 目标血量上限（处决阈值判定用） */
  targetMaxHp(ref: TargetInfo['ref']): number
  /** 发弹（能力触发）：完整能力弹，携带 pierce/onHit/齐射等由能力机器处理；
   * 阵营由 ctx 实现注入（Projectile 结构本身敌我同构） */
  spawnProjectile(x: number, y: number, angle: number, def: ProjectileDef, damage: number): void
  /** 我方锚点（光环类能力的圆心；队伍 ctx = 队伍中心） */
  anchor(): { x: number; y: number }
  /** 登记一个仅本帧生效的减速区域（光环每帧重新登记），叠乘敌对方移速 */
  applySlow(x: number, y: number, radius: number, factor: number): void
  damageMul(): number
  cooldownMul(): number
  /** 出手/爆炸等能力音效（内部已节流） */
  sfx(id: SfxId): void
  /** 播放持有者本体的一次性动画 clip：durMs 传行为的真实间隔（攻速越快
   * 动画越快的绑定入口）。clip 未落地/未烘焙时静默保持静态 */
  playOwnerClip(clipId: string, durMs: number): void
  /** 持有者当前朝向（aim:'move' 弹用；敌方 ctx 取物理速度方向） */
  ownerHeading?(): { x: number; y: number }
  /** 持有方的确定性随机流（volley.randomRotate 用；敌方 ctx 接 scene.rng） */
  random?(): number
  /** 登记一个仅本帧生效的金币吸取点（回旋镖沿途收币；金币是玩家资源） */
  attractCoins?(x: number, y: number, radius: number): void
  /** 给持有者授予短暂无敌（刺客出手帧；敌方无无敌帧概念） */
  grantOwnerInvuln?(ms: number): void
  /** 电击起搏：给范围内复活倒计时最长的阵亡队友减 ms；无阵亡者返回 false */
  cutReviveTimer?(x: number, y: number, range: number, ms: number): boolean
  /** 全队集结：阵亡者满血复活、存活者按上限比例回复、全队短暂无敌 */
  rallyTeam?(healRatio: number, invulnMs: number): void
  /** 敌对方全体跳舞定身（含休眠者与窗口内新登场者；打断蓄力/冲刺） */
  danceTargets?(durationMs: number): void
  /** 时停：接下来 durationMs 内敌方时间近乎凝固（移动/攻速/在途敌弹/刷怪），队伍照常 */
  timeStop?(durationMs: number): void
  /** 限时全队伤害倍率（到期自动复原，不叠加直接覆写） */
  buffTeamDamage?(mul: number, durationMs: number): void
  /** 战场掉落金币（含拾取爆点视觉与音效；金币是玩家资源，敌方 ctx 缺席） */
  spawnCoins?(x: number, y: number, count: number): void
  /** 当前波次威胁倍率（随敌人成长缩放的效果用） */
  waveScale?(): number
  /** 目标是否 Boss（承伤折减类效果用） */
  isBossTarget?(ref: TargetInfo['ref']): boolean
  /** 目标是否已中毒（小蜂优先扑未中毒的敌人；无此机制的 ctx 缺席即恒 false） */
  isPoisoned?(ref: TargetInfo['ref']): boolean
}

/** 能力运行时：每（持有者×能力）一个实例，自管冷却/视觉/攻击行为 */
export interface AbilityRuntime {
  update(delta: number, owner: AbilityOwner): void
  /** 手动触发：无视冷却立即施放一次（队长主动技能通道；持有者不调 update
   * 即为纯手动模式）。未实现的 kind 不能作技能载荷——gen 校验把关 */
  castNow?(owner: AbilityOwner): void
  /** 压制窗口（跳舞/变形）只走冷却不开火：保持敌侧攻击的时间表语义
   *（窗口结束若冷却已耗尽则立即出手，与原攻击积木行为一致） */
  tickCooldown?(delta: number): void
  /** 把下一次出手至少推迟 ms（变形恢复的缓冲，避免恢复瞬间齐射） */
  postponeFire?(ms: number): void
  setVisible(on: boolean): void
  destroy(): void
}
