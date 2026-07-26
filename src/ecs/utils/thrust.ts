import { sineEaseOut } from './ease'
import { Swing, Thrust } from '../components'
import type { Sim } from '../sim'

/** 攻击索敌上限：只打得到射程内的敌人才挥 */
export function reachOf(e: number): number {
  return Thrust.reach[e]! + Thrust.hitRadius[e]!
}

/** 挥击进度 0→1→0：去回各半程，两程都走 Sine.easeOut（镜像 yoyo 缓动） */
export function lungeT(sim: Sim, e: number, thrustMs: number): number {
  const half = thrustMs / 2
  if (Swing.durMs[e] === 0 || half <= 0) return 0
  const p = (sim.fxMs - Swing.startMs[e]!) / half
  if (p >= 2) return 0
  return sineEaseOut(p <= 1 ? p : 2 - p)
}
