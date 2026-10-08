import { query } from 'bitecs'
import { clipFrameIndex } from '../../emoji/anim'
import { Anim, ANIM_SET, Sprite } from '../components'
import { animId, animOutline } from '../store'
import type { Sim } from '../sim'

export function updateAnims(sim: Sim): void {
  const atlas = sim.frames
  const now = sim.elapsedMs
  for (const eid of query(sim.world, ANIM_SET)) {
    if (Anim.frames[eid]! < 0) continue
    const id = animId[eid]
    const outline = animOutline[eid]
    if (id === undefined || outline === undefined) continue
    if (Anim.onceFrames[eid]! > 0) {
      const t = now - Anim.onceAt[eid]!
      if (t < Anim.onceDur[eid]!) {
        Sprite.frame[eid] = Anim.onceBase[eid]! + clipFrameIndex(t, Anim.onceDur[eid]!, Anim.onceFrames[eid]!, true)
        continue
      }
      Anim.onceFrames[eid] = 0
    }
    if (Anim.frames[eid]! === 0) {
      const c = atlas.clip(id, outline, 'idle')
      if (c.frames === 0) {
        Sprite.frame[eid] = Anim.still[eid]!
        continue
      }
      Anim.base[eid] = c.base
      Anim.frames[eid] = c.frames
    }
    Sprite.frame[eid] =
      Anim.base[eid]! + clipFrameIndex(now + Anim.offset[eid]!, Anim.durMs[eid]!, Anim.frames[eid]!, false)
  }
}
