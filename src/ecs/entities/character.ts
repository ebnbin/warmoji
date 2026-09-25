import { addComponent } from 'bitecs'
import { newEntity } from './entity'

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
import { INVINCIBLE_HP, sandboxInvincible, sandboxLevel } from '../sandbox/knobs'
import { armIdle } from '../systems/shared/anim'

import type { RunState } from '../../run/state'
import { Alive, Anim, Breath, Depth, Follow, GroundHit, VisOff, Hurt, Iframe, CharAtkSlow, Character, CharFlash, CharHp, CharPerk, CharScale, MoveSpeed, OrbitBias, Pop, Post, Quad, Revive, Slot, Sprite, Threat, Tint, Transform, Wander } from '../components'

import type { EcsWorld } from '../world'
import type { EcsAtlas } from '../atlas'

export interface CharacterPlacement {
  slot: number
  post: number
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
  const { slot, post, x, y } = place
  const def = CHARACTERS[run.roster[slot]!]
  const teamFx = aggregateTeamCards(run.teamCards)
  const captain = CAPTAINS[run.captainId]
  const sandboxHp = sandboxInvincible() ? INVINCIBLE_HP : MEMBER.maxHp
  const size = MEMBER.size * UNIT * place.sizeMul
    const eid = newEntity(world)
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
  addComponent(world, eid, CharScale)
  addComponent(world, eid, MoveSpeed)
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
  const owned = sandbox ? [] : (run.memberItems[slot] ?? [])
  const level = sandbox ? sandboxLevel() + 1 : characterLevel(characterXp(owned))
  const fx = aggregateCharacterEffects(owned, levelStatsFor(run.roster[slot]!, level))
  const maxHp = sandbox ? sandboxHp : Math.round(memberMaxHp(fx.hpAdd, captain.hpMul) * teamFx.teamHpMul)
  CharHp.hp[eid] = sandbox ? sandboxHp : waveStartHp(run.memberHp[slot] ?? MEMBER.maxHp, maxHp)
  CharHp.max[eid] = maxHp
  CharPerk.thorns[eid] = fx.thorns
  CharPerk.killHeal[eid] = fx.killHeal
  CharPerk.regenPerSec[eid] = fx.regenPerSec
  Iframe.ms[eid] = MEMBER.iframesMs + fx.iframesAddMs
  Iframe.last[eid] = -1e9
  GroundHit.last[eid] = -1e9
  Revive.ms[eid] = Math.max(1000, TEAM.reviveMs * captain.reviveMul * teamFx.reviveMul + fx.reviveAddMs)
  Revive.at[eid] = 0
  Hurt.radius[eid] = MEMBER.radius * UNIT * place.sizeMul
  CharScale.v[eid] = place.sizeMul
  MoveSpeed.v[eid] = def.moveSpeed * UNIT * teamFx.moveSpeedMul
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
