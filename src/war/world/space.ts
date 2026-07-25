// 太空图（kind='space'）的纯函数与常数：黑洞禁锢场 + 天体横扫的几何/数值。
// 与单位无关（传 px 或格皆可，只要一致）；场景侧乘 UNIT 后调用。

// 设计参数（黑洞禁锢场半径、天体横扫的间隔/尺寸/速度/伤害）已上移到 MapDef.space（数据）。

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
