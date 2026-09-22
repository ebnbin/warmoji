import { ANIM_DEF } from '../../../emoji/anim'
import type { OutlineKind } from '../../../emoji/svg'
import { Anim } from '../../components'
import { animId, animOutline } from '../../store'
import type { Sim } from '../../sim'
import type { FrameIndex } from '../../frames'

export function armIdle(eid: number, id: string, outline: OutlineKind, still: number, offsetMs: number): void {
  animId[eid] = id
  animOutline[eid] = outline
  Anim.base[eid] = -1
  Anim.frames[eid] = 0
  Anim.durMs[eid] = ANIM_DEF.durMs
  Anim.offset[eid] = offsetMs
  Anim.onceBase[eid] = -1
  Anim.onceFrames[eid] = 0
  Anim.onceDur[eid] = 0
  Anim.onceAt[eid] = 0
  Anim.still[eid] = still
}

/** durMs = 本次行为的真实间隔 */
export function playClip(sim: Sim, atlas: FrameIndex, eid: number, clipId: string, durMs: number): void {
  const id = animId[eid]
  const outline = animOutline[eid]
  if (id === undefined || outline === undefined) return
  const c = atlas.clip(id, outline, clipId)
  if (c.frames === 0) return // 尚未烘好则不播
  Anim.onceBase[eid] = c.base
  Anim.onceFrames[eid] = c.frames
  Anim.onceDur[eid] = durMs
  Anim.onceAt[eid] = sim.elapsedMs
}

