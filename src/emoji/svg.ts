const OPEN_TAG = /<svg\b[^>]*>/
const VIEW_BOX = /viewBox\s*=\s*"([^"]+)"/

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

export function setSvgSize(svg: string, size: number): string {
  const open = OPEN_TAG.exec(svg)
  if (!open) throw new Error('不是有效的 SVG')
  let tag = open[0].replace(/\s(?:width|height)\s*=\s*"[^"]*"/g, '')
  tag = tag.replace('<svg', `<svg width="${size}" height="${size}"`)
  return svg.slice(0, open.index) + tag + svg.slice(open.index + open[0].length)
}

export function outlineSvg(svg: string, radius: number, color: string): string {
  const open = OPEN_TAG.exec(svg)
  if (!open) throw new Error('不是有效的 SVG')
  const style =
    `<style>.__ol,.__ol *{fill:${color} !important;stroke:${color} !important;` +
    `stroke-width:${radius * 2} !important;stroke-linejoin:round !important;stroke-linecap:round !important;}</style>`

  const closeIdx = svg.lastIndexOf('</svg>')
  if (closeIdx < 0) throw new Error('SVG 缺少闭合标签')
  const body = svg.slice(open.index + open[0].length, closeIdx)
  return svg.slice(0, open.index) + open[0] + style + `<g class="__ol">${body}</g>` + body + '</svg>'
}

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
