import { UNIT } from '../../util/units'
import { ORBIT } from '../../data/feel'
import { ringPostAngle } from '../../data/formation'
import { angleDiff, orbitTendency, pickDriver, stepPhase, threatWeight } from '../../war/orbit'
import type { OrbitThreat } from '../../war/orbit'
import { Alive, Orbit, Threat, Transform } from '../components'
import type { Sim } from '../sim'
import { centerX, centerY } from '../utils/team'

/** 队伍活感·探测与轨道(镜像 updateOrbit):逐员判定探测范围内有无敌人 + 环上主力驱动共享相位 */
export function updateOrbit(sim: Sim): void {
  const delta = sim.dtMs
  const { count, formation } = sim
  if (sim.characters.length === 0) return
  const range = ORBIT.detectRange * UNIT
  const rangeSq = range * range
  const wants = new Array<number>(sim.characters.length).fill(0)
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
    for (const t of sim.enemyTargets) {
      const dx = t.x - Transform.x[eid]!
      const dy = t.y - Transform.y[eid]!
      const dSq = dx * dx + dy * dy
      if (dSq >= rangeSq) continue
      Threat.v[eid] = 1
      if (base === null || bias === 0) break
      threats.push({
        diff: angleDiff(theta, Math.atan2(t.y - centerY(sim), t.x - centerX(sim))),
        weight: threatWeight(Math.sqrt(dSq), range),
      })
    }
    if (base !== null && bias !== 0) wants[idx] = orbitTendency(bias, threats)
  }
  if (!rotatable) return
  const driver = pickDriver(
    wants.map((w) => Math.abs(w)),
    Math.random,
  )
  Orbit.driver[sim.captain] = driver
  Orbit.phase[sim.captain] = stepPhase(Orbit.phase[sim.captain]!, driver >= 0 ? (wants[driver] ?? 0) : 0, delta)
}
