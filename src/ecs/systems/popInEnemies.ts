import { query } from 'bitecs'
import { Boss, ENEMY_SET, Pop, Tint, Transform } from '../components'
import { backEaseOut } from '../utils/ease'
import type { Sim } from '../sim'

function finishPop(eid: number): void {
  Pop.until[eid] = 0
  Transform.w[eid] = Pop.size[eid]!
  Transform.h[eid] = Pop.size[eid]!
  Tint.alpha[eid] = Pop.alpha[eid]!
}

/** 过场冻结期：世界钟停了，入场弹入直接到位 */
export function finishEnemyPops(sim: Sim): void {
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
    if (Pop.until[eid] !== 0) finishPop(eid)
  }
}

/** 休眠者也照常弹入；按世界时，时停时随世界一起放慢 */
export function popInEnemies(sim: Sim): void {
  const now = sim.elapsedMs
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
    if (Pop.until[eid] === 0) continue
    const left = Pop.until[eid]! - now
    if (left <= 0) {
      finishPop(eid)
      continue
    }
    const raw = 1 - left / Pop.ms[eid]!
    const t = Pop.back[eid] ? backEaseOut(raw) : raw
    const from = Boss.v[eid] ? 0.2 : 0.3
    const k = Pop.size[eid]! * (from + (1 - from) * t)
    Transform.w[eid] = k
    Transform.h[eid] = k
    Tint.alpha[eid] = from + (Pop.alpha[eid]! - from) * t
  }
}
