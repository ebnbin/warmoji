// 数值预算（描述式·创作层设计数据，不进运行时 bundle）：给每种投送定「设计定位 +
// 生效 DPS 带宽」。带宽是对当前手调数值的显式描述——当前全部战斗能力（含各升级档）
// 都落在各自带宽内，一条不改。用途：给 scripts/dps.ts 算出的生效 DPS 做软护栏——
// gen 越界只告警、不阻断构建（见 gen-defs.ts）；balance.ts 同源标注越界行。
// DPS 口径见 scripts/dps.ts（并发/去回/满命中按各机器折算，暴击/道具/aim 前）。

export const COMBAT_KINDS = [
  'projectile', 'thrust', 'sweep', 'areaBlast', 'boomerang',
  'laser', 'chainArc', 'assassinate', 'summon', 'turret',
] as const

export type CombatKind = (typeof COMBAT_KINDS)[number]

export interface Budget {
  /** 设计定位：这条投送在阵容里扮演什么、带宽为何如此 */
  readonly role: string
  /** 生效 DPS 设计带宽 [下限, 上限]（含各升级档；越界即偏离设计） */
  readonly dps: readonly [number, number]
}

// 单体投送 DPS 可高（只打一个）；范围/连锁换取的是覆盖，单目标 DPS 折价；
// 爆发点杀持续 DPS 低但单击极高；并发（召唤/装置）按同时在场单位累计。
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
