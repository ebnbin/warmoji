import { describe, expect, it, vi } from 'vitest'
import { TimeStopAbility } from './TimeStopAbility'
import { CAPTAINS } from '../../captains/registry'
import type { AbilityContext, AbilityOwner } from './types'
import type { TimeStopDef } from '../../abilities/defs'

const DEF: TimeStopDef = { kind: 'timeStop', cooldownMs: 45_000, durationMs: 15_000 }
const owner = {} as AbilityOwner

function ctxWith(timeStop: (ms: number) => void): AbilityContext {
  return { timeStop, cooldownMul: () => 1 } as unknown as AbilityContext
}

describe('时停能力', () => {
  it('castNow 触发 ctx.timeStop(durationMs)（队长主动技能路径）', () => {
    const timeStop = vi.fn()
    const a = new TimeStopAbility(DEF, ctxWith(timeStop), 0)
    a.castNow(owner)
    expect(timeStop).toHaveBeenCalledWith(15_000)
  })

  it('作自动能力时按冷却自转：冷却未到不触发，到点触发一次并重置', () => {
    const timeStop = vi.fn()
    const a = new TimeStopAbility(DEF, ctxWith(timeStop), 1000)
    a.update(500, owner)
    expect(timeStop).not.toHaveBeenCalled()
    a.update(600, owner) // 累计 1100 ≥ 1000
    expect(timeStop).toHaveBeenCalledTimes(1)
  })

  it('「定格」队长的主动技能载荷解析为 timeStop（15 秒时停）', () => {
    const skill = CAPTAINS.chrono.skill
    expect(skill.abilities).toHaveLength(1)
    expect(skill.abilities[0]!.kind).toBe('timeStop')
    const def = skill.abilities[0] as TimeStopDef
    expect(def.durationMs).toBe(15_000)
  })
})
