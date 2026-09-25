import { hasComponent } from 'bitecs'
import { playSfx } from '../../audio/sfx'
import { Alive, FACTION, Faction, Heal, HealAoe, HealDefib, Revive, Transform } from '../components'
import { damageMul, ownerX, ownerY } from '../utils/amp'
import { healEnemies, healCharacters } from './shared/heal'
import { castScan } from './shared/castScan'
import type { Sim } from '../sim'
import { spawnFxCircle } from '../entities/fx'

export function castHeals(sim: Sim): void {
  castScan(sim, Heal, (e) => {
    const x = ownerX(e)
    const y = ownerY(e)
    const range = Heal.range[e]!
    const team = Faction.v[e] === FACTION.team
    if (
      team &&
      hasComponent(sim.world, e, HealDefib) &&
      cutReviveTimer(sim, x, y, range, HealDefib.reviveCutMs[e]!)
    ) {
      pulse(sim, x, y, range, 0xfff176)
      playSfx('zap')
      return true
    }
    const base = Math.max(1, Math.round(Heal.amount[e]! * damageMul(sim, e)))
    const all = hasComponent(sim.world, e, HealAoe)
    const amount = all ? Math.max(1, Math.round(base * HealAoe.ratio[e]!)) : base
    const healed = team
      ? healCharacters(sim, x, y, range, amount, all)
      : healEnemies(sim, x, y, range, amount, all)
    if (healed === 0) {
      Heal.cdLeft[e] = 300
      return false
    }
    pulse(sim, x, y, range, 0x81c784)
    playSfx('upgrade')
    return true
  })
}

function cutReviveTimer(sim: Sim, x: number, y: number, range: number, ms: number): boolean {
  const r2 = range * range
  let best = -1
  for (const m of sim.characters) {
    if (Alive.v[m]) continue
    const d = sim.hooks.worldDelta(sim, x, y, Transform.x[m]!, Transform.y[m]!)
    if (d.x * d.x + d.y * d.y > r2) continue
    if (best < 0 || Revive.at[m]! > Revive.at[best]!) best = m
  }
  if (best < 0) return false
  Revive.at[best] = Revive.at[best]! - ms
  return true
}

function pulse(sim: Sim, x: number, y: number, radius: number, color: number): void {
  spawnFxCircle(sim, x, y, radius, {
    fill: color,
    fillAlpha: 0.08,
    stroke: color,
    lineWidth: 3,
    lineAlpha: 0.7,
    fromScale: 0.25,
    toScale: 1,
    durationMs: 420,
    depth: 6,
  })
}
