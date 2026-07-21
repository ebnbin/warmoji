import type Phaser from 'phaser'
import { emojiImage } from '../emoji/textures'

// 表现层（Cue，阵营中立）：一次性放完即弃的战斗特效——与机制正交。能力运行时类
// 只「触发一个 cue」，不自己写 tween/draw（GAS GameplayCue 思路：机制不依赖渲染）。
// 持续性视觉（持有物/召唤物/光环圈）是能力生命周期状态，由各类自管，不在此列。

/** 扩散淡出的圆：填充圆（可选描边），从 fromScale 缩放到 toScale 同时淡出后销毁。
 * 命中白闪、冲击环、治疗/集结/冻结脉冲共用此一处——各自传颜色/尺度/时长/深度。 */
export interface CircleCue {
  readonly fill: number
  readonly fillAlpha: number
  /** 描边色；省略即无描边（纯填充闪光） */
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

/** 💥 爆裂：emoji 从缩小随机微转弹出到全尺寸并淡出（轰炸命中点）。 */
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

/** 贯穿光束：沿 angle 铺一条长 length 的双层矩形（外层色 + 白芯），纵向收拢淡出。 */
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

/** 锯齿闪电折线：沿折点串每段拆几截加垂直抖动画一条电弧，短暂淡出（连锁传导路径）。 */
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

/** 斩击弧光：以 (x,y) 为心、朝 angle 画一段 ±1.1rad 的白弧，淡出（瞬袭背刺）。 */
export function slashCue(scene: Phaser.Scene, x: number, y: number, angle: number, radius: number): void {
  const g = scene.add.graphics().setDepth(14)
  g.lineStyle(5, 0xffffff, 0.9)
  g.beginPath()
  g.arc(x, y, radius, angle - 1.1, angle + 1.1)
  g.strokePath()
  scene.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() })
}

/** 全屏白闪：一块盖满视口的定屏矩形淡出（天罚全域打击）。 */
export function screenFlashCue(scene: Phaser.Scene, color: number, alpha: number, durationMs: number): void {
  const flash = scene.add
    .rectangle(scene.scale.width / 2, scene.scale.height / 2, 6000, 6000, color, alpha)
    .setScrollFactor(0)
    .setDepth(200)
  scene.tweens.add({ targets: flash, alpha: 0, duration: durationMs, onComplete: () => flash.destroy() })
}
