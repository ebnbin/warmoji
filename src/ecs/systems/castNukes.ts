import { query } from 'bitecs'
import type { NukeDef } from '../../types/abilityDefs'
import { playSfx } from '../../audio/sfx'
import { Boss, Dormant, ENEMY_SET } from '../components'
import { enemyDef } from '../store'
import { damageMul, damageTarget, waveScale } from '../ability/amp'
import { sourceOf } from '../ability/source'
import { castScan } from '../ability/castScan'
import { KindNuke } from '../ability/tags'
import type { Sim } from '../sim'

/** 全域打击：全场活跃敌人各吃一次大额伤害 + 全屏白闪。伤害随当前波次威胁倍率缩放
 *（与敌人血量成长同源），Boss 按比例折减；休眠者不在活跃集内，天然豁免 */
export function castNukes(sim: Sim): void {
  castScan<NukeDef>(sim, KindNuke, (e, def) => {
    const src = sourceOf(sim, e)
    sim.pendingCues.push({ kind: 'screenFlash', color: 0xffffff, alpha: 0.55, durationMs: 380 })
    playSfx('boom')
    const scale = waveScale(sim, e)
    const mul = damageMul(sim, e)
    // 伤害会边遍历边击杀（query 返回的是活动数组），先复制快照
    for (const t of [...query(sim.world, ENEMY_SET as unknown as object[])]) {
      if (Dormant.v[t] || enemyDef[t] === undefined) continue
      const damage = Math.max(1, Math.round(def.damage * scale * mul * (Boss.v[t] ? def.bossRatio : 1)))
      damageTarget(sim, src, t, damage)
    }
  })
}
