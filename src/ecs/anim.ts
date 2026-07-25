import { query } from 'bitecs'
import { ANIM_DEF, clipFrameIndex } from '../emoji/studio'
import type { OutlineKind } from '../emoji/svg'
import { Anim, ANIM_SET, Sprite } from './components'
import { animId, animOutline } from './store'
import type { Sim } from './sim'
import type { FrameIndex } from './frames'

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

/** 逐帧:把时钟翻算成帧下标写进 Sprite.frame(一次性 clip 优先,播完回落 idle) */
export function updateAnims(sim: Sim, atlas: FrameIndex): void {
  const now = sim.elapsedMs
  for (const eid of query(sim.world, ANIM_SET as unknown as object[])) {
    if (Anim.frames[eid]! < 0) continue // 停帧哨兵(阵亡尸体):保持死亡那一帧,不再翻帧
    const id = animId[eid]
    const outline = animOutline[eid]
    if (id === undefined || outline === undefined) continue
    // 一次性 clip:播完回落
    if (Anim.onceFrames[eid]! > 0) {
      const t = now - Anim.onceAt[eid]!
      if (t < Anim.onceDur[eid]!) {
        Sprite.frame[eid] = Anim.onceBase[eid]! + clipFrameIndex(t, Anim.onceDur[eid]!, Anim.onceFrames[eid]!, true)
        continue
      }
      Anim.onceFrames[eid] = 0
    }
    // idle 帧惰性解析:未就绪保持静态帧,烘好后接上
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
