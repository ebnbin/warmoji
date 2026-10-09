import type Phaser from 'phaser'
import type { OutlineKind } from '../emoji/outline'
import { Icon } from './icon'
import { Label, RichLabel } from './label'
import type { ScrollView } from './scrollView'
import type { TextColor, TextKind } from './theme'

type Target = ScrollView | Phaser.GameObjects.Container

const HEAD_ICON = 34
const HEAD_GAP = 10

/** 自上而下的图文排版：分节标题、段落、图标行；正文与标题文字左对齐 */
export class Flow {
  y: number

  private readonly scene: Phaser.Scene
  private readonly target: Target
  private readonly x: number
  private readonly width: number

  constructor(scene: Phaser.Scene, target: Target, opts: { readonly x?: number; readonly y?: number; readonly width: number }) {
    this.scene = scene
    this.target = target
    this.x = opts.x ?? 24
    this.y = opts.y ?? 0
    this.width = opts.width
  }

  /** 正文的左边距 */
  get indent(): number {
    return this.x + HEAD_ICON + HEAD_GAP
  }

  heading(title: string, icon?: string, color?: TextColor): this {
    const content = icon ? `{${icon}} ${title}` : title
    this.put(new RichLabel(this.scene, this.x, this.y + 18, content, { kind: 'heading', color, iconSize: HEAD_ICON, gap: HEAD_GAP - 6, originX: 0, maxWidth: this.width }))
    this.y += 44
    return this
  }

  text(text: string, opts: { readonly color?: TextColor; readonly kind?: TextKind; readonly indent?: boolean; readonly bold?: boolean } = {}): this {
    const left = opts.indent === false ? this.x : this.indent
    const t = new Label(this.scene, left, this.y, text, {
      kind: opts.kind ?? 'body',
      color: opts.color ?? 'soft',
      bold: opts.bold,
      wrap: this.x + this.width - left,
    })
    this.put(t)
    this.y += Math.max(34, t.height + 8)
    return this
  }

  icons(ids: readonly string[], opts: { readonly size?: number; readonly outline?: OutlineKind } = {}): this {
    const size = opts.size ?? 44
    const pitch = size + 4
    const perRow = Math.max(1, Math.floor((this.x + this.width - this.indent) / pitch))
    ids.forEach((id, i) => {
      if (i > 0 && i % perRow === 0) this.y += pitch
      this.put(new Icon(this.scene, this.indent + (i % perRow) * pitch + size / 2, this.y + size / 2, id, size, opts.outline))
    })
    if (ids.length > 0) this.y += pitch + 4
    return this
  }

  gap(h: number): this {
    this.y += h
    return this
  }

  /** 任意对象放在当前位置之后前进 height */
  put(obj: Phaser.GameObjects.GameObject, height = 0): this {
    this.target.add(obj)
    this.y += height
    return this
  }

  /** 收尾：滚动区设好内容高度，返回总高 */
  finish(pad = 12): number {
    const total = this.y + pad
    if ('setContentSize' in this.target) this.target.setContentSize(total)
    return total
  }
}
