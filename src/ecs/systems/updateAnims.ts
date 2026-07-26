import { query } from 'bitecs'
import { clipFrameIndex } from '../../emoji/anim'
import { Anim, ANIM_SET, Sprite } from '../components'
import { animId, animOutline } from '../store'
import type { Sim } from '../sim'

// 部件动画的逐帧推进：把游戏时钟翻算成帧下标写进 Sprite.frame。
// 帧是惰性烘焙的：未就绪时 atlas 返回 frames=0，此处保持静态帧，
// 烘好后下一帧自然接上（渐进增强，无加载闪烁）。登记在 ../anim.ts。

/** 逐帧:把时钟翻算成帧下标写进 Sprite.frame(一次性 clip 优先,播完回落 idle) */
export function updateAnims(sim: Sim): void {
  const atlas = sim.frames
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
