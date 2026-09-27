import { SceneKey } from '../scene/keys'
import type { FightDef } from '../types/runs'
import { runDef, stepOf } from './state'
import type { RunState } from './state'

/** 一步对应的页面 */
export type StepScene = SceneKey.Recruit | SceneKey.Shop | SceneKey.Battle

/** 当前步骤的页面；步骤都走完了是 null */
export function stepScene(run: RunState): StepScene | null {
  const step = stepOf(run)
  if (!step) return null
  switch (step.kind) {
    case 'recruit':
      return SceneKey.Recruit
    case 'shop':
      return SceneKey.Shop
    case 'fight':
      return SceneKey.Battle
  }
}

/** 已经打过至少一场 */
export function fought(run: RunState): boolean {
  return runDef(run).steps.slice(0, run.step).some((s) => s.kind === 'fight')
}

/** 当前这一场；步骤停在别处时往后找到下一场并停在那里 */
export function enterFight(run: RunState): FightDef {
  const steps = runDef(run).steps
  for (let i = run.step; i < steps.length; i++) {
    const s = steps[i]!
    if (s.kind !== 'fight') continue
    run.step = i
    return s.fight
  }
  throw new Error(`${runDef(run).name}已经没有战斗了`)
}
