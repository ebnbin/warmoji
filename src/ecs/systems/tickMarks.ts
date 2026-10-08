import { hasComponent, query } from 'bitecs'
import { Alive, Hp, MARK, MARK_SLOTS, Mark, Transform } from '../components'
import { MORPH } from '../../data/abilities'
import { restoreMorph } from '../entities/enemy'
import { WORLD_SOURCE } from '../utils/source'
import { postponeAbilities } from './shared/ability'
import { hit } from './shared/damage'
import { applyAbilityEffects, FUSE_DEF, markSource, STORE_DEF } from './shared/effects'
import { strongestSlot } from '../utils/marks'
import { die } from './shared/combat'
import type { Sim } from '../sim'

/** 到期反应：变形要把外观、锚定还回去并让它缓一下，定身要把身体摆正；引信在身上引爆，存伤以存下的伤害为基础结算 */
function expire(sim: Sim, eid: number, kind: number, s: number): void {
  if (kind === MARK.fuse || kind === MARK.store) {
    const src = markSource(eid, s)
    const at = { x: Transform.x[eid]!, y: Transform.y[eid]!, targets: [eid] }
    if (kind === MARK.fuse) {
      const def = FUSE_DEF.get(Mark.b[s]!)
      if (def && src) applyAbilityEffects(sim, src, def.then, { ...at, baseDamage: Mark.a[s]! })
    } else {
      const def = STORE_DEF.get(Mark.b[s]!)
      if (def && src) applyAbilityEffects(sim, src, def.then, { ...at, baseDamage: Mark.a[s]! * def.ratio })
    }
    return
  }
  if (kind === MARK.morph) {
    restoreMorph(sim, sim.frames, eid, Mark.a[s] === 1)
    sim.out.bursts.push({ x: Transform.x[eid]!, y: Transform.y[eid]!, count: 6, kind: 'puff' })
    postponeAbilities(sim, eid, MORPH.recoverMs)
  } else if (kind === MARK.stun) {
    Transform.rot[eid] = 0
  }
}

/** 标记的时钟：中毒只有最强的一条按节拍跳伤，落后一拍以上的从现在重新数；亡后残留的按秒流失、流失殆尽即死；到期的清掉并执行到期反应 */
export function tickMarks(sim: Sim): void {
  const now = sim.elapsedMs
  const dt = sim.wdtMs / 1000
  for (const eid of [...query(sim.world, [Mark])]) {
    if (!hasComponent(sim.world, eid, Mark)) continue
    const base = eid * MARK_SLOTS
    const poison = strongestSlot(sim, eid, MARK.poison)
    for (let i = 0; i < MARK_SLOTS; i++) {
      const s = base + i
      const kind = Mark.kind[s]!
      if (kind === MARK.none) continue
      const until = Mark.until[s]!
      if (s === poison && now >= Mark.c[s]! && Mark.c[s]! <= until) {
        const next = Mark.c[s]! + Mark.b[s]!
        Mark.c[s] = next <= now ? now + Mark.b[s]! : next
        hit(sim, markSource(eid, s) ?? WORLD_SOURCE, eid, Mark.a[s]!, { tick: true })
        if (!hasComponent(sim.world, eid, Mark)) break
      }
      if (kind === MARK.undead && Alive.v[eid]) {
        Hp.v[eid] = Hp.v[eid]! - Mark.a[s]! * dt
        if (Hp.v[eid]! <= 0 || now >= until) {
          Mark.kind[s] = MARK.none
          die(sim, eid, WORLD_SOURCE, 0, 0)
          if (!hasComponent(sim.world, eid, Mark)) break
          continue
        }
      }
      if (now >= until) {
        Mark.kind[s] = MARK.none
        expire(sim, eid, kind, s)
        if (!hasComponent(sim.world, eid, Mark)) break
      }
    }
  }
}
