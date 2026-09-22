// 纯函数，原始 SVG 永不改动。viewBox 统一从 "0 0 36 36" pad 成 "-6 -6 48 48"，
// 注入点唯一：textures.ts 的 emojiSvgText；此后全项目的 emoji 尺寸都指 48 标准

const OPEN_TAG = /<svg\b[^>]*>/
const VIEW_BOX = /viewBox\s*=\s*"([^"]+)"/

/** viewBox 单位；36 + 2×6 = 48 */
export const EMOJI_PAD = 6

export function padSvg(svg: string, pad: number): string {
  const open = OPEN_TAG.exec(svg)
  if (!open) throw new Error('不是有效的 SVG')
  const vb = VIEW_BOX.exec(open[0])?.[1]
  if (!vb) throw new Error('SVG 缺少 viewBox')
  const parts = vb.trim().split(/[\s,]+/).map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error(`viewBox 无法解析: ${vb}`)
  }
  const [x, y, w, h] = parts as [number, number, number, number]
  const openTag = open[0].replace(
    VIEW_BOX,
    `viewBox="${x - pad} ${y - pad} ${w + pad * 2} ${h + pad * 2}"`,
  )
  return svg.slice(0, open.index) + openTag + svg.slice(open.index + open[0].length)
}

/** SVG 作为 <img> 加载时以 width/height 为自然尺寸 */
export function setSvgSize(svg: string, size: number): string {
  const open = OPEN_TAG.exec(svg)
  if (!open) throw new Error('不是有效的 SVG')
  let tag = open[0].replace(/\s(?:width|height)\s*=\s*"[^"]*"/g, '')
  tag = tag.replace('<svg', `<svg width="${size}" height="${size}"`)
  return svg.slice(0, open.index) + tag + svg.slice(open.index + open[0].length)
}

/** 副本垫在下层，CSS 强制其填充/描边为 color 并外扩 radius；描边画在 padding 余量里，须 EMOJI_PAD ≥ radius */
export function outlineSvg(svg: string, radius: number, color: string): string {
  const open = OPEN_TAG.exec(svg)
  if (!open) throw new Error('不是有效的 SVG')
  // CSS 规则优先级高于 SVG 表现属性（fill="..."），可整体改写副本配色
  const style =
    `<style>.__ol,.__ol *{fill:${color} !important;stroke:${color} !important;` +
    `stroke-width:${radius * 2} !important;stroke-linejoin:round !important;stroke-linecap:round !important;}</style>`

  const closeIdx = svg.lastIndexOf('</svg>')
  if (closeIdx < 0) throw new Error('SVG 缺少闭合标签')
  const body = svg.slice(open.index + open[0].length, closeIdx)
  return svg.slice(0, open.index) + open[0] + style + `<g class="__ol">${body}</g>` + body + '</svg>'
}

// radius 单位 = viewBox 单位
export const OUTLINE = {
  radius: 2,
  colors: {
    player: '#000000',
    enemy: '#8e24aa',
    enemyProjectile: '#d32f2f',
    elite: '#ffb300',
  },
} as const

export type OutlineKind = keyof typeof OUTLINE.colors
