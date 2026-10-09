import { SceneKey } from '../scene/keys'
import type { FightDef } from '../types/runs'
import { runDef, stepOf, stepsOf } from './state'
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
  return stepsOf(run).slice(0, run.step).some((s) => s.kind === 'fight')
}

/** 当前这一场；步骤停在别处时往后找到下一场并停在那里，地图换成这一场的 */
export function enterFight(run: RunState): FightDef {
  const steps = stepsOf(run)
  for (let i = run.step; i < steps.length; i++) {
    const s = steps[i]!
    if (s.kind !== 'fight') continue
    run.step = i
    run.mapId = s.fight.map
    return s.fight
  }
  throw new Error(`${runDef(run).name}已经没有战斗了`)
}

/** 这一局要打的各场，按先后 */
export function plannedFights(run: RunState): FightDef[] {
  return stepsOf(run).flatMap((s) => (s.kind === 'fight' ? [s.fight] : []))
}

/** 打完了几场：当前步骤之前的战斗数 */
export function fightsDone(run: RunState): number {
  return stepsOf(run).slice(0, run.step).filter((s) => s.kind === 'fight').length
}

/** 上一场：当前步骤之前最后一场 */
export function lastFight(run: RunState): FightDef | undefined {
  const steps = stepsOf(run).slice(0, run.step)
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i]!
    if (s.kind === 'fight') return s.fight
  }
  return undefined
}

/** 下一场：当前步骤起的第一场，战斗中就是正在打的这一场 */
export function nextFight(run: RunState): FightDef | undefined {
  for (const s of stepsOf(run).slice(run.step)) if (s.kind === 'fight') return s.fight
  return undefined
}

/** 下一次招募之后紧接着的那一场：队伍还能扩编才有 */
export function fightAfterRecruit(run: RunState): FightDef | undefined {
  const steps = stepsOf(run)
  const from = stepOf(run)?.kind === 'fight' ? run.step + 1 : run.step
  let recruiting = false
  for (const s of steps.slice(from)) {
    if (s.kind === 'recruit' && s.upTo > run.roster.length) recruiting = true
    if (s.kind === 'fight' && recruiting) return s.fight
  }
  return undefined
}
