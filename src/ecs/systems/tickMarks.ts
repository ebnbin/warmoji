import { hasComponent, query } from 'bitecs'
import { Alive, Dormant, Hp, MARK, MARK_SLOTS, Mark, Transform } from '../components'
import { MORPH } from '../../data/abilities'
import { restoreMorph } from '../entities/enemy'
import { poisonSrc } from '../store'
import { WORLD_SOURCE } from '../utils/source'
import { postponeAbilities } from './shared/ability'
import { hit } from './shared/damage'
import { applyAbilityEffects, FUSE_DEF, markSource, STORE_DEF } from './shared/effects'
import { rescale } from './shared/scale'
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
  if (kind === MARK.grow) {
    rescale(sim, eid)
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

/** 标记的时钟：跳伤的按节拍扣血，回复的按秒回血，亡后残留的按秒流失、流失殆尽即死，到期的清掉并执行到期反应；休眠的身体不走 */
export function tickMarks(sim: Sim): void {
  const now = sim.elapsedMs
  const dt = sim.wdtMs / 1000
  for (const eid of [...query(sim.world, [Mark])]) {
    if (!hasComponent(sim.world, eid, Mark) || Dormant.v[eid]) continue
    const base = eid * MARK_SLOTS
    for (let i = 0; i < MARK_SLOTS; i++) {
      const s = base + i
      const kind = Mark.kind[s]!
      if (kind === MARK.none) continue
      const until = Mark.until[s]!
      if (kind === MARK.poison && now >= Mark.c[s]! && Mark.c[s]! <= until) {
        Mark.c[s] = Mark.c[s]! + Mark.b[s]!
        hit(sim, poisonSrc[eid] ?? WORLD_SOURCE, eid, Mark.a[s]!, { tick: true })
        if (!hasComponent(sim.world, eid, Mark)) break
      }
      if (kind === MARK.regen && Alive.v[eid] && Hp.v[eid]! < Hp.max[eid]!) {
        Hp.v[eid] = Math.min(Hp.max[eid]!, Hp.v[eid]! + Mark.a[s]! * dt)
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
