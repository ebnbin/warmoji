import type { AbilityDef, Effect } from './abilityDefs'

// ── 移动方式 ────────────────────────────────────────────────
export type DashTrigger =
  | { readonly kind: 'detect'; readonly range: number; readonly cooldownMs: number }
  | { readonly kind: 'timer'; readonly intervalMs: number; readonly firstDelayMs?: number }
export type DashLength =
  | { readonly kind: 'dist'; readonly dist: number }
  | { readonly kind: 'time'; readonly durationMs: number }
export interface DashLocomotion {
  readonly kind: 'dash'
  readonly windupMs: number
  readonly dashSpeed: number
  readonly trigger: DashTrigger
  readonly length: DashLength
  readonly idle: 'wander' | 'chase'
  readonly aim: 'nearest' | 'teamCenter'
  readonly lockAt: 'windup' | 'launch'
  readonly sfx?: 'whoosh'
}
export interface StandoffLocomotion {
  readonly kind: 'standoff'
  /** 超出则只游荡 */
  readonly detectRange: number
  /** 更近则后退 */
  readonly standoffDist: number
}
/** 蓄力前被打死则不炸 */
export interface DetonateLocomotion {
  readonly kind: 'detonate'
  /** 进入即定身蓄力 */
  readonly triggerRange: number
  readonly windupMs: number
  readonly blastRadius: number
  readonly blastDamage: number
}
/** 巢被拆后按 orphan 倍率强化并直扑玩家 */
export interface BaseOrbitLocomotion {
  readonly kind: 'baseOrbit'
  readonly orbitRadius: number
  /** 以巢为基准 */
  readonly aggroRange: number
  readonly orphanSpeedMul: number
  readonly orphanDamageMul: number
}
export type LocomotionDef =
  | { readonly kind: 'chase' }
  | { readonly kind: 'wander' }
  | { readonly kind: 'static' }
  | { readonly kind: 'flee'; readonly range: number }
  | { readonly kind: 'coinThief' }
  | StandoffLocomotion
  | DetonateLocomotion
  | BaseOrbitLocomotion
  | DashLocomotion
export interface SplitEffect {
  readonly kind: 'split'
  readonly into: EnemyDef
  readonly count: number
}
export interface DecoyEffect {
  readonly kind: 'decoy'
  readonly hp: number
  readonly durationMs: number
  readonly alpha: number
}
export type DeathEffect = Effect | SplitEffect | DecoyEffect
export interface EnemyDef {
  readonly kind:
    | 'zombie'
    | 'ghost'
    | 'mushroom'
    | 'blob'
    | 'blobling'
    | 'invader'
    | 'boar'
    | 'snake'
    | 'rat'
    | 'slime'
    | 'hive'
    | 'larva'
    | 'creeper'
    | 'rhino'
    | 'treant'
    | 'scorpion'
    | 'croc'
    | 'mecha'
    | 'elf'
    | 'turtle'
    | 'locust'
    | 'gargoyle'
    | 'puffer'
    | 'eclipse'
    | 'ufo'
    | 'alien'
    | 'comet'
    | 'blackhole'
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly size: number
  readonly radius: number
  readonly hp: number
  readonly speed: number
  readonly damage: number
  // 经验击杀即得；金币需拾取，波末消失
  readonly xp: number
  readonly coins: number
  readonly locomotion: LocomotionDef
  readonly abilities?: readonly AbilityDef[]
  readonly onDeath?: readonly DeathEffect[]
  readonly onContact?: readonly Effect[]
  readonly spawner?: {
    readonly into: EnemyDef
    readonly intervalMs: number
    readonly count: number
    /** 在场上限，达上限即停生 */
    readonly maxAlive: number
    readonly firstDelayMs?: number
  }
  readonly kbImmune?: boolean
  readonly phasesWalls?: boolean
  /** 仅冲刺态破墙 */
  readonly breaksWalls?: boolean
  /** 缺省 enemy */
  readonly role?: 'enemy' | 'boss'
}
export interface EnemyMixRow {
  readonly kind: string
  readonly sinceWave: number
  readonly base: number
  readonly perWave: number
  readonly min: number
  readonly max: number
}
export interface Difficulty {
  readonly spawn: {
    readonly startIntervalMs: number
    readonly minIntervalMs: number
    readonly rampSeconds: number
    readonly hpGrowthPerMin: number
    readonly maxAlive: number
    /** factor = teamFactorBase + teamFactorPerMember × 人数 */
    readonly teamFactorBase: number
    readonly teamFactorPerMember: number
    readonly telegraphMs: number
    readonly markEmoji: string
    readonly markSize: number
    readonly minPlayerDist: number
    readonly edgeInset: number
  }
  readonly elite: {
    readonly fromWave: number
    readonly chance: number
    readonly hpMul: number
    readonly speedMul: number
    readonly damageMul: number
    readonly sizeMul: number
    readonly xpMul: number
    readonly coinsMul: number
  }
  readonly surge: {
    readonly count: number
    readonly elites: number
    /** 陆续落地的时长 */
    readonly spreadMs: number
  }
  /** 终波常规刷怪间隔倍率 */
  readonly bossSpawnRelief: number
}
export interface AiTuning {
  /** 换向间隔 [turnMinMs, turnMinMs + turnJitterMs)；spawn* 为出生后首次换向 */
  readonly wander: {
    readonly turnMinMs: number
    readonly turnJitterMs: number
    readonly spawnTurnMinMs: number
    readonly spawnTurnJitterMs: number
  }
  /** 站位滞回带（格）：standoffDist ± band 内不动 */
  readonly standoffBandU: number
  readonly coinThiefEatCdMs: number
  /** 脱战时的速度倍率 */
  readonly fleeIdleSpeedMul: number
}
export interface EnemyMixEntry {
  def: EnemyDef
  weight: number
}
