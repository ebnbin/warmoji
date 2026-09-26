import { addComponent, hasComponent, query, removeComponent, removeEntity } from 'bitecs'
import { POP_MS, RETIRE_MS } from '../entities/minion'
import { Ability, Aim, Emplacement, Fired, Frozen, Minion, Retiring, Shoot, Tint, Transform } from '../components'
import { playClip } from './shared/anim'
import { backEaseOut } from '../utils/ease'
import type { Sim } from '../sim'

export function updateEmplacements(sim: Sim): void {
  for (const t of [...query(sim.world, [Emplacement, Minion, Transform])]) {
    if (hasComponent(sim.world, t, Retiring)) {
      const left = Retiring.until[t]! - sim.fxMs
      if (left <= 0) {
        removeEntity(sim.world, t)
        continue
      }
      const p = 1 - left / RETIRE_MS
      const k = Minion.size[t]! * (1 - 0.7 * p)
      Transform.w[t] = k
      Transform.h[t] = k
      Tint.alpha[t] = 1 - p
      continue
    }
    // 限时的弩塔到点退场
    if (Minion.dieAt[t]! > 0 && sim.elapsedMs >= Minion.dieAt[t]!) {
      addComponent(sim.world, t, Retiring)
      Retiring.until[t] = sim.fxMs + RETIRE_MS
      removeComponent(sim.world, t, Ability)
      continue
    }
    if (Frozen.v[t]) {
      Tint.alpha[t] = 0
      continue
    }
    const age = sim.fxMs - Minion.bornMs[t]!
    if (age < POP_MS) {
      const k = Minion.size[t]! * (0.2 + 0.8 * backEaseOut(age / POP_MS))
      Transform.w[t] = k
      Transform.h[t] = k
    } else if (Transform.w[t] !== Minion.size[t]) {
      Transform.w[t] = Minion.size[t]!
      Transform.h[t] = Minion.size[t]!
    }
    Tint.alpha[t] = 1
    if (Fired.v[t]) {
      Fired.v[t] = 0
      Transform.rot[t] = Aim.rad[t]! - Math.PI / 4
      playClip(sim, sim.frames, t, 'attack', Shoot.cdLeft[t]!)
    }
  }
}
