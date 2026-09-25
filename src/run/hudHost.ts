import type Phaser from 'phaser'
import type { Polarity } from '../types/battlefield'

// HudHost：战斗 → HUD 的全部读数；HudInput：HUD → 战斗的全部输入。两侧只经这两条契约相识：
// 战斗场景按结构满足 HudHost，不认识 UIScene

export interface HudSnapshot {
  xp: number
  xpNext: number
  kills: number
  coins: number
  wave: number
  seconds: number
  remainMs: number
  /** null = 无 Boss */
  bossHp: number | null
  bossMaxHp: number
  battleFx: { emoji: string; polarity: Polarity; remainMs: number; totalMs: number }[]
}

/** 本波增量 */
export interface WaveSummary {
  wave: number
  kills: number
  coins: number
  levels: number
}

/** 战斗场景在 create 里登记，先于 scene.launch('ui')；shutdown 不清空：视口变化只重启 UIScene，战斗场景照旧 */
let active: HudHost | undefined

export function setActiveHudHost(host: HudHost): void {
  active = host
}

export function activeHudHost(): HudHost | undefined {
  return active
}

export interface HudHost {
  readonly sandbox: boolean
  /** 须发出 wave-complete / wave-warning / skill-cast / field-collected */
  readonly events: Phaser.Events.EventEmitter
  readonly scene: Phaser.Scenes.ScenePlugin
  hudSnapshot(): HudSnapshot
  skillSnapshot(): { remainMs: number; cdMs: number }
  /** 返回是否真的放出 */
  castSkill(): boolean
}

// ── HudInput ──

export interface HudInput {
  /** 摇杆向量；键盘在战斗侧合流；未推时为零向量 */
  readonly moveVector: { x: number; y: number }
}

const NO_MOVE = { x: 0, y: 0 }
let activeInput: HudInput | undefined

export function setActiveHudInput(input: HudInput | undefined): void {
  activeInput = input
}

/** HUD 未挂载时为零向量 */
export function hudMoveVector(): { x: number; y: number } {
  return activeInput?.moveVector ?? NO_MOVE
}
