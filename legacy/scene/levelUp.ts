import type Phaser from 'phaser'
import type { Claim, FieldMember } from '../run/levelUp'
import { SceneKey } from './keys'

export interface LevelUpData {
  /** 连这一次在内，捡起来还没选的升级有几次 */
  readonly queued: number
  /** 场上每一格此刻的样子 */
  readonly field: readonly FieldMember[]
}

/** 升级弹窗关掉时交回战斗的：这一次领了什么 */
export interface LevelUpResult {
  readonly claim: Claim
}

/** 从全角色页回到升级弹窗时带的话：挑好了就是要上场的人和他站到哪一格，没挑是 null */
export interface LevelUpWake {
  readonly join: Extract<Claim, { readonly kind: 'join' }> | null
}

/** 弹出升级弹窗：盖在战斗上，战斗与 HUD 停住，选完回到战斗 */
export function openLevelUp(scene: Phaser.Scene, data: LevelUpData): void {
  scene.scene.launch(SceneKey.LevelUp, data)
}
