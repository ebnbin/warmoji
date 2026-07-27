import { addComponent, addEntity } from 'bitecs'

import { UNIT } from '../../util/units'

import { FOLLOW } from '../../data/feel'
import { CAPTAINS } from '../../data/captains'
import { CHARACTERS } from '../../data/characters'
import { MEMBER, TEAM } from '../../data/characters'
import { memberMaxHp } from '../../data/stats'

import { aggregateTeamCards } from '../../data/cards'
import { aggregateCharacterEffects, characterXp } from '../../data/items'
import { levelStatsFor } from '../../data/levels'
import { characterLevel } from '../../data/charLevel'

import { waveStartHp } from '../../run/state'
import { INVINCIBLE_HP, labInvincible, labLevel } from '../../run/lab'
import { armIdle } from '../systems/shared/anim'

import type { RunState } from '../../run/state'
import { Alive, Anim, Breath, Depth, Follow, GroundHit, VisOff, Hurt, Iframe, CharAtkSlow, Character, CharFlash, CharHp, CharPerk, OrbitBias, Pop, Post, Quad, Revive, Slot, Sprite, Threat, Tint, Transform, Wander } from '../components'

import type { EcsWorld } from '../world'
import type { EcsAtlas } from '../atlas'

// 组队(镜像 ArcadeBattleScene setup 的阵容/岗位/成员建立):建 Sim + 逐槽位装配队员实体。
// 属性逐槽位按已持道具 + 专属等级聚合;血量跨波保留(上一波阵亡者低血量复活)。

/** 建立队伍:返回 Sim(含 characters eid 列表),并把队员实体装进 world */
/** 队伍编队的派生结果：实体清单 + 供 Sim 用的编队参数 */
/** 角色在场上的站位——**由创建者决定**。角色自己不知道阵型、不知道自己站哪，
 * 只知道「我被放在这个坐标、这个岗位」。旋转环的角度分配是队长的事（见 captain.ts） */
export interface CharacterPlacement {
  /** 花名册槽位：伤害分账、道具归属、跨波血量都按它索引 */
  slot: number
  /** 编队岗位：决定它在环上的哪个位置（与 slot 可以不同，如 N 保 1 的护卫序） */
  post: number
  x: number
  y: number
  /** 深度基线偏移（格）：前排压后排，由创建者按站位算好 */
  depthOffsetY: number
  /** 受击圆半径倍率：N 保 1 的中心位减半，也是阵型知识，故由创建者给 */
  hurtRadiusMul: number
}

/** 建**一个**角色实体。位置与岗位由 place 给定 */
export function spawnCharacter(
  world: EcsWorld,
  atlas: EcsAtlas,
  run: RunState,
  testMode: boolean,
  place: CharacterPlacement,
): number {
  const { slot, post, x, y } = place
  const def = CHARACTERS[run.roster[slot]!]
  const teamFx = aggregateTeamCards(run.teamCards)
  const captain = CAPTAINS[run.captainId]
  // 测试模式素体血量:「无敌」旋钮开则天量血(镜像 makeMember)
  const labHp = labInvincible() ? INVINCIBLE_HP : MEMBER.maxHp
  const size = MEMBER.size * UNIT
    const eid = addEntity(world)
  addComponent(world, eid, Character)
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
  addComponent(world, eid, CharHp)
  addComponent(world, eid, CharAtkSlow)
  addComponent(world, eid, CharPerk)
  addComponent(world, eid, Iframe)
  addComponent(world, eid, Revive)
  addComponent(world, eid, Hurt)
  addComponent(world, eid, GroundHit)
  addComponent(world, eid, CharFlash)
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
  CharAtkSlow.until[eid] = 0
  CharAtkSlow.mul[eid] = 1
  // 道具属性:正常局按该槽位已持道具 + 专属等级聚合,测试模式素体
  const owned = testMode ? [] : (run.memberItems[slot] ?? [])
  // 等级与能力侧同源(测试模式走场内旋钮档位),否则旋钮只改能力不改属性
  const level = testMode ? labLevel() + 1 : characterLevel(characterXp(owned))
  const fx = aggregateCharacterEffects(owned, levelStatsFor(run.roster[slot]!, level))
  const maxHp = testMode ? labHp : Math.round(memberMaxHp(fx.hpAdd, captain.hpMul) * teamFx.teamHpMul)
  // 血量跨波保留;上一波阵亡者低血量复活(测试模式素体满血)
  CharHp.hp[eid] = testMode ? labHp : waveStartHp(run.memberHp[slot] ?? MEMBER.maxHp, maxHp)
  CharHp.max[eid] = maxHp
  CharPerk.thorns[eid] = fx.thorns
  CharPerk.killHeal[eid] = fx.killHeal
  CharPerk.regenPerSec[eid] = fx.regenPerSec
  Iframe.ms[eid] = MEMBER.iframesMs + fx.iframesAddMs
  Iframe.last[eid] = -1e9
  GroundHit.last[eid] = -1e9 // 开局就踩进毒圈也该当场掉第一跳
  Revive.ms[eid] = Math.max(1000, TEAM.reviveMs * captain.reviveMul * teamFx.reviveMul + fx.reviveAddMs)
  Revive.at[eid] = 0
  // 受击判定圆(格值需 ×UNIT 换算成 px);N 保 1 中心的被保护收益:半径减半,更难被敌人/敌弹摸到
  Hurt.radius[eid] = MEMBER.radius * UNIT * place.hurtRadiusMul
  CharFlash.until[eid] = 0
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
  Depth.z[eid] = 10 + place.depthOffsetY
  Quad.v[eid] = 0
  return eid
}
