import { hasComponent, query, removeEntity } from 'bitecs'
import { norm } from '../../../util/vec'
import { playSfx } from '../../../audio/sfx'
import { gainXp } from '../../../run/xp'
import { coinDropChance } from '../../../data/waves'
import { ELITE } from '../../../data/enemies'
import type { EnemyDef } from '../../../types/enemies'
import { KNOCKBACK } from '../../../data/abilities'
import { MEMBER } from '../../../data/characters'
import { UNIT } from '../../../util/units'
import { spawnShards } from '../../entities/shard'
import { Alive, Anim, Boss, DmgMul, Dormant, Elite, Enemy, ENEMY_SET, Flash, Hp, Iframe, Kv, CharFlash, CharHp, Morph, CharPerk, Nest, Orphan, Pop, Revive, Slot, SpMul, Sprite, Thief, Tint, Transform } from '../../components'
import { enemyCarries, enemyDef } from '../../store'
import { dropCoins, dropFieldPickup } from '../../entities/pickup'
import { unequipAbilities } from '../../entities/ability'
import type { Sim } from '../../sim'
import { spawnDamageNumber } from '../../entities/fx'

export function applyDamage(
  sim: Sim,
  eid: number,
  damage: number,
  knockback = 0,
  srcX?: number,
  srcY?: number,
  srcSlot = -1,
  crit = false,
): void {
  if (!hasComponent(sim.world, eid, Enemy) || Dormant.v[eid]) return
  const def = enemyDef[eid]
  const morphed = Morph.until[eid] !== 0 && sim.elapsedMs < Morph.until[eid]!
  const dmg = morphed && Morph.vuln[eid] !== 1 ? Math.round(damage * Morph.vuln[eid]!) : damage
  spawnDamageNumber(sim, Transform.x[eid]!, Transform.y[eid]!, dmg, crit)
  const hp = Hp.v[eid]! - dmg
  const st = sim.run.stats
  if (srcSlot >= 0 && srcSlot < st.damage.length) {
    st.damage[srcSlot] = (st.damage[srcSlot] ?? 0) + Math.min(dmg, Math.max(0, Hp.v[eid]!))
  }
  const kbImmune = def?.kbImmune === true && !morphed
  if (hp <= 0) {
    let flingVx = 0
    let flingVy = 0
    if (knockback > 0 && srcX !== undefined && srcY !== undefined && !kbImmune) {
      const d = sim.hooks.worldDelta(sim, srcX, srcY, Transform.x[eid]!, Transform.y[eid]!)
      const dir = norm(d.x, d.y)
      flingVx = dir.x * knockback
      flingVy = dir.y * knockback
    }
    killEnemy(sim, eid, srcSlot, flingVx, flingVy)
    return
  }
  Hp.v[eid] = hp
  playSfx('hit')
  Flash.until[eid] = sim.elapsedMs + 70
  Tint.effect[eid] = 1
  Tint.color[eid] = 0xffffff
  const kb = kbImmune ? 0 : knockback
  if (kb > 0 && srcX !== undefined && srcY !== undefined) {
    const d = sim.hooks.worldDelta(sim, srcX, srcY, Transform.x[eid]!, Transform.y[eid]!)
    const dir = norm(d.x, d.y)
    let kvx = Kv.x[eid]! + dir.x * kb
    let kvy = Kv.y[eid]! + dir.y * kb
    const len = Math.hypot(kvx, kvy)
    if (len > KNOCKBACK.maxSpeed) {
      kvx = (kvx / len) * KNOCKBACK.maxSpeed
      kvy = (kvy / len) * KNOCKBACK.maxSpeed
    }
    Kv.x[eid] = kvx
    Kv.y[eid] = kvy
  }
}

function killEnemy(sim: Sim, eid: number, srcSlot = -1, flingVx = 0, flingVy = 0): void {
  sim.run.kills++
  const st = sim.run.stats
  if (srcSlot >= 0 && srcSlot < st.kills.length) st.kills[srcSlot] = (st.kills[srcSlot] ?? 0) + 1
  const killer = sim.characters[srcSlot]
  if (killer !== undefined && Alive.v[killer] && CharPerk.killHeal[killer]! > 0) {
    CharHp.hp[killer] = Math.min(CharHp.max[killer]!, CharHp.hp[killer]! + CharPerk.killHeal[killer]!)
  }
  playSfx('kill')
  const def = enemyDef[eid]
  const elite = Elite.v[eid] === 1
  const boss = Boss.v[eid] === 1
  if (def) st.enemyKills[def.name] = (st.enemyKills[def.name] ?? 0) + 1
  if (elite) st.eliteKills += 1
  sim.out.bursts.push({ x: Transform.x[eid]!, y: Transform.y[eid]!, count: 6, kind: 'death' })
  if (boss) sim.out.bursts.push({ x: Transform.x[eid]!, y: Transform.y[eid]!, count: 24, kind: 'death' })
  if (boss) sim.bossDown = true
  if (def) grantKillRewards(sim, eid, def, elite)
  const hexed = Morph.until[eid] !== 0 && sim.elapsedMs < Morph.until[eid]!
  if (!hexed && def?.onDeath) {
    const snap = { eid: -1, def, x: Transform.x[eid]!, y: Transform.y[eid]!, elite, boss, dmgMul: DmgMul.v[eid]! }
    if (sim.onDeathFx) sim.onDeathFx({ ...snap, eid })
    else sim.pendingDeaths.push(snap)
  }
  if (def?.spawner) orphanBrood(sim, eid, !hexed)
  const carries = enemyCarries[eid]
  if (carries) {
    dropFieldPickup(sim, Transform.x[eid]!, Transform.y[eid]!, carries)
    enemyCarries[eid] = undefined
  }
  spawnShards(
    sim,
    Transform.x[eid]!,
    Transform.y[eid]!,
    Transform.w[eid]!,
    Transform.h[eid]!,
    Sprite.frame[eid]!,
    Sprite.flipX[eid]!,
    flingVx,
    flingVy,
  )
  unequipAbilities(sim, eid)
  enemyDef[eid] = undefined
  removeEntity(sim.world, eid)
}

function gainTeamXp(sim: Sim, amount: number): void {
  const gained = gainXp(sim.run.xp, amount)
  sim.run.xp = gained.state
  if (gained.levelsGained > 0) {
    sim.run.cardDraws += gained.levelsGained
    playSfx('levelup')
  }
}

function grantKillRewards(sim: Sim, eid: number, def: EnemyDef, elite: boolean): void {
  const xpMul = sim.reward.captainXpMul * (elite ? ELITE.xpMul : 1)
  gainTeamXp(sim, Math.round(def.xp * xpMul))
  const dropRoll = sim.rng.next()
  const doubleRoll = sim.rng.next()
  const dropped = dropRoll < coinDropChance((sim.run.combatMs + sim.elapsedMs) / 1000)
  const baseCoins = dropped ? Math.round(def.coins * (elite ? ELITE.coinsMul : 1)) : 0
  const doubled = baseCoins > 0 && doubleRoll < sim.reward.doubleCoinChance ? baseCoins : 0
  const eaten = Thief.eaten[eid]!
  const total = baseCoins + doubled + eaten + (eaten > 0 ? 1 : 0)
  if (total > 0) dropCoins(sim, Transform.x[eid]!, Transform.y[eid]!, total)
}

function orphanBrood(sim: Sim, nestEid: number, rage = true): void {
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
    if (Nest.of[eid] !== nestEid) continue
    Nest.of[eid] = -1
    if (rage && hasComponent(sim.world, eid, Orphan)) {
      SpMul.v[eid] = SpMul.v[eid]! * Orphan.speedMul[eid]!
      DmgMul.v[eid] = DmgMul.v[eid]! * Orphan.damageMul[eid]!
    }
  }
}

export function despawnEnemy(sim: Sim, eid: number, puff = true): void {
  if (puff) sim.out.bursts.push({ x: Transform.x[eid]!, y: Transform.y[eid]!, count: 8, kind: 'puff' })
  if (enemyDef[eid]?.spawner) orphanBrood(sim, eid)
  enemyCarries[eid] = undefined
  unequipAbilities(sim, eid)
  enemyDef[eid] = undefined
  removeEntity(sim.world, eid)
}

export function hurtCharacter(sim: Sim, eid: number, damage: number, srcName?: string, tint = 0xff7777): void {
  const st = sim.run.stats
  const slot = Slot.v[eid]!
  if (slot >= 0 && slot < st.damageTaken.length) {
    st.damageTaken[slot] = (st.damageTaken[slot] ?? 0) + damage
  }
  if (srcName) st.enemyDamage[srcName] = (st.enemyDamage[srcName] ?? 0) + damage
  const hp = Math.max(0, CharHp.hp[eid]! - damage)
  CharHp.hp[eid] = hp
  playSfx('hurt')
  sim.characterHitCount++
  CharFlash.until[eid] = sim.fxMs + 120
  Tint.color[eid] = tint
  Tint.effect[eid] = 0
  if (hp <= 0) {
    Alive.v[eid] = 0
    Revive.at[eid] = sim.elapsedMs + Revive.ms[eid]!
    Tint.color[eid] = 0x888888
    Tint.alpha[eid] = 0.35
    const deaths = sim.run.stats.deaths
    if (slot >= 0 && slot < deaths.length) deaths[slot] = (deaths[slot] ?? 0) + 1
    Anim.frames[eid] = -1
    Anim.onceFrames[eid] = 0
    Transform.rot[eid] = 0
    Transform.w[eid] = MEMBER.size * UNIT
    Transform.h[eid] = MEMBER.size * UNIT
    sim.out.bursts.push({ x: Transform.x[eid]!, y: Transform.y[eid]!, count: 10, kind: 'puff' })
    if (sim.characters.every((x) => !Alive.v[x])) sim.over = true
  }
}

export function reviveCharacter(sim: Sim, eid: number): void {
  const now = sim.elapsedMs
  playSfx('revive')
  Alive.v[eid] = 1
  Anim.frames[eid] = 0
  CharHp.hp[eid] = CharHp.max[eid]!
  Iframe.last[eid] = now
  Tint.color[eid] = 0xffffff
  Tint.alpha[eid] = 1
  Tint.effect[eid] = 0
  Pop.until[eid] = sim.fxMs + 200
  Transform.w[eid] = MEMBER.size * UNIT * 0.3
  Transform.h[eid] = MEMBER.size * UNIT * 0.3
}

