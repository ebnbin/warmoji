import type runsJson from '../assets/runs.json'

export type RunId = keyof typeof runsJson

/** 横幅：标题与一句提示 */
export interface Banner {
  readonly title: string
  readonly sub: string
}

/** 一队敌人：按这一场的配比抽，前 elites 只必是精英、其余各有 eliteChance 的几率，spreadMs 内依次放出 */
export interface Squad {
  readonly count: number
  readonly elites?: number
  readonly eliteChance?: number
  readonly spreadMs?: number
}

/** 连续刷怪：按进度的刷怪间隔与地图配比，间隔再乘 intervalMul；每只有 eliteChance 的几率是精英 */
export interface StreamRule {
  readonly kind: 'stream'
  readonly intervalMul?: number
  readonly eliteChance?: number
}
/** 开打 atMs 后打出横幅，放出一队 */
export interface BatchRule {
  readonly kind: 'batch'
  readonly atMs: number
  readonly squad: Squad
  readonly banner?: Banner
}
/** 开打 atMs 后这张图的头目登场 */
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
export type SpawnRule = StreamRule | BatchRule | BossRule | CarrierRule | KnobRule

/** 结束规则，任一条满足就赢：time 撑到时间，boss 头目倒下；全灭永远是输 */
export type EndRule = { readonly kind: 'time'; readonly ms: number } | { readonly kind: 'boss' }

/** 一场战斗：刷什么怪、什么时候结束；不写名字就只显示用时 */
export interface FightDef {
  readonly name?: string
  readonly spawns: readonly SpawnRule[]
  readonly ends: readonly EndRule[]
}

/** 一步：招募到 upTo 人、进商店、打一场 */
export type StepDef = { readonly kind: 'recruit'; readonly upTo: number } | { readonly kind: 'shop' } | { readonly kind: 'fight'; readonly fight: FightDef }

/** 一局的玩法：按顺序走完这些步骤就赢，全灭就输。team 为 knobs 时队伍由试炼场的旋钮给出，不写就靠招募步骤组建；record 为真时结算记最高分 */
export interface RunDef {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly team?: 'knobs'
  readonly coins?: number
  readonly record?: boolean
  readonly steps: readonly StepDef[]
}
