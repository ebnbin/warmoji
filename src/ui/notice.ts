import Phaser from 'phaser'
import { drawBlock } from './draw'
import { pressable } from './gesture'
import { Icon } from './icon'
import { Label } from './label'
import { SHAPE, SURFACE, TONE } from './theme'
import type { Tone } from './theme'
import { Widget } from './widget'

export interface NoticeOptions {
  readonly icon: string
  /** 正文上面加粗的一行，例如出问题的位置 */
  readonly title?: string
  readonly text: string
  readonly tone?: Tone
  readonly onTap?: () => void
}

const ICON = 34
const PAD = 12

/** 提示条：色调描边的一块，左边图标，右边标题与自动换行的正文；(x, y) 是左上角，高度随正文变 */
export class Notice extends Widget {
  readonly boxHeight: number

  constructor(scene: Phaser.Scene, x: number, y: number, width: number, opts: NoticeOptions) {
    super(scene, x, y)
    const tone = TONE[opts.tone ?? 'bad']
    const left = PAD + ICON + 12
    const textW = width - left - PAD
    const title = opts.title ? new Label(scene, left, PAD, opts.title, { kind: 'label', bold: true, color: opts.tone ?? 'bad' }).setOrigin(0, 0).fit(textW) : undefined
    const top = title ? PAD + title.displayHeight + 2 : PAD
    const text = new Label(scene, left, top, opts.text, { kind: 'label', color: 'ink', wrap: textW })
    const h = Math.max(ICON + PAD * 2, top + text.height + PAD)
    this.boxHeight = h
    const bg = scene.add.graphics()
    drawBlock(bg, 0, 0, width, h, { face: SURFACE.raised, radius: SHAPE.radius.sm + 2, drop: 2, lineW: 2, line: tone.face })
    this.add([bg, new Icon(scene, PAD + ICON / 2, Math.min(h / 2, PAD + ICON / 2 + 4), opts.icon, ICON), ...(title ? [title] : []), text])
    if (opts.onTap) pressable(this, { shape: new Phaser.Geom.Rectangle(0, 0, width, h + 2), onTap: opts.onTap })
  }
}
