import { hasComponent } from 'bitecs'
import { CRIT_MUL } from '../../../data/items'
import { norm } from '../../../util/vec'
import { playSfx } from '../../../audio/sfx'
import { Alive, CharFlash, Dormant, FACTION, Faction, Flash, Hp, Iframe, MARK, Slot, TAG, Tint, Transform } from '../../components'
import { addMark, guardMul, hasMark } from '../../utils/marks'
import { impulse } from './body'
import { die } from './combat'
import { spawnDamageNumber } from '../../entities/fx'
import type { Point } from '../../../util/vec'
import type { Source } from '../../utils/source'
import type { Sim } from '../../sim'

export interface HitOpts {
  readonly knockback?: number
  readonly from?: Point
  /** 持续伤害与场地危害：不看也不消耗无敌帧 */
  readonly tick?: boolean
}

function record(sim: Sim, src: Source, target: number, dmg: number): void {
  const st = sim.run.stats
  if (Faction.v[target] === FACTION.team) {
    const slot = Slot.v[target]!
    if (slot >= 0 && slot < st.damageTaken.length) st.damageTaken[slot] = (st.damageTaken[slot] ?? 0) + dmg
    if (src.enemy) st.enemyDamage[src.enemy] = (st.enemyDamage[src.enemy] ?? 0) + dmg
    if (src.hazard) st.hazardDamage[src.hazard] = (st.hazardDamage[src.hazard] ?? 0) + dmg
    return
  }
  if (src.slot >= 0 && src.slot < st.damage.length) {
    st.damage[src.slot] = (st.damage[src.slot] ?? 0) + Math.min(dmg, Math.max(0, Hp.v[target]!))
  }
}

/** 唯一的伤害入口：无敌帧、护盾倍率、暴击、扣血、死亡、受击反馈、击退冲量，敌我同一条；返回是否命中 */
export function hit(sim: Sim, src: Source, target: number, damage: number, o: HitOpts = {}): boolean {
  if (sim.over || !hasComponent(sim.world, target, Hp) || Dormant.v[target] || Alive.v[target] === 0) return false
  const now = sim.elapsedMs
  if (!o.tick) {
    if (hasMark(sim, target, MARK.invuln)) return false
    if (Iframe.ms[target]! > 0) addMark(target, MARK.invuln, TAG.effect, now + Iframe.ms[target]!)
  }
  let dmg = damage
  const guard = guardMul(sim, target)
  if (guard !== 1) dmg = Math.max(1, Math.round(dmg * guard))
  const crit = src.crit > 0 && sim.rng.next() < Math.min(0.5, src.crit)
  if (crit) dmg = Math.round(dmg * CRIT_MUL)
  spawnDamageNumber(sim, Transform.x[target]!, Transform.y[target]!, dmg, crit)
  record(sim, src, target, dmg)
  const team = Faction.v[target] === FACTION.team
  if (team) sim.characterHitCount++
  let jx = 0
  let jy = 0
  const kb = (o.knockback ?? 0) * src.kb
  if (kb > 0 && o.from) {
    const d = sim.hooks.worldDelta(sim, o.from.x, o.from.y, Transform.x[target]!, Transform.y[target]!)
    const dir = norm(d.x, d.y)
    jx = dir.x * kb
    jy = dir.y * kb
  }
  const hp = Hp.v[target]! - dmg
  if (hp <= 0) {
    die(sim, target, src, jx, jy)
    return true
  }
  Hp.v[target] = hp
  if (team) {
    playSfx('hurt')
    CharFlash.until[target] = sim.fxMs + 120
    Tint.color[target] = src.tint ?? 0xff7777
    Tint.effect[target] = 0
  } else {
    playSfx('hit')
    Flash.until[target] = now + 70
    Tint.effect[target] = 1
    Tint.color[target] = 0xffffff
  }
  if (jx !== 0 || jy !== 0) impulse(sim, target, jx, jy)
  return true
}
