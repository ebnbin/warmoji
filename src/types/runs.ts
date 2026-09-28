import type runsJson from '../assets/runs.json'
import type mutatorsJson from '../assets/mutators.json'
import type { CharacterId, CharacterTag } from './characters'
import type { DriveDef, EnemyKind } from './enemies'
import type { ItemRarity } from './items'
import type { MapId } from './maps'
import type { StatMods } from './stats'

export type RunId = keyof typeof runsJson
export type MutatorId = keyof typeof mutatorsJson

/** 横幅：标题与一句提示 */
export interface Banner {
  readonly title: string
  readonly sub: string
}

/** 敌人从哪来，不写是队长看得见的刷怪点：far 是离队伍远的刷怪点，ring 在队长周围 dist 格围成一圈，behind 在队长身后 dist 格，point 是地图中心起偏 dx、dy 格再散开 spread 格 */
export type SpawnAt =
  | { readonly kind: 'far' }
  | { readonly kind: 'ring'; readonly dist: number }
  | { readonly kind: 'behind'; readonly dist: number }
  | { readonly kind: 'point'; readonly dx: number; readonly dy: number; readonly spread?: number }

/** 配比里的一种敌人与它的权重 */
export interface MixEntry {
  readonly kind: EnemyKind
  readonly weight: number
}

/** 一队敌人：不写 enemy 就按这一场的配比抽，指定头目时血量不随进度涨；前 elites 只必是精英、其余各有 eliteChance 的几率；spreadMs 内依次放出；hpMul 乘在血量上；drive 换掉指定敌人的走法；bounty 为真时是悬赏目标；escort 是跟着这一队一起放出的另一种敌人，不算悬赏目标 */
export interface Squad {
  readonly count: number
  readonly enemy?: EnemyKind
  readonly elites?: number
  readonly eliteChance?: number
  readonly spreadMs?: number
  readonly at?: SpawnAt
  readonly hpMul?: number
  readonly drive?: DriveDef
  readonly bounty?: boolean
  readonly escort?: Escort
}

/** 护卫：count 只 enemy，elite 为真时都是精英 */
export interface Escort {
  readonly enemy: EnemyKind
  readonly count: number
  readonly elite?: boolean
}

/** 连续刷怪：间隔不写 intervalMs 就按进度与队伍人数算，再乘 intervalMul；每只有 eliteChance 的几率是精英；只在开打后 fromMs 到 untilMs 之间刷；场上敌人到 cap 就这一轮不刷 */
export interface StreamRule {
  readonly kind: 'stream'
  readonly intervalMs?: number
  readonly intervalMul?: number
  readonly eliteChance?: number
  readonly fromMs?: number
  readonly untilMs?: number
  readonly cap?: number
  readonly at?: SpawnAt
}
/** 开打 atMs 后打出横幅，放出一队 */
export interface BatchRule {
  readonly kind: 'batch'
  readonly atMs: number
  readonly squad: Squad
  readonly banner?: Banner
}
/** 一组一组来：第一组在开打 atMs 后，之后每次场上清空再隔 gapMs 来下一组 */
export interface WavesRule {
  readonly kind: 'waves'
  readonly atMs: number
  readonly gapMs: number
  readonly squads: readonly (Squad & { readonly banner?: Banner })[]
}
/** 开打 atMs 后这张图的头目登场；别的头目按一队敌人指定 */
export interface BossRule {
  readonly kind: 'boss'
  readonly atMs: number
}
/** 带光圈的敌人：从 atMs 起 spanMs 内依次放出，先增益后减益，效果从地图的效果池里抽 */
export interface CarrierRule {
  readonly kind: 'carriers'
  readonly buff: number
  readonly debuff: number
  readonly atMs: number
  readonly spanMs: number
}
/** 试炼场：按旋钮刷怪 */
export interface KnobRule {
  readonly kind: 'knobs'
}
export type SpawnRule = StreamRule | BatchRule | WavesRule | BossRule | CarrierRule | KnobRule

/** 据点的一处：地图中心起偏 dx、dy 格 */
export interface HoldPoint {
  readonly dx: number
  readonly dy: number
}

/**
 * 结束规则，全灭永远是输。
 * 获胜：time 撑到时间，boss 头目倒下，cleared 定时与成组的敌人都放完、连续刷怪也停了、场上一个不剩，kills 本场击杀到数，bounty 悬赏目标都倒下，hold 队长在据点圈里累计站满 ms、圈按 points 依次换位置、每处分到一样长，coins 本场捡到的金币到数。
 * 失败：time 带 lose 时到点就输，downs 本场队员累计倒下到数就输。
 */
export type EndRule =
  | { readonly kind: 'time'; readonly ms: number; readonly lose?: boolean }
  | { readonly kind: 'boss' }
  | { readonly kind: 'cleared' }
  | { readonly kind: 'kills'; readonly count: number }
  | { readonly kind: 'bounty' }
  | { readonly kind: 'hold'; readonly ms: number; readonly radius: number; readonly points: readonly HoldPoint[] }
  | { readonly kind: 'coins'; readonly count: number }
  | { readonly kind: 'downs'; readonly count: number }

/**
 * 我方在一场里的规则，写在一局上对每一场生效，写在一场上只管这一场、盖过一局写的：
 * revive 为假时倒下的队员不会自己起来；rescue 让活着的队长在倒下的队员身边 radius 格内连续站满 ms 毫秒把他扶起来；
 * leader 里 lock 不许手动换队长，critical 队长倒下就输，switchCdMs 是手动换队长的冷却；
 * surprise 为真时敌人现身不打预兆；skills 为假时不能放主动技能；vision 是队长看得见的半径（格），外面一片漆黑；
 * mods 是给队伍的常驻修正，一局与一场写的叠加。
 */
export interface FightRules {
  readonly revive?: boolean
  readonly rescue?: { readonly ms: number; readonly radius: number }
  readonly leader?: { readonly lock?: boolean; readonly critical?: boolean; readonly switchCdMs?: number }
  readonly surprise?: boolean
  readonly skills?: boolean
  readonly vision?: number
  readonly mods?: StatMods
}

/** 场与场之间：carry 活着的带着残血、倒下的回三成血；full 每场满血；permadeath 活着的带着残血，一场打完时还倒着的这一局都回不来 */
export type Between = 'carry' | 'full' | 'permadeath'

/** 商店：rarity 只摆出这个范围里的稀有度，两头都含；reroll 为假时不能刷新 */
export interface ShopRules {
  readonly rarity?: { readonly min?: ItemRarity; readonly max?: ItemRarity }
  readonly reroll?: boolean
}

/** 一局里我方的规则：每一场的规则之外，lives 是全队共享的起来次数（自己起来、被扶起来、被技能救起来都算一次），between 是场与场之间怎么恢复，recruit 只许招募同时带着这些标签的角色，shop 是商店规则，maxLevel 是队员的等级上限；mods 在商店里也算 */
export interface RunRules extends FightRules {
  readonly lives?: number
  readonly between?: Between
  readonly recruit?: { readonly tags: readonly CharacterTag[] }
  readonly shop?: ShopRules
  readonly maxLevel?: number
}

/** 星级条件，赢下一局时按整局评定：downs 队员倒下不超过 count 次，time 战斗用时不超过 ms，switches 手动换队长不超过 count 次，skills 放主动技能不超过 count 次，kills 击杀至少 count，lives 剩下至少 count 次起来的机会 */
export type StarRule =
  | { readonly kind: 'downs'; readonly count: number }
  | { readonly kind: 'time'; readonly ms: number }
  | { readonly kind: 'switches'; readonly count: number }
  | { readonly kind: 'skills'; readonly count: number }
  | { readonly kind: 'kills'; readonly count: number }
  | { readonly kind: 'lives'; readonly count: number }

/** 词缀对我方规则的改动，只能往难里改 */
export interface MutatorRules {
  readonly revive?: false
  readonly leader?: { readonly lock?: true; readonly critical?: true }
  readonly surprise?: true
  readonly skills?: false
  readonly vision?: number
  readonly mods?: StatMods
}

/** 开局前玩家自选的词缀：rules 盖在每一场的我方规则上，视野取更小的；enemyMods 加给每一场的敌人；heat 是它算几点热度 */
export interface MutatorDef {
  readonly emoji: string
  readonly name: string
  readonly heat: number
  readonly rules?: MutatorRules
  readonly enemyMods?: StatMods
}

/** 过关奖励：coins 是额外的金币，heal 为真时全队回满血进下一场 */
export interface FightReward {
  readonly coins?: number
  readonly heal?: boolean
}

/** 一场战斗：刷什么怪、什么时候结束；map 让这一场换到这张地图上打，不写就在一局的地图上；intro 是开打时的横幅，mix 换掉地图的配比，enemyMods 是这一场给敌人的常驻修正，chaseLeader 让追人的敌人都盯着队长，rules 是我方在这一场的规则，reward 是过关奖励，clockSec 让这一场从难度时钟的这一秒开打（敌人的血量、刷怪间隔与掉币率都从这一秒往后算），不写就接着一局累计打过的时长；不写名字就只显示用时 */
export interface FightDef {
  readonly name?: string
  readonly map?: MapId
  readonly intro?: Banner
  readonly mix?: readonly MixEntry[]
  readonly spawns: readonly SpawnRule[]
  readonly ends: readonly EndRule[]
  readonly enemyMods?: StatMods
  readonly chaseLeader?: boolean
  readonly rules?: FightRules
  readonly reward?: FightReward
  readonly clockSec?: number
}

/** 一步：招募到 upTo 人、进商店、打一场 */
export type StepDef = { readonly kind: 'recruit'; readonly upTo: number } | { readonly kind: 'shop' } | { readonly kind: 'fight'; readonly fight: FightDef }

/** 预设队伍的一个位置：指定角色，或从同时带着这些标签的角色里随机一名 */
export type TeamSlot = CharacterId | { readonly tags: readonly CharacterTag[] }

/** 预设队伍：第一个位置是队长，level 是队员的等级下限 */
export interface TeamDef {
  readonly slots: readonly TeamSlot[]
  readonly level?: number
}

/**
 * 一局的玩法：按顺序走完这些步骤就赢，全灭就输。
 * map 固定地图，不写由玩家选；team 为 knobs 时队伍由试炼场的旋钮给出，是 TeamDef 时开局就按它组队，不写就靠招募步骤组建；rules 是我方这一局的规则；start 是开局的进度，波数定配比、物价与稀有度，秒数定敌人的血量与刷怪间隔；record 为真时结算记最高分；note 写这一关在试什么；stars 是赢下后再各得一星的两条条件。
 */
export interface RunDef {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly note?: string
  readonly map?: MapId
  readonly team?: 'knobs' | TeamDef
  readonly rules?: RunRules
  readonly start?: { readonly wave: number; readonly sec: number }
  readonly coins?: number
  readonly record?: boolean
  readonly stars?: readonly [StarRule, StarRule]
  readonly steps: readonly StepDef[]
}
