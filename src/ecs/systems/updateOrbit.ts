import { UNIT } from '../../util/units'
import { ORBIT } from '../../data/feel'
import { ringPostAngle } from '../../data/formation'
import { angleDiff, orbitTendency, pickDriver, stepPhase, threatWeight } from '../utils/orbit'
import type { OrbitThreat } from '../utils/orbit'
import { eachTarget } from '../utils/targets'
import { boltSource } from '../utils/source'
import { Alive, Orbit, Threat, Transform } from '../components'
import type { Sim } from '../sim'
import { centerX, centerY } from '../utils/team'
import { orbitOn } from './shared/pursuit'

export function updateOrbit(sim: Sim): void {
  const delta = sim.dtMs
  const { count, formation } = sim
  if (sim.characters.length === 0) return
  const range = ORBIT.detectRange * UNIT
  const rangeSq = range * range
  const wants = new Array<number>(sim.characters.length).fill(0)
  const src = boltSource(-1)
  let rotatable = false
  for (let slot = 0; slot < sim.characters.length; slot++) {
    const eid = sim.characters[slot]!
    Threat.v[eid] = 0
    if (!Alive.v[eid]) continue
    const bias = sim.lineupOrbit[slot] ?? 0
    const idx = sim.postBySlot[slot] ?? slot
    const base = ringPostAngle(formation, idx, count)
    if (base !== null) rotatable = true
    const theta = (base ?? 0) + Orbit.phase[sim.captain]!
    const threats: OrbitThreat[] = []
    const mx = Transform.x[eid]!
    const my = Transform.y[eid]!
    eachTarget(sim, src, mx, my, range, (_t, tx, ty) => {
      const dx = tx - mx
      const dy = ty - my
      const dSq = dx * dx + dy * dy
      if (dSq >= rangeSq) return
      Threat.v[eid] = 1
      if (base === null || bias === 0) return true
      threats.push({
        diff: angleDiff(theta, Math.atan2(ty - centerY(sim), tx - centerX(sim))),
        weight: threatWeight(Math.sqrt(dSq), range),
      })
    })
    if (base !== null && bias !== 0) wants[idx] = orbitTendency(bias, threats)
  }
  if (!rotatable || !orbitOn()) return
  const driver = pickDriver(
    wants.map((w) => Math.abs(w)),
    Math.random,
  )
  Orbit.driver[sim.captain] = driver
  Orbit.phase[sim.captain] = stepPhase(Orbit.phase[sim.captain]!, driver >= 0 ? (wants[driver] ?? 0) : 0, delta)
}
