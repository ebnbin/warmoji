export const OPEN_TAG = /<svg\b[^>]*>/
const TAG = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|[^">])*?)(\/?)>/g

export interface SplitSvg {
  open: string
  defs: string
  els: string[]
}

export interface TopSegment {
  tag: string
  text: string
  open: string | null
  inner: string | null
}

export function topLevelSegments(body: string): TopSegment[] {
  const out: TopSegment[] = []
  const re = new RegExp(TAG.source, 'g')
  let depth = 0
  let start = 0
  let startTag = ''
  let startOpen = ''
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) {
    const close = m[1] === '/'
    const self = m[4] === '/'
    if (close) {
      depth--
      if (depth < 0) throw new Error('SVG 标签不平衡')
      if (depth === 0) {
        out.push({
          tag: startTag,
          text: body.slice(start, m.index + m[0].length),
          open: startOpen,
          inner: body.slice(start + startOpen.length, m.index),
        })
      }
    } else if (self) {
      if (depth === 0) out.push({ tag: m[2]!, text: m[0], open: null, inner: null })
    } else {
      if (depth === 0) {
        start = m.index
        startTag = m[2]!
        startOpen = m[0]
      }
      depth++
    }
  }
  if (depth !== 0) throw new Error('SVG 标签不平衡')
  return out
}

/** 顶层元素按出现顺序编号，动画部件的下标就是这个编号；defs 不算 */
export function splitSvg(svg: string): SplitSvg {
  const open = OPEN_TAG.exec(svg)?.[0]
  if (!open) throw new Error('不是有效的 SVG')
  const closeIdx = svg.lastIndexOf('</svg>')
  if (closeIdx < 0) throw new Error('SVG 缺少闭合标签')
  const body = svg.slice(svg.indexOf(open) + open.length, closeIdx)
  let defs = ''
  const els: string[] = []
  for (const seg of topLevelSegments(body)) {
    if (seg.tag === 'defs') defs += seg.text
    else els.push(seg.text)
  }
  return { open, defs, els }
}
