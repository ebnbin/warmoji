// 浮冰地图（kind='ice'）的纯逻辑与常数（禁 phaser/DOM）。
// 核心 = 全局打滑：每个实体的速度以时间常数 tau 缓慢趋近"它想要的速度"，
// tau 越大越滑、越刹不住（起步慢、松手滑行久）。这一条数学同时作用于玩家与敌人，
// 也让击退更突出——被击退的速度在低摩擦下衰减得慢，滑得更远。
// 冰面 tau 大（滑）；出了浮冰就是水，水中 tau 小但限速 → 迟滞、游得慢、难游回。
// "在冰上还是在水里"是纯几何判定（方形浮冰 [0,floe]²）。

export const ICE = {
  /** 方形浮冰边长（格）：战斗区 = [0,floeU]²，其外皆是水 */
  floeU: 25,
  /** 冰上速度响应时间常数（秒）——打滑程度主参数，越大越滑、越不跟手 */
  teamTauIce: 0.55,
  /** 水中速度响应时间常数（秒）：小=跟手不滑，但配合限速 → 游得慢、有阻力 */
  teamTauWater: 0.12,
  /** 敌人冰上速度响应时间常数（秒）：同款打滑，略小于玩家（否则敌人乱飘追不到人） */
  enemyTauIce: 0.5,
  /** 水中速度倍率（玩家/敌人同用）：落水移动被拖慢、难游回 */
  waterSpeedMul: 0.45,
  /** 玩家落水每秒掉血 */
  waterTeamDps: 16,
  /** 敌人落水每秒掉血（更狠：把敌人击退下水淹死是这张图的签名打法） */
  waterEnemyDps: 32,
  /** 落水掉血结算间隔（ms） */
  waterTickMs: 250,
} as const

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
