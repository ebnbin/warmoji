import { hasComponent, query } from 'bitecs'
import { Dormant, MARK, MARK_SLOTS, Mark, Transform } from '../components'
import { restoreMorph } from '../entities/enemy'
import { poisonSrc } from '../store'
import { WORLD_SOURCE } from '../utils/source'
import { postponeAbilities } from './shared/ability'
import { hit } from './shared/damage'
import type { Sim } from '../sim'

/** 到期反应：只有变形要把外观、锚定还回去并让它缓一下，定身要把身体摆正 */
function expire(sim: Sim, eid: number, kind: number, s: number): void {
  if (kind === MARK.morph) {
    restoreMorph(sim, sim.frames, eid, Mark.a[s] === 1)
    sim.out.bursts.push({ x: Transform.x[eid]!, y: Transform.y[eid]!, count: 6, kind: 'puff' })
    postponeAbilities(sim, eid, 700)
  } else if (kind === MARK.stun) {
    Transform.rot[eid] = 0
  }
}

/** 标记的时钟：跳伤的按节拍扣血，到期的清掉并执行到期反应；休眠的身体不走 */
export function tickMarks(sim: Sim): void {
  const now = sim.elapsedMs
  for (const eid of query(sim.world, [Mark])) {
    if (Dormant.v[eid]) continue
    const base = eid * MARK_SLOTS
    for (let i = 0; i < MARK_SLOTS; i++) {
      const s = base + i
      const kind = Mark.kind[s]!
      if (kind === MARK.none) continue
      const until = Mark.until[s]!
      if (kind === MARK.dot && now >= Mark.c[s]! && Mark.c[s]! <= until) {
        Mark.c[s] = Mark.c[s]! + Mark.b[s]!
        hit(sim, poisonSrc[eid] ?? WORLD_SOURCE, eid, Mark.a[s]!, { tick: true })
        if (!hasComponent(sim.world, eid, Mark)) break
      }
      if (now >= until) {
        Mark.kind[s] = MARK.none
        expire(sim, eid, kind, s)
      }
    }
  }
}
