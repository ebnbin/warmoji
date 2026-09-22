import type Phaser from 'phaser'

// Phaser 4 的 GeometryMask 只剩 Canvas 实现，WebGL 下 setMask() 只打一条 warn 就静默失效，须用 Mask filter。
// Mask filter 默认每帧重建遮罩纹理；这些裁剪窗都是静态矩形，故关掉 autoUpdate，矩形变了由调用方 markDirty

/** shape 可以是不可见的 Graphics */
export function clipTo(
  target: Phaser.GameObjects.Container,
  shape: Phaser.GameObjects.Graphics,
): Phaser.Filters.Mask | undefined {
  target.enableFilters()
  const mask = target.filters?.internal.addMask(shape)
  if (mask) mask.autoUpdate = false
  return mask
}

export function markDirty(mask: Phaser.Filters.Mask | undefined): void {
  if (mask) mask.needsUpdate = true
}
