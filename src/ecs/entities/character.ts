import { addComponent, addEntity } from 'bitecs'
import type { FormationId } from '../../types/formation'
import { UNIT } from '../../util/units'

import { FOLLOW } from '../../data/feel'
import { CAPTAINS } from '../../data/captains'
import { CHARACTERS } from '../../data/characters'
import { MEMBER, TEAM } from '../../data/characters'
import { memberMaxHp } from '../../data/stats'
import { formationPosts } from '../../data/formation'
import { aggregateTeamCards } from '../../data/cards'
import { aggregateCharacterEffects, characterXp } from '../../data/items'
import { levelStatsFor } from '../../data/levels'
import { characterLevel } from '../../data/charLevel'

import { currentFormation, guardOrder, hasCenter, waveStartHp } from '../../run/state'
import { INVINCIBLE_HP, labInvincible, labLevel } from '../../run/lab'
import { armIdle } from '../anim'

import type { RunState } from '../../run/state'
import { Alive, Anim, Breath, Depth, Follow, VisOff, Hurt, Iframe, MAtkSlow, Member, MFlash, MHp, MPerk, OrbitBias, Pop, Post, Quad, Revive, Slot, Sprite, Threat, Tint, Transform, Wander } from '../components'

import type { EcsWorld } from '../world'
import type { EcsAtlas } from '../render/atlas'

// 组队(镜像 ArcadeBattleScene setup 的阵容/岗位/成员建立):建 Sim + 逐槽位装配队员实体。
// 属性逐槽位按已持道具 + 专属等级聚合;血量跨波保留(上一波阵亡者低血量复活)。

/** 建立队伍:返回 Sim(含 members eid 列表),并把队员实体装进 world */
/** 队伍编队的派生结果：实体清单 + 供 Sim 用的编队参数 */
export interface TeamLayout {
  members: number[]
  count: number
  formation: FormationId
  postBySlot: number[]
  lineupOrbit: number[]
}

/** 建本局全部角色实体（队长不在此列，见 captain.ts）。
 * 只造实体、只返回编队派生量——Sim 的组装在 ../sim.ts，工厂不碰全局状态 */
export function spawnCharacters(
  world: EcsWorld,
  atlas: EcsAtlas,
  run: RunState,
  testMode: boolean,
  center: { x: number; y: number },
): TeamLayout {
  const rosterIds = run.roster
  const lineup = rosterIds.map((id) => CHARACTERS[id])
  const count = lineup.length
  const formation = testMode ? 'ring' : currentFormation(run)
  const order = testMode || !hasCenter(run) ? null : guardOrder(run)
  const postBySlot = rosterIds.map((id, slot) => {
    if (!order) return slot
    const post = order.indexOf(id)
    return post >= 0 ? post : slot
  })
  const teamFx = aggregateTeamCards(run.teamCards)
  const captain = CAPTAINS[run.captainId]
  // 测试模式素体血量:「无敌」旋钮开则天量血(镜像 makeMember)
  const labHp = labInvincible() ? INVINCIBLE_HP : MEMBER.maxHp

  const posts = formationPosts(formation, count, 0)
  const size = MEMBER.size * UNIT
  const members: number[] = []
  for (let slot = 0; slot < count; slot++) {
    const def = lineup[slot]!
    const post = postBySlot[slot] ?? slot
    const off = posts[post] ?? { x: 0, y: 0 }
    const x = center.x + off.x
    const y = center.y + off.y
    const eid = addEntity(world)
    addComponent(world, eid, Member)
    addComponent(world, eid, Slot)
    addComponent(world, eid, Post)
    addComponent(world, eid, OrbitBias)
    addComponent(world, eid, Follow)
    addComponent(world, eid, VisOff)
    addComponent(world, eid, Wander)
    addComponent(world, eid, Breath)
    addComponent(world, eid, Pop)
    addComponent(world, eid, Alive)
    addComponent(world, eid, Threat)
    addComponent(world, eid, MHp)
    addComponent(world, eid, MAtkSlow)
    addComponent(world, eid, MPerk)
    addComponent(world, eid, Iframe)
    addComponent(world, eid, Revive)
    addComponent(world, eid, Hurt)
    addComponent(world, eid, MFlash)
    addComponent(world, eid, Transform)
    addComponent(world, eid, Anim)
    addComponent(world, eid, Sprite)
    addComponent(world, eid, Tint)
    addComponent(world, eid, Depth)
    Slot.v[eid] = slot
    Post.v[eid] = post
    OrbitBias.v[eid] = def.orbit
    Follow.x[eid] = x
    Follow.y[eid] = y
    Follow.vx[eid] = 0
    Follow.vy[eid] = 0
    VisOff.x[eid] = 0
    VisOff.y[eid] = 0
    Follow.k[eid] = FOLLOW.kBase * (1 + FOLLOW.kJitter * Math.sin(slot * 12.9898))
    Wander.seed[eid] = slot * 2.399
    Wander.amp[eid] = 0
    Breath.phase[eid] = slot * 1.3
    Pop.until[eid] = 0
    Alive.v[eid] = 1
    Threat.v[eid] = 0
    MAtkSlow.until[eid] = 0
    MAtkSlow.mul[eid] = 1
    // 道具属性:正常局按该槽位已持道具 + 专属等级聚合,测试模式素体
    const owned = testMode ? [] : (run.memberItems[slot] ?? [])
    // 等级与能力侧同源(测试模式走场内旋钮档位),否则旋钮只改能力不改属性
    const level = testMode ? labLevel() + 1 : characterLevel(characterXp(owned))
    const fx = aggregateCharacterEffects(owned, levelStatsFor(rosterIds[slot]!, level))
    const maxHp = testMode ? labHp : Math.round(memberMaxHp(fx.hpAdd, captain.hpMul) * teamFx.teamHpMul)
    // 血量跨波保留;上一波阵亡者低血量复活(测试模式素体满血)
    MHp.hp[eid] = testMode ? labHp : waveStartHp(run.memberHp[slot] ?? MEMBER.maxHp, maxHp)
    MHp.max[eid] = maxHp
    MPerk.thorns[eid] = fx.thorns
    MPerk.killHeal[eid] = fx.killHeal
    MPerk.regenPerSec[eid] = fx.regenPerSec
    Iframe.ms[eid] = MEMBER.iframesMs + fx.iframesAddMs
    Iframe.last[eid] = -1e9
    Revive.ms[eid] = Math.max(1000, TEAM.reviveMs * captain.reviveMul * teamFx.reviveMul + fx.reviveAddMs)
    Revive.at[eid] = 0
    // 受击判定圆(格值需 ×UNIT 换算成 px);N 保 1 中心的被保护收益:半径减半,更难被敌人/敌弹摸到
    Hurt.radius[eid] = MEMBER.radius * UNIT * (formation === 'guard' && post === 0 ? TEAM.guardCenterHurtboxMul : 1)
    MFlash.until[eid] = 0
    Transform.x[eid] = x
    Transform.y[eid] = y
    Transform.rot[eid] = 0
    Transform.w[eid] = size
    Transform.h[eid] = size
    Sprite.frame[eid] = atlas.index(def.emoji, 'player')
    Sprite.flipX[eid] = 0
    // 部件动画:idle 常驻翻帧,相位按槽位错开(镜像 makeMember 的 anim.setIdle)
    armIdle(eid, def.emoji, 'player', Sprite.frame[eid]!, slot * 173)
    Tint.color[eid] = 0xffffff
    Tint.effect[eid] = 0
    Tint.alpha[eid] = 1
    Depth.z[eid] = 10 + off.y / UNIT
    Quad.v[eid] = 0
    members.push(eid)
  }

  return { members, count, formation, postBySlot, lineupOrbit: lineup.map((c) => c.orbit) }
}
