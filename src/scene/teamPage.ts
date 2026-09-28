import Phaser from 'phaser'
import { endRun, nextStep } from '../run/state'
import type { RunState } from '../run/state'
import { fought, stepScene } from '../run/flow'
import type { StatGroup } from '../types/statLines'
import type { Flow, PageHeaderOptions } from '../ui'
import { SceneKey } from './keys'
import { openPause } from './pause'
import type { PauseData } from './pause'

/** 打开当前步骤的页面；步骤都走完了就进结算，算赢 */
export function goStep(scene: Phaser.Scene, run: RunState): void {
  const key = stepScene(run)
  if (key) scene.scene.start(key)
  else scene.scene.start(SceneKey.Result, { win: true })
}

/** 已经确认离开的页面：切走要到下一帧才生效，这之前再确认不能再走一步 */
const leaving = new WeakSet<Phaser.Scene>()

/** 当前这一步做完了：走到下一步并打开它的页面，同一页只走一次 */
export function finishStep(scene: Phaser.Scene, run: RunState): void {
  if (leaving.has(scene)) return
  leaving.add(scene)
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => leaving.delete(scene))
  nextStep(run)
  goStep(scene, run)
}

export function isLeaving(scene: Phaser.Scene): boolean {
  return leaving.has(scene)
}

/** 一局之中离开当前页：打第一场之前是返回这一局的来处（没有就返回选图），之后先进暂停页，在那里继续或结束本局 */
export function runExit(scene: Phaser.Scene, run: RunState, pause: () => PauseData): Pick<PageHeaderOptions, 'back' | 'pause'> {
  if (!fought(run)) {
    return {
      back: (): void => {
        endRun()
        scene.scene.start(run.origin ?? SceneKey.Map)
      },
    }
  }
  return { pause: () => openPause(scene, pause()) }
}

export function flowStatGroups(flow: Flow, groups: readonly StatGroup[]): void {
  for (const group of groups) {
    flow.heading(group.title, group.icon)
    for (const line of group.lines) flow.text(line)
    flow.gap(10)
  }
}
