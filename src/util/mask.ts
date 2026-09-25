import type Phaser from 'phaser'

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
