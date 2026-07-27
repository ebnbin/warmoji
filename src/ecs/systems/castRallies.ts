import { Alive, Iframe, CharFlash, CharHp, Rally, Tint } from '../components'
import { reviveCharacter } from './shared/combat'
import { ownerX, ownerY } from '../utils/amp'
import { castScan } from './shared/castScan'
import type { Sim } from '../sim'

/** 集结：阵亡者满血复活、存活者按上限比例回复、全队短暂无敌。
 * 无敌走受击无敌帧通道（把「上次受击」推到未来），接触与敌弹一并挡下 */
export function castRallies(sim: Sim): void {
  castScan(sim, Rally, (e) => {
    for (const m of sim.characters) {
      if (!Alive.v[m]) reviveCharacter(sim, m)
      else CharHp.hp[m] = Math.min(CharHp.max[m]!, CharHp.hp[m]! + CharHp.max[m]! * Rally.healRatio[e]!)
      Iframe.last[m] = sim.elapsedMs + Rally.invulnMs[e]! - Iframe.ms[m]!
      // 到手反馈：全队闪一下圣光金（走受击闪光同一通道，到期由 characterVisual 复原）
      CharFlash.until[m] = sim.elapsedMs + 320
      Tint.color[m] = 0xffe082
      Tint.effect[m] = 0
    }
    sim.pendingCues.push({
      kind: 'circle',
      x: ownerX(e),
      y: ownerY(e),
      radius: Rally.ringRadius[e]!,
      o: {
        fill: Rally.color[e]!,
        fillAlpha: 0.3,
        stroke: Rally.color[e]!,
        lineWidth: 4,
        lineAlpha: 0.9,
        fromScale: 0.4,
        toScale: 3,
        durationMs: 550,
        depth: 20,
      },
    })
  })
}
