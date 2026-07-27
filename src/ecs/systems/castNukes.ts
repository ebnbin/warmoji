import { hasComponent, query } from 'bitecs'
import { playSfx } from '../../audio/sfx'
import { Boss, Dormant, ENEMY_SET, Enemy, Nuke } from '../components'
import { damageMul, waveScale } from '../utils/amp'
import { damageTarget } from './shared/damage'
import { sourceOf } from '../utils/source'
import { castScan } from './shared/castScan'
import type { Sim } from '../sim'

/** 全域打击：全场活跃敌人各吃一次大额伤害 + 全屏白闪。伤害随当前波次威胁倍率缩放
 *（与敌人血量成长同源），Boss 按比例折减；休眠者不在活跃集内，天然豁免 */
export function castNukes(sim: Sim): void {
  castScan(sim, Nuke, (e) => {
    const src = sourceOf(sim, e)
    sim.pendingCues.push({ kind: 'screenFlash', color: 0xffffff, alpha: 0.55, durationMs: 380 })
    playSfx('boom')
    const base = Nuke.damage[e]! * waveScale(sim, e) * damageMul(sim, e)
    const bossRatio = Nuke.bossRatio[e]!
    // 伤害会边遍历边击杀（query 返回的是活动数组），先复制快照
    for (const t of [...query(sim.world, ENEMY_SET as unknown as object[])]) {
      if (Dormant.v[t] || !hasComponent(sim.world, t, Enemy)) continue
      damageTarget(sim, src, t, Math.max(1, Math.round(base * (Boss.v[t] ? bossRatio : 1))))
    }
  })
}
