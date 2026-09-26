import type Phaser from 'phaser'
import type { Polarity } from '../types/battlefield'

export interface HudSnapshot {
  xp: number
  xpNext: number
  kills: number
  coins: number
  wave: number
  seconds: number
  remainMs: number
  bossHp: number | null
  bossMaxHp: number
  battleFx: { emoji: string; polarity: Polarity; remainMs: number; totalMs: number }[]
}

export interface WaveSummary {
  wave: number
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
  reviveSec: number
}

/** 满员才有队长；members 按入队顺序 */
export interface SquadSnapshot {
  leaderSlot: number
  switching: boolean
  members: SquadMember[]
}

/** 当前队长的主动技能；aim 为真时按住按钮可拖出方向，rangeU 是瞄准线长度 */
export interface LeaderSkill {
  icon: string
  name: string
  emoji: string
  remainMs: number
  cdMs: number
  aim: boolean
  rangeU: number
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
  readonly sandbox: boolean
  readonly events: HudEvents
  readonly scene: Phaser.Scenes.ScenePlugin
  hudSnapshot(): HudSnapshot
  squadSnapshot(): SquadSnapshot | null
  switchLeader(slot: number): boolean
  leaderSkill(): LeaderSkill | null
  castLeaderSkill(dir: { x: number; y: number } | null): boolean
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
