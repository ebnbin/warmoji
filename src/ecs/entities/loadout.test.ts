import { describe, expect, it } from 'vitest'
import { CAPTAINS } from '../../data/captains'
import { CHARACTERS, loadoutFor } from '../../data/characters'
import { MAX_CHAR_LEVEL, tiersForLevel } from '../../data/charLevel'
import { BOSSES, ENEMY_DEFS } from '../../data/enemies'
import { toPx } from '../../data/px'
import { FACTION } from '../components'
import { makeWorld } from '../world'
import { equipAbility, NEUTRAL_AMP } from './ability'
import { spawnCaptain } from './captain'
import type { AbilityDef } from '../../types/abilityDefs'
import type { EnemyDef } from '../../types/enemies'
import type { FrameIndex } from '../frames'
import type { Sim } from '../sim'

// 守卫：同一宿主上共用组件的两条徒手能力在装配时抛错，战斗当帧冻结

const frames: FrameIndex = { index: () => 0, clip: () => ({ base: 0, frames: 0 }) }

/** 返回抛出的错误，装齐则为 null */
function equipAll(abilities: readonly AbilityDef[], faction: number, manual: boolean): string | null {
  const world = makeWorld()
  const sim = { world, frames } as unknown as Sim
  const host = spawnCaptain(world, 0, 0, 0, 0)
  try {
    for (const a of abilities) equipAbility(sim, host, toPx(a), faction, 0, NEUTRAL_AMP, manual)
    return null
  } catch (e) {
    return String(e)
  }
}

/** 含巢穴子敌与分裂体 */
function allEnemyDefs(): EnemyDef[] {
  const seen = new Set<EnemyDef>()
  const visit = (d: EnemyDef): void => {
    if (seen.has(d)) return
    seen.add(d)
    if (d.spawner) visit(d.spawner.into)
    for (const fx of d.onDeath ?? []) if (fx.kind === 'split') visit(fx.into)
  }
  for (const d of [...ENEMY_DEFS, ...BOSSES]) visit(d)
  return [...seen]
}

describe('数据里的每个宿主都能装齐自己的全部能力', () => {
  it('队员各等级', () => {
    const bad: string[] = []
    for (const [id, def] of Object.entries(CHARACTERS)) {
      for (let level = 1; level <= MAX_CHAR_LEVEL; level++) {
        const err = equipAll(loadoutFor(def, tiersForLevel(level)), FACTION.team, false)
        if (err) bad.push(`${id} Lv${level}：${err}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('队长技能', () => {
    const bad: string[] = []
    for (const [id, def] of Object.entries(CAPTAINS)) {
      const err = equipAll(def.skill.abilities, FACTION.team, true)
      if (err) bad.push(`${id}：${err}`)
    }
    expect(bad).toEqual([])
  })

  it('敌人、Boss、子敌与分裂体', () => {
    const bad: string[] = []
    for (const def of allEnemyDefs()) {
      const err = equipAll(def.abilities ?? [], FACTION.enemy, false)
      if (err) bad.push(`${def.name}：${err}`)
    }
    expect(bad).toEqual([])
  })
})
