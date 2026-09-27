import type Phaser from 'phaser'
import { endRun } from '../run/state'
import type { RunState } from '../run/state'
import type { StatGroup } from '../types/statLines'
import type { Flow, PageHeaderOptions } from '../ui'
import { SceneKey } from './keys'
import { openPause } from './pause'
import type { PauseData } from './pause'

export const PREVIEW_SPIN = 0.18

export function fitIconSize(posts: readonly { x: number; y: number }[], scale: number, base: number): number {
  let minD = Infinity
  for (let i = 0; i < posts.length; i++) {
    for (let j = i + 1; j < posts.length; j++) {
      minD = Math.min(minD, Math.hypot(posts[i]!.x - posts[j]!.x, posts[i]!.y - posts[j]!.y))
    }
  }
  if (!Number.isFinite(minD)) return base
  return Math.max(24, Math.min(base, minD * scale * 0.92))
}

export function isInitialWave(run: RunState): boolean {
  return run.wave === 1
}

export function nextAfterTeam(run: RunState): SceneKey.Battle | SceneKey.Shop {
  return isInitialWave(run) ? SceneKey.Battle : SceneKey.Shop
}

/** 一局之中离开当前页：首波之前是返回选图，之后先进暂停页，在那里继续或结束本局 */
export function runExit(scene: Phaser.Scene, run: RunState, pause: () => PauseData): Pick<PageHeaderOptions, 'back' | 'pause'> {
  if (isInitialWave(run)) {
    return {
      back: (): void => {
        endRun()
        scene.scene.start(SceneKey.Map)
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
