// 昼夜世界规则（kind='daynight'）的纯函数与常数：跨波次主时钟 → 时刻 → 视野/迷雾。
// 主时钟 = 累计战斗秒（BaseArenaScene 的 combatMs + elapsed，跨波持久、非战斗不走）。
// 周期 48 秒 = 一整天 24 小时；视野随时刻余弦涨落，夜里额外收一层以队伍为心的迷雾圈。

export const DAYNIGHT = {
  /** 一整天 = 48 秒（白天→黑夜→白天 一个完整周期） */
  cycleSec: 48,
  /** wave 1 从黎明 06:00 起（标准视野、白昼入场） */
  startHour: 6,
  /** 正午视野（格）——相机拉最远，纵览全场 */
  visionMax: 30,
  /** 黄昏/黎明视野（格）——标准视野，1280px = 20 格 的基准 */
  visionMid: 20,
  /** 午夜视野（格）——相机拉最近，视野收窄 */
  visionMin: 10,
  /** 迷雾圈半径（格）：黄昏/黎明够大到基本不挡 */
  fogRadiusDusk: 11,
  /** 迷雾圈半径（格）：午夜收成一小圈，视野四周吞进黑暗 */
  fogRadiusMidnight: 3.5,
  /** 午夜迷雾最浓时的不透明度 */
  fogAlphaMax: 0.9,
  /** 出怪密度：白天间隔倍率（<1 更密） */
  daySpawnScale: 0.68,
  /** 出怪密度：夜晚间隔倍率（>1 更疏；但视野小、迷雾遮，照样不轻松） */
  nightSpawnScale: 1.55,
} as const

/** 累计战斗秒 → 游戏时刻（0..24），跨波持久、按周期回卷 */
export function hourAt(combatSec: number): number {
  const h = DAYNIGHT.startHour + combatSec * (24 / DAYNIGHT.cycleSec)
  return ((h % 24) + 24) % 24
}

/** 时刻 → 视野格数：正午 30、黄昏/黎明 20、午夜 10，余弦平滑（连续变大→变小→变大） */
export function visionGridsAt(hour: number): number {
  return DAYNIGHT.visionMid + (DAYNIGHT.visionMax - DAYNIGHT.visionMid) * Math.cos(((hour - 12) * Math.PI) / 12)
}

/** 夜深程度 0..1：白天恒 0，黄昏/黎明 0，午夜 1（迷雾半径/浓度都挂它） */
export function nightDepthAt(hour: number): number {
  const fromMidnight = Math.min(hour, 24 - hour) // 距午夜的小时数 0..12
  return Math.max(0, 1 - fromMidnight / 6)
}

/** 是否白天（06:00–18:00）：昼夜两批怪、出怪密度据此切换 */
export function isDayAt(hour: number): boolean {
  return hour >= 6 && hour < 18
}

/** 夜雾圈半径（格）：白天等于 dusk 极大值（视觉上不挡），夜里按夜深收到午夜值 */
export function fogRadiusAt(hour: number): number {
  const d = nightDepthAt(hour)
  return DAYNIGHT.fogRadiusDusk + (DAYNIGHT.fogRadiusMidnight - DAYNIGHT.fogRadiusDusk) * d
}

/** 夜雾不透明度：白天 0，夜里按夜深淡入到 fogAlphaMax */
export function fogAlphaAt(hour: number): number {
  return DAYNIGHT.fogAlphaMax * nightDepthAt(hour)
}
