import { UNIT } from '../../util/units'
import { fanSlots } from '../../data/formation'
import { SQUAD } from '../../data/feel'
import { TEAM } from '../../data/characters'
import { leaderSlot } from '../../run/state'
import type { RunState } from '../../run/state'
import type { EcsAtlas } from '../atlas'
import { spawnCharacter } from './character'
import type { EcsWorld } from '../world'

export interface TeamLayout {
  characters: number[]
  leader: number
}

/** 队长站在出生点，其余按入队顺序排在身后的扇形上 */
export function formTeam(world: EcsWorld, atlas: EcsAtlas, run: RunState, sandbox: boolean, x: number, y: number): TeamLayout {
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
      x: x + off.x,
      y: y + off.y,
      depthOffsetY: off.y / UNIT,
      sizeMul: isLeader ? TEAM.leaderSizeMul : TEAM.followerSizeMul,
    })
    if (isLeader) leader = eid
    characters.push(eid)
  }
  return { characters, leader }
}
