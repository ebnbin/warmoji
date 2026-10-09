import type runsJson from '../assets/runs.json'
import type mutatorsJson from '../assets/mutators.json'
import type experimentsJson from '../assets/experiments.json'
import type { Polarity } from './battlefield'
import type { CharacterId, CharacterTag } from './characters'
import type { DriveDef, EnemyKind } from './enemies'
import type { Hazard, MapId } from './maps'
import type { MapCue, MapEvent, MapGauge } from '../data/signals'
import type { StatMods } from './stats'
import type { DifficultyCurve } from './waves'
import type { XpCurve } from './xp'

export type RunId = keyof typeof runsJson
export type MutatorId = keyof typeof mutatorsJson
export type ExperimentId = keyof typeof experimentsJson

/** 横幅：标题与一句提示 */
export interface Banner {
  readonly title: string
  readonly sub: string
}

/**
 * 敌人从哪来，不写是队长看得见的刷怪点：far 是离队伍远的刷怪点，ring 在队长周围 dist 格围成一圈，behind 在队长身后 dist 格，gate 是这张图的那一种出怪口；
 * 前几种定下的点再吸附到附近的出怪口
 */
export type SpawnAt =
  | { readonly kind: 'far' }
  | { readonly kind: 'ring'; readonly dist: number }
  | { readonly kind: 'behind'; readonly dist: number }
  | { readonly kind: 'gate'; readonly gate: string }

/** 配比里的一种敌人与它的权重 */
export interface MixEntry {
  readonly kind: EnemyKind
  readonly weight: number
}

/** 战利品倍率：乘在敌人掉的经验与金币上 */
export interface Loot {
  readonly xp?: number
  readonly coins?: number
}

/**
 * 一批敌人共有的特征：
 * enemy 指定种类，指定头目时血量不随难度时钟涨；mix 按这份配比抽；都不写就按这一阶段的配比。
 * drive 换掉指定敌人的走法；stats 是给它们的属性修正；eliteChance 是每只是精英的几率；
 * huntLeader 让它们里追人的都盯着队长；loot 乘在它们的经验与金币上；carry 让每只身上带一个这张地图效果池里这种极性的效果，打死掉在地上。
 */
export interface GroupTraits {
  readonly enemy?: EnemyKind
  readonly mix?: readonly MixEntry[]
  readonly drive?: DriveDef
  readonly stats?: StatMods
  readonly eliteChance?: number
  readonly huntLeader?: boolean
  readonly loot?: Loot
  readonly carry?: Polarity
}

/** 一队敌人：count 只，前 elites 只必是精英；spreadMs 内依次放出；bounty 为真时是悬赏目标；escort 是跟着这一队一起放出的另一种敌人，不算悬赏目标，也不带这一队的特征 */
export interface Squad extends GroupTraits {
  readonly count: number
  readonly elites?: number
  readonly spreadMs?: number
  readonly at?: SpawnAt
  readonly bounty?: boolean
  readonly escort?: Escort
}

/** 护卫：count 只 enemy，elite 为真时都是精英，stats 是给它们的属性修正 */
export interface Escort {
  readonly enemy: EnemyKind
  readonly count: number
  readonly elite?: boolean
  readonly stats?: StatMods
}

/** 连续刷怪：每隔 intervalMs 放一只，ramp 让间隔在 overMs 内匀速变到 toMs；不写间隔就按这一局的难度曲线、队伍人数与昼夜算，再乘 intervalMul；只在这一阶段开始后 fromMs 到 untilMs 之间刷，放满 total 只就停；场上敌人到 cap 就这一轮不刷 */
export interface StreamRule extends GroupTraits {
  readonly kind: 'stream'
  readonly intervalMs?: number
  readonly intervalMul?: number
  readonly ramp?: { readonly toMs: number; readonly overMs: number }
  readonly fromMs?: number
  readonly untilMs?: number
  readonly total?: number
  readonly cap?: number
  readonly at?: SpawnAt
}

/**
 * 这一阶段开始 atMs 后打出横幅，放出一队；写了 every 就每隔 every 再放一队，一共 times 队，不写 times 就一直放到这一阶段结束，横幅只在第一队打。
 * 写了 on 就不按阶段开始算：这一阶段里每当地图上发生一次这件事，过 atMs 放出一队、打一次横幅，写了 times 就最多放这么多队
 */
export interface BatchRule {
  readonly kind: 'batch'
  readonly atMs: number
  readonly squad: Squad
  readonly banner?: Banner
  readonly every?: number
  readonly times?: number
  readonly on?: MapEvent
}

/** 一组一组来：第一组在这一阶段开始 atMs 后，之后每次场上清空再隔 gapMs 来下一组 */
export interface WavesRule {
  readonly kind: 'waves'
  readonly atMs: number
  readonly gapMs: number
  readonly squads: readonly (Squad & { readonly banner?: Banner })[]
}

export type SpawnRule = StreamRule | BatchRule | WavesRule

/** 据点的一处：地图中心起偏 dx、dy 格，或这张图那一组地标里的第 nth 处（从 0 算，不写是第一处），地标会动的圈跟着动 */
export type HoldPoint = { readonly dx: number; readonly dy: number } | { readonly mark: string; readonly nth?: number }

/**
 * 一个阶段的结束规则，时刻与进度都从这一阶段开始时算，全灭永远是输。
 * 达成：time 撑到时间，boss 头目倒下，bossHp 场上的头目血量降到上限的 below 以下，cleared 定时、按地图事件放出的与成组的敌人都放完、连续刷怪也停了、场上一个不剩，kills 击杀到数（写了 enemy 只数这一种，写了 by 只数死于这种危害的），bounty 悬赏目标都倒下，hold 队长在据点圈里累计站满 ms、圈按 points 依次换位置、每处分到一样长，coins 捡到的金币到数，
 * event 地图上这件事发生到 count 次，gauge 地图的读数升过 above 或降过 below，visit 队长到访这一组地标里 count 处（不写是全部），每处在 radius 格内站满 ms。
 * 失败：time 带 lose 时到点就输，downs 队员累计倒下到数就输，event 与 gauge 带 lose 时满足了就输，leak 朝这一组地标行进的敌人走到 radius 格内（走到就离场）累计 count 只就输。
 */
export type EndRule =
  | { readonly kind: 'time'; readonly ms: number; readonly lose?: boolean }
  | { readonly kind: 'boss' }
  | { readonly kind: 'bossHp'; readonly below: number }
  | { readonly kind: 'cleared' }
  | { readonly kind: 'kills'; readonly count: number; readonly enemy?: EnemyKind; readonly by?: Hazard }
  | { readonly kind: 'bounty' }
  | { readonly kind: 'hold'; readonly ms: number; readonly radius: number; readonly points: readonly HoldPoint[] }
  | { readonly kind: 'coins'; readonly count: number }
  | { readonly kind: 'downs'; readonly count: number }
  | { readonly kind: 'event'; readonly event: MapEvent; readonly count: number; readonly lose?: boolean }
  | { readonly kind: 'gauge'; readonly gauge: MapGauge; readonly above?: number; readonly below?: number; readonly lose?: boolean }
  | { readonly kind: 'visit'; readonly mark: string; readonly count?: number; readonly radius: number; readonly ms: number }
  | { readonly kind: 'leak'; readonly mark: string; readonly radius: number; readonly count: number }

/**
 * 我方在一场里的规则，写在一局上对每一场生效，写在一场上只管这一场、盖过一局写的；倒下的队员不会自己起来：
 * rescue 让活着的队长在倒下的队员身边 radius 格内连续站满 ms 毫秒把他扶起来；
 * leader 里 lock 不许手动换队长，critical 队长倒下就输，switchCdMs 是手动换队长的冷却；
 * surprise 为真时敌人现身不打预兆；skills 为假时不能放主动技能；vision 是队长看得见的半径（格），外面一片漆黑；
 * harmless 为真时我方伤不了敌人：出手照样命中，击退、控制与附带的效果照常，只是不掉血，敌人只能死于地图上的危害；relay 是每隔多少毫秒自动把队长交给名单上的下一名活着的队员；
 * mods 是给队伍的常驻修正，一局与一场写的叠加。
 */
export interface FightRules {
  readonly rescue?: { readonly ms: number; readonly radius: number }
  readonly leader?: { readonly lock?: boolean; readonly critical?: boolean; readonly switchCdMs?: number }
  readonly surprise?: boolean
  readonly skills?: boolean
  readonly vision?: number
  readonly harmless?: boolean
  readonly relay?: number
  readonly mods?: StatMods
}

/** 一局里我方的规则：每一场的规则之外，lives 是全队共享的起来次数（被扶起来、被技能救起来都算一次）；mods 在商店里也算。场与场之间不休整：活着的带着残血，倒下的进下一场还倒着 */
export interface RunRules extends FightRules {
  readonly lives?: number
}

/** 星级条件，赢下一局时按整局评定：downs 队员倒下不超过 count 次，time 战斗用时不超过 ms，switches 手动换队长不超过 count 次，skills 放主动技能不超过 count 次，kills 击杀至少 count，hazard 全队受到 by 这种危害的伤害不超过 damage */
export type StarRule =
  | { readonly kind: 'downs'; readonly count: number }
  | { readonly kind: 'time'; readonly ms: number }
  | { readonly kind: 'switches'; readonly count: number }
  | { readonly kind: 'skills'; readonly count: number }
  | { readonly kind: 'kills'; readonly count: number }
  | { readonly kind: 'hazard'; readonly by: Hazard; readonly damage: number }

/** 词缀对我方规则的改动，只能往难里改 */
export interface MutatorRules {
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

/** 过关奖励：coins 是额外的金币 */
export interface FightReward {
  readonly coins?: number
}

/** 对地图下的一条指令：这一阶段开始 atMs 后让地图做一次 cue，写了 every 就每隔 every 再做一次，一共 times 次，不写 times 就一直做到这一阶段结束 */
export interface CueRule {
  readonly cue: MapCue
  readonly atMs: number
  readonly every?: number
  readonly times?: number
}

/** 一个阶段：intro 是开始时的横幅，mix 是没指定敌人的那批按的配比，spawns 刷什么怪，cues 对地图下的指令，ends 怎么结束；need 为 all 时达成条件要全部达成，不写达成一条就算 */
export interface PhaseDef {
  readonly intro?: Banner
  readonly mix?: readonly MixEntry[]
  readonly spawns: readonly SpawnRule[]
  readonly cues?: readonly CueRule[]
  readonly ends: readonly EndRule[]
  readonly need?: 'all'
}

/** 一场战斗：map 是在哪张地图上打，phases 按先后不停顿地接上，场上的敌人留着，最后一个阶段达成才算这一场赢；enemyMods 是给这一场敌人的常驻修正，chaseLeader 让追人的敌人都盯着队长，rules 是我方在这一场的规则，reward 是过关奖励，clockSec 是开打时难度时钟走到的秒数（敌人的血量、刷怪间隔与掉币率都从这一秒往后算），不写就接着一局累计打过的时长 */
export interface FightDef {
  readonly name: string
  readonly map: MapId
  readonly phases: readonly PhaseDef[]
  readonly enemyMods?: StatMods
  readonly chaseLeader?: boolean
  readonly rules?: FightRules
  readonly reward?: FightReward
  readonly clockSec?: number
}

/** 一步：招募到 upTo 人；进商店，物价与稀有度按第 tier 波算；打一场 */
export type StepDef = { readonly kind: 'recruit'; readonly upTo: number } | { readonly kind: 'shop'; readonly tier: number } | { readonly kind: 'fight'; readonly fight: FightDef }

/** 全队升级：队员不靠买道具升级，而是击杀攒全队经验、按这条曲线升级，每升一级掉一个升级道具，队长捡起来选一项：给场上一人升一级，或让一人满生命上场（招募、替换、恢复） */
export type TeamLevelDef = XpCurve

/** 预设队伍的一个位置：指定角色，或从同时带着这些标签的角色里随机一名 */
export type TeamSlot = CharacterId | { readonly tags: readonly CharacterTag[] }

/** 预设队伍：第一个位置是队长，level 是队员的等级下限 */
export interface TeamDef {
  readonly slots: readonly TeamSlot[]
  readonly level?: number
}

/**
 * 一局的玩法：按顺序走完这些步骤就赢，全灭就输。
 * team 为 knobs 时是沙盒：队伍与刷怪都由旋钮给出；是 TeamDef 时开局就按它组队，不写就靠招募步骤组建；rules 是我方这一局的规则；teamLevel 让队员靠全队升级成长；curve 是这一局的难度曲线，不写按默认的；coins 是开局的金币；note 写这一关在试什么；stars 是赢下后再各得一星的两条条件；
 * chapter 写了，这一局就是冒险里这张图的那一章：各场都打在这张图上，每逛完一次商店，下一场就在同一主题上按新种子重新生成地图。
 */
export interface RunDef {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly note?: string
  readonly chapter?: MapId
  readonly team?: 'knobs' | TeamDef
  readonly rules?: RunRules
  readonly teamLevel?: TeamLevelDef
  readonly curve?: DifficultyCurve
  readonly coins?: number
  readonly stars?: readonly [StarRule, StarRule]
  readonly steps: readonly StepDef[]
}

/**
 * 实验：一种新玩法的最小单位，就是一场战斗，地图、阶段、刷怪、目标与这一场的我方规则都写在 fight 里，放进哪一局的步骤里都照样能打。
 * 单独试玩时按 team 组队打这一场，stars 是赢下后再各得一星的两条条件；name、desc 与 note 同一局
 */
export interface ExperimentDef {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly note: string
  readonly team: TeamDef
  readonly stars: readonly [StarRule, StarRule]
  readonly fight: FightDef
}
