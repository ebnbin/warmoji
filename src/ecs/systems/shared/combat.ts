import { hasComponent, query, removeEntity } from 'bitecs'
import { playSfx } from '../../../audio/sfx'
import { gainXp } from '../../../run/xp'
import { coinDropChance } from '../../../data/waves'
import { ELITE } from '../../../data/enemies'
import type { EnemyDef } from '../../../types/enemies'
import { MEMBER } from '../../../data/characters'
import { UNIT } from '../../../util/units'
import { spawnShards } from '../../entities/shard'
import { Alive, Anchored, Anim, Boss, Elite, ENEMY_SET, Hp, CharScale, MARK, Nest, Pop, Revive, Slot, Sprite, TAG, Thief, Tint, Transform } from '../../components'
import { addMark, dmgMul, hasMark } from '../../utils/marks'
import { bodyRules, enemyCarries, enemyDef } from '../../store'
import { selfSource } from '../../utils/source'
import { applyAbilityEffects } from './effects'
import { dropCoins, dropFieldPickup } from '../../entities/pickup'
import { unequipAbilities } from '../../entities/ability'
import type { Source } from '../../utils/source'
import type { Sim } from '../../sim'

/** 生命归零：带复活计时的身体倒地等待，其余身体死亡移除 */
export function die(sim: Sim, eid: number, src: Source, flingVx: number, flingVy: number): void {
  if (hasComponent(sim.world, eid, Revive)) {
    down(sim, eid)
    return
  }
  const anchored = hasComponent(sim.world, eid, Anchored)
  killEnemy(sim, eid, src.slot, anchored ? 0 : flingVx, anchored ? 0 : flingVy)
}

function down(sim: Sim, eid: number): void {
  Hp.v[eid] = 0
  Alive.v[eid] = 0
  Revive.at[eid] = sim.elapsedMs + Revive.ms[eid]!
  Tint.color[eid] = 0x888888
  Tint.alpha[eid] = 0.35
  const st = sim.run.stats
  const slot = Slot.v[eid]!
  if (slot >= 0 && slot < st.deaths.length) st.deaths[slot] = (st.deaths[slot] ?? 0) + 1
  Anim.frames[eid] = -1
  Anim.onceFrames[eid] = 0
  Transform.rot[eid] = 0
  Transform.w[eid] = MEMBER.size * UNIT * CharScale.v[eid]!
  Transform.h[eid] = MEMBER.size * UNIT * CharScale.v[eid]!
  sim.out.bursts.push({ x: Transform.x[eid]!, y: Transform.y[eid]!, count: 10, kind: 'puff' })
  if (sim.characters.every((x) => !Alive.v[x])) sim.over = true
}

function killEnemy(sim: Sim, eid: number, srcSlot: number, flingVx: number, flingVy: number): void {
  sim.run.kills++
  const st = sim.run.stats
  if (srcSlot >= 0 && srcSlot < st.kills.length) st.kills[srcSlot] = (st.kills[srcSlot] ?? 0) + 1
  const killer = sim.characters[srcSlot]
  const onKill = killer !== undefined && Alive.v[killer] ? bodyRules[killer]?.onKill : undefined
  if (killer !== undefined && onKill) {
    applyAbilityEffects(sim, selfSource(sim, killer), onKill, { x: Transform.x[killer]!, y: Transform.y[killer]!, baseDamage: 0, targets: [killer] })
  }
  playSfx('kill')
  const def = enemyDef[eid]
  const elite = Elite.v[eid] === 1
  const boss = Boss.v[eid] === 1
  if (def) st.enemyKills[def.kind] = (st.enemyKills[def.kind] ?? 0) + 1
  if (elite) st.eliteKills += 1
  sim.out.bursts.push({ x: Transform.x[eid]!, y: Transform.y[eid]!, count: 6, kind: 'death' })
  if (boss) sim.out.bursts.push({ x: Transform.x[eid]!, y: Transform.y[eid]!, count: 24, kind: 'death' })
  if (boss) sim.bossDown = true
  if (def) grantKillRewards(sim, eid, def, elite)
  const hexed = hasMark(sim, eid, MARK.morph)
  if (!hexed && def?.onDeath) {
    const snap = { eid: -1, def, x: Transform.x[eid]!, y: Transform.y[eid]!, elite, boss, dmgMul: dmgMul(sim, eid) }
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

export function gainTeamXp(sim: Sim, amount: number): void {
  const gained = gainXp(sim.run.xp, amount)
  sim.run.xp = gained.state
  if (gained.levelsGained > 0) {
    playSfx('levelup')
  }
}

function grantKillRewards(sim: Sim, eid: number, def: EnemyDef, elite: boolean): void {
  const xpMul = elite ? ELITE.xpMul : 1
  gainTeamXp(sim, Math.round(def.xp * xpMul))
  const dropRoll = sim.rng.next()
  const dropped = dropRoll < coinDropChance((sim.run.combatMs + sim.elapsedMs) / 1000)
  const baseCoins = dropped ? Math.round(def.coins * (elite ? ELITE.coinsMul : 1)) : 0
  const eaten = Thief.eaten[eid]!
  const total = baseCoins + eaten + (eaten > 0 ? 1 : 0)
  if (total > 0) dropCoins(sim, Transform.x[eid]!, Transform.y[eid]!, total)
}

function orphanBrood(sim: Sim, nestEid: number, rage = true): void {
  for (const eid of query(sim.world, ENEMY_SET)) {
    if (Nest.of[eid] !== nestEid) continue
    Nest.of[eid] = -1
    const lost = rage ? bodyRules[eid]?.onAnchorLost : undefined
    if (lost) applyAbilityEffects(sim, selfSource(sim, eid), lost, { x: Transform.x[eid]!, y: Transform.y[eid]!, baseDamage: 0, targets: [eid] })
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

/** 无敌窗口只能延长，不能缩短 */
export function grantIframe(sim: Sim, eid: number, ms: number): void {
  addMark(eid, MARK.invuln, TAG.effect, sim.elapsedMs + ms)
}

export function reviveCharacter(sim: Sim, eid: number): void {
  playSfx('revive')
  Alive.v[eid] = 1
  Anim.frames[eid] = 0
  Hp.v[eid] = Hp.max[eid]!
  // 复活视同被命中一次的保护
  const back = bodyRules[eid]?.onHurt
  if (back) applyAbilityEffects(sim, selfSource(sim, eid), back, { x: Transform.x[eid]!, y: Transform.y[eid]!, baseDamage: 0, targets: [eid] })
  Tint.color[eid] = 0xffffff
  Tint.alpha[eid] = 1
  Tint.effect[eid] = 0
  Pop.until[eid] = sim.fxMs + 200
  Transform.w[eid] = MEMBER.size * UNIT * 0.3 * CharScale.v[eid]!
  Transform.h[eid] = MEMBER.size * UNIT * 0.3 * CharScale.v[eid]!
}
