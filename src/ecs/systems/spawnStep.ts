import { playSfx } from '../../audio/sfx'
import { attachCarrierRing } from '../entities/pickup'
import { spawnEnemy } from '../entities/enemy'
import { enemyCarries, telegraphCarries, telegraphDef } from '../store'
import { Due, Telegraph, Transform } from '../components'
import { query, removeEntity } from 'bitecs'
import { runStream } from '../fight/spawns'
import { runKnobs } from '../sandbox/spawn'
import type { Sim } from '../sim'

/** 到点的预兆现身为敌人，再按这一场的规则连续刷怪 */
export function spawnStep(sim: Sim): void {
  const atlas = sim.frames
  const now = sim.elapsedMs
  for (const e of [...query(sim.world, [Telegraph, Due])]) {
    if (now < Due.at[e]!) continue
    const boss = Telegraph.boss[e] === 1
    const eid = spawnEnemy(sim, atlas, telegraphDef[e]!, Transform.x[e]!, Transform.y[e]!,
      Telegraph.hp[e]!, Telegraph.elite[e] === 1, boss)
    if (Telegraph.loud[e]) playSfx('boom')
    const carries = telegraphCarries[e]
    if (carries) {
      enemyCarries[eid] = carries
      attachCarrierRing(sim, eid, carries)
    }
    removeEntity(sim.world, e)
  }
  const f = sim.fight
  for (const st of f.streams) runStream(sim, st, sim.wdtMs)
  if (f.knobs) runKnobs(sim, f.knobs, sim.wdtMs)
}
