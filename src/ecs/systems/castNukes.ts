import { hasComponent, query } from 'bitecs'
import { playSfx } from '../../audio/sfx'
import { Boss, Dormant, ENEMY_SET, Enemy, Nuke } from '../components'
import { damageMul, waveScale } from '../utils/amp'
import { damageTarget } from './shared/damage'
import { sourceOf } from '../utils/source'
import { castScan } from './shared/castScan'
import type { Sim } from '../sim'

/** 休眠者不在活跃集内，天然豁免 */
export function castNukes(sim: Sim): void {
  castScan(sim, Nuke, (e) => {
    const src = sourceOf(sim, e)
    sim.out.flash = { color: 0xffffff, alpha: 0.55, durationMs: 380 }
    playSfx('boom')
    const base = Nuke.damage[e]! * waveScale(sim) * damageMul(sim, e)
    const bossRatio = Nuke.bossRatio[e]!
    // 边遍历边击杀，须先复制快照
    for (const t of [...query(sim.world, ENEMY_SET as unknown as object[])]) {
      if (Dormant.v[t] || !hasComponent(sim.world, t, Enemy)) continue
      damageTarget(sim, src, t, Math.max(1, Math.round(base * (Boss.v[t] ? bossRatio : 1))))
    }
  })
}
