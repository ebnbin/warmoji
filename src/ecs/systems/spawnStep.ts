import { playSfx } from '../../audio/sfx'
import { SPAWN } from '../../data/enemies'
import { attachCarrierRing } from '../entities/pickup'
import { markBounty, sightedSpawnPoint, spawnEnemy } from '../entities/enemy'
import { enterBody } from '../entities/entrance'
import { telegraphDelay } from '../entities/telegraph'
import { enemyCarries, telegraphDef, telegraphEntry, telegraphTraits } from '../store'
import { Bounty, Due, Telegraph, Transform } from '../components'
import { hasComponent, query, removeEntity } from 'bitecs'
import { runStream, runWaves } from '../fight/spawns'
import { runKnobs } from '../sandbox/spawn'
import { moveEntry } from '../worlds/gates'
import type { Entry } from '../worlds/gates'
import type { Sim } from '../sim'

/** 落点站不住时最多换几次地方，再站不住就照样出来 */
const MAX_MOVES = 2

/** 落点站不住了（熔岩漫了过来）：按原来的站位重找一处，预兆挪过去重新打 */
function retarget(sim: Sim, t: number, e: Entry): void {
  const boss = Telegraph.boss[t] === 1
  const next = moveEntry(sim, e, telegraphDef[t]!.kind, boss, () => (boss ? sim.hooks.spawnPoint(sim, true) : sightedSpawnPoint(sim)))
  telegraphEntry[t] = next
  Transform.x[t] = next.x
  Transform.y[t] = next.y
  Telegraph.bornMs[t] = sim.elapsedMs
  Due.at[t] = sim.elapsedMs + telegraphDelay(sim, boss, SPAWN.telegraphMs * (boss ? 1.6 : 1), next)
}

/** 到点的预兆现身为敌人：从出怪口进场的在起点现身、按进场方式落到预兆的地方；再按这一场的规则连续刷怪、放出下一组 */
export function spawnStep(sim: Sim): void {
  const atlas = sim.frames
  const now = sim.elapsedMs
  for (const e of [...query(sim.world, [Telegraph, Due])]) {
    if (now < Due.at[e]!) continue
    const entry = telegraphEntry[e]
    if (entry && entry.moves < MAX_MOVES && !sim.hooks.canSpawn(sim, entry.x, entry.y)) {
      retarget(sim, e, entry)
      continue
    }
    const boss = Telegraph.boss[e] === 1
    const traits = telegraphTraits[e] ?? {}
    const eid = spawnEnemy(sim, atlas, telegraphDef[e]!, entry?.sx ?? Transform.x[e]!, entry?.sy ?? Transform.y[e]!,
      Telegraph.hp[e]!, Telegraph.elite[e] === 1, boss, traits)
    if (entry) enterBody(sim, eid, entry)
    if (Telegraph.loud[e]) playSfx('boom')
    if (traits.carries) {
      enemyCarries[eid] = traits.carries
      attachCarrierRing(sim, eid, traits.carries)
    }
    if (hasComponent(sim.world, e, Bounty)) markBounty(sim, eid)
    telegraphTraits[e] = undefined
    telegraphEntry[e] = undefined
    removeEntity(sim.world, e)
  }
  const f = sim.fight
  for (const st of f.streams) runStream(sim, st, sim.wdtMs)
  for (const w of f.waves) runWaves(sim, w)
  if (f.knobs) runKnobs(sim, f.knobs, sim.wdtMs)
}
