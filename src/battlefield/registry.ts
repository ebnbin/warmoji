import battlefieldJson from '../assets/battlefield.json'
import type { MapId } from '../maps/registry'

// 战场拾取（第三支柱：绑定地图，短时·战术·走位）：金币→队员(永久)，
// 经验→团队(永久)，战场拾取→战场(短时/位置/可趋可避)。每张地图有固定池，
// 主题呼应本图世界规则。携带者敌人带极性光环（绿=增益/红=减益），死亡掉在地面，
// 队伍走位拾取（不磁吸）；增益去趋、减益去避。拾取即施加一层与 teamFx 并行相乘的
// 限时战斗层（battleFx），几秒后自动失效。数量按波次预算固定（非概率）。

export type Polarity = 'buff' | 'debuff'

/** 限时战斗层：与 teamFx 并行相乘的短时增/减益（拾取施加，逐个到期）。 */
export interface BattleEffects {
  /** 队伍移速倍率（乘） */
  moveSpeedMul: number
  /** 全队伤害倍率（乘） */
  teamDamageMul: number
  /** 全队冷却倍率（乘，<1 攻速更快） */
  teamCooldownMul: number
  /** 全队暴击率加成（加，与角色/团队暴击相加后封顶 0.5） */
  critAdd: number
  /** 全体敌人移速倍率（乘，<1 更慢；>1 敌人狂化更快） */
  enemySlowMul: number
}

export const BATTLE_FX_IDENTITY: BattleEffects = {
  moveSpeedMul: 1,
  teamDamageMul: 1,
  teamCooldownMul: 1,
  critAdd: 0,
  enemySlowMul: 1,
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

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

export interface FieldPickupDef {
  readonly id: string
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly polarity: Polarity
  /** 拾取后效果的持续时长（毫秒）——短时，制造趋避的节奏 */
  readonly durationMs: number
  readonly fx: Partial<BattleEffects>
}

// 战场拾取的「设计数据」形状：各图拾取池（内容）+ 拾取管线旋钮（手感）。
// 数据行在 defs/battlefield.ts（创作层），gen 校验产出 battlefield.json；本文件只留逻辑。
export interface BattlefieldTuning {
  /** 每图各自的拾取池（主题呼应本图世界规则），每图至少 1 增益 + 1 减益 */
  readonly pools: Record<MapId, readonly FieldPickupDef[]>
  /** 拾取管线旋钮（格值，进战斗乘 UNIT） */
  readonly field: {
    /** 拾取半径：队伍中心进入即收（不磁吸，需主动走位） */
    readonly grabRadiusU: number
    /** 地面停留时长：无人拾取则淡出 */
    readonly groundMs: number
    /** 携带者光环半径 */
    readonly auraRadiusU: number
  }
  /** 本波携带者预算（固定数量，非概率）：随波次上探，Boss 波偏减益施压 */
  readonly carrierBudget: {
    /** Boss 波预算 */
    readonly boss: { readonly buff: number; readonly debuff: number }
    /** 常规波按波次分档：命中首个 wave ≤ upToWave 的档 */
    readonly waveTiers: readonly {
      readonly upToWave: number
      readonly buff: number
      readonly debuff: number
    }[]
    /** 超出所有档的兜底预算 */
    readonly fallback: { readonly buff: number; readonly debuff: number }
  }
}

const BF = battlefieldJson as unknown as BattlefieldTuning

// 四图各自的拾取池（主题呼应本图世界规则），每图至少 1 增益 + 1 减益。
const POOLS: Record<MapId, readonly FieldPickupDef[]> = BF.pools

/** 全部拾取按 id 索引（携带者掉落/注入器按 id 反查） */
export const FIELD_PICKUPS: Record<string, FieldPickupDef> = Object.fromEntries(
  Object.values(POOLS)
    .flat()
    .map((d) => [d.id, d]),
)

export const FIELD_PICKUP_IDS = Object.keys(FIELD_PICKUPS)

/** 本图拾取池 */
export function fieldPickupsFor(mapId: MapId): readonly FieldPickupDef[] {
  return POOLS[mapId]
}

/** 本波携带者预算（固定数量，非概率）：随波次上探，Boss 波偏减益施压。分档表见 battlefield 数据 */
export function waveCarrierBudget(wave: number, isBoss: boolean): { buff: number; debuff: number } {
  const cb = BF.carrierBudget
  if (isBoss) return { buff: cb.boss.buff, debuff: cb.boss.debuff }
  for (const t of cb.waveTiers) if (wave <= t.upToWave) return { buff: t.buff, debuff: t.debuff }
  return { buff: cb.fallback.buff, debuff: cb.fallback.debuff }
}

function pickPolarity(
  pool: readonly FieldPickupDef[],
  polarity: Polarity,
  rand: () => number,
): FieldPickupDef | undefined {
  const sub = pool.filter((d) => d.polarity === polarity)
  if (sub.length === 0) return undefined
  return sub[Math.floor(rand() * sub.length) % sub.length]
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

// 拾取管线旋钮（格值，进战斗乘 UNIT）
export const FIELD = BF.field

export const POLARITY_COLOR: Record<Polarity, number> = {
  buff: 0x66bb6a,
  debuff: 0xef5350,
}

/** 已激活的限时效果（拾取后短时生效） */
export interface BattleMod {
  id: string
  emoji: string
  polarity: Polarity
  until: number
  totalMs: number
  fx: Partial<BattleEffects>
}
