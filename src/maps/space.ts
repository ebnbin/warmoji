// 太空图（kind='space'）的纯函数与常数：黑洞禁锢场 + 天体横扫的几何/数值。
// 与单位无关（传 px 或格皆可，只要一致）；场景侧乘 UNIT 后调用。

export const BLACKHOLE = {
  /** 禁锢场半径（格）：整张地图即此圈，从第一波起常驻、圆心固定在地图中心。
   * 直径 25 ≈ 标准 25×25 方形图的内切圆。越靠边缘、向外的阻力越大，到边缘 100%——谁也逃不出去 */
  fieldRadiusU: 12.5,
} as const

export const METEOR = {
  /** 天体横扫平均间隔（ms） */
  intervalMs: 15000,
  /** 间隔随机抖动（±ms） */
  intervalJitterMs: 5000,
  /** 出现前的预警时长（ms）：画出轨迹与来袭方向，给玩家反应 */
  warnMs: 1500,
  /** 球体半径（格） */
  radiusU: 2.6,
  /** 划过速度（格/秒） */
  speedU: 14,
  /** 直线全长（格）：两端落在视野外，确保从一侧划到另一侧 */
  travelU: 30,
  /** 路径相对队伍中心的垂直随机偏移上限（格）：偏一点但仍大体经过队伍附近 */
  offsetU: 7,
  /** 压到（进入球体半径）的伤害——队员/敌人/Boss 一律照打 */
  damage: 30,
} as const

/** 黑洞禁锢：把「向外」的速度分量按到中心距离衰减（中心 0 阻力、边缘 100% 全挡），
 * 向内 / 切向分量不受影响。用于队伍位移增量与敌人速度，令场内实体谁也逃不出半径 R。
 * 返回处理后的 (x,y)。 */
export function confineVelocity(
  px: number,
  py: number,
  cx: number,
  cy: number,
  vx: number,
  vy: number,
  r: number,
): { x: number; y: number } {
  const rx = px - cx
  const ry = py - cy
  const d = Math.hypot(rx, ry)
  if (d < 1e-6 || r <= 0) return { x: vx, y: vy }
  const ux = rx / d
  const uy = ry / d
  const radial = vx * ux + vy * uy // 有符号径向速度（+ 为向外）
  if (radial <= 0) return { x: vx, y: vy } // 向内 / 切向：放行
  const keep = Math.max(0, 1 - d / r) // 向外保留比例：中心 1、边缘 0
  const delta = radial * (keep - 1) // ≤ 0，抵消掉的向外分量
  return { x: vx + ux * delta, y: vy + uy * delta }
}

/** 硬边界钳制：把点钳回以 (cx,cy) 为心、半径 r 的圆盘内。
 * 引力削速（confineVelocity）之外的兜底——防击退/冲刺把实体一帧怼出圈。圈内原样返回。 */
export function clampToDisc(px: number, py: number, cx: number, cy: number, r: number): { x: number; y: number } {
  const dx = px - cx
  const dy = py - cy
  const d = Math.hypot(dx, dy)
  if (d <= r || d < 1e-6) return { x: px, y: py }
  const k = r / d
  return { x: cx + dx * k, y: cy + dy * k }
}

/** 天体横扫的直线：以队伍中心为参照，按角度 + 垂直偏移取一条过其附近的线，
 * 两端各外延 halfLen（落在视野外）。返回起点/终点/单位方向。 */
export function meteorSweep(
  cx: number,
  cy: number,
  angle: number,
  offset: number,
  halfLen: number,
): { sx: number; sy: number; ex: number; ey: number; dx: number; dy: number } {
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  // 垂直于前进方向的偏移
  const ox = -dy * offset
  const oy = dx * offset
  return {
    sx: cx + ox - dx * halfLen,
    sy: cy + oy - dy * halfLen,
    ex: cx + ox + dx * halfLen,
    ey: cy + oy + dy * halfLen,
    dx,
    dy,
  }
}
