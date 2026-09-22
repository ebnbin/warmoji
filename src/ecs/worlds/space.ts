
// 与单位无关，传 px 或格皆可，只要一致

/** 削向外分量：中心 0 阻力、边缘全挡；向内与切向不受影响 */
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

/** 硬边界兜底，圈内原样返回 */
export function clampToDisc(px: number, py: number, cx: number, cy: number, r: number): { x: number; y: number } {
  const dx = px - cx
  const dy = py - cy
  const d = Math.hypot(dx, dy)
  if (d <= r || d < 1e-6) return { x: px, y: py }
  const k = r / d
  return { x: cx + dx * k, y: cy + dy * k }
}

/** 两端各外延 halfLen；返回起点/终点/单位方向 */
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
