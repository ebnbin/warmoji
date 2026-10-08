import type Phaser from 'phaser'
import type { Polarity } from '../types/battlefield'
import type { StatValues } from '../types/stats'

export interface HudSnapshot {
  xp: number
  xpNext: number
  /** 全队等级；不靠全队升级的一局是 null */
  level: number | null
  /** 升上去了还没领的次数 */
  levelUps: number
  kills: number
  coins: number
  /** 这一场的名字；没有就只显示用时 */
  label: string | null
  seconds: number
  /** 离时限还有多久；没有时限是 null，显示已用时 */
  remainMs: number | null
  /** 这一场的目标与进度：warn 为真的是提醒会输的 */
  goals: readonly { readonly text: string; readonly warn: boolean }[]
  /** 场上活着的头目，按出场先后 */
  bosses: readonly BossBar[]
  battleFx: { emoji: string; name: string; desc: string; polarity: Polarity; remainMs: number; totalMs: number }[]
  /** 在紫晶洞里打的一局才有：太阳月亮在天上哪儿、离天黑或天亮还有多久 */
  clock: ClockSnapshot | null
  /** 在深海打的一局才有：潜艇停着、快开走还是开走了，这一段还剩多少 */
  submarine: SubmarineSnapshot | null
  /** 在舞台里打的一局才有：离下一次换幕还有多久，正在换还是快要换了，新一幕刚画好时这一章叫什么 */
  stage: StageSnapshot | null
}

/** 场上一个头目的条：名字、生命、控制韧性满了多少（0 到 1），霸体中 steadfast 为真 */
export interface BossBar {
  readonly uid: number
  readonly name: string
  readonly hp: number
  readonly maxHp: number
  readonly tenacity: number
  readonly steadfast: boolean
}

/** 天上此刻的样子：太阳与月亮的时角（弧度，正午为 0、往西为正），月龄占朔望月的比例；night 为真时下一件事是天亮，inSec 是还有几秒 */
export interface ClockSnapshot {
  readonly sun: number
  readonly moon: number
  readonly phase: number
  readonly night: boolean
  readonly inSec: number
}

/** 潜艇的倒计时：phase 是停着（down）、快开走（warn）还是开走了（away），ratio 是这一段还剩的比例，inSec 是还有几秒 */
export interface SubmarineSnapshot {
  readonly phase: 'down' | 'warn' | 'away'
  readonly ratio: number
  readonly inSec: number
}

/** 舞台的倒计时：phase 是演着（stand）、快换幕（warn）还是正在换（turn），ratio 是离下一次换幕还剩的比例，inSec 是还有几秒；title 是刚翻到的这一章，过了那几秒为 null */
export interface StageSnapshot {
  readonly phase: 'stand' | 'warn' | 'turn'
  readonly ratio: number
  readonly inSec: number
  readonly title: string | null
}

export interface WaveSummary {
  title: string
  kills: number
  coins: number
  /** 过关奖励的说法；没有奖励是 null */
  reward: string | null
}

export interface WaveWarning {
  title: string
  sub: string
}

export interface FieldCollected {
  emoji: string
  name: string
  desc: string
  polarity: Polarity
}

export interface SquadMember {
  emoji: string
  name: string
  skillIcon: string
  cdRemainMs: number
  cdMs: number
  alive: boolean
  hp: number
  max: number
  /** 几秒后起来；这一场不会自己起来是 null */
  reviveSec: number | null
  /** 剩下的体力占上限的比例 */
  stamina: number
  /** 正在拖慢全队 */
  tired: boolean
}

/** 队长就是玩家附身的角色；members 按入队顺序 */
export interface SquadSnapshot {
  leaderSlot: number
  switching: boolean
  members: SquadMember[]
}

/** 一名队员此刻的属性：now 是实际值，lasting 是不算限时修正、战场效果与体力的常驻值 */
export interface MemberSheet {
  emoji: string
  level: number
  leader: boolean
  alive: boolean
  hp: number
  max: number
  /** 几秒后起来；这一场不会自己起来是 null */
  reviveSec: number | null
  /** 剩下的体力占上限的比例 */
  stamina: number
  /** 正在拖慢全队 */
  tired: boolean
  now: StatValues
  lasting: StatValues
}

/** 当前队长的主动技能；aim 为真时按住按钮可拖出方向，rangeU 是瞄准线长度；charges 为 -1 表示不攒次数；recastMs 是下一段还能接多久；holdMs 非零时按住蓄力 */
export interface LeaderSkill {
  icon: string
  name: string
  emoji: string
  remainMs: number
  cdMs: number
  aim: boolean
  rangeU: number
  charges: number
  recastMs: number
  holdMs: number
}

export interface LeaderChanged {
  emoji: string
  name: string
}

export enum HudEvent {
  WaveWarning = 'wave-warning',
  WaveComplete = 'wave-complete',
  SkillCast = 'skill-cast',
  FieldCollected = 'field-collected',
  LeaderChanged = 'leader-changed',
}

interface HudPayload {
  [HudEvent.WaveWarning]: WaveWarning
  [HudEvent.WaveComplete]: WaveSummary
  [HudEvent.SkillCast]: string
  [HudEvent.FieldCollected]: FieldCollected
  [HudEvent.LeaderChanged]: LeaderChanged
}

export interface HudEvents {
  emit<E extends HudEvent>(event: E, payload: HudPayload[E]): boolean
  on<E extends HudEvent>(event: E, fn: (payload: HudPayload[E]) => void, context: object): this
  off<E extends HudEvent>(event: E, fn: (payload: HudPayload[E]) => void, context: object): this
}

let active: HudHost | undefined

export function setActiveHudHost(host: HudHost): void {
  active = host
}

export function activeHudHost(): HudHost | undefined {
  return active
}

export interface HudHost {
  readonly events: HudEvents
  readonly scene: Phaser.Scenes.ScenePlugin
  hudSnapshot(): HudSnapshot
  squadSnapshot(): SquadSnapshot | null
  /** 按入队顺序 */
  teamSheets(): MemberSheet[]
  switchLeader(slot: number): boolean
  /** 现在为什么不能手动换队长；能换是 null */
  switchBlock(): string | null
  leaderSkill(): LeaderSkill | null
  /** 现在为什么不能放主动技能；规则上能放是 null */
  skillBlock(): string | null
  castLeaderSkill(dir: { x: number; y: number } | null, holdRatio?: number): boolean
  setSkillAim(dir: { x: number; y: number } | null): void
}

export interface HudInput {
  readonly moveVector: { x: number; y: number }
}

const NO_MOVE = { x: 0, y: 0 }
let activeInput: HudInput | undefined

export function setActiveHudInput(input: HudInput | undefined): void {
  activeInput = input
}

export function hudMoveVector(): { x: number; y: number } {
  return activeInput?.moveVector ?? NO_MOVE
}
