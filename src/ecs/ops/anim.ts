import { ANIM_DEF } from '../../emoji/anim'
import type { OutlineKind } from '../../emoji/svg'
import { Anim } from '../components'
import { animId, animOutline } from '../store'
import type { Sim } from '../sim'
import type { FrameIndex } from '../frames'

// 部件动画(镜像 Animator):常驻 idle 循环 + 一次性覆盖 clip,把游戏时钟翻算成帧下标,
// 写进 Sprite.frame 即换帧。帧是惰性烘焙的:未就绪时 atlas 返回 frames=0,
// 此处保持静态帧,烘好后下一帧自然接上(渐进增强,无加载闪烁)。

/** 给实体登记常驻 idle:记下 emoji/描边(帧惰性解析)+ 相位偏移(同屏大量实体错开呼吸) */
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

/** 播一次性 clip 覆盖 idle:durMs = 本次行为的真实间隔(攻速直接驱动动画速度) */
export function playClip(sim: Sim, atlas: FrameIndex, eid: number, clipId: string, durMs: number): void {
  const id = animId[eid]
  const outline = animOutline[eid]
  if (id === undefined || outline === undefined) return
  const c = atlas.clip(id, outline, clipId)
  if (c.frames === 0) return // 尚未烘好:本次不播(与旧 Animator 的静默一致)
  Anim.onceBase[eid] = c.base
  Anim.onceFrames[eid] = c.frames
  Anim.onceDur[eid] = durMs
  Anim.onceAt[eid] = sim.elapsedMs
}

