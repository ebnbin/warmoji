import type Phaser from 'phaser'
import type { BlastRing } from '../types/abilityDefs'
import { emojiImage } from '../emoji/textures'

// 一次性特效；持续性视觉（持有物/召唤物/光环圈）由各能力自管

export interface CircleCue {
  readonly fill: number
  readonly fillAlpha: number
  readonly stroke?: number
  readonly lineWidth?: number
  readonly lineAlpha?: number
  readonly fromScale: number
  readonly toScale: number
  readonly durationMs: number
  readonly depth: number
}

export function circleCue(scene: Phaser.Scene, x: number, y: number, radius: number, o: CircleCue): void {
  const c = scene.add.circle(x, y, radius, o.fill, o.fillAlpha).setDepth(o.depth).setScale(o.fromScale)
  if (o.stroke !== undefined) c.setStrokeStyle(o.lineWidth ?? 2, o.stroke, o.lineAlpha ?? 1)
  scene.tweens.add({
    targets: c,
    scale: o.toScale,
    alpha: 0,
    duration: o.durationMs,
    ease: 'Cubic.easeOut',
    onComplete: () => c.destroy(),
  })
}

export function boomCue(scene: Phaser.Scene, x: number, y: number, size: number): void {
  const boom = emojiImage(scene, x, y, '1f4a5', size).setDepth(9)
  const full = boom.scale
  boom.setScale(full * 0.4).setRotation((Math.random() - 0.5) * 0.8)
  scene.tweens.add({
    targets: boom,
    scale: full,
    alpha: 0,
    duration: 340,
    ease: 'Back.easeOut',
    onComplete: () => boom.destroy(),
  })
}

export function beamCue(
  scene: Phaser.Scene,
  x: number,
  y: number,
  angle: number,
  length: number,
  radius: number,
  color: number,
): void {
  const beam = scene.add.rectangle(x, y, length, radius * 2, color, 0.55).setOrigin(0, 0.5).setRotation(angle).setDepth(7)
  const core = scene.add.rectangle(x, y, length, radius * 0.7, 0xffffff, 0.95).setOrigin(0, 0.5).setRotation(angle).setDepth(8)
  scene.tweens.add({
    targets: [beam, core],
    alpha: 0,
    scaleY: 0.15,
    duration: 200,
    ease: 'Cubic.easeIn',
    onComplete: () => {
      beam.destroy()
      core.destroy()
    },
  })
}

export function lightningCue(scene: Phaser.Scene, points: readonly { x: number; y: number }[], color: number): void {
  if (points.length < 2) return
  const g = scene.add.graphics().setDepth(14)
  g.lineStyle(3, color, 0.95)
  g.beginPath()
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const segs = 4
    g.moveTo(a.x, a.y)
    for (let s = 1; s <= segs; s++) {
      const t = s / segs
      const nx = -(b.y - a.y)
      const ny = b.x - a.x
      const len = Math.hypot(nx, ny) || 1
      const jitter = s === segs ? 0 : (Math.random() - 0.5) * 18
      g.lineTo(a.x + (b.x - a.x) * t + (nx / len) * jitter, a.y + (b.y - a.y) * t + (ny / len) * jitter)
    }
  }
  g.strokePath()
  scene.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() })
}

export function slashCue(scene: Phaser.Scene, x: number, y: number, angle: number, radius: number): void {
  const g = scene.add.graphics().setDepth(14)
  g.lineStyle(5, 0xffffff, 0.9)
  g.beginPath()
  g.arc(x, y, radius, angle - 1.1, angle + 1.1)
  g.strokePath()
  scene.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() })
}

export function screenFlashCue(scene: Phaser.Scene, color: number, alpha: number, durationMs: number): void {
  const flash = scene.add
    .rectangle(scene.scale.width / 2, scene.scale.height / 2, 6000, 6000, color, alpha)
    .setScrollFactor(0)
    .setDepth(200)
  scene.tweens.add({ targets: flash, alpha: 0, duration: durationMs, onComplete: () => flash.destroy() })
}

export function blastRing(scene: Phaser.Scene, x: number, y: number, radius: number, ring: BlastRing): void {
  circleCue(scene, x, y, radius, {
    fill: ring.color,
    fillAlpha: ring.fillAlpha,
    stroke: ring.color,
    lineWidth: ring.lineWidth,
    lineAlpha: ring.lineAlpha,
    fromScale: 0.3,
    toScale: 1,
    durationMs: ring.durMs,
    depth: 7,
  })
}
