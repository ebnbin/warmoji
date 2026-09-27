import Phaser from 'phaser'
import type { OutlineKind } from '../emoji/svg'
import { textRes } from '../util/apply'
import { Icon } from './icon'
import { css, FONT_FAMILY, SURFACE, TEXT, textColor } from './theme'
import type { TextColor, TextKind } from './theme'
import { Widget } from './widget'

export interface LabelStyle {
  readonly kind?: TextKind
  readonly color?: TextColor
  readonly bold?: boolean
  readonly align?: 'left' | 'center' | 'right'
  /** 换行宽度；中文按字断行 */
  readonly wrap?: number
  /** 行距，默认随字号 */
  readonly spacing?: number
  /** 压在地图上的文字：粗描边加投影 */
  readonly outline?: boolean
  /** 标题的硬投影 */
  readonly shadow?: boolean
}

const CJK = /[⺀-鿿豈-﫿＀-￯　-〿]/
/** 不能出现在行首的标点 */
const CLOSING = /[，。、；：！？）》」』】〉…·,.;:!?)\]%]/
/** 不能出现在行尾的标点 */
const OPENING = /[（《「『【〈(\[]/

/** 断行单位：汉字逐字，拉丁词与数字成组，标点贴住相邻的字 */
function breakUnits(line: string): string[] {
  const units: string[] = []
  let opening = ''
  const start = (s: string): void => {
    units.push(opening + s)
    opening = ''
  }
  for (const ch of line) {
    const last = units.length - 1
    const prev = units[last] ?? ''
    if (CLOSING.test(ch) && !opening && last >= 0) {
      if (prev.trim() === '' && last >= 1) {
        units.pop()
        units[last - 1] += prev + ch
      } else {
        units[last] = prev + ch
      }
    } else if (OPENING.test(ch)) {
      opening += ch
    } else if (opening || last < 0 || ch === ' ' || CJK.test(ch) || prev.endsWith(' ') || CJK.test(prev.slice(-1))) {
      start(ch)
    } else {
      units[last] = prev + ch
    }
  }
  if (opening) start('')
  return units
}

function wrapCjk(text: string, ctx: CanvasRenderingContext2D, width: number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    let cur = ''
    for (const unit of breakUnits(para)) {
      const next = cur + unit
      if (cur.trim() && ctx.measureText(next.trimEnd()).width > width) {
        out.push(cur.trimEnd())
        cur = unit.trimStart()
      } else {
        cur = next
      }
    }
    out.push(cur.trimEnd())
  }
  return out
}

/** 描边字的描边宽度；它也会把文字画布左右各撑宽一半 */
function outlineWidth(kind: TextKind): number {
  return Math.max(4, Math.round(TEXT[kind].size / 6))
}

function toPhaserStyle(s: LabelStyle): Phaser.Types.GameObjects.Text.TextStyle {
  const kind = TEXT[s.kind ?? 'body']
  const style: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: FONT_FAMILY,
    fontSize: `${kind.size}px`,
    fontStyle: (s.bold ?? kind.bold) ? 'bold' : 'normal',
    color: css(textColor(s.color ?? 'ink')),
    align: s.align ?? 'left',
    resolution: textRes(),
  }
  if (s.wrap !== undefined) {
    style.wordWrap = {
      width: s.wrap,
      callback: (text: string, obj: Phaser.GameObjects.Text) => wrapCjk(text, obj.context, obj.style.wordWrapWidth ?? s.wrap ?? 0),
    }
    style.lineSpacing = s.spacing ?? Math.round(kind.size * 0.24)
  } else if (s.spacing !== undefined) {
    style.lineSpacing = s.spacing
  }
  const outline = css(SURFACE.outline)
  if (s.outline) {
    style.stroke = outline
    style.strokeThickness = outlineWidth(s.kind ?? 'body')
    style.shadow = { offsetX: 0, offsetY: Math.max(2, Math.round(kind.size / 14)), color: outline, blur: 0, stroke: true, fill: true }
  } else if (s.shadow) {
    style.shadow = { offsetX: 0, offsetY: Math.max(2, Math.round(kind.size / 12)), color: outline, blur: 0, stroke: false, fill: true }
  }
  return style
}

export class Label extends Phaser.GameObjects.Text {
  constructor(scene: Phaser.Scene, x: number, y: number, text: string, style: LabelStyle = {}) {
    super(scene, x, y, text, toPhaserStyle(style))
    scene.add.existing(this)
  }

  setInk(color: TextColor): this {
    return this.setColor(css(textColor(color)))
  }

  setBold(bold: boolean): this {
    return this.setFontStyle(bold ? 'bold' : 'normal')
  }

  /** 单行过宽时整体缩小到 maxWidth */
  fit(maxWidth: number): this {
    this.setScale(1)
    if (this.width > maxWidth) this.setScale(maxWidth / this.width)
    return this
  }
}

export type Segment =
  | string
  | { readonly text: string; readonly color?: TextColor; readonly bold?: boolean }
  | { readonly icon: string; readonly outline?: OutlineKind; readonly size?: number }

export interface RichStyle extends LabelStyle {
  readonly iconSize?: number
  readonly gap?: number
  /** 横向锚点：0 左、0.5 中、1 右；纵向总以 y 为中线 */
  readonly originX?: number
  /** 超宽时整体缩小 */
  readonly maxWidth?: number
}

const SLOTS = /(\{[^}]+\})/
const SLOT = /^\{([^}]+)\}$/

/** 模板里 {emoji} 占位对应的 emoji */
export function templateEmojis(template: string): string[] {
  return template.split(SLOTS).flatMap((seg) => {
    const m = SLOT.exec(seg)
    return m ? [m[1]!] : []
  })
}

function parse(template: string): Segment[] {
  return template.split(SLOTS).flatMap((seg): Segment[] => {
    if (!seg) return []
    const m = SLOT.exec(seg)
    return m ? [{ icon: m[1]! }] : [seg]
  })
}

/** 一行文字与 emoji 混排：模板里的 {emoji} 换成图标，也可逐段指定颜色 */
export class RichLabel extends Widget {
  private readonly style: RichStyle
  private span = 0

  constructor(scene: Phaser.Scene, x: number, y: number, content: string | readonly Segment[], style: RichStyle = {}) {
    super(scene, x, y)
    this.style = style
    this.setContent(content)
  }

  /** 未缩放时的总宽 */
  get spanWidth(): number {
    return this.span
  }

  setContent(content: string | readonly Segment[]): this {
    this.removeAll(true)
    const s = this.style
    const size = TEXT[s.kind ?? 'body'].size
    const iconSize = s.iconSize ?? Math.round(size * 1.15)
    const gap = s.gap ?? Math.round(iconSize * 0.15)
    // 描边把文字画布撑宽，排版按字形本身的宽度算
    const bleed = s.outline ? outlineWidth(s.kind ?? 'body') / 2 : 0
    const parts: { obj: Icon | Label; w: number }[] = []
    for (const seg of typeof content === 'string' ? parse(content) : content) {
      if (typeof seg === 'string') {
        const t = new Label(this.scene, 0, 0, seg, s).setOrigin(0, 0.5)
        parts.push({ obj: t, w: t.width - bleed * 2 })
      } else if ('icon' in seg) {
        const side = seg.size ?? iconSize
        parts.push({ obj: new Icon(this.scene, 0, 0, seg.icon, side, seg.outline), w: side })
      } else {
        const t = new Label(this.scene, 0, 0, seg.text, { ...s, color: seg.color ?? s.color, bold: seg.bold ?? s.bold }).setOrigin(0, 0.5)
        parts.push({ obj: t, w: t.width - bleed * 2 })
      }
    }
    this.span = parts.reduce((a, p) => a + p.w, 0) + gap * Math.max(0, parts.length - 1)
    let cursor = -this.span * (s.originX ?? 0.5)
    for (const p of parts) {
      p.obj.setX(p.obj instanceof Icon ? cursor + p.w / 2 : cursor - bleed)
      cursor += p.w + gap
      this.add(p.obj)
    }
    this.setScale(s.maxWidth !== undefined && this.span > s.maxWidth ? s.maxWidth / this.span : 1)
    return this
  }

  setInk(color: TextColor): this {
    for (const o of this.list) if (o instanceof Label) o.setInk(color)
    return this
  }
}
