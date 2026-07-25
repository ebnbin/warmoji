// 浮冰地图（kind='ice'）的纯逻辑与常数（禁 phaser/DOM）。
// 核心 = 全局打滑：每个实体的速度以时间常数 tau 缓慢趋近"它想要的速度"，
// tau 越大越滑、越刹不住（起步慢、松手滑行久）。这一条数学同时作用于玩家与敌人，
// 也让击退更突出——被击退的速度在低摩擦下衰减得慢，滑得更远。
// 冰面 tau 大（滑）；出了浮冰就是水，水中 tau 小但限速 → 迟滞、游得慢、难游回。
// "在冰上还是在水里"是纯几何判定（方形浮冰 [0,floe]²）。

// 设计参数（floeU / 各 tau / 水域伤害等）已上移到 MapDef.ice（数据）。

/** 是否在方形浮冰上（世界像素坐标，floePx = floeU × UNIT）。出界即落水 */
export function onFloe(x: number, y: number, floePx: number): boolean {
  return x >= 0 && x <= floePx && y >= 0 && y <= floePx
}

/** 一阶低通（帧率无关）：当前速度按时间常数 tau 趋近目标速度。
 * tau 越大越"滑"——改变越慢：起步慢、松手滑行久。这就是"打滑程度"的数学。 */
export function approach(current: number, target: number, dt: number, tau: number): number {
  if (tau <= 0) return target
  return current + (target - current) * (1 - Math.exp(-dt / tau))
}
