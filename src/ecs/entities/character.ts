import { addComponents } from 'bitecs'
import { spawnBody } from './body'

import { UNIT } from '../../util/units'

import { CHARACTERS, MEMBER, TEAM, memberBase } from '../../data/characters'

import { gearMods } from '../../data/items'
import { levelStatsFor } from '../../data/levels'

import { waveStartHp } from '../../run/state'
import { INVINCIBLE_HP, sandboxInvincible } from '../sandbox/knobs'
import { armIdle } from '../systems/shared/anim'

import type { RunState } from '../../run/state'
import { Anim, Breath, Depth, FACTION, Grow, Hp, CharFlash, CharScale, Facing, Pop, Revive, Seat, Slot, Sprite, Transform } from '../components'
import { bodyRules } from '../store'
import { foldBody, setStatLayer } from '../utils/stats'
import { attachResource } from './resource'
import { memberGear } from './loadout'

import type { EcsWorld } from '../world'
import type { EcsAtlas } from '../atlas'

interface CharacterPlacement {
  slot: number
  x: number
  y: number
  depthOffsetY: number
  sizeMul: number
}

export function spawnCharacter(
  world: EcsWorld,
  atlas: EcsAtlas,
  run: RunState,
  sandbox: boolean,
  place: CharacterPlacement,
): number {
  const { slot, x, y } = place
  const id = run.roster[slot]!
  const def = CHARACTERS[id]
  const size = MEMBER.size * UNIT * place.sizeMul
  const { owned, level } = memberGear(run, slot, sandbox)
  const base = memberBase(def)
  const eid = spawnBody(world, {
    faction: FACTION.team,
    x,
    y,
    radius: MEMBER.radius * UNIT * place.sizeMul,
    stats: sandbox && sandboxInvincible() ? { ...base, maxHp: INVINCIBLE_HP } : base,
    drag: def.body.drag,
    mass: def.body.mass,
    grip: TEAM.followerGrip,
    ownClock: true,
  })
  addComponents(world, eid, Slot, Breath, Pop, CharScale, Seat, Facing, Revive, CharFlash, Anim)
  Slot.v[eid] = slot
  Breath.phase[eid] = slot * 1.3
  CharScale.v[eid] = place.sizeMul
  Grow.r0[eid] = MEMBER.radius * UNIT
  Grow.s0[eid] = MEMBER.size * UNIT
  setStatLayer(eid, 'gear', gearMods(owned, levelStatsFor(id, level)))
  foldBody(world, undefined, eid)
  Hp.v[eid] = sandbox ? Hp.max[eid]! : waveStartHp(run.memberHp[slot] ?? Hp.max[eid]!, Hp.max[eid]!)
  bodyRules[eid] = { ...def.rules, resource: def.resource }
  attachResource(world, eid, def.resource, run.memberRes[slot] ?? -1)
  Seat.v[eid] = -1
  Facing.y[eid] = -1
  Transform.w[eid] = size
  Transform.h[eid] = size
  Sprite.frame[eid] = atlas.index(def.emoji, 'player')
  armIdle(eid, def.emoji, 'player', Sprite.frame[eid]!, slot * 173)
  Depth.z[eid] = 10 + place.depthOffsetY
  return eid
}
