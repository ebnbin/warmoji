import type { SfxId } from './sfx'
import type { GroundEffectDef } from './groundEffects'

export interface ProjectileSpec {
  readonly emoji: string
  readonly size: number
  readonly radius: number
  readonly speed: number
  readonly rotationOffsetDeg: number
}
export interface HeldVisual {
  readonly emoji: string
  readonly size: number
  readonly restOffset: number
  readonly rotationOffsetDeg: number
  readonly mountSide?: -1 | 1
  readonly mountGap?: number
}
interface BlastRing {
  readonly color: number
  readonly fillAlpha: number
  readonly lineWidth: number
  readonly lineAlpha: number
  readonly durMs: number
}
interface BlastEffect {
  readonly kind: 'blast'
  readonly radius: number
  readonly ratio: number
  readonly knockback: number
  readonly ring?: BlastRing
}
interface SlowEffect {
  readonly kind: 'slow'
  readonly factor: number
  readonly durationMs: number
}
interface PoisonEffect {
  readonly kind: 'poison'
  readonly damage: number
  readonly tickMs: number
  readonly durationMs: number
}
interface GroundZone {
  readonly kind: 'ground'
  readonly def: GroundEffectDef
}
interface MorphEffect {
  readonly kind: 'morph'
  readonly durationMs: number
  readonly morphEmoji: string
  readonly vulnMul?: number
}
interface SpawnProjectileEffect {
  readonly kind: 'spawnProjectile'
  readonly projectile: ProjectileSpec
  readonly damage: number
  readonly lifeMs: number
  readonly aim: 'nearest'
}
/** 有目标列表时治列表里的人（全体或血量比例最低者），否则治落点周围 range 内的同伴 */
interface HealEffect {
  readonly kind: 'heal'
  readonly amount: number
  readonly scope?: 'all' | 'lowest'
  readonly ratio?: number
  readonly range?: number
}
interface AttackSlowEffect {
  readonly kind: 'attackSlow'
  readonly mul: number
  readonly durationMs: number
}
/** 倍率增益：不写 durationMs 就是永久 */
interface BuffEffect {
  readonly kind: 'buff'
  readonly damageMul?: number
  readonly speedMul?: number
  readonly durationMs?: number
}
/** 直接造成一笔伤害 */
interface DamageEffect {
  readonly kind: 'damage'
  readonly amount: number
}
/** 定身：失去行动 */
interface StunEffect {
  readonly kind: 'stun'
  readonly durationMs: number
}
/** 隐匿：敌人看不见 */
interface HideEffect {
  readonly kind: 'hide'
  readonly durationMs: number
}
/** 嘲讽：目标只看得见施法者 */
interface TauntEffect {
  readonly kind: 'taunt'
  readonly durationMs: number
}
interface GuardEffect {
  readonly kind: 'guard'
  readonly mul: number
  readonly durationMs: number
}
interface ReviveEffect {
  readonly kind: 'revive'
}
interface HealRatioEffect {
  readonly kind: 'healRatio'
  readonly ratio: number
}
interface InvulnEffect {
  readonly kind: 'invuln'
  readonly ms: number
}
interface ReviveCutEffect {
  readonly kind: 'reviveCut'
  readonly ms: number
}
interface TimeStopEffect {
  readonly kind: 'timeStop'
  readonly durationMs: number
}
interface CoinsEffect {
  readonly kind: 'coins'
  readonly count: number
}
/** 消散：目标身体不算击杀地移除，自爆者对自己用 */
interface VanishEffect {
  readonly kind: 'vanish'
}
export type Effect =
  | BlastEffect
  | SlowEffect
  | PoisonEffect
  | GroundZone
  | MorphEffect
  | SpawnProjectileEffect
  | HealEffect
  | AttackSlowEffect
  | BuffEffect
  | DamageEffect
  | StunEffect
  | HideEffect
  | TauntEffect
  | GuardEffect
  | ReviveEffect
  | HealRatioEffect
  | InvulnEffect
  | ReviveCutEffect
  | TimeStopEffect
  | CoinsEffect
  | VanishEffect

export interface ZoneVisual {
  readonly color: number
  readonly fillAlpha: number
  readonly lineAlpha: number
  readonly lineWidth: number
  readonly enterMs: number
}

/** 形状：一次出手覆盖谁 */
export type Shape =
  | { readonly kind: 'bolt'; readonly projectile: ProjectileSpec; readonly lifeMs: number; readonly pierce?: number }
  | { readonly kind: 'segment'; readonly reach: number; readonly radius: number; readonly ms: number; readonly lungeDist?: number; readonly beam?: boolean }
  | { readonly kind: 'sector'; readonly radius: number; readonly arcDeg: number; readonly ms: number }
  | { readonly kind: 'disc'; readonly radius: number; readonly at: 'self' | 'target'; readonly of?: 'foes' | 'hurt' }
  | { readonly kind: 'chain'; readonly hops: number; readonly hopRange: number; readonly decay: number }
  | {
      readonly kind: 'flyer'
      readonly range: number
      readonly outMs: number
      readonly returnSpeed: number
      readonly radius: number
      readonly spinDegPerSec: number
      readonly coinMagnetRadius?: number
    }
  | {
      readonly kind: 'drop'
      readonly targets: number
      readonly emoji: string
      readonly size: number
      readonly fromAbove: number
      readonly dropMs: number
      readonly staggerMs: number
    }
  | { readonly kind: 'blink'; readonly behindDist: number; readonly strikeMs: number; readonly execute?: { readonly hpRatio: number; readonly mul: number } }
  | { readonly kind: 'sprint'; readonly distance: number; readonly ms: number; readonly radius?: number }
  | { readonly kind: 'leap'; readonly distance: number; readonly ms: number; readonly height: number; readonly radius: number }
  | { readonly kind: 'all'; readonly of: 'foes' | 'allies'; readonly downed?: boolean }
  | {
      readonly kind: 'zone'
      readonly radius: number
      readonly durationMs: number
      readonly tickMs?: number
      readonly mend?: number
      readonly follow?: boolean
      readonly pulse?: { readonly intervalMs: number; readonly onHit: readonly Effect[] }
      readonly visual: ZoneVisual
    }
  | {
      readonly kind: 'summon'
      readonly count: number
      readonly minion: {
        readonly emoji: string
        readonly size: number
        readonly speed: number
        readonly orbit: { readonly radius: number; readonly spinRadPerSec: number }
      }
      readonly lifeMs: number
    }
  | {
      readonly kind: 'emplace'
      readonly count: number
      readonly spread?: number
      readonly maxAlive: number
      readonly lifeMs: number
      readonly turret: { readonly emoji: string; readonly size: number }
      readonly ability: AbilityDef
    }
  | { readonly kind: 'world' }
export type ShapeKind = Shape['kind']

/** 瞄准：出手的方向或落点从哪来 */
export type Aim = 'nearest' | 'strongest' | 'move' | 'leader' | 'self' | 'stick'

/** 重复出手：一次几发、隔多久、每发打几折、每第 N 次才触发、追加的几发怎么重新瞄准 */
export interface Repeat {
  readonly count: number
  readonly spreadDeg?: number
  readonly delayMs?: number
  readonly ratio?: number
  readonly everyN?: number
  readonly reaim?: 'same' | 'nearest' | 'random'
}

/** 蓄力：出手前停下 ms 毫秒；方向在蓄力开始或结束时锁定；telegraph 是蓄力期间身体上的预兆 */
export interface Windup {
  readonly ms: number
  readonly lockAt: 'start' | 'end'
  readonly telegraph: 'shake' | 'blink'
}

interface AbilityBase {
  readonly aim: Aim
  readonly windup?: Windup
  readonly range?: number
  readonly shape: Shape
  readonly damage?: number
  readonly knockback?: number
  readonly waveScale?: boolean
  readonly bossRatio?: number
  readonly onHit?: readonly Effect[]
  readonly onSelf?: readonly Effect[]
  readonly repeat?: Repeat
  readonly held?: HeldVisual
  readonly fireSfx?: SfxId
  readonly color?: number
  readonly fxRadius?: number
  readonly piercesWalls?: boolean
}
/** 一个能力 = 触发 × 瞄准 × 形状 × 载荷 × 重复 */
export type AbilityDef =
  | (AbilityBase & { readonly trigger: 'auto'; readonly cooldownMs: number; readonly firstDelayMs?: number })
  | (AbilityBase & { readonly trigger: 'manual' })
