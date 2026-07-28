import { BATTLE_FX_IDENTITY, CARRIER_BUDGET, POOLS } from '../../data/battlefield'
import type { BattleEffects, FieldPickupDef, Polarity } from '../../types/battlefield'
import type { MapId } from '../../types/maps'

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

function pickPolarity(
  pool: readonly FieldPickupDef[],
  polarity: Polarity,
  rand: () => number,
): FieldPickupDef | undefined {
  const sub = pool.filter((d) => d.polarity === polarity)
  if (sub.length === 0) return undefined
  return sub[Math.floor(rand() * sub.length) % sub.length]
}

// 限时战斗层的规则：多来源效果折叠、按波次分配携带者预算与抽取。
// ECS 侧的一份；旧框架侧另有等价实现（arcade/field.ts 尾段），两份有意重复。

/** 叠加多个限时片段：乘区相乘、crit 相加，最终封顶/保底防叠飞。 */
export function foldBattleEffects(parts: readonly Partial<BattleEffects>[]): BattleEffects {
  const fx = { ...BATTLE_FX_IDENTITY }
  for (const p of parts) {
    if (p.moveSpeedMul !== undefined) fx.moveSpeedMul *= p.moveSpeedMul
    if (p.teamDamageMul !== undefined) fx.teamDamageMul *= p.teamDamageMul
    if (p.teamCooldownMul !== undefined) fx.teamCooldownMul *= p.teamCooldownMul
    if (p.critAdd !== undefined) fx.critAdd += p.critAdd
    if (p.enemySlowMul !== undefined) fx.enemySlowMul *= p.enemySlowMul
  }
  fx.moveSpeedMul = clamp(fx.moveSpeedMul, 0.35, 2.2)
  fx.teamDamageMul = clamp(fx.teamDamageMul, 0.35, 2.5)
  fx.teamCooldownMul = clamp(fx.teamCooldownMul, 0.4, 2.2)
  fx.critAdd = clamp(fx.critAdd, 0, 0.5)
  fx.enemySlowMul = clamp(fx.enemySlowMul, 0.4, 2.2)
  return fx
}
/** 本波携带者预算（固定数量，非概率）：随波次上探，Boss 波偏减益施压。分档表见 battlefield 数据 */
export function waveCarrierBudget(wave: number, isBoss: boolean): { buff: number; debuff: number } {
  const cb = CARRIER_BUDGET
  if (isBoss) return { buff: cb.boss.buff, debuff: cb.boss.debuff }
  for (const t of cb.waveTiers) if (wave <= t.upToWave) return { buff: t.buff, debuff: t.debuff }
  return { buff: cb.fallback.buff, debuff: cb.fallback.debuff }
}
/** 本波所有携带者背的拾取（buff/debuff 数由预算表定，从本图池随机抽，可重复） */
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
