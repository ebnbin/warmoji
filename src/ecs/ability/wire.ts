import type Phaser from 'phaser'
import { query } from 'bitecs'
import { CHARACTERS, loadoutFor } from '../../characters/registry'
import { CAPTAINS } from '../../captains/registry'
import { aggregateCharacterEffects, characterXp, resolveAbilityDef } from '../../items/registry'
import { levelStatsFor } from '../../characters/levels'
import { characterLevel } from '../../run/charLevel'
import { aggregateTeamCards } from '../../cards/registry'
import { createAbility } from '../../abilities/create'
import { toPx } from '../../battle/px'
import { labLevel } from '../../run/lab'
import type { RunState } from '../../run/state'
import type { AbilityOwner, AbilityRuntime, TargetInfo } from '../../abilities/types'
import { Alive, ENEMY_SET, Radius, Transform } from '../components'
import { enemyDef, enemyRef, memberAbilities, memberHandle } from '../store'
import { makeTeamCtx } from './ctx'
import type { Sim } from '../sim'
import type { EcsAtlas } from '../render/atlas'

// 队员装备能力(镜像 createMember 的配装/等级/道具 fx 生效链)+ 每帧驱动。
// 复用 createAbility 造出的能力运行时,不重写任何能力逻辑。

/** 敌人稳定引用({__eid} + active 存活探针);killEnemy 清空后按 eid 复用会重建。
 * active 供能力(核弹/落石等)剔除已死目标——读 enemyDef(死亡/自毁时清空) */
function refOf(eid: number): TargetInfo['ref'] {
  let r = enemyRef[eid]
  if (!r) {
    r = {
      __eid: eid,
      get active() {
        return enemyDef[eid] !== undefined
      },
    }
    enemyRef[eid] = r
  }
  return r as unknown as TargetInfo['ref']
}

/** 为全队装备能力(P3c:测试模式素体;正常局的道具个体差异 P4 细化) */
export function armTeam(sim: Sim, scene: Phaser.Scene, atlas: EcsAtlas, run: RunState, testMode: boolean): void {
  memberAbilities.length = 0
  memberHandle.length = 0
  const teamFx = aggregateTeamCards(run.teamCards)
  // 抛射物 onHit 命中链的共享效果执行面(阵营=队伍,效果作用于敌方,与具体持有者无关)
  sim.effectCtx = makeTeamCtx(sim, scene, atlas, -1, aggregateCharacterEffects([], []), teamFx)
  for (let slot = 0; slot < run.roster.length; slot++) {
    const id = run.roster[slot]!
    const def = CHARACTERS[id]
    const owned = testMode ? [] : (run.memberItems[slot] ?? [])
    const level = testMode ? labLevel() + 1 : characterLevel(characterXp(owned))
    const tiers = { u1: level >= 2, u2: level >= 3 }
    const fx = aggregateCharacterEffects(owned, levelStatsFor(id, level))
    const ctx = makeTeamCtx(sim, scene, atlas, slot, fx, teamFx)
    const handle: AbilityOwner = {
      get x() {
        return Transform.x[sim.members[slot]!]!
      },
      get y() {
        return Transform.y[sim.members[slot]!]!
      },
      setVisualOffset() {},
    }
    memberHandle[slot] = handle
    memberAbilities[slot] = loadoutFor(def, tiers).map((w, i) =>
      createAbility(toPx(resolveAbilityDef(w, fx)), ctx, 300 + slot * 120 + i * 230),
    )
  }
}

/** 队长主动技能的载荷(镜像 setup 的 captainAbilities/captainHandle):效果本体是标准能力行,
 * 行为主体锚在队伍中心,不进 update 循环——只经 castSkill 手动单发 */
export function armCaptain(
  sim: Sim,
  scene: Phaser.Scene,
  atlas: EcsAtlas,
  run: RunState,
): { abilities: AbilityRuntime[]; handle: AbilityOwner } {
  const teamFx = aggregateTeamCards(run.teamCards)
  const ctx = makeTeamCtx(sim, scene, atlas, -1, aggregateCharacterEffects([], []), teamFx)
  const handle: AbilityOwner = {
    get x() {
      return sim.center.x
    },
    get y() {
      return sim.center.y
    },
    setVisualOffset() {},
  }
  const abilities = CAPTAINS[run.captainId].skill.abilities.map((a) => createAbility(toPx(a), ctx, 0))
  return { abilities, handle }
}

/** 每帧:重建敌方存活快照 + 驱动各活着队员的能力(wdelta = 世界时长,P3c 等于真实帧长) */
export function updateMemberAbilities(sim: Sim, wdelta: number): void {
  const targets: TargetInfo[] = []
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
    targets.push({ x: Transform.x[eid]!, y: Transform.y[eid]!, radius: Radius.v[eid]!, ref: refOf(eid) })
  }
  sim.enemyTargets = targets
  for (let slot = 0; slot < sim.members.length; slot++) {
    if (!Alive.v[sim.members[slot]!]) continue
    const abilities = memberAbilities[slot]
    const handle = memberHandle[slot]
    if (!abilities || !handle) continue
    for (const w of abilities) w.update(wdelta, handle)
  }
}
