import { addComponents } from 'bitecs'
import { newEntity } from './entity'
import { UNIT } from '../../util/units'
import { CHARACTERS } from '../../data/characters'
import { formationPosts } from '../../data/formation'
import { TEAM } from '../../data/characters'
import { currentFormation, guardOrder, hasCenter } from '../../run/state'
import type { RunState } from '../../run/state'
import type { FormationId } from '../../types/formation'
import type { EcsAtlas } from '../atlas'
import { spawnCharacter } from './character'
import { Alive, Captain, DanceWindow, Magnet, MoveSpeed, Orbit, Slot, TeamDamage, Transform } from '../components'
import type { EcsWorld } from '../world'


export function spawnCaptain(
  world: EcsWorld,
  x: number,
  y: number,
  moveSpeed: number,
  magnetRadius: number,
): number {
  const eid = newEntity(world)
  addComponents(world, eid, Captain, Transform, Slot, Alive, MoveSpeed, Magnet, Orbit, TeamDamage, DanceWindow)
  Transform.x[eid] = x
  Transform.y[eid] = y
  Slot.v[eid] = -1
  Alive.v[eid] = 1
  MoveSpeed.v[eid] = moveSpeed
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
  const formation = sandbox ? 'ring' : currentFormation(run)
  const order = sandbox || !hasCenter(run) ? null : guardOrder(run)
  const postBySlot = rosterIds.map((id, slot) => {
    if (!order) return slot
    const post = order.indexOf(id)
    return post >= 0 ? post : slot
  })
  const posts = formationPosts(formation, count, 0)
  const characters: number[] = []
  for (let slot = 0; slot < count; slot++) {
    const post = postBySlot[slot] ?? slot
    const off = posts[post] ?? { x: 0, y: 0 }
    characters.push(
      spawnCharacter(world, atlas, run, sandbox, {
        slot,
        post,
        x: cx + off.x,
        y: cy + off.y,
        depthOffsetY: off.y / UNIT,
        hurtRadiusMul: formation === 'guard' && post === 0 ? TEAM.guardCenterHurtboxMul : 1,
      }),
    )
  }
  return { characters, count, formation, postBySlot, lineupOrbit: rosterIds.map((id) => CHARACTERS[id].orbit) }
}
