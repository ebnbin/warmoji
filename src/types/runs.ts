import type runsJson from '../assets/runs.json'
import type { CharacterId, CharacterTag } from './characters'
import type { DriveDef, EnemyKind } from './enemies'
import type { MapId } from './maps'
import type { StatMods } from './stats'

export type RunId = keyof typeof runsJson

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

/** 一队敌人：不写 enemy 就按这一场的配比抽，指定头目时血量不随进度涨；前 elites 只必是精英、其余各有 eliteChance 的几率；spreadMs 内依次放出；hpMul 乘在血量上；drive 换掉指定敌人的走法；bounty 为真时是悬赏目标 */
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

/** 一场战斗：刷什么怪、什么时候结束；intro 是开打时的横幅，mix 换掉地图的配比，mods 是这一场给两边的常驻修正，chaseLeader 让追人的敌人都盯着队长，noRevive 倒下的队员这一场不再起来；不写名字就只显示用时 */
export interface FightDef {
  readonly name?: string
  readonly intro?: Banner
  readonly mix?: readonly MixEntry[]
  readonly spawns: readonly SpawnRule[]
  readonly ends: readonly EndRule[]
  readonly mods?: { readonly team?: StatMods; readonly enemy?: StatMods }
  readonly chaseLeader?: boolean
  readonly noRevive?: boolean
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
 * map 固定地图，不写由玩家选；team 为 knobs 时队伍由试炼场的旋钮给出，是 TeamDef 时开局就按它组队，不写就靠招募步骤组建；start 是开局的进度，波数定配比、物价与稀有度，秒数定敌人的血量与刷怪间隔；record 为真时结算记最高分；note 写这一关在试什么。
 */
export interface RunDef {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly note?: string
  readonly map?: MapId
  readonly team?: 'knobs' | TeamDef
  readonly start?: { readonly wave: number; readonly sec: number }
  readonly coins?: number
  readonly record?: boolean
  readonly steps: readonly StepDef[]
}
