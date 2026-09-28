import type Phaser from 'phaser'
import type { OutlineKind } from '../emoji/svg'
import { drawBlock } from './draw'
import { Icon } from './icon'
import { Label } from './label'
import { SHAPE, SURFACE, TONE } from './theme'
import type { Tone } from './theme'
import { Widget } from './widget'

export interface FieldRowOptions {
  /** 名字前面的图标 */
  readonly icon?: string
  readonly outline?: OutlineKind
  readonly label: string
  /** 名字后面加粗高亮的当前值 */
  readonly value?: string
  /** 名字下面的淡色说明 */
  readonly hint?: string
  /** 右侧的控件，按控件中心摆放 */
  readonly control?: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject
  /** 控件占的宽度 */
  readonly controlWidth?: number
  /** 描边改用这个色调，例如这一项有问题 */
  readonly tone?: Tone
  /** 往里缩进：跟在上一行后面的从属参数 */
  readonly indent?: number
}

const MIN_H = 68
const PAD = 12
const ICON = 36

/** 参数行：左边图标、名字、当前值与说明，右边一个控件；(x, y) 是左上角，高度随说明的行数变 */
export class FieldRow extends Widget {
  readonly rowHeight: number
  private readonly valueText?: Label
  private valueRoom = 0

  constructor(scene: Phaser.Scene, x: number, y: number, width: number, opts: FieldRowOptions) {
    super(scene, x + (opts.indent ?? 0), y)
    const w = width - (opts.indent ?? 0)
    const ctrlW = opts.control ? (opts.controlWidth ?? 200) + 20 : 0
    const left = opts.icon ? 18 + ICON + 10 : 18
    const textW = w - left - ctrlW - 12
    const name = new Label(scene, left, 0, opts.label, { kind: 'body', bold: true }).setOrigin(0, 0).fit(textW)
    const hint = opts.hint ? new Label(scene, left, 0, opts.hint, { kind: 'caption', color: 'muted', wrap: textW }) : undefined
    const nameH = name.displayHeight
    const h = Math.max(MIN_H, nameH + (hint ? hint.height + 4 : 0) + PAD * 2)
    this.rowHeight = h
    const bg = scene.add.graphics()
    drawBlock(bg, 0, 0, w, h, { face: SURFACE.raised, radius: SHAPE.radius.sm + 2, drop: 2, lineW: 2, line: opts.tone ? TONE[opts.tone].face : undefined })
    this.add(bg)
    if (opts.icon) this.add(new Icon(scene, 18 + ICON / 2, h / 2, opts.icon, ICON, opts.outline))
    const top = (h - nameH - (hint ? hint.height + 4 : 0)) / 2
    name.setY(top)
    this.add(name)
    if (opts.value !== undefined) {
      const at = left + name.displayWidth + 12
      this.valueRoom = Math.max(24, left + textW - at)
      this.valueText = new Label(scene, at, top, opts.value, { kind: 'body', bold: true, color: 'accent' }).setOrigin(0, 0).fit(this.valueRoom)
      this.add(this.valueText)
    }
    if (hint) {
      hint.setY(top + nameH + 4)
      this.add(hint)
    }
    if (opts.control) {
      opts.control.setPosition(w - 16 - (opts.controlWidth ?? 200) / 2, h / 2)
      this.add(opts.control)
    }
  }

  /** 改写名字后面的当前值，例如拖动滑杆时 */
  setValue(text: string): this {
    this.valueText?.setText(text).fit(this.valueRoom)
    return this
  }
}
