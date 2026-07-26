import { CHARACTERS, loadoutFor } from '../../data/characters'
import { CAPTAINS } from '../../data/captains'
import { aggregateCharacterEffects, characterXp, resolveAbilityDef } from '../../data/items'
import { levelStatsFor } from '../../data/levels'
import { characterLevel } from '../../data/charLevel'
import { aggregateTeamCards } from '../../data/cards'
import { toPx } from '../../war/px'
import { labLevel } from '../../run/lab'
import type { RunState } from '../../run/state'
import { FACTION } from '../components'
import { NEUTRAL_AMP } from './equip'
import { spawnWeapon } from '../entities/weapon'
import type { Sim } from '../sim'

// 装备：把配装解析成武器实体。队伍在开局一次装齐；敌人首次被扫到时装配
// （lazy-arm，与旧实现的出生即装配等价，因为压制期照样推进冷却）。

/** 为全队装备能力：逐槽位按已持道具 + 专属等级解析生效能力（测试模式走场内等级旋钮） */
export function armTeam(sim: Sim, run: RunState, testMode: boolean): void {
  const teamFx = aggregateTeamCards(run.teamCards)
  for (let slot = 0; slot < run.roster.length; slot++) {
    const id = run.roster[slot]!
    const def = CHARACTERS[id]
    const owned = testMode ? [] : (run.memberItems[slot] ?? [])
    const level = testMode ? labLevel() + 1 : characterLevel(characterXp(owned))
    const tiers = { u1: level >= 2, u2: level >= 3 }
    const fx = aggregateCharacterEffects(owned, levelStatsFor(id, level))
    // 装备期乘区（道具/等级/团队卡折算）：随局面变的那部分由 amp.ts 现算
    const amp = {
      dmg: fx.damageMul * teamFx.teamDamageMul,
      cd: fx.cooldownMul * teamFx.teamCooldownMul,
      crit: fx.critChance + teamFx.critAdd,
      kb: fx.knockbackMul,
      battle: true,
    }
    loadoutFor(def, tiers).forEach((w, i) => {
      spawnWeapon(sim, sim.members[slot]!, toPx(resolveAbilityDef(w, fx)), FACTION.team, 300 + slot * 120 + i * 230, amp)
    })
  }
}

/** 队长主动技能的载荷：效果本体是标准能力行，行为主体锚在队伍中心。
 * 不进自动扫描——只等 castSkill 的施放请求。返回锚点实体 */
export function armCaptain(sim: Sim, run: RunState): void {
  // 队长实体在 makeSim 里已建好（队伍中心即它的位置），这里只挂技能载荷
  for (const a of CAPTAINS[run.captainId].skill.abilities) {
    spawnWeapon(sim, sim.captain, toPx(a), FACTION.team, 0, NEUTRAL_AMP, true)
  }
}

