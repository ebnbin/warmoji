import { addComponent } from 'bitecs'
import { newEntity } from './entity'

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
import { Alive, Anim, AtkSlow, Breath, Clock, Depth, DmgBuff, DmgMul, Drive, FACTION, Faction, GroundHit, Guard, Hidden, Hp, VisOff, Iframe, Character, CharFlash, CharPerk, CharScale, Facing, Leaping, Magnet, Phys, Poison, Pop, Quad, Radius, Revive, Rushing, Seat, Slot, Slow, Sprite, Tint, Transform } from '../components'

import type { EcsWorld } from '../world'
import type { EcsAtlas } from '../atlas'

export interface CharacterPlacement {
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
    const eid = newEntity(world)
  addComponent(world, eid, Character)
  addComponent(world, eid, Slot)
  addComponent(world, eid, VisOff)
  addComponent(world, eid, Breath)
  addComponent(world, eid, Pop)
  addComponent(world, eid, Alive)
  addComponent(world, eid, Hp)
  addComponent(world, eid, Guard)
  addComponent(world, eid, DmgMul)
  addComponent(world, eid, Slow)
  addComponent(world, eid, Poison)
  addComponent(world, eid, CharScale)
  addComponent(world, eid, Phys)
  addComponent(world, eid, Drive)
  addComponent(world, eid, Clock)
  addComponent(world, eid, Faction)
  addComponent(world, eid, Seat)
  addComponent(world, eid, Facing)
  addComponent(world, eid, AtkSlow)
  addComponent(world, eid, CharPerk)
  addComponent(world, eid, Iframe)
  addComponent(world, eid, Revive)
  addComponent(world, eid, Radius)
  addComponent(world, eid, GroundHit)
  addComponent(world, eid, CharFlash)
  addComponent(world, eid, Transform)
  addComponent(world, eid, Anim)
  addComponent(world, eid, Sprite)
  addComponent(world, eid, Tint)
  addComponent(world, eid, Depth)
  addComponent(world, eid, Magnet)
  addComponent(world, eid, DmgBuff)
  addComponent(world, eid, Hidden)
  addComponent(world, eid, Rushing)
  addComponent(world, eid, Leaping)
  Slot.v[eid] = slot
  VisOff.x[eid] = 0
  VisOff.y[eid] = 0
  Breath.phase[eid] = slot * 1.3
  Pop.until[eid] = 0
  Alive.v[eid] = 1
  AtkSlow.until[eid] = 0
  AtkSlow.mul[eid] = 1
  Guard.until[eid] = 0
  Guard.mul[eid] = 1
  DmgMul.v[eid] = 1
  Slow.until[eid] = 0
  Slow.mul[eid] = 1
  Poison.until[eid] = 0
  Magnet.radius[eid] = def.magnet * UNIT
  DmgBuff.mul[eid] = 1
  DmgBuff.until[eid] = 0
  Hidden.until[eid] = 0
  Hidden.tinted[eid] = 0
  Rushing.active[eid] = 0
  Leaping.active[eid] = 0
  Leaping.landed[eid] = 0
  const owned = sandbox ? [] : (run.memberItems[slot] ?? [])
  const level = sandbox ? sandboxLevel() + 1 : characterLevel(characterXp(owned))
  const fx = aggregateCharacterEffects(owned, levelStatsFor(run.roster[slot]!, level))
  const maxHp = sandbox ? sandboxHp : memberMaxHp(fx.hpAdd)
  Hp.v[eid] = sandbox ? sandboxHp : waveStartHp(run.memberHp[slot] ?? MEMBER.maxHp, maxHp)
  Hp.max[eid] = maxHp
  CharPerk.thorns[eid] = fx.thorns
  CharPerk.killHeal[eid] = fx.killHeal
  CharPerk.regenPerSec[eid] = fx.regenPerSec
  Iframe.ms[eid] = MEMBER.iframesMs + fx.iframesAddMs
  Iframe.last[eid] = -1e9
  GroundHit.last[eid] = -1e9
  Revive.ms[eid] = Math.max(1000, TEAM.reviveMs + fx.reviveAddMs)
  Revive.at[eid] = 0
  Radius.v[eid] = MEMBER.radius * UNIT * place.sizeMul
  CharScale.v[eid] = place.sizeMul
  Phys.vx[eid] = 0
  Phys.vy[eid] = 0
  Phys.thrust[eid] = def.body.thrust * UNIT
  Phys.drag[eid] = def.body.drag
  Phys.mass[eid] = def.body.mass
  Phys.grip[eid] = TEAM.followerGrip
  Drive.x[eid] = 0
  Drive.y[eid] = 0
  Clock.v[eid] = 1
  Faction.v[eid] = FACTION.team
  Seat.v[eid] = -1
  Seat.ghost[eid] = 0
  Facing.x[eid] = 0
  Facing.y[eid] = -1
  Facing.vx[eid] = 0
  Facing.vy[eid] = 0
  CharFlash.until[eid] = 0
  Transform.x[eid] = x
  Transform.y[eid] = y
  Transform.rot[eid] = 0
  Transform.w[eid] = size
  Transform.h[eid] = size
  Sprite.frame[eid] = atlas.index(def.emoji, 'player')
  Sprite.flipX[eid] = 0
  armIdle(eid, def.emoji, 'player', Sprite.frame[eid]!, slot * 173)
  Tint.color[eid] = 0xffffff
  Tint.effect[eid] = 0
  Tint.alpha[eid] = 1
  Depth.z[eid] = 10 + place.depthOffsetY
  Quad.v[eid] = 0
  return eid
}
