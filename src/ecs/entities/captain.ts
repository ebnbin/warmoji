import { addComponents } from 'bitecs'
import { newEntity } from './entity'
import { UNIT } from '../../util/units'
import { CHARACTERS } from '../../data/characters'
import { fanSlots, formationPosts } from '../../data/formation'
import { SQUAD } from '../../data/feel'
import { TEAM } from '../../data/characters'
import { currentFormation, guardOrder, hasCenter } from '../../run/state'
import type { RunState } from '../../run/state'
import type { FormationId } from '../../types/formation'
import type { EcsAtlas } from '../atlas'
import { spawnCharacter } from './character'
import { Alive, Captain, DanceWindow, Magnet, Orbit, Phys, Slot, TeamDamage, Transform } from '../components'
import type { EcsWorld } from '../world'


export function spawnCaptain(
  world: EcsWorld,
  x: number,
  y: number,
  moveSpeed: number,
  magnetRadius: number,
): number {
  const eid = newEntity(world)
  addComponents(world, eid, Captain, Transform, Slot, Alive, Phys, Magnet, Orbit, TeamDamage, DanceWindow)
  Transform.x[eid] = x
  Transform.y[eid] = y
  Slot.v[eid] = -1
  Alive.v[eid] = 1
  Phys.vx[eid] = 0
  Phys.vy[eid] = 0
  Phys.thrust[eid] = moveSpeed * TEAM.anchor.drag
  Phys.drag[eid] = TEAM.anchor.drag
  Phys.mass[eid] = TEAM.anchor.mass
  Magnet.radius[eid] = magnetRadius
  Orbit.phase[eid] = 0
  Orbit.driver[eid] = -1
  return eid
}

export interface TeamLayout {
  characters: number[]
  count: number
  formation: FormationId
  postBySlot: number[]
  lineupOrbit: number[]
  leader: number
}

export function formTeam(
  world: EcsWorld,
  atlas: EcsAtlas,
  run: RunState,
  sandbox: boolean,
  captainEid: number,
): TeamLayout {
  const cx = Transform.x[captainEid]!
  const cy = Transform.y[captainEid]!
  const rosterIds = run.roster
  const count = rosterIds.length
  const formation = currentFormation(run)
  const order = hasCenter(run) ? guardOrder(run) : null
  const postBySlot = rosterIds.map((id, slot) => {
    if (!order) return slot
    const post = order.indexOf(id)
    return post >= 0 ? post : slot
  })
  const posts = formationPosts(formation, count, 0)
  const fan = fanSlots(Math.max(0, count - 1), SQUAD.fanDistance, SQUAD.fanSpreadDeg, 0, -1)
  const characters: number[] = []
  let leader = -1
  for (let slot = 0; slot < count; slot++) {
    const post = postBySlot[slot] ?? slot
    const lead = formation === 'guard' && post === 0
    const off = (formation === 'guard' ? (lead ? { x: 0, y: 0 } : fan[post - 1]) : posts[post]) ?? { x: 0, y: 0 }
    const eid = spawnCharacter(world, atlas, run, sandbox, {
      slot,
      post,
      x: cx + off.x,
      y: cy + off.y,
      depthOffsetY: off.y / UNIT,
      sizeMul: formation === 'guard' ? (lead ? TEAM.leaderSizeMul : TEAM.followerSizeMul) : 1,
    })
    if (lead) leader = eid
    characters.push(eid)
  }
  return { characters, count, formation, postBySlot, lineupOrbit: rosterIds.map((id) => CHARACTERS[id].orbit), leader }
}
