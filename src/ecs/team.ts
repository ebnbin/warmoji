import { addComponent, addEntity } from 'bitecs'
import { UNIT } from '../core/units'
import { FOLLOW } from '../battle/config'
import { CAPTAINS } from '../captains/registry'
import { CHARACTERS } from '../characters/registry'
import { MEMBER } from '../characters/registry'
import { formationPosts } from '../characters/formation'
import { aggregateTeamCards } from '../cards/registry'
import { currentFormation, guardOrder, hasCenter } from '../run/state'
import type { RunState } from '../run/state'
import {
  Alive,
  Depth,
  Follow,
  Member,
  OrbitBias,
  Post,
  Slot,
  Sprite,
  Threat,
  Tint,
  Transform,
  Wander,
} from './components'
import type { Sim } from './sim'
import type { EcsWorld } from './world'
import type { EcsAtlas } from './render/atlas'

// 组队(镜像 BaseArenaScene setup 的阵容/岗位/成员建立):建 Sim + 逐槽位装配队员实体。
// P2 只做移动/渲染所需字段;血量/道具/能力/动画在后续阶段追加。

/** 建立队伍:返回 Sim(含 members eid 列表),并把队员实体装进 world */
export function spawnTeam(
  world: EcsWorld,
  atlas: EcsAtlas,
  run: RunState,
  testMode: boolean,
  center: { x: number; y: number },
  mapW: number,
  mapH: number,
): Sim {
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
  const moveSpeed = CAPTAINS[run.captainId].moveSpeed * UNIT * teamFx.moveSpeedMul

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
    addComponent(world, eid, Wander)
    addComponent(world, eid, Alive)
    addComponent(world, eid, Threat)
    addComponent(world, eid, Transform)
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
    Follow.k[eid] = FOLLOW.kBase * (1 + FOLLOW.kJitter * Math.sin(slot * 12.9898))
    Wander.seed[eid] = slot * 2.399
    Wander.amp[eid] = 0
    Alive.v[eid] = 1
    Threat.v[eid] = 0
    Transform.x[eid] = x
    Transform.y[eid] = y
    Transform.rot[eid] = 0
    Transform.w[eid] = size
    Transform.h[eid] = size
    Sprite.frame[eid] = atlas.index(def.emoji, 'player')
    Sprite.flipX[eid] = 0
    Tint.color[eid] = 0xffffff
    Tint.effect[eid] = 0
    Tint.alpha[eid] = 1
    Depth.z[eid] = 10 + off.y / UNIT
    members.push(eid)
  }

  return {
    world,
    center: { x: center.x, y: center.y },
    orbitPhase: 0,
    driverPost: -1,
    teamDir: { x: 0, y: 0 },
    moveInputRaw: 0,
    moveSpeed,
    formation,
    count,
    postBySlot,
    lineupOrbit: lineup.map((c) => c.orbit),
    members,
    mapW,
    mapH,
    elapsedMs: 0,
    frameTargets: [],
  }
}
