import { addComponent, addComponents, removeEntity } from 'bitecs'
import { newEntity } from './entity'
import { armIdle } from '../systems/shared/anim'
import { attachDrawable } from './drawable'
import { holderOutline } from './weapon'
import { Amp, Anim, Built, Emplacement, EmplaceShape, Faction, Fired, Minion, Owner, Retiring, Sprite, SummonShape, Swarmer } from '../components'
import type { Sim } from '../sim'
import { ANIM_DEF } from '../../emoji/anim'
import { abilityArtEmoji, emplaceAbility } from '../store'
import { ownerX, ownerY } from '../utils/amp'
import { equipAbility } from '../entities/ability'
import { liveOnes } from '../utils/turret'

interface MinionSpec {
  tag: object
  emoji: string
  size: number
  bornScale: number
  x: number
  y: number
  z: number
  lifeMs: number
  phase: number
  animOffsetMs?: number
}

function spawnMinion(sim: Sim, weaponEid: number, spec: MinionSpec): number {
  const outline = holderOutline(Faction.v[weaponEid]!, Owner.eid[weaponEid]!)
  const m = newEntity(sim.world)
  attachDrawable(sim.world, m, sim.frames, {
    id: spec.emoji,
    outline,
    x: spec.x,
    y: spec.y,
    size: spec.size * spec.bornScale,
    z: spec.z,
  })
  addComponents(sim.world, m, Minion, Owner, Built, spec.tag)
  Owner.eid[m] = Owner.eid[weaponEid]!
  Built.by[m] = weaponEid
  Minion.bornMs[m] = sim.fxMs
  Minion.dieAt[m] = spec.lifeMs > 0 ? sim.elapsedMs + spec.lifeMs : 0
  Minion.phase[m] = spec.phase
  Minion.size[m] = spec.size
  Minion.ability[m] = 0
  if (spec.animOffsetMs !== undefined) {
    addComponent(sim.world, m, Anim)
    armIdle(m, spec.emoji, outline, Sprite.frame[m]!, spec.animOffsetMs)
  }
  return m
}

export function spawnBee(sim: Sim, e: number, index: number): void {
  const count = SummonShape.count[e]!
  spawnMinion(sim, e, {
    tag: Swarmer,
    emoji: abilityArtEmoji[e]!,
    size: SummonShape.size[e]!,
    bornScale: 1,
    x: ownerX(e),
    y: ownerY(e),
    z: 12,
    lifeMs: SummonShape.lifeMs[e]!,
    phase: (index * Math.PI * 2) / count,
    animOffsetMs: (index * ANIM_DEF.durMs) / count,
  })
}

export const RETIRE_MS = 240
export const POP_MS = 220
const FIRST_SHOT_MS = 200

/** 装置退场：先撤它的能力，再缩小淡出 */
export function retireEmplacement(sim: Sim, t: number): void {
  addComponent(sim.world, t, Retiring)
  Retiring.until[t] = sim.fxMs + RETIRE_MS
  const a = Minion.ability[t]!
  if (a !== 0) {
    removeEntity(sim.world, a)
    Minion.ability[t] = 0
  }
}

/** 架一座装置：一个固定身体，带着定义里那条能力，所有者仍是施法者 */
export function place(sim: Sim, e: number, at?: { x: number; y: number }, lifeMs = 0): void {
  const live = liveOnes(sim, e)
  const m = spawnMinion(sim, e, {
    tag: Emplacement,
    emoji: abilityArtEmoji[e]!,
    size: EmplaceShape.size[e]!,
    bornScale: 0.2,
    x: at ? at.x : ownerX(e),
    y: at ? at.y : ownerY(e) + 6,
    z: 5,
    lifeMs,
    phase: 0,
    animOffsetMs: live.length * 311,
  })
  addComponent(sim.world, m, Fired)
  Fired.v[m] = 0
  const def = emplaceAbility[e]!
  const a = equipAbility(sim, m, def, Faction.v[e]!, FIRST_SHOT_MS, {
    dmg: Amp.dmg[e]!,
    cd: Amp.cd[e]!,
    crit: Amp.crit[e]!,
    kb: Amp.kb[e]!,
    battle: Amp.battle[e] === 1,
  }, { owner: Owner.eid[e]! })
  Minion.ability[m] = a
  let over = live.length + 1 - EmplaceShape.maxAlive[e]!
  while (over-- > 0) {
    let oldest = -1
    for (const o of live) if (oldest < 0 || Minion.bornMs[o]! < Minion.bornMs[oldest]!) oldest = o
    if (oldest < 0) break
    retireEmplacement(sim, oldest)
    live.splice(live.indexOf(oldest), 1)
  }
}
