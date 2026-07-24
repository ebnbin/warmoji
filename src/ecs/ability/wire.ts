import type Phaser from 'phaser'
import { query } from 'bitecs'
import { CHARACTERS, loadoutFor } from '../../characters/registry'
import { aggregateCharacterEffects, characterXp, resolveAbilityDef } from '../../items/registry'
import { levelStatsFor } from '../../characters/levels'
import { characterLevel } from '../../run/charLevel'
import { aggregateTeamCards } from '../../cards/registry'
import { createAbility } from '../../abilities/create'
import { toPx } from '../../battle/px'
import { labLevel } from '../../run/lab'
import type { RunState } from '../../run/state'
import type { AbilityOwner, TargetInfo } from '../../abilities/types'
import { Alive, ENEMY_SET, Radius, Transform } from '../components'
import { enemyRef, memberAbilities, memberHandle } from '../store'
import { makeTeamCtx } from './ctx'
import type { Sim } from '../sim'
import type { EcsAtlas } from '../render/atlas'

// 队员装备能力(镜像 createMember 的配装/等级/道具 fx 生效链)+ 每帧驱动。
// 复用 createAbility 造出的能力运行时,不重写任何能力逻辑。

/** 敌人稳定引用({__eid});killEnemy 清空后按 eid 复用会重建 */
function refOf(eid: number): TargetInfo['ref'] {
  let r = enemyRef[eid]
  if (!r) {
    r = { __eid: eid }
    enemyRef[eid] = r
  }
  return r as unknown as TargetInfo['ref']
}

/** 为全队装备能力(P3c:测试模式素体;正常局的道具个体差异 P4 细化) */
export function armTeam(sim: Sim, scene: Phaser.Scene, atlas: EcsAtlas, run: RunState, testMode: boolean): void {
  memberAbilities.length = 0
  memberHandle.length = 0
  const teamFx = aggregateTeamCards(run.teamCards)
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
