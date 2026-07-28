// 顶点色打包：Uint24 的 RGB + 0..1 的 alpha → 0xAARRGGBB。
//
// **alpha 必须先钳进 [0,1]**。Phaser 的 getTintAppendFloatAlpha 打包写的是
// `((a * 255) | 0) & 0xff`，文档也明说入参「range between 0.0 and 1.0」——它敢这么写，
// 是因为核心那边的 alpha 一律出自 Alpha 组件的 setter，而那个 setter 第一行就是
// Clamp(value, 0, 1)。ECS 这边 Tint.alpha 是裸 f32，谁都能写，越界既不报错也没人拦，
// 而 & 0xff 会把越界值绕回低 8 位——**正好是本意的反面**：
//   · 负数（本该已经淡没）绕成几乎不透明
//   · 大于 1（本该完全不透明）绕成几乎全透明
//
// 已经踩到两处，都是 Back.easeOut 的过冲段：
//   · 💥 爆裂 alpha = 1 - backEaseOut(t)，t∈[0.37,1] 恒为负——那是它 63% 的寿命，
//     且正是尺寸最大的那一段。旧实现走 setAlpha 被钳成 0（看不见，只留前段那一下
//     由小弹大的闪现），移植成裸写之后变成「满不透明地停在最大尺寸上」，
//     看起来就是这个 💥 比从前大了一圈
//   · Boss 入场 alpha = 0.2 + 0.8·backEaseOut(t)，峰值 1.08——本该完全不透明，
//     实际几乎全透明
//
// 公式与 Phaser 同源，这里自己写一遍只为**不 import phaser**：渲染层唯一一处纯算术，
// 抄过来才进得了单测（同 render/bands.ts）。
export function packTint(rgb: number, alpha: number): number {
  const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha
  return (((a * 255) | 0) << 24) | (rgb >>> 0)
}
