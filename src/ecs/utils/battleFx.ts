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

/** 带光圈的敌人各自带什么效果：先 buff 个增益，再 debuff 个减益，都从地图的效果池里抽 */
export function rollCarriers(mapId: MapId, buff: number, debuff: number, rand: () => number): FieldPickupDef[] {
  const pool = POOLS[mapId]
  const out: FieldPickupDef[] = []
  for (let i = 0; i < buff; i++) {
    const d = pickPolarity(pool, 'buff', rand)
    if (d) out.push(d)
  }
  for (let i = 0; i < debuff; i++) {
    const d = pickPolarity(pool, 'debuff', rand)
    if (d) out.push(d)
  }
  return out
}
