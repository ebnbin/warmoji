// 缓动(纯函数):与 Phaser 的同名缓动同参,供纯逻辑侧的弹入动画用。
// 单独成模块是为了避免 sim ↔ enemy 之间为了一个缓动函数互相 import 成环。

/** Back.easeOut(Phaser 默认过冲量):末段轻微过冲再回落 */
export function backEaseOut(t: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  const u = t - 1
  return 1 + c3 * u * u * u + c1 * u * u
}
