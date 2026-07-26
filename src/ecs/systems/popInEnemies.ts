import { query } from 'bitecs'
import { Boss, ENEMY_SET, Pop, Tint, Transform } from '../components'
import { backEaseOut } from '../utils/ease'
import type { Sim } from '../sim'

/** 入场弹入:缩放/透明插值到位后清零(Boss 走 Back.easeOut 过冲,普通怪线性)。
 * 休眠者也照常弹入——出生即被冻结的怪不该卡在 0.3 倍大小 */
export function popInEnemies(sim: Sim): void {
  const now = sim.elapsedMs
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
    if (Pop.until[eid] === 0) continue
    const left = Pop.until[eid]! - now
    if (left <= 0) {
      Pop.until[eid] = 0
      Transform.w[eid] = Pop.size[eid]!
      Transform.h[eid] = Pop.size[eid]!
      Tint.alpha[eid] = Pop.alpha[eid]!
      continue
    }
    const raw = 1 - left / Pop.ms[eid]!
    const t = Pop.back[eid] ? backEaseOut(raw) : raw
    const from = Boss.v[eid] ? 0.2 : 0.3
    const k = Pop.size[eid]! * (from + (1 - from) * t)
    Transform.w[eid] = k
    Transform.h[eid] = k
    Tint.alpha[eid] = from + (Pop.alpha[eid]! - from) * t // 与 scale 共用缓动(Boss 的 Back 会过冲)
  }
}
