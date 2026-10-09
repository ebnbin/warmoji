import type Phaser from 'phaser'
import { SHAPE, SURFACE } from './theme'

type Graphics = Phaser.GameObjects.Graphics

export interface BlockStyle {
  readonly face: number
  readonly faceAlpha?: number
  /** 面下沿厚边的颜色；不给就是平面 */
  readonly lip?: number
  readonly lipH?: number
  /** 描边颜色；null 表示不描边 */
  readonly line?: number | null
  readonly lineW?: number
  readonly lineAlpha?: number
  /** 外投影下移量 */
  readonly drop?: number
  readonly radius: number
  /** 顶部高光的不透明度 */
  readonly gloss?: number
}

function clampRadius(w: number, h: number, r: number): number {
  return Math.max(0, Math.min(r, w / 2, h / 2))
}

/** 卡通描边块：外投影、厚边、面、高光、描边，由下往上画 */
export function drawBlock(g: Graphics, x: number, y: number, w: number, h: number, s: BlockStyle): void {
  const r = clampRadius(w, h, s.radius)
  const drop = s.drop ?? 0
  const line = s.line === undefined ? SURFACE.outline : s.line
  if (drop > 0) {
    g.fillStyle(line ?? SURFACE.outline, 1)
    g.fillRoundedRect(x, y + drop, w, h, r)
  }
  const alpha = s.faceAlpha ?? 1
  if (s.lip !== undefined) {
    const lipH = Math.min(s.lipH ?? SHAPE.lip, h / 2)
    g.fillStyle(s.lip, alpha)
    g.fillRoundedRect(x, y, w, h, r)
    g.fillStyle(s.face, alpha)
    g.fillRoundedRect(x, y, w, h - lipH, clampRadius(w, h - lipH, r))
  } else {
    g.fillStyle(s.face, alpha)
    g.fillRoundedRect(x, y, w, h, r)
  }
  if (s.gloss) {
    const inset = Math.max(6, r * 0.7)
    const gh = Math.max(3, Math.min(6, h * 0.1))
    g.fillStyle(0xffffff, s.gloss)
    g.fillRoundedRect(x + inset, y + 4, Math.max(0, w - inset * 2), gh, gh / 2)
  }
  if (line !== null) {
    g.lineStyle(s.lineW ?? SHAPE.line, line, s.lineAlpha ?? 1)
    g.strokeRoundedRect(x, y, w, h, r)
  }
}

export interface DiscStyle {
  readonly face: number
  readonly faceAlpha?: number
  readonly line?: number | null
  readonly lineW?: number
  readonly lineAlpha?: number
  readonly drop?: number
  readonly gloss?: number
}

export function drawDisc(g: Graphics, cx: number, cy: number, radius: number, s: DiscStyle): void {
  const drop = s.drop ?? 0
  const line = s.line === undefined ? SURFACE.outline : s.line
  if (drop > 0) {
    g.fillStyle(line ?? SURFACE.outline, 1)
    g.fillCircle(cx, cy + drop, radius)
  }
  g.fillStyle(s.face, s.faceAlpha ?? 1)
  g.fillCircle(cx, cy, radius)
  if (s.gloss) {
    g.fillStyle(0xffffff, s.gloss)
    g.fillEllipse(cx, cy - radius * 0.55, radius * 1.1, radius * 0.32)
  }
  if (line !== null) {
    g.lineStyle(s.lineW ?? SHAPE.line, line, s.lineAlpha ?? 1)
    g.strokeCircle(cx, cy, radius)
  }
}

/** 从十二点顺时针的一段圆弧 */
export function strokeArc(g: Graphics, cx: number, cy: number, radius: number, ratio: number): void {
  if (ratio <= 0) return
  const start = -Math.PI / 2
  g.beginPath()
  g.arc(cx, cy, radius, start, start + Math.min(1, ratio) * Math.PI * 2, false)
  g.strokePath()
}
