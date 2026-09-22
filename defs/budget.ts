// 描述式带宽：只用于 gen 与 balance 的越界告警，DPS 口径见 scripts/dps.ts

export const COMBAT_KINDS = [
  'projectile', 'thrust', 'sweep', 'areaBlast', 'boomerang',
  'laser', 'chainArc', 'assassinate', 'summon', 'turret',
] as const

export type CombatKind = (typeof COMBAT_KINDS)[number]

export interface Budget {
  readonly role: string
  /** 生效 DPS 带宽 [下限, 上限]，含各升级档 */
  readonly dps: readonly [number, number]
}

export const BUDGET: Record<CombatKind, Budget> = {
  projectile: { role: '单体远程·直伤主力到功能弹', dps: [8, 60] },
  thrust: { role: '单体近战·贴身高击退', dps: [20, 40] },
  sweep: { role: '近战范围·一次扫多', dps: [16, 34] },
  areaBlast: { role: '远程范围·爆心 AoE', dps: [11, 24] },
  laser: { role: '贯穿直线·穿一线', dps: [10, 24] },
  boomerang: { role: '往返范围·去回两判', dps: [11, 24] },
  chainArc: { role: '连锁范围·敌越密越强（满命中口径）', dps: [30, 70] },
  assassinate: { role: '爆发点杀·低持续高单击', dps: [16, 34] },
  summon: { role: '持续并发·多单位累计', dps: [28, 60] },
  turret: { role: '驻守并发·多塔累计', dps: [30, 72] },
}
