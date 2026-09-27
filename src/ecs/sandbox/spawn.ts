import { ENEMIES } from '../../data/enemies'
import { mapEnemyRoster } from '../../data/maps'
import { toPx } from '../../data/px'
import type { EnemyKind } from '../../types/enemies'
import { foeCount, sightedSpawnPoint } from '../entities/enemy'
import { spawnTelegraph, telegraphCount } from '../entities/telegraph'
import { sandboxDifficulty, sandboxEnemySet, spawnParams } from './knobs'
import type { Sim } from '../sim'

/** 试炼场按旋钮刷怪：每隔一阵来一批，种类、规模与血量都看旋钮，场上满了就不刷 */
export function runKnobs(sim: Sim, st: { cooldownMs: number }, deltaMs: number): void {
  st.cooldownMs -= deltaMs
  if (st.cooldownMs > 0) return
  const d = spawnParams()
  st.cooldownMs = d.intervalMs
  const roster = new Set<EnemyKind>(mapEnemyRoster(sim.mapId).map((e) => e.kind))
  const kinds = [...sandboxEnemySet()].filter((k) => roster.has(k))
  if (kinds.length === 0) return
  const hpMul = sandboxDifficulty()
  let live = foeCount(sim) + telegraphCount(sim)
  for (let i = 0; i < d.batch; i++, live++) {
    if (live >= d.cap) return
    const raw = ENEMIES[kinds[Math.floor(sim.rng.next() * kinds.length)]!]
    const def = toPx(raw)
    const boss = raw.role === 'boss'
    const pos = boss ? sim.hooks.spawnPoint(sim, true) : sightedSpawnPoint(sim)
    spawnTelegraph(sim, def, pos.x, pos.y, Math.round(def.hp * hpMul), false, boss)
  }
}
