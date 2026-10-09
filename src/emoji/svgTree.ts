const OPEN_TAG = /<svg\b[^>]*>/
const TAG = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|[^">])*?)(\/?)>/g

interface TopSegment {
  tag: string
  text: string
  open: string | null
  inner: string | null
}

function topLevelSegments(body: string): TopSegment[] {
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

interface SvgTreeNode {
  readonly path: string
  readonly tag: string
  readonly raw: string
  readonly open: string | null
  readonly fill: string | null
  readonly children: readonly SvgTreeNode[]
  readonly paints: boolean
}

export interface SvgTree {
  readonly open: string
  readonly nodes: readonly SvgTreeNode[]
}

function buildNodes(body: string, parentPath: string, paints: boolean): SvgTreeNode[] {
  return topLevelSegments(body).map((seg, i) => {
    const path = parentPath === '' ? String(i) : `${parentPath}/${i}`
    const selfPaints = paints && seg.tag !== 'defs'
    return {
      path,
      tag: seg.tag,
      raw: seg.text,
      open: seg.open,
      fill: /\bfill="([^"]+)"/.exec(seg.open ?? seg.text)?.[1] ?? null,
      children: seg.inner === null ? [] : buildNodes(seg.inner, path, selfPaints),
      paints: selfPaints,
    }
  })
}

export function parseSvgTree(svg: string): SvgTree {
  const open = OPEN_TAG.exec(svg)?.[0]
  if (!open) throw new Error('不是有效的 SVG')
  const closeIdx = svg.lastIndexOf('</svg>')
  if (closeIdx < 0) throw new Error('SVG 缺少闭合标签')
  const body = svg.slice(svg.indexOf(open) + open.length, closeIdx)
  return { open, nodes: buildNodes(body, '', true) }
}

interface ComposeState {
  readonly hidden?: ReadonlySet<string>
}

export function composeSvg(tree: SvgTree, state: ComposeState = {}): string {
  const hidden = state.hidden ?? new Set<string>()
  const anyHiddenWithin = (path: string): boolean => {
    for (const h of hidden) if (h.startsWith(`${path}/`)) return true
    return false
  }
  const emit = (node: SvgTreeNode): string => {
    if (!node.paints) return node.raw
    if (hidden.has(node.path)) return ''
    return node.children.length > 0 && anyHiddenWithin(node.path)
      ? `${node.open}${node.children.map(emit).join('')}</${node.tag}>`
      : node.raw
  }
  return `${tree.open}${tree.nodes.map(emit).join('')}</svg>`
}

export interface TreeRow {
  readonly path: string
  readonly tag: string
  readonly fill: string | null
  readonly depth: number
  readonly paints: boolean
  readonly container: boolean
  readonly childCount: number
}

export function flattenTree(tree: SvgTree, collapsed: ReadonlySet<string>): TreeRow[] {
  const rows: TreeRow[] = []
  const walk = (nodes: readonly SvgTreeNode[], depth: number): void => {
    for (const node of nodes) {
      rows.push({
        path: node.path,
        tag: node.tag,
        fill: node.fill,
        depth,
        paints: node.paints,
        container: node.children.length > 0,
        childCount: node.children.length,
      })
      if (node.children.length > 0 && !collapsed.has(node.path)) walk(node.children, depth + 1)
    }
  }
  walk(tree.nodes, 0)
  return rows
}
