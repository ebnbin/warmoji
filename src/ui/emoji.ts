import Phaser from 'phaser'
import { ENTITY_EMOJIS, OUTLINE } from '../core/config'
import { emojiCodepoints } from '../core/emoji'
import { outlineSvg, setSvgSize } from '../core/svg'

// twemoji SVG（jdecked/twemoji@15.1.0，图形 CC-BY 4.0），文件名 = 码点；
// 与源码中 emoji 的一一对应由 src/emoji-assets.test.ts 校验。
// 加载管线：fetch SVG 文本 → core/svg.ts 的纯函数改写 → 光栅化 → Phaser 纹理，
// 原始 SVG 文件永不改动，后续对 SVG 的定制都加在改写这一步。
const files = import.meta.glob('../assets/emoji/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const RASTER = 256

export function emojiKey(emoji: string, outlined = false): string {
  return `emoji-${emojiCodepoints(emoji)}${outlined ? '-ol' : ''}`
}

async function rasterize(svgText: string): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('SVG 光栅化失败'))
      img.src = url
    })
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function loadEmojiTextures(scene: Phaser.Scene): Promise<void> {
  const entityCodes = new Set(ENTITY_EMOJIS.map(emojiCodepoints))
  await Promise.all(
    Object.entries(files).map(async ([path, url]) => {
      const code = /([0-9a-f-]+)\.svg$/.exec(path)?.[1]
      if (!code) return
      try {
        const raw = await (await fetch(url)).text()
        scene.textures.addImage(`emoji-${code}`, await rasterize(setSvgSize(raw, RASTER)))
        if (entityCodes.has(code)) {
          const outlined = setSvgSize(outlineSvg(raw, OUTLINE.radius, OUTLINE.color), RASTER)
          scene.textures.addImage(`emoji-${code}-ol`, await rasterize(outlined))
        }
      } catch (err) {
        // console.error 让 e2e 的无报错断言能捕获资源问题
        console.error(`emoji 纹理加载失败 ${code}: ${String(err)}`)
      }
    }),
  )
}

export function emojiImage(
  scene: Phaser.Scene,
  x: number,
  y: number,
  emoji: string,
  size: number,
  outlined = false,
): Phaser.GameObjects.Image {
  return scene.add.image(x, y, emojiKey(emoji, outlined)).setDisplaySize(size, size)
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
