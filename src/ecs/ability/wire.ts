import type Phaser from 'phaser'
import { query } from 'bitecs'
import { CHARACTERS, loadoutFor } from '../../data/characters'
import { CAPTAINS } from '../../data/captains'
import { aggregateCharacterEffects, characterXp, resolveAbilityDef } from '../../data/items'
import { levelStatsFor } from '../../data/levels'
import { characterLevel } from '../../data/charLevel'
import { aggregateTeamCards } from '../../data/cards'
import { createAbility } from '../../war/abilities/create'
import { abilityPiercesWalls } from '../../data/abilityDefs'
import type { AbilityDef } from '../../data/abilityDefs'
import { toPx } from '../../war/px'
import { labLevel } from '../../run/lab'
import type { RunState } from '../../run/state'
import type { AbilityContext, AbilityOwner, AbilityRuntime, TargetInfo } from '../../war/abilities/types'
import { Alive, Dormant, ENEMY_SET, Radius, Transform, VisOff } from '../components'
import { enemyDef, enemyRef, memberAbilities, memberHandle } from '../store'
import { FACTION } from './components'
import { ecsAbilityKind, equipAbility, NEUTRAL_AMP, spawnTeamAnchor } from './equip'
import { makeEffectCtx, makeTeamCtx } from './ctx'
import type { Sim } from '../sim'
import type { EcsAtlas } from '../render/atlas'

// 队员装备能力(镜像 createMember 的配装/等级/道具 fx 生效链)+ 每帧驱动。
// 复用 createAbility 造出的能力运行时,不重写任何能力逻辑。
// 阵亡即收械、复活即亮械;断壁图的非穿墙能力索敌受遮挡(wallAwareCtx)。

/** 各槽位持械视觉的已呈现存活态(与 Alive 对帐,只在翻转时收/亮械) */
const shownAlive: boolean[] = []

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

/** 为全队装备能力:逐槽位按已持道具 + 专属等级解析生效能力(测试模式走场内等级旋钮) */
export function armTeam(sim: Sim, scene: Phaser.Scene, atlas: EcsAtlas, run: RunState, testMode: boolean): void {
  memberAbilities.length = 0
  memberHandle.length = 0
  shownAlive.length = 0
  const teamFx = aggregateTeamCards(run.teamCards)
  // 抛射物 onHit 命中链的共享效果执行面(阵营=队伍,效果作用于敌方,与具体持有者无关)
  sim.effectCtx = makeEffectCtx(sim, scene, atlas)
  for (let slot = 0; slot < run.roster.length; slot++) {
    const id = run.roster[slot]!
    const def = CHARACTERS[id]
    const owned = testMode ? [] : (run.memberItems[slot] ?? [])
    const level = testMode ? labLevel() + 1 : characterLevel(characterXp(owned))
    const tiers = { u1: level >= 2, u2: level >= 3 }
    const fx = aggregateCharacterEffects(owned, levelStatsFor(id, level))
    const ctx = makeTeamCtx(sim, scene, atlas, slot, fx, teamFx, testMode)
    const handle: AbilityOwner = {
      get x() {
        return Transform.x[sim.members[slot]!]!
      },
      get y() {
        return Transform.y[sim.members[slot]!]!
      },
      setVisualOffset(dx: number, dy: number) {
        const m = sim.members[slot]
        if (m === undefined) return
        VisOff.x[m] = dx
        VisOff.y[m] = dy
      },
    }
    memberHandle[slot] = handle
    // 装备期乘区(道具/等级/团队卡折算):随局面变的那部分由 amp.ts 现算
    const amp = {
      dmg: fx.damageMul * teamFx.teamDamageMul,
      cd: fx.cooldownMul * teamFx.teamCooldownMul,
      crit: fx.critChance + teamFx.critAdd,
      kb: fx.knockbackMul,
      battle: true,
    }
    // 已 ECS 化的 kind 物化成能力实体,其余仍由旧运行时驱动(过渡期)
    memberAbilities[slot] = loadoutFor(def, tiers).flatMap((w, i) => {
      const px = toPx(resolveAbilityDef(w, fx))
      const delay = 300 + slot * 120 + i * 230
      if (ecsAbilityKind(px.kind)) {
        equipAbility(sim, sim.members[slot]!, px, FACTION.team, delay, amp)
        return []
      }
      return [createAbility(px, wallAwareCtx(sim, px, ctx, slot), delay)]
    })
  }
}

/** 断壁遮挡分流(镜像 wallAwareCtx):非穿墙能力的索敌受断壁遮挡——探头才打得到。
 * 无墙图 wallHit 恒 null,原样返回基座 ctx */
function wallAwareCtx(sim: Sim, def: AbilityDef, base: AbilityContext, slot: number): AbilityContext {
  if (abilityPiercesWalls(def)) return base
  return {
    ...base,
    targets: () => {
      const m = sim.members[slot]
      const all = base.targets()
      if (m === undefined) return all
      const fx = Transform.x[m]!
      const fy = Transform.y[m]!
      return all.filter((t) => sim.hooks.wallHit(sim, fx, fy, t.x, t.y) === null)
    },
  }
}

/** 队长主动技能的载荷(镜像 setup 的 captainAbilities/captainHandle):效果本体是标准能力行,
 * 行为主体锚在队伍中心,不进 update 循环——只经 castSkill 手动单发 */
export function armCaptain(
  sim: Sim,
  scene: Phaser.Scene,
  atlas: EcsAtlas,
  run: RunState,
): { abilities: AbilityRuntime[]; handle: AbilityOwner; anchor: number } {
  const teamFx = aggregateTeamCards(run.teamCards)
  const ctx = makeTeamCtx(sim, scene, atlas, -1, aggregateCharacterEffects([], []), teamFx, false, true)
  // 锚点实体:队长技能没有本体,以队伍中心为行为主体
  const anchor = spawnTeamAnchor(sim)
  const handle: AbilityOwner = {
    get x() {
      return sim.center.x
    },
    get y() {
      return sim.center.y
    },
    setVisualOffset() {},
  }
  const abilities: AbilityRuntime[] = []
  for (const a of CAPTAINS[run.captainId].skill.abilities) {
    const px = toPx(a)
    if (ecsAbilityKind(px.kind)) equipAbility(sim, anchor, px, FACTION.team, 0, NEUTRAL_AMP, true)
    else abilities.push(createAbility(px, ctx, 0))
  }
  return { abilities, handle, anchor }
}

/** 重建敌方存活快照(能力索敌与抛射物 onHit 效果链共享):须先于 stepSim,
 * 否则本帧的命中效果读的是上一帧位置 */
export function refreshEnemyTargets(sim: Sim): void {
  const targets: TargetInfo[] = []
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
    if (Dormant.v[eid]) continue // 休眠怪不可被索敌(镜像 dormancyFrameTargets)
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const radius = Radius.v[eid]!
    const ref = refOf(eid)
    targets.push({ x, y, radius, ref })
    // 环面:真身之外再喂三个镜像,能力零改动即可隔着传送门瞄准
    for (const g of sim.hooks.ghosts(sim, x, y)) targets.push({ x: g.x, y: g.y, radius, ref })
  }
  sim.enemyTargets = targets
}

/** 每帧:驱动各活着队员的能力(wdelta = 世界时长);索敌快照由 refreshEnemyTargets 先行重建 */
export function updateMemberAbilities(sim: Sim, wdelta: number): void {
  // 本帧光环登记表清零:能力更新即唯一生产者,消费方(steerEnemies/magnetCoins)读最近一次
  sim.frameSlowZones.length = 0
  sim.frameAttractors.length = 0
  for (let slot = 0; slot < sim.members.length; slot++) {
    const m = sim.members[slot]!
    const abilities = memberAbilities[slot]
    const handle = memberHandle[slot]
    if (!abilities || !handle) continue
    // 阵亡即收械(持械视觉不该悬在尸体上)+ 清视觉偏移;复活自动亮回来
    const alive = Alive.v[m] === 1
    if (alive !== (shownAlive[slot] ?? true)) {
      shownAlive[slot] = alive
      for (const w of abilities) w.setVisible?.(alive)
      if (!alive) {
        VisOff.x[m] = 0
        VisOff.y[m] = 0
      }
    }
    if (!alive) continue
    for (const w of abilities) w.update(wdelta, handle)
  }
}
