import type { AbilityDef, Cond, Effect, ReactionBase } from './abilityDefs'
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
/** 分裂：死后裂成 count 只 into，不写 into 的裂成自己这一种的普通版 */
export interface SplitEffect {
  readonly kind: 'split'
  readonly into?: EnemyDef
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
 * idle ms 内没出手（still 为真时还要没动）就施于自身，出手后重新计；touched 被接触时施于碰我的人，touch 接触时施于被我碰到的人；idle、death 每种最多一条，lowHp 最多八条
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
  /** 残血线，按比例从高到低 */
  readonly onLowHp?: readonly { readonly ratio: number; readonly effects: readonly Effect[] }[]
  readonly onIdle?: { readonly ms: number; readonly still?: boolean; readonly effects: readonly Effect[] }
  readonly onHurt?: readonly Effect[]
  readonly onTouched?: readonly Effect[]
  readonly onTouch?: readonly Effect[]
  readonly onKill?: readonly Effect[]
  readonly onDeath?: readonly DeathEffect[]
  readonly onAnchorLost?: readonly Effect[]
}
/**
 * 单位天生的特质，地图规则按它区别对待：swims 在水里照常游（不被水流冲走、追人时能下水），breathes 要换气（深海里离开气口会缺氧），
 * phases 穿得过能穿的墙与岩石，fireproof 不怕岩浆，coldproof 不怕冰水，anchored 推不动、也不被地图机关搬走，wary 会绕开致命的地方；
 * 会不会飞不写在这里，看身段：脚下那层离了地就是飞着的
 */
export type UnitTrait = 'swims' | 'breathes' | 'phases' | 'fireproof' | 'coldproof' | 'anchored' | 'wary'
/** 角色与敌人共用的写法：外观、名字、特质、反应、资源与形态 */
export interface UnitBase {
  readonly emoji: string
  readonly name: string
  readonly traits?: readonly UnitTrait[]
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
  /** 换成这一形态时的特质，不写沿用本体 */
  readonly traits?: readonly UnitTrait[]
  readonly damage?: number
}
/** 按条件换走法：self 是自己，target 是离自己最近的敌人 */
export interface DriveRule {
  readonly if: Cond
  readonly drive: DriveDef
}
/** 头目的一个阶段：生命第一次低于 below 时进入，换上这一段的招式、走法与属性（不写的沿用上一段），进入时对自己施加 effects；两段都有的同一招保留冷却 */
export interface PhaseDef {
  readonly below: number
  readonly name?: string
  readonly abilities?: readonly AbilityDef[]
  readonly drive?: DriveDef
  readonly stats?: StatMods
  readonly effects?: readonly Effect[]
}
/** 一个会动会打的非玩家身体：敌人、召唤出的分身与亡仆都用它；kind 是敌人的身份，召唤物没有；一个身体同一时间只做一件事，前摇、连发、冲刺没完别的招等着 */
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
  /** 按条件换走法：每一刻取第一条成立的，都不成立用本来的 */
  readonly drives?: readonly DriveRule[]
  readonly abilities?: readonly AbilityDef[]
  /** 公共冷却：出完一招后这么久内别的招不出 */
  readonly gcdMs?: number
  /** 头目阶段，按生命线从高到低排 */
  readonly phases?: readonly PhaseDef[]
  readonly spawner?: {
    readonly into: EnemyDef
    readonly intervalMs: number
    readonly count: number
    readonly maxAlive: number
    readonly firstDelayMs?: number
  }
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
    /** 精英出生时随机挂上 min 到 max 个不重样的词缀 */
    readonly affixes: { readonly min: number; readonly max: number }
  }
  readonly surge: {
    readonly count: number
    readonly elites: number
    readonly spreadMs: number
  }
  /** 控制韧性：头目与精英被控制的时间累进条里，打断了正在蓄的力或连发也算 interruptMs；满了解掉控制、霸体 steadfastMs 并清空；不被控制时整条 drainMs 回落到空 */
  readonly tenacity: {
    readonly boss: Tenacity
    readonly elite: Tenacity
    readonly interruptMs: number
    readonly drainMs: number
  }
}
/** 多少毫秒的控制填满条，满了霸体多久 */
export interface Tenacity {
  readonly fillMs: number
  readonly steadfastMs: number
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
