import battlefieldJson from '../assets/battlefield.json'
import type { MapId } from '../types/maps'
import type { BattleEffects, BattlefieldTuning, FieldPickupDef, Polarity } from '../types/battlefield'

// 战场拾取（第三支柱：绑定地图，短时·战术·走位）：金币→队员(永久)，
// 经验→团队(永久)，战场拾取→战场(短时/位置/可趋可避)。每张地图有固定池，
// 主题呼应本图世界规则。携带者敌人带极性光环（绿=增益/红=减益），死亡掉在地面，
// 队伍走位拾取（不磁吸）；增益去趋、减益去避。拾取即施加一层与 teamFx 并行相乘的
// 限时战斗层（battleFx），几秒后自动失效。数量按波次预算固定（非概率）。

export const BATTLE_FX_IDENTITY: BattleEffects = {
  moveSpeedMul: 1,
  teamDamageMul: 1,
  teamCooldownMul: 1,
  critAdd: 0,
  enemySlowMul: 1,
}

const BF = battlefieldJson as unknown as BattlefieldTuning

// 四图各自的拾取池（主题呼应本图世界规则），每图至少 1 增益 + 1 减益。
export const POOLS: Record<MapId, readonly FieldPickupDef[]> = BF.pools

/** 全部拾取按 id 索引（携带者掉落/注入器按 id 反查） */
export const FIELD_PICKUPS: Record<string, FieldPickupDef> = Object.fromEntries(
  Object.values(POOLS)
    .flat()
    .map((d) => [d.id, d]),
)

// 拾取管线旋钮（格值，进战斗乘 UNIT）
export const FIELD = BF.field
export const CARRIER_BUDGET = BF.carrierBudget

export const POLARITY_COLOR: Record<Polarity, number> = {
  buff: 0x66bb6a,
  debuff: 0xef5350,
}
