import { addComponents } from 'bitecs'
import { spawnBody } from './body'

import { UNIT } from '../../util/units'

import { CHARACTERS, MEMBER, TEAM, memberBase } from '../../data/characters'

import { ROLES } from '../../data/roles'
import { elementIndex } from '../../data/elements'

import { INVINCIBLE_HP, waveStartHp } from '../../run/state'
import { armGear } from '../systems/shared/gear'

import type { RunState } from '../../run/state'
import type { StatMods } from '../../types/stats'
import { Breath, Depth, FACTION, Grow, Hp, CharFlash, CharScale, Facing, Pop, Revive, Seat, Slot, Sprite, Transform } from '../components'
import { bodyRules } from '../store'
import { foldBody, setStatLayer } from '../utils/stats'
import { STANDARD } from '../utils/pass'
import { attachResource } from './resource'
import { memberGear, memberGearMods } from './loadout'

import type { EcsWorld } from '../world'
import type { FrameIndex } from '../frames'
import { rulesOf } from '../../data/reactions'
import { setTraits } from '../utils/traits'

interface CharacterPlacement {
  slot: number
  x: number
  y: number
  depthOffsetY: number
  sizeMul: number
}

export function spawnCharacter(
  world: EcsWorld,
  atlas: FrameIndex,
  run: RunState,
  place: CharacterPlacement,
  mods: readonly StatMods[],
): number {
  const { slot, x, y } = place
  const id = run.roster[slot]!
  const def = CHARACTERS[id]
  const size = MEMBER.size * UNIT * place.sizeMul
  const { owned } = memberGear(run, slot)
  const base = memberBase(def)
  const eid = spawnBody(world, {
    faction: FACTION.team,
    x,
    y,
    radius: MEMBER.radius * UNIT * place.sizeMul,
    span: STANDARD,
    stats: run.invincible ? { ...base, maxHp: INVINCIBLE_HP } : base,
    drag: def.body.drag,
    mass: def.body.mass,
    grip: TEAM.followerGrip,
    ownClock: true,
    element: elementIndex(def.element),
  })
  addComponents(world, eid, Slot, Breath, Pop, CharScale, Seat, Facing, Revive, CharFlash)
  Slot.v[eid] = slot
  Breath.phase[eid] = slot * 1.3
  CharScale.v[eid] = place.sizeMul
  Grow.r0[eid] = MEMBER.radius * UNIT
  Grow.s0[eid] = MEMBER.size * UNIT
  setTraits(world, eid, [...MEMBER.traits, ...(def.traits ?? [])])
  setStatLayer(eid, 'role', [ROLES[def.role].stats])
  setStatLayer(eid, 'gear', memberGearMods(run, slot))
  setStatLayer(eid, 'fight', mods)
  foldBody(world, undefined, eid)
  Hp.v[eid] = waveStartHp(run.memberHp[slot] ?? Hp.max[eid]!, Hp.max[eid]!)
  bodyRules[eid] = rulesOf(def)
  armGear(world, eid, owned)
  attachResource(world, eid, def.resource, run.memberRes[slot] ?? -1)
  Seat.v[eid] = -1
  Facing.y[eid] = -1
  Transform.w[eid] = size
  Transform.h[eid] = size
  Sprite.frame[eid] = atlas.index(def.emoji, 'player')
  Depth.z[eid] = 10 + place.depthOffsetY
  return eid
}
