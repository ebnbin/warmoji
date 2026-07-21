import type Phaser from 'phaser'

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
