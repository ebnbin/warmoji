import Phaser from 'phaser'
import { emojiCodepoints } from '../core/emoji'

// twemoji SVG（jdecked/twemoji@15.1.0，图形 CC-BY 4.0），文件名 = 码点；
// 与源码中 emoji 的一一对应由 src/emoji-assets.test.ts 校验
const files = import.meta.glob('../assets/emoji/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const RASTER = 256

export function emojiKey(emoji: string): string {
  return `emoji-${emojiCodepoints(emoji)}`
}

export function preloadEmojis(scene: Phaser.Scene): void {
  for (const [path, url] of Object.entries(files)) {
    const code = /([0-9a-f-]+)\.svg$/.exec(path)?.[1]
    if (code) scene.load.svg(`emoji-${code}`, url, { width: RASTER, height: RASTER })
  }
}

export function emojiImage(
  scene: Phaser.Scene,
  x: number,
  y: number,
  emoji: string,
  size: number,
): Phaser.GameObjects.Image {
  return scene.add.image(x, y, emojiKey(emoji)).setDisplaySize(size, size)
}

/** 图标 + 文字的水平居中组合 */
export function iconLabel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  emoji: string,
  iconSize: number,
  text: string,
  style: Phaser.Types.GameObjects.Text.TextStyle,
): Phaser.GameObjects.Container {
  const label = scene.add.text(0, 0, text, style).setOrigin(0, 0.5)
  const icon = emojiImage(scene, 0, 0, emoji, iconSize)
  const gap = 10
  const total = iconSize + gap + label.width
  icon.setX(-total / 2 + iconSize / 2)
  label.setX(-total / 2 + iconSize + gap)
  return scene.add.container(x, y, [icon, label])
}
