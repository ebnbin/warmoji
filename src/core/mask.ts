import type Phaser from 'phaser'

// 矩形裁剪（滚动区/网格的可视窗）。Phaser 4 起 GeometryMask 只剩 Canvas 实现，
// WebGL 下 setMask() 只打一条 warn 就返回、裁剪静默失效（编译期与单测都抓不到），
// 官方替代是 Mask filter：先 enableFilters() 再往 internal 列表挂遮罩对象。
// 遮罩形状仍是调用方那块 setVisible(false) 的 Graphics，原样传进来即可
//（不可见不影响遮罩渲染），所以各调用点只需把 setMask(...) 换成本函数。
//
// 性能要点：Mask filter 走 framebuffer（把遮罩对象画进一张 DynamicTexture），
// 默认每帧重建一次，比 v3 的 stencil 遮罩贵得多。这些裁剪窗都是静态矩形，
// 故关掉 autoUpdate——只在首帧渲染一次；矩形若变了（如 ScrollView.setViewport
// 重画遮罩），调用方用 markDirty 显式要求重建。

/** 用 shape 的图形把 target 裁出可视窗（shape 通常是一块画了 fillRect 的隐藏 Graphics） */
export function clipTo(
  target: Phaser.GameObjects.Container,
  shape: Phaser.GameObjects.Graphics,
): Phaser.Filters.Mask | undefined {
  target.enableFilters()
  const mask = target.filters?.internal.addMask(shape)
  if (mask) mask.autoUpdate = false
  return mask
}

/** 遮罩形状改动后（矩形挪位/改尺寸）要求重建一次遮罩纹理 */
export function markDirty(mask: Phaser.Filters.Mask | undefined): void {
  if (mask) mask.needsUpdate = true
}
