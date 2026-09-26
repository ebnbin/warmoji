import { addComponents } from 'bitecs'
import { spawnBody } from './body'

import { UNIT } from '../../util/units'

import { CHARACTERS } from '../../data/characters'
import { MEMBER, TEAM } from '../../data/characters'
import { memberMaxHp } from '../../data/stats'

import { aggregateCharacterEffects, characterXp } from '../../data/items'
import { levelStatsFor } from '../../data/levels'
import { characterLevel } from '../../data/charLevel'

import { waveStartHp } from '../../run/state'
import { INVINCIBLE_HP, sandboxInvincible, sandboxLevel } from '../sandbox/knobs'
import { armIdle } from '../systems/shared/anim'

import type { RunState } from '../../run/state'
import { Anim, Breath, Depth, FACTION, Grow, Hp, CharFlash, CharScale, Facing, Magnet, MARK, Pop, Revive, Seat, Slot, Sprite, TAG, Transform } from '../components'
import { addMark } from '../utils/marks'
import { bodyRules } from '../store'
import { attachResource } from './resource'

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
  const def = CHARACTERS[run.roster[slot]!]
  const sandboxHp = sandboxInvincible() ? INVINCIBLE_HP : MEMBER.maxHp
  const size = MEMBER.size * UNIT * place.sizeMul
  const owned = sandbox ? [] : (run.memberItems[slot] ?? [])
  const level = sandbox ? sandboxLevel() + 1 : characterLevel(characterXp(owned))
  const fx = aggregateCharacterEffects(owned, levelStatsFor(run.roster[slot]!, level))
  const maxHp = sandbox ? sandboxHp : memberMaxHp(fx.hpAdd)
  const eid = spawnBody(world, {
    faction: FACTION.team,
    x,
    y,
    radius: MEMBER.radius * UNIT * place.sizeMul,
    hp: maxHp,
    thrust: def.body.thrust * UNIT,
    drag: def.body.drag,
    mass: def.body.mass,
    grip: TEAM.followerGrip,
    ownClock: true,
  })
  addComponents(world, eid, Slot, Breath, Pop, CharScale, Seat, Facing, Revive, CharFlash, Anim, Magnet)
  Slot.v[eid] = slot
  Breath.phase[eid] = slot * 1.3
  Magnet.radius[eid] = def.magnet * UNIT
  Hp.v[eid] = sandbox ? sandboxHp : waveStartHp(run.memberHp[slot] ?? MEMBER.maxHp, maxHp)
  const own = def.rules
  bodyRules[eid] = {
    resource: def.resource,
    onHurt: [{ kind: 'invuln', ms: MEMBER.iframesMs + fx.iframesAddMs }, ...(own?.onHurt ?? [])],
    onTouched: [...(fx.thorns > 0 ? [{ kind: 'damage' as const, amount: fx.thorns }] : []), ...(own?.onTouched ?? [])],
    onTouch: own?.onTouch,
    onKill: [...(fx.killHeal > 0 ? [{ kind: 'heal' as const, amount: fx.killHeal, scope: 'all' as const }] : []), ...(own?.onKill ?? [])],
    onLethal: own?.onLethal,
    onLowHp: own?.onLowHp,
    onIdle: own?.onIdle,
  }
  attachResource(world, eid, def.resource)
  if (fx.regenPerSec > 0) addMark(eid, MARK.regen, TAG.perk, Infinity, fx.regenPerSec)
  Revive.ms[eid] = Math.max(1000, TEAM.reviveMs + fx.reviveAddMs)
  CharScale.v[eid] = place.sizeMul
  Grow.r0[eid] = MEMBER.radius * UNIT
  Grow.s0[eid] = MEMBER.size * UNIT
  Seat.v[eid] = -1
  Facing.y[eid] = -1
  Transform.w[eid] = size
  Transform.h[eid] = size
  Sprite.frame[eid] = atlas.index(def.emoji, 'player')
  armIdle(eid, def.emoji, 'player', Sprite.frame[eid]!, slot * 173)
  Depth.z[eid] = 10 + place.depthOffsetY
  return eid
}
