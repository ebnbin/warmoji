// 加载期对 SVG 文本做程序化修改的纯函数层（原始 SVG 文件永不改动）。
// 项目 emoji 规范：twemoji 原始 viewBox "0 0 36 36"（内容贴边）统一 pad 成
// "-6 -6 48 48"——内容居中、四周各 6 单位余量，描边/位移动画不裁边。
// 注入点唯一：ui/emoji.ts 的 emojiSvgText；此后全项目提到 emoji 尺寸都指 48 标准

const OPEN_TAG = /<svg\b[^>]*>/
const VIEW_BOX = /viewBox\s*=\s*"([^"]+)"/

/** 统一 padding（viewBox 单位）：36 内容 + 两侧各 6 = 48 标准 */
export const EMOJI_PAD = 6

/** viewBox 四周外扩 pad 单位（内容不动、居中） */
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

/** 设置光栅化尺寸（width/height 属性），SVG 作为 <img> 加载时以此为自然尺寸 */
export function setSvgSize(svg: string, size: number): string {
  const open = OPEN_TAG.exec(svg)
  if (!open) throw new Error('不是有效的 SVG')
  let tag = open[0].replace(/\s(?:width|height)\s*=\s*"[^"]*"/g, '')
  tag = tag.replace('<svg', `<svg width="${size}" height="${size}"`)
  return svg.slice(0, open.index) + tag + svg.slice(open.index + open[0].length)
}

/**
 * 给整个图形加剪影描边（矢量方案）：把内容复制一份垫在下层，
 * CSS 强制副本所有填充/描边为 color 且 stroke 圆角外扩 radius（viewBox 单位），
 * 各形状的 黑fill ∪ 黑stroke 的并集即平滑的剪影轮廓，任意分辨率无锯齿。
 * 描边画在统一 padding 的余量里（EMOJI_PAD ≥ radius），viewBox 不再自扩
 */
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

// 剪影描边（radius 单位 = twemoji viewBox 单位，36 格）：按阵营配色
// 玩家侧黑、敌人紫、敌方子弹红、精英/Boss 金——一眼分清敌我与威胁等级
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
