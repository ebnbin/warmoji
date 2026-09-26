import type { AbilityDef, Effect } from './abilityDefs'

/** 驱动：身体没事时怎么走；蓄力突刺、自爆这类"动作"是能力，不在这里 */
export type DriveDef =
  | { readonly kind: 'chase'; readonly at?: 'leader' }
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
type DeathEffect = Effect | SplitEffect | DecoyEffect
/** 资源：能量按秒回复、出手消耗；怒气打中人涨、闲了掉；热量出手涨、满了过热；成长击杀涨、满了触发 full；full 是攒满时施于自身的效果，lockMs 期间耗资源的能力出不了手 */
export interface ResourceDef {
  readonly kind: 'energy' | 'fury' | 'heat' | 'growth'
  readonly max: number
  readonly start?: number
  readonly regen?: number
  readonly decay?: number
  readonly decayDelayMs?: number
  readonly onHit?: number
  readonly onHurt?: number
  readonly onKill?: number
  readonly full?: { readonly effects?: readonly Effect[]; readonly lockMs?: number; readonly reset?: boolean }
}
/** 身体自己的规则：被命中、击杀、锚点消失时施于自身；被接触时施于碰我的人；接触时施于被我碰到的人；死亡以尸体位置为落点 */
export interface BodyRules {
  readonly resource?: ResourceDef
  /** 致命一击：本条命第一次生命归零时不死，改施加这些效果 */
  readonly onLethal?: readonly Effect[]
  /** 残血：本条命第一次生命低于 ratio 时施于自身 */
  readonly onLowHp?: { readonly ratio: number; readonly effects: readonly Effect[] }
  /** 闲着：ms 内没出手（still 为真时还要没动）就施于自身，出手后重新计 */
  readonly onIdle?: { readonly ms: number; readonly still?: boolean; readonly effects: readonly Effect[] }
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
  | 'chameleon'
  | 'skeleton'
  | 'knight'
  | 'crab'
  | 'raccoon'
  | 'siren'
  | 'sapling'
  | 'tree'
  | 'pylon'
  | 'swan'
/** 一种形态：换外观、换能力、换走法、换体型；不写的沿用本体 */
export interface FormDef {
  readonly emoji?: string
  readonly name?: string
  readonly abilities?: readonly AbilityDef[]
  readonly drive?: DriveDef
  readonly sizeMul?: number
  readonly speedMul?: number
  readonly anchored?: boolean
  readonly damage?: number
}
/** 一个会动会打的非玩家身体：敌人、召唤出的分身与亡仆都用它；kind 是敌人的身份，召唤物没有 */
export interface NpcDef extends BodyRules {
  readonly kind?: EnemyKind
  readonly emoji: string
  readonly name: string
  readonly size: number
  readonly radius: number
  readonly hp: number
  readonly speed: number
  readonly damage: number
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
  /** 可切换的形态，第 0 个是本体以外的第一个；form 效果按下标切换 */
  readonly forms?: readonly FormDef[]
  /** 坐骑：先扣它的生命，扣光后切到 form 形态 */
  readonly mount?: { readonly hp: number; readonly form: number; readonly emoji?: string }
  /** 延时成长：出生 ms 后还活着就长成 into */
  readonly grow?: { readonly ms: number; readonly into: EnemyDef }
  /** 依存无敌：自己召出的这种身体还有活着的，就打不动 */
  readonly guardedBy?: EnemyKind
}
export interface EnemyDef extends NpcDef {
  readonly kind: EnemyKind
  readonly desc: string
  readonly xp: number
  readonly coins: number
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
    readonly dormantTtlMs: number
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
  readonly idleSpeedMul: { readonly chase: number; readonly standoff: number; readonly coinThief: number; readonly flee: number }
  readonly firstShot: { readonly minMs: number; readonly jitterMs: number }
}
export interface EnemyMixEntry {
  def: EnemyDef
  weight: number
}
