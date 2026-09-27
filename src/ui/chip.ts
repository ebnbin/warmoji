import type Phaser from 'phaser'
import type { OutlineKind } from '../emoji/svg'
import { drawBlock } from './draw'
import { Icon } from './icon'
import { Label } from './label'
import { SURFACE, TONE } from './theme'
import type { TextColor, Tone } from './theme'
import { Widget } from './widget'

export interface ChipOptions {
  readonly tone?: Tone
  readonly size?: 'sm' | 'md'
  /** 横向锚点：0 左、0.5 中、1 右；纵向以 y 为中线 */
  readonly originX?: number
}

const CHIP = { sm: { h: 30, kind: 'caption' }, md: { h: 36, kind: 'label' } } as const

/** 实心小标签：分类、稀有度、身份 */
export class Chip extends Widget {
  private readonly bg: Phaser.GameObjects.Graphics
  private readonly caption: Label
  private readonly opts: ChipOptions
  private tone: Tone
  private chipW = 0

  constructor(scene: Phaser.Scene, x: number, y: number, text: string, opts: ChipOptions = {}) {
    super(scene, x, y)
    this.opts = opts
    this.tone = opts.tone ?? 'accent'
    const size = CHIP[opts.size ?? 'sm']
    this.bg = scene.add.graphics()
    this.caption = new Label(scene, 0, 0, text, { kind: size.kind, bold: true }).setOrigin(0.5)
    this.add([this.bg, this.caption])
    this.layout()
  }

  get chipWidth(): number {
    return this.chipW
  }

  setText(text: string): this {
    this.caption.setText(text)
    this.layout()
    return this
  }

  setTone(tone: Tone): this {
    this.tone = tone
    this.layout()
    return this
  }

  private layout(): void {
    const h = CHIP[this.opts.size ?? 'sm'].h
    this.chipW = Math.round(this.caption.width + h * 0.8)
    const left = -this.chipW * (this.opts.originX ?? 0.5)
    const spec = TONE[this.tone]
    drawBlock(this.bg.clear(), left, -h / 2, this.chipW, h, { face: spec.face, radius: h / 2, lineW: 2 })
    this.caption.setX(left + this.chipW / 2).setInk(spec.on)
  }
}

export interface PillOptions {
  readonly icon?: string
  readonly outline?: OutlineKind
  readonly text: string
  readonly color?: TextColor
  readonly size?: 'md' | 'lg'
  /** 横向锚点：0 左、0.5 中、1 右；纵向以 y 为中线 */
  readonly originX?: number
}

const PILL = { md: { h: 42, kind: 'body' }, lg: { h: 50, kind: 'heading' } } as const

/** 深色计数胶囊：图标压在左端，数值加粗 */
export class Pill extends Widget {
  private readonly bg: Phaser.GameObjects.Graphics
  private readonly caption: Label
  private readonly icon?: Icon
  private readonly opts: PillOptions

  constructor(scene: Phaser.Scene, x: number, y: number, opts: PillOptions) {
    super(scene, x, y)
    this.opts = opts
    const size = PILL[opts.size ?? 'md']
    this.bg = scene.add.graphics()
    this.caption = new Label(scene, 0, 0, opts.text, { kind: size.kind, bold: true, color: opts.color }).setOrigin(0, 0.5)
    this.add([this.bg, this.caption])
    if (opts.icon) {
      this.icon = new Icon(scene, 0, 0, opts.icon, Math.round(size.h * 0.95), opts.outline)
      this.add(this.icon)
    }
    this.layout()
  }

  setText(text: string): this {
    if (text === this.caption.text) return this
    this.caption.setText(text)
    this.layout()
    return this
  }

  setInk(color: TextColor): this {
    this.caption.setInk(color)
    return this
  }

  private layout(): void {
    const h = PILL[this.opts.size ?? 'md'].h
    const pad = Math.round(h * 0.4)
    const lead = this.icon ? Math.round(h * 0.95) + 6 : pad
    const w = Math.round(lead + this.caption.width + pad)
    const left = -w * (this.opts.originX ?? 0.5)
    drawBlock(this.bg.clear(), left, -h / 2, w, h, { face: SURFACE.bg, radius: h / 2, drop: 3 })
    this.icon?.setPosition(left + (lead - 6) / 2, -1)
    this.caption.setX(left + lead)
  }
}
