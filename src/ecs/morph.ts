import { Anim, Boss, Elite, EState, Morph, Sprite, Tint, Transform } from './components'
import { armIdle } from './anim'
import { enemyDef } from './store'
import type { Sim } from './sim'
import type { EcsAtlas } from './render/atlas'

// 魔尘变形(仙子 morph):把敌人变成无害绵羊替身——缴械/无伤/缓速游荡,顶绵羊形象,
// 到期复原。Boss 免疫;同一敌人有冷却(变形期 + 复形后 MORPH_RECAST_CD)。镜像 applyHex/restoreMorph。
// 变形期的移动(半速游荡)在 steerEnemies、受伤倍率/无害在 combat、缴械/复形在 enemyWire。

/** 变形+复形冷却(镜像 BaseArenaScene.MORPH_RECAST_CD) */
export const MORPH_RECAST_CD = 5000

/** 施加变形(镜像 applyHex):Boss/冷却中拒绝;换绵羊帧、打断蓄力、清旋转 */
export function applyMorph(
  sim: Sim,
  atlas: EcsAtlas,
  eid: number,
  spec: { durationMs: number; morphEmoji: string; vulnMul?: number },
): void {
  if (Boss.v[eid]) return
  if (sim.elapsedMs < Morph.cdUntil[eid]!) return
  const wasMorphed = Morph.until[eid] !== 0
  const until = sim.elapsedMs + spec.durationMs
  Morph.cdUntil[eid] = until + MORPH_RECAST_CD
  Morph.until[eid] = until
  Morph.vuln[eid] = spec.vulnMul ?? 1
  if (!wasMorphed) {
    const outline = Elite.v[eid] ? 'elite' : 'enemy'
    Sprite.frame[eid] = atlas.index(spec.morphEmoji, outline)
    // 动画整套换成替身的 idle 帧(未烘焙则停留静态替身形象)
    armIdle(eid, spec.morphEmoji, outline, Sprite.frame[eid]!, Anim.offset[eid]!)
    // 蓄力中被变形:打断状态机 + 清白闪染色 + 复位旋转
    if (EState.v[eid] === 2) {
      Tint.effect[eid] = 0
      Tint.color[eid] = 0xffffff
    }
    EState.v[eid] = 0
    Transform.rot[eid] = 0
    sim.pendingBursts.push({ x: Transform.x[eid]!, y: Transform.y[eid]!, count: 8, kind: 'puff' }) // 魔尘灰烟
  }
}

/** 复形(镜像 restoreMorph 的形象部分):换回本体帧;缴械后延由 enemyWire 掌管 */
export function restoreMorphVisual(atlas: EcsAtlas, eid: number): void {
  const def = enemyDef[eid]
  if (!def) return
  const outline = Elite.v[eid] ? 'elite' : 'enemy'
  Sprite.frame[eid] = atlas.index(def.emoji, outline)
  armIdle(eid, def.emoji, outline, Sprite.frame[eid]!, Anim.offset[eid]!)
  Morph.until[eid] = 0
}
