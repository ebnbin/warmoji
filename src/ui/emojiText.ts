import Phaser from 'phaser'
import { emojiImage } from '../emoji/textures'

// emoji 排版控件：把「文字 + 内联 emoji 图标」组合成 Phaser 容器。
// 素材侧只提供 emojiImage（纹理 → Image），此处只管排版，故归 ui/ 而非 emoji/。

/** 图标 + 文字的水平居中组合（图标在前） */
export function iconLabel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  id: string,
  iconSize: number,
  text: string,
  style: Phaser.Types.GameObjects.Text.TextStyle,
): Phaser.GameObjects.Container {
  const label = scene.add.text(0, 0, text, style).setOrigin(0, 0.5)
  const icon = emojiImage(scene, 0, 0, id, iconSize)
  const gap = 10
  const total = iconSize + gap + label.width
  icon.setX(-total / 2 + iconSize / 2)
  label.setX(-total / 2 + iconSize + gap)
  return scene.add.container(x, y, [icon, label])
}

/** 富文本：把含 {id} 占位符的模板渲染成「文字段 + 内联 SVG 图标」的水平组合。
 * 项目内一切「文字里带 emoji」的场合都走这里——emoji 恒以 SVG 图标呈现，永不用字体。
 * origin 沿水平方向定位（0 左对齐 / 0.5 居中 / 1 右对齐），垂直恒居中于 y。 */
export function emojiText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  template: string,
  style: Phaser.Types.GameObjects.Text.TextStyle,
  opts: { iconSize?: number; origin?: number; gap?: number } = {},
): Phaser.GameObjects.Container {
  const fontSize = typeof style.fontSize === 'number' ? style.fontSize : parseInt(String(style.fontSize ?? '24'), 10) || 24
  const iconSize = opts.iconSize ?? fontSize
  const gap = opts.gap ?? Math.round(iconSize * 0.15)
  const origin = opts.origin ?? 0.5

  const parts: (Phaser.GameObjects.Image | Phaser.GameObjects.Text)[] = []
  const widths: number[] = []
  // 模板拆成 [文字, {id}, 文字, ...]
  for (const seg of template.split(/(\{[^}]+\})/)) {
    if (!seg) continue
    const m = /^\{([^}]+)\}$/.exec(seg)
    if (m) {
      parts.push(emojiImage(scene, 0, 0, m[1]!, iconSize))
      widths.push(iconSize)
    } else {
      const label = scene.add.text(0, 0, seg, style).setOrigin(0, 0.5)
      parts.push(label)
      widths.push(label.width)
    }
  }
  const total = widths.reduce((a, w) => a + w, 0) + gap * Math.max(0, parts.length - 1)
  let cursor = -total * origin
  parts.forEach((p, i) => {
    const w = widths[i]!
    // Image 以中心定位，Text 以左边（setOrigin(0,0.5)）定位
    p.setX(p instanceof Phaser.GameObjects.Image ? cursor + w / 2 : cursor)
    cursor += w + gap
  })
  return scene.add.container(x, y, parts)
}
