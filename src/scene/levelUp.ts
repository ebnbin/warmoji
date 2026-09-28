import type Phaser from 'phaser'
import { SceneKey } from './keys'

export interface LevelUpData {
  /** 这一场已经打完：新招的队员下一场才上 */
  readonly settling: boolean
  /** 连这一次在内，捡起来还没选的升级有几次 */
  readonly queued: number
}

/** 从招募页回到升级弹窗时带的话：recruited 为真是已经招到人了 */
export interface LevelUpWake {
  readonly recruited: boolean
}

/** 弹出升级弹窗：盖在战斗上，战斗与 HUD 停住，选完回到战斗 */
export function openLevelUp(scene: Phaser.Scene, data: LevelUpData): void {
  scene.scene.launch(SceneKey.LevelUp, data)
}
