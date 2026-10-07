import { POOLS } from '../../data/battlefield'
import type { BattleEffects, FieldPickupDef, Polarity } from '../../types/battlefield'
import type { MapId } from '../../types/maps'

function pickPolarity(
  pool: readonly FieldPickupDef[],
  polarity: Polarity,
  rand: () => number,
): FieldPickupDef | undefined {
  const sub = pool.filter((d) => d.polarity === polarity)
  if (sub.length === 0) return undefined
  return sub[Math.floor(rand() * sub.length) % sub.length]
}

/** 一只敌人身上带的效果：从这张地图的效果池里抽一个这种极性的 */
export function rollCarry(mapId: MapId, polarity: Polarity, rand: () => number): FieldPickupDef | undefined {
  return pickPolarity(POOLS[mapId], polarity, rand)
}

/** 同时生效的战场效果：各自的修正按阵营收拢，交给属性表去叠 */
export function foldBattleEffects(parts: readonly FieldPickupDef['fx'][]): BattleEffects {
  return { team: parts.flatMap((p) => (p.team ? [p.team] : [])), enemy: parts.flatMap((p) => (p.enemy ? [p.enemy] : [])) }
}
