import type Phaser from 'phaser'
import type { ProjectileDef, ProjectileSpec } from '../../types/abilityDefs'
import type { GroundEffectDef } from '../../types/groundEffects'
import type { SfxId } from '../../audio/sfx'
import type { OutlineKind } from '../../emoji/svg'

/** 坐标可能是镜像；ref 指真身 */
export interface TargetInfo {
  x: number
  y: number
  radius: number
  ref: Phaser.GameObjects.Image
}

export interface AbilityOwner {
  readonly x: number
  readonly y: number
  setVisualOffset(dx: number, dy: number): void
}

export interface EffectCtx {
  scene: Phaser.Scene
  /** 每帧重建 */
  targets(): readonly TargetInfo[]
  /** knockback：击退冲量（px/秒），方向 = 源点 (srcX, srcY) 指向目标中心 */
  damageTarget(
    target: Phaser.GameObjects.Image,
    damage: number,
    knockback?: number,
    srcX?: number,
    srcY?: number,
  ): void
  /** factor = 0 即冻结 */
  slowTarget(target: Phaser.GameObjects.Image, factor: number, durationMs: number): void
  /** 每 tickMs 造成 damage，持续 durationMs；缺席即 no-op */
  poisonTarget?(target: Phaser.GameObjects.Image, damage: number, tickMs: number, durationMs: number): void
  spawnGroundEffect(x: number, y: number, def: GroundEffectDef): void
  /** all=false 只治血量比例最低的一名，满血者不计；返回被治数；exclude 排除一单位 */
  heal(x: number, y: number, range: number, amount: number, all: boolean, exclude?: TargetInfo['ref']): number
  /** 缺席即 no-op */
  morphTarget?(ref: TargetInfo['ref'], spec: { durationMs: number; morphEmoji: string; vulnMul?: number }): void
  /** 无 pierce/齐射；缺席即 no-op */
  spawnBullet?(x: number, y: number, angle: number, spec: ProjectileSpec, damage: number, lifeMs: number): void
  /** 缺席即 no-op */
  attackSlowMember?(ref: TargetInfo['ref'], mul: number, durationMs: number): void
}

export interface AbilityContext extends EffectCtx {
  readonly ownerOutline: OutlineKind
  /** 实时读，不吃帧快照 */
  targetHp(ref: TargetInfo['ref']): number
  targetMaxHp(ref: TargetInfo['ref']): number
  /** 阵营由 ctx 实现注入 */
  spawnProjectile(x: number, y: number, angle: number, def: ProjectileDef, damage: number): void
  /** 队伍 ctx = 队伍中心 */
  anchor(): { x: number; y: number }
  /** 仅本帧生效，须每帧重新登记 */
  applySlow(x: number, y: number, radius: number, factor: number): void
  damageMul(): number
  cooldownMul(): number
  /** 内部已节流 */
  sfx(id: SfxId): void
  /** durMs 传行为的真实间隔；clip 未烘焙时静默 */
  playOwnerClip(clipId: string, durMs: number): void
  /** 敌方 ctx 取物理速度方向 */
  ownerHeading?(): { x: number; y: number }
  /** 敌方 ctx 接 scene.rng */
  random?(): number
  /** 仅本帧生效 */
  attractCoins?(x: number, y: number, radius: number): void
  /** 敌方无此概念 */
  grantOwnerInvuln?(ms: number): void
  /** 无阵亡者返回 false */
  cutReviveTimer?(x: number, y: number, range: number, ms: number): boolean
  rallyTeam?(healRatio: number, invulnMs: number): void
  /** 含休眠者与窗口内新登场者 */
  danceTargets?(durationMs: number): void
  /** 敌方时间近乎凝固，队伍照常 */
  timeStop?(durationMs: number): void
  /** 不叠加，直接覆写 */
  buffTeamDamage?(mul: number, durationMs: number): void
  /** 敌方 ctx 缺席 */
  spawnCoins?(x: number, y: number, count: number): void
  waveScale?(): number
  isBossTarget?(ref: TargetInfo['ref']): boolean
  /** 缺席即恒 false */
  isPoisoned?(ref: TargetInfo['ref']): boolean
}

/** 每（持有者 × 能力）一个实例 */
export interface AbilityRuntime {
  update(delta: number, owner: AbilityOwner): void
  /** 无视冷却立即施放；未实现的 kind 不能作技能载荷，gen 校验 */
  castNow?(owner: AbilityOwner): void
  /** 压制窗口只走冷却不开火 */
  tickCooldown?(delta: number): void
  /** 下一次出手至少推迟 ms */
  postponeFire?(ms: number): void
  setVisible(on: boolean): void
  destroy(): void
}
