import type { AbilityDef, Effect } from './abilityDefs'

type DashTrigger =
  | { readonly kind: 'detect'; readonly range: number; readonly cooldownMs: number }
  | { readonly kind: 'timer'; readonly intervalMs: number; readonly firstDelayMs?: number }
type DashLength =
  | { readonly kind: 'dist'; readonly dist: number }
  | { readonly kind: 'time'; readonly durationMs: number }
interface DashLocomotion {
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
interface StandoffLocomotion {
  readonly kind: 'standoff'
  readonly detectRange: number
  readonly standoffDist: number
}
interface DetonateLocomotion {
  readonly kind: 'detonate'
  readonly triggerRange: number
  readonly windupMs: number
  readonly blastRadius: number
  readonly blastDamage: number
}
interface BaseOrbitLocomotion {
  readonly kind: 'baseOrbit'
  readonly orbitRadius: number
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
    readonly maxAlive: number
    readonly firstDelayMs?: number
  }
  readonly kbImmune?: boolean
  readonly phasesWalls?: boolean
  readonly breaksWalls?: boolean
  readonly role?: 'enemy' | 'boss'
}
export interface EnemyMixRow {
  readonly kind: EnemyDef['kind']
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
    readonly spreadMs: number
  }
  readonly bossSpawnRelief: number
}
export interface AiTuning {
  readonly wander: {
    readonly turnMinMs: number
    readonly turnJitterMs: number
    readonly spawnTurnMinMs: number
    readonly spawnTurnJitterMs: number
  }
  readonly standoffBandU: number
  readonly coinThiefEatCdMs: number
  readonly fleeIdleSpeedMul: number
}
export interface EnemyMixEntry {
  def: EnemyDef
  weight: number
}
