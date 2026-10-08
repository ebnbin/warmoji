import type { AbilityDef, Effect, ReactionBase } from './abilityDefs'
import type { Span } from './obstacles'
import type { StatBase, StatMods } from './stats'
import type { DifficultyCurve } from './waves'

/** 驱动：身体没事时怎么走，march 是朝这张图那一组地标里最近的一处行进，不理会队伍；蓄力突刺、自爆这类"动作"是能力，不在这里 */
export type DriveDef =
  | { readonly kind: 'chase'; readonly at?: 'leader' }
  | { readonly kind: 'wander' }
  | { readonly kind: 'stay' }
  | { readonly kind: 'flee'; readonly range: number }
  | { readonly kind: 'coinThief' }
  | { readonly kind: 'standoff'; readonly detectRange: number; readonly standoffDist: number }
  | { readonly kind: 'orbit'; readonly radius: number; readonly aggroRange: number }
  | { readonly kind: 'march'; readonly mark: string }
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
/** 资源：能量按秒回复、出手消耗；怒气打中人涨、闲了掉；热量出手涨、满了过热；成长击杀涨、满了触发 full；full 是攒满时施于自身的效果，lockMs 期间耗资源的能力出不了手；keep 为真时角色的资源跨波保留 */
export interface ResourceDef {
  readonly kind: 'energy' | 'fury' | 'heat' | 'growth'
  readonly keep?: boolean
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
/** 死亡：以尸体位置为落点，还能分裂、留下替身 */
interface DeathReaction {
  readonly on: 'death'
  readonly to: 'spot'
  readonly effects: readonly DeathEffect[]
}
/**
 * 身体的反应：hurt 挨打、kill 击杀、anchorLost 锚点消失时施于自身；lethal 本条命第一次生命归零时不死，改施加这些；lowHp 本条命第一次生命低于 ratio 时施于自身；
 * idle ms 内没出手（still 为真时还要没动）就施于自身，出手后重新计；touched 被接触时施于碰我的人，touch 接触时施于被我碰到的人；lowHp、idle、death 每种最多一条
 */
export type BodyReaction =
  | (ReactionBase &
      (
        | { readonly on: 'hurt' | 'kill'; readonly to: 'self'; readonly chance?: number }
        | { readonly on: 'touch' | 'touched'; readonly to: 'other'; readonly chance?: number }
        | { readonly on: 'lethal'; readonly to: 'self' }
        | { readonly on: 'anchorLost'; readonly to: 'self' }
        | { readonly on: 'lowHp'; readonly ratio: number; readonly to: 'self' }
        | { readonly on: 'idle'; readonly ms: number; readonly still?: boolean; readonly to: 'self' }
      ))
  | DeathReaction
/** 身体的规则表：反应按事件编好，运行时按事件查 */
export interface BodyRules {
  readonly resource?: ResourceDef
  readonly onLethal?: readonly Effect[]
  readonly onLowHp?: { readonly ratio: number; readonly effects: readonly Effect[] }
  readonly onIdle?: { readonly ms: number; readonly still?: boolean; readonly effects: readonly Effect[] }
  readonly onHurt?: readonly Effect[]
  readonly onTouched?: readonly Effect[]
  readonly onTouch?: readonly Effect[]
  readonly onKill?: readonly Effect[]
  readonly onDeath?: readonly DeathEffect[]
  readonly onAnchorLost?: readonly Effect[]
}
/** 角色与敌人共用的写法：外观、名字、反应、资源与形态 */
export interface UnitBase {
  readonly emoji: string
  readonly name: string
  readonly reactions?: readonly BodyReaction[]
  readonly resource?: ResourceDef
  /** 可切换的形态，第 0 个是本体以外的第一个；form 效果按下标切换；角色的主动技能不随形态换 */
  readonly forms?: readonly FormDef[]
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
/** 一种形态：换外观、换能力、换走法、改属性、换身段；不写的沿用本体 */
export interface FormDef {
  readonly emoji?: string
  readonly name?: string
  readonly span?: Span
  readonly abilities?: readonly AbilityDef[]
  readonly drive?: DriveDef
  readonly stats?: StatMods
  readonly anchored?: boolean
  readonly damage?: number
}
/** 一个会动会打的非玩家身体：敌人、召唤出的分身与亡仆都用它；kind 是敌人的身份，召唤物没有 */
export interface NpcDef extends UnitBase {
  readonly kind?: EnemyKind
  readonly size: number
  readonly radius: number
  /** 竖直方向占哪几层，不写是标准身体 */
  readonly span?: Span
  readonly hp: number
  readonly speed: number
  readonly damage: number
  /** 生命与移速以外的基础属性，如护甲、闪避、体力；赶路耗体力为 0 是不知疲倦 */
  readonly stats?: Omit<StatBase, 'maxHp' | 'moveSpeed'>
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
export interface Difficulty {
  /** 没写难度曲线的一局按这一条 */
  readonly curve: DifficultyCurve
  readonly spawn: {
    readonly maxAlive: number
    readonly telegraphMs: number
    readonly markEmoji: string
    readonly markSize: number
    readonly minPlayerDist: number
    readonly edgeInset: number
  }
  readonly elite: {
    readonly stats: StatMods
    readonly xpMul: number
    readonly coinsMul: number
  }
  readonly surge: {
    readonly count: number
    readonly elites: number
    readonly spreadMs: number
  }
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
