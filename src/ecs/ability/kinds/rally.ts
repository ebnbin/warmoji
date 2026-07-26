import type { RallyDef } from '../../../types/abilityDefs'
import { Alive, Iframe, MFlash, MHp, Tint } from '../../components'
import { reviveMember } from '../../combat'
import { ownerX, ownerY } from '../amp'
import { castScan } from '../systems/cast'
import { KindRally } from '../tags'
import type { Sim } from '../../sim'

/** 集结：阵亡者满血复活、存活者按上限比例回复、全队短暂无敌。
 * 无敌走受击无敌帧通道（把「上次受击」推到未来），接触与敌弹一并挡下 */
export function castRallies(sim: Sim): void {
  castScan<RallyDef>(sim, KindRally, (e, def) => {
    for (const m of sim.members) {
      if (!Alive.v[m]) reviveMember(sim, m)
      else MHp.hp[m] = Math.min(MHp.max[m]!, MHp.hp[m]! + MHp.max[m]! * def.healRatio)
      Iframe.last[m] = sim.elapsedMs + def.invulnMs - Iframe.ms[m]!
      // 到手反馈：全队闪一下圣光金（走受击闪光同一通道，到期由 memberVisual 复原）
      MFlash.until[m] = sim.elapsedMs + 320
      Tint.color[m] = 0xffe082
      Tint.effect[m] = 0
    }
    sim.pendingCues.push({
      kind: 'circle',
      x: ownerX(e),
      y: ownerY(e),
      radius: def.ringRadius,
      o: {
        fill: def.color,
        fillAlpha: 0.3,
        stroke: def.color,
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
