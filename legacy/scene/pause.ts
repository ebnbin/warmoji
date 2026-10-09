import type Phaser from 'phaser'
import { SceneKey } from './keys'

/** 能打开暂停页的界面：关掉暂停页就回到这里 */
export type PauseFrom = SceneKey.Battle | SceneKey.Shop | SceneKey.Recruit

export interface PauseData {
  readonly from: PauseFrom
  /** 先看哪名队员；不给就看队长 */
  readonly slot?: number
}

let shown = false

/** 暂停页开着或正要打开 */
export function markPauseShown(on: boolean): void {
  shown = on
}

/** 打开暂停页：盖在当前界面上，下层停住，关掉后原样继续 */
export function openPause(scene: Phaser.Scene, data: PauseData): void {
  if (shown) return
  shown = true
  scene.scene.launch(SceneKey.Pause, data)
}
