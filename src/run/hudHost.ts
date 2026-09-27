import type Phaser from 'phaser'
import type { Polarity } from '../types/battlefield'
import type { StatValues } from '../types/stats'

export interface HudSnapshot {
  xp: number
  xpNext: number
  kills: number
  coins: number
  /** 这一场的名字；没有就只显示用时 */
  label: string | null
  seconds: number
  /** 离时限还有多久；没有时限是 null，显示已用时 */
  remainMs: number | null
  /** 这一场的目标与进度：warn 为真的是提醒会输的 */
  goals: readonly { readonly text: string; readonly warn: boolean }[]
  bossHp: number | null
  bossMaxHp: number
  battleFx: { emoji: string; name: string; desc: string; polarity: Polarity; remainMs: number; totalMs: number }[]
}

export interface WaveSummary {
  title: string
  kills: number
  coins: number
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
  leaderSkill(): LeaderSkill | null
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
