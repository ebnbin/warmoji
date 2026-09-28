import { playSfx } from '../../audio/sfx'
import { attachCarrierRing } from '../entities/pickup'
import { markBounty, spawnEnemy } from '../entities/enemy'
import { enemyCarries, telegraphDef, telegraphTraits } from '../store'
import { Bounty, Due, Telegraph, Transform } from '../components'
import { hasComponent, query, removeEntity } from 'bitecs'
import { runStream, runWaves } from '../fight/spawns'
import { runKnobs } from '../sandbox/spawn'
import type { Sim } from '../sim'

/** 到点的预兆现身为敌人，再按这一场的规则连续刷怪、放出下一组 */
export function spawnStep(sim: Sim): void {
  const atlas = sim.frames
  const now = sim.elapsedMs
  for (const e of [...query(sim.world, [Telegraph, Due])]) {
    if (now < Due.at[e]!) continue
    const boss = Telegraph.boss[e] === 1
    const traits = telegraphTraits[e] ?? {}
    const eid = spawnEnemy(sim, atlas, telegraphDef[e]!, Transform.x[e]!, Transform.y[e]!,
      Telegraph.hp[e]!, Telegraph.elite[e] === 1, boss, traits)
    if (Telegraph.loud[e]) playSfx('boom')
    if (traits.carries) {
      enemyCarries[eid] = traits.carries
      attachCarrierRing(sim, eid, traits.carries)
    }
    if (hasComponent(sim.world, e, Bounty)) markBounty(sim, eid)
    telegraphTraits[e] = undefined
    removeEntity(sim.world, e)
  }
  const f = sim.fight
  for (const st of f.streams) runStream(sim, st, sim.wdtMs)
  for (const w of f.waves) runWaves(sim, w)
  if (f.knobs) runKnobs(sim, f.knobs, sim.wdtMs)
}
