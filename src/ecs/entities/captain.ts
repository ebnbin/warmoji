import { addComponents } from 'bitecs'
import { newEntity } from './entity'
import { UNIT } from '../../util/units'
import { fanSlots } from '../../data/formation'
import { SQUAD } from '../../data/feel'
import { TEAM } from '../../data/characters'
import { leaderSlot } from '../../run/state'
import type { RunState } from '../../run/state'
import type { EcsAtlas } from '../atlas'
import { spawnCharacter } from './character'
import { Alive, Captain, DanceWindow, Magnet, Slot, TeamDamage, Transform } from '../components'
import type { EcsWorld } from '../world'

/** 队伍中心实体：不可见，跟着队长走，承载团队增益、金币吸附与队长技能 */
export function spawnCaptain(world: EcsWorld, x: number, y: number, magnetRadius: number): number {
  const eid = newEntity(world)
  addComponents(world, eid, Captain, Transform, Slot, Alive, Magnet, TeamDamage, DanceWindow)
  Transform.x[eid] = x
  Transform.y[eid] = y
  Slot.v[eid] = -1
  Alive.v[eid] = 1
  Magnet.radius[eid] = magnetRadius
  return eid
}

export interface TeamLayout {
  characters: number[]
  leader: number
}

/** 队长站在中心，其余按入队顺序排在身后的扇形上 */
export function formTeam(world: EcsWorld, atlas: EcsAtlas, run: RunState, sandbox: boolean, captainEid: number): TeamLayout {
  const cx = Transform.x[captainEid]!
  const cy = Transform.y[captainEid]!
  const count = run.roster.length
  const lead = leaderSlot(run)
  const fan = fanSlots(Math.max(0, count - 1), SQUAD.fanDistance, SQUAD.fanSpreadDeg, 0, -1)
  const characters: number[] = []
  let leader = -1
  let seat = 0
  for (let slot = 0; slot < count; slot++) {
    const isLeader = slot === lead
    const off = (isLeader ? undefined : fan[seat++]) ?? { x: 0, y: 0 }
    const eid = spawnCharacter(world, atlas, run, sandbox, {
      slot,
      x: cx + off.x,
      y: cy + off.y,
      depthOffsetY: off.y / UNIT,
      sizeMul: isLeader ? TEAM.leaderSizeMul : TEAM.followerSizeMul,
    })
    if (isLeader) leader = eid
    characters.push(eid)
  }
  return { characters, leader }
}
