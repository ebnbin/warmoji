
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
  const radial = vx * ux + vy * uy
  if (radial <= 0) return { x: vx, y: vy }
  const keep = Math.max(0, 1 - d / r)
  const delta = radial * (keep - 1)
  return { x: vx + ux * delta, y: vy + uy * delta }
}

export function clampToDisc(px: number, py: number, cx: number, cy: number, r: number): { x: number; y: number } {
  const dx = px - cx
  const dy = py - cy
  const d = Math.hypot(dx, dy)
  if (d <= r || d < 1e-6) return { x: px, y: py }
  const k = r / d
  return { x: cx + dx * k, y: cy + dy * k }
}

export function meteorSweep(
  cx: number,
  cy: number,
  angle: number,
  offset: number,
  halfLen: number,
): { sx: number; sy: number; ex: number; ey: number } {
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  const ox = -dy * offset
  const oy = dx * offset
  return {
    sx: cx + ox - dx * halfLen,
    sy: cy + oy - dy * halfLen,
    ex: cx + ox + dx * halfLen,
    ey: cy + oy + dy * halfLen,
  }
}
