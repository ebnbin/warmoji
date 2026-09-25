import type Phaser from 'phaser'

// Phaser 4 的 GeometryMask 只剩 Canvas 实现，WebGL 下 setMask() 只打一条 warn 就静默失效，须用 Mask filter
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
