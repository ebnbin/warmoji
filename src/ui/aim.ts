import type Phaser from 'phaser'
import { strokeArc } from './draw'
import { SURFACE, TONE } from './theme'

/** 技能瞄准的指示：蓄力圈与方向线 */
export class AimGuide {
  private readonly g: Phaser.GameObjects.Graphics

  constructor(scene: Phaser.Scene, depth: number) {
    this.g = scene.add.graphics().setDepth(depth)
  }

  /** hold 为 null 时不画蓄力圈，dir 为 null 时不画方向线 */
  draw(x: number, y: number, dir: { readonly x: number; readonly y: number } | null, len: number, hold: number | null, holdRadius: number): void {
    const g = this.g.clear()
    const accent = TONE.accent.face
    if (hold !== null) {
      g.lineStyle(10, SURFACE.outline, 0.9)
      strokeArc(g, x, y, holdRadius, hold)
      g.lineStyle(6, accent, 1)
      strokeArc(g, x, y, holdRadius, hold)
    }
    if (!dir) return
    const ex = x + dir.x * len
    const ey = y + dir.y * len
    g.lineStyle(9, SURFACE.outline, 0.9)
    g.lineBetween(x, y, ex, ey)
    g.lineStyle(5, accent, 1)
    g.lineBetween(x, y, ex, ey)
    g.fillStyle(SURFACE.outline, 0.9)
    g.fillCircle(ex, ey, 12)
    g.fillStyle(accent, 1)
    g.fillCircle(ex, ey, 9)
  }

  clear(): void {
    this.g.clear()
  }
}
