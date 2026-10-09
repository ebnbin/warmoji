import type Phaser from 'phaser'
import { strokeArc } from './draw'
import { INK, SURFACE, TONE } from './theme'

const KNOB = 24

/** 技能的施法轮盘：半透明的底盘、跟着手指并限在盘里的摇杆头，与沿盘边的蓄力进度 */
export class AimGuide {
  private readonly g: Phaser.GameObjects.Graphics

  constructor(scene: Phaser.Scene, depth: number) {
    this.g = scene.add.graphics().setDepth(depth)
  }

  /** (x, y) 是盘心，(dx, dy) 是手指从按下处拖出的位移；aimed 为真时摇杆头用强调色，hold 为 null 时不画蓄力进度 */
  draw(x: number, y: number, radius: number, dx: number, dy: number, aimed: boolean, hold: number | null): void {
    const g = this.g.clear()
    const accent = TONE.accent.face
    g.fillStyle(SURFACE.outline, 0.25)
    g.fillCircle(x, y, radius)
    g.lineStyle(3, INK.ink, 0.4)
    g.strokeCircle(x, y, radius)
    if (hold !== null) {
      g.lineStyle(10, SURFACE.outline, 0.9)
      strokeArc(g, x, y, radius, hold)
      g.lineStyle(6, accent, 1)
      strokeArc(g, x, y, radius, hold)
    }
    const k = Math.min(1, (radius - KNOB) / Math.max(1, Math.hypot(dx, dy)))
    const kx = x + dx * k
    const ky = y + dy * k
    g.fillStyle(SURFACE.outline, 0.9)
    g.fillCircle(kx, ky, KNOB + 3)
    g.fillStyle(aimed ? accent : INK.soft, 1)
    g.fillCircle(kx, ky, KNOB)
  }

  clear(): void {
    this.g.clear()
  }
}
