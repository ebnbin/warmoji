import type { AbilityDef, Effect } from './abilityDefs'

/** 驱动：身体没事时怎么走；蓄力突刺、自爆这类"动作"是能力，不在这里 */
export type DriveDef =
  | { readonly kind: 'chase' }
  | { readonly kind: 'wander' }
  | { readonly kind: 'stay' }
  | { readonly kind: 'flee'; readonly range: number }
  | { readonly kind: 'coinThief' }
  | { readonly kind: 'standoff'; readonly detectRange: number; readonly standoffDist: number }
  | { readonly kind: 'orbit'; readonly radius: number; readonly aggroRange: number }
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
/** 身体自己的规则：被命中、击杀、锚点消失时施于自身；被接触时施于碰我的人；接触时施于被我碰到的人；死亡以尸体位置为落点 */
export interface BodyRules {
  readonly onHurt?: readonly Effect[]
  readonly onTouched?: readonly Effect[]
  readonly onTouch?: readonly Effect[]
  readonly onKill?: readonly Effect[]
  readonly onDeath?: readonly DeathEffect[]
  readonly onAnchorLost?: readonly Effect[]
}
export type EnemyKind =
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
export interface EnemyDef extends BodyRules {
  readonly kind: EnemyKind
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
  readonly drive: DriveDef
  readonly abilities?: readonly AbilityDef[]
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
  readonly kind: EnemyKind
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
