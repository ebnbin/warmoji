import { CARRIER_BUDGET, POOLS } from '../../data/battlefield'
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

/** 同时生效的战场效果：各自的修正按阵营收拢，交给属性表去叠 */
export function foldBattleEffects(parts: readonly FieldPickupDef['fx'][]): BattleEffects {
  return { team: parts.flatMap((p) => (p.team ? [p.team] : [])), enemy: parts.flatMap((p) => (p.enemy ? [p.enemy] : [])) }
}

function waveCarrierBudget(wave: number, isBoss: boolean): { buff: number; debuff: number } {
  const cb = CARRIER_BUDGET
  if (isBoss) return { buff: cb.boss.buff, debuff: cb.boss.debuff }
  for (const t of cb.waveTiers) if (wave <= t.upToWave) return { buff: t.buff, debuff: t.debuff }
  return { buff: cb.fallback.buff, debuff: cb.fallback.debuff }
}
export function rollWaveCarriers(
  mapId: MapId,
  wave: number,
  isBoss: boolean,
  rand: () => number,
): FieldPickupDef[] {
  const budget = waveCarrierBudget(wave, isBoss)
  const pool = POOLS[mapId]
  const out: FieldPickupDef[] = []
  for (let i = 0; i < budget.buff; i++) {
    const d = pickPolarity(pool, 'buff', rand)
    if (d) out.push(d)
  }
  for (let i = 0; i < budget.debuff; i++) {
    const d = pickPolarity(pool, 'debuff', rand)
    if (d) out.push(d)
  }
  return out
}
