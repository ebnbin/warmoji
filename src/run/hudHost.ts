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
  levels: number
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
  readonly events: Phaser.Events.EventEmitter
  readonly scene: Phaser.Scenes.ScenePlugin
  hudSnapshot(): HudSnapshot
  skillSnapshot(): { remainMs: number; cdMs: number }
  castSkill(): boolean
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
