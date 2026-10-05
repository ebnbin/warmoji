import type Phaser from 'phaser'
import type { HoloKind } from './layout'

/** 全息像自己的水平面在画面上压扁多少：像是斜着往下看的 */
const SQUASH = 0.42

/** 全息像上的一点：自己的横 x、纵 y（水平面里）与高 z，像素；画在 (cx, cy) 上方 */
interface Pt {
  readonly x: number
  readonly y: number
  readonly z: number
}

/** 一笔全息线：外面一层宽而淡的光，里面一条亮线；front 为假的画得暗一些（在像的背面） */
function stroke(g: Phaser.GameObjects.Graphics, pts: readonly Pt[], cx: number, cy: number, color: number, alpha: number, front: boolean, shift: (z: number) => number): void {
  if (pts.length < 2) return
  const k = front ? 1 : 0.45
  for (const [w, a] of [
    [3.2, 0.14],
    [1.3, 0.85],
  ] as const) {
    g.lineStyle(w, color, a * alpha * k)
    g.beginPath()
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!
      const sx = cx + p.x + shift(p.z)
      const sy = cy + p.y * SQUASH - p.z
      if (i === 0) g.moveTo(sx, sy)
      else g.lineTo(sx, sy)
    }
    g.strokePath()
  }
}

/** 地球仪：几道纬线，几道转着的经线；朝前的半边亮 */
function globe(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, t: number, color: number, alpha: number, shift: (z: number) => number): void {
  for (const lat of [-0.9, -0.45, 0, 0.45, 0.9]) {
    const rr = r * Math.cos(lat)
    const z = r * Math.sin(lat)
    for (const front of [false, true]) {
      const pts: Pt[] = []
      for (let k = 0; k <= 24; k++) {
        const a = Math.PI * (front ? k / 24 : 1 + k / 24)
        pts.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr, z })
      }
      stroke(g, pts, cx, cy, color, alpha, front, shift)
    }
  }
  for (let m = 0; m < 6; m++) {
    const a = t * 0.8 + (m / 6) * Math.PI
    const pts: Pt[] = []
    for (let k = 0; k <= 20; k++) {
      const phi = -Math.PI / 2 + (k / 20) * Math.PI
      pts.push({ x: Math.cos(a) * Math.cos(phi) * r, y: Math.sin(a) * Math.cos(phi) * r, z: Math.sin(phi) * r })
    }
    stroke(g, pts, cx, cy, color, alpha, Math.sin(a) > 0, shift)
  }
}

/** 双螺旋：两股绕着竖轴转，中间一级级的横档 */
function helix(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, t: number, color: number, alpha: number, shift: (z: number) => number): void {
  const h = r * 2.4
  const turns = 2
  for (const off of [0, Math.PI]) {
    const pts: Pt[] = []
    for (let k = 0; k <= 40; k++) {
      const z = (k / 40) * h - h / 2
      const a = t * 1.4 + off + (k / 40) * turns * Math.PI * 2
      pts.push({ x: Math.cos(a) * r * 0.55, y: Math.sin(a) * r * 0.55, z: z + h / 2 })
    }
    stroke(g, pts, cx, cy, color, alpha, true, shift)
  }
  for (let k = 0; k <= 12; k++) {
    const z = (k / 12) * h - h / 2
    const a = t * 1.4 + (k / 12) * turns * Math.PI * 2
    const p = { x: Math.cos(a) * r * 0.55, y: Math.sin(a) * r * 0.55, z: z + h / 2 }
    stroke(g, [p, { x: -p.x, y: -p.y, z: p.z }], cx, cy, color, alpha * 0.7, Math.sin(a) > 0, shift)
  }
}

/** 楼群模型：一圈高矮不一的方楼，整片慢慢转 */
function towers(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, t: number, color: number, alpha: number, shift: (z: number) => number): void {
  const spin = t * 0.35
  const blocks = [
    [0, 0, 0.32, 1.9],
    [0.62, 0.1, 0.22, 1.1],
    [-0.55, 0.32, 0.24, 1.4],
    [0.1, -0.62, 0.2, 0.9],
    [-0.3, -0.45, 0.18, 1.2],
    [0.42, 0.58, 0.18, 0.7],
  ] as const
  for (const [bx, by, s, hh] of blocks) {
    const c = Math.cos(spin)
    const sn = Math.sin(spin)
    const corners: Pt[] = []
    for (const [dx, dy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      const lx = (bx + dx * s) * r
      const ly = (by + dy * s) * r
      corners.push({ x: lx * c - ly * sn, y: lx * sn + ly * c, z: 0 })
    }
    const top = corners.map((p) => ({ ...p, z: hh * r }))
    stroke(g, [...top, top[0]!], cx, cy, color, alpha, true, shift)
    stroke(g, [...corners, corners[0]!], cx, cy, color, alpha * 0.6, false, shift)
    for (let k = 0; k < 4; k++) stroke(g, [corners[k]!, top[k]!], cx, cy, color, alpha * 0.8, corners[k]!.y > 0, shift)
  }
}

/**
 * 一座全息台上投出的像：台面上一道锥形的光往上散开，像悬在上面慢慢转；像会忽闪，隔一阵错位一下（一段横条错开、旁边多出一道品红的重影）。
 * (cx, cy) 是台子在地上的中心，像素；base 是像的底离地多高、r 是像的半径，像素；glitch 在 0 到 1，是这一下错位有多狠
 */
export function drawHolo(g: Phaser.GameObjects.Graphics, kind: HoloKind, cx: number, cy: number, top: number, base: number, r: number, t: number, color: number, ghost: number, glitch: number, flicker: number): void {
  const cone = 0.06 + 0.04 * flicker
  g.fillStyle(color, cone)
  g.beginPath()
  g.moveTo(cx - r * 0.35, cy - top)
  g.lineTo(cx + r * 0.35, cy - top)
  g.lineTo(cx + r * 1.05, cy - base)
  g.lineTo(cx - r * 1.05, cy - base)
  g.closePath()
  g.fillPath()
  g.lineStyle(1.2, color, 0.35 * flicker)
  g.strokeEllipse(cx, cy - top, r * 0.7, r * 0.7 * SQUASH)
  const draw = kind === 'globe' ? globe : kind === 'helix' ? helix : towers
  const lift = kind === 'globe' ? base + r : base
  const band = base + r * (0.3 + 1.2 * ((t * 7.3) % 1))
  const shift = (z: number): number => (glitch > 0 && Math.abs(lift + z - band) < r * 0.25 ? glitch * r * 0.35 : 0)
  if (glitch > 0) draw(g, cx + glitch * 4, cy - lift, r, t, ghost, 0.5 * glitch, () => 0)
  draw(g, cx, cy - lift, r, t, color, 0.6 + 0.4 * flicker, shift)
}
