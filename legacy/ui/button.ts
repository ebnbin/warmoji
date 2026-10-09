import Phaser from 'phaser'
import type { SfxId } from '../types/sfx'
import { drawBlock, drawDisc } from './draw'
import { pressable } from './gesture'
import { Icon } from './icon'
import { RichLabel } from './label'
import { INK, SHAPE, SURFACE, TONE } from './theme'
import type { TextKind, Tone } from './theme'
import { Widget } from './widget'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'good'
export type ButtonSize = 'lg' | 'md' | 'sm'

const DIMS: Readonly<Record<ButtonSize, { readonly h: number; readonly w: number; readonly kind: TextKind; readonly radius: number }>> = {
  lg: { h: 72, w: 340, kind: 'lead', radius: 20 },
  md: { h: 58, w: 240, kind: 'heading', radius: 16 },
  sm: { h: 50, w: 150, kind: 'body', radius: 14 },
}

const VARIANT_TONE: Readonly<Record<ButtonVariant, Tone>> = {
  primary: 'accent',
  secondary: 'steel',
  danger: 'bad',
  good: 'good',
}

/** 按下时按钮面下沉的距离 */
const SINK = SHAPE.drop - 1

export interface ButtonOptions {
  /** 可含 {emoji} 占位 */
  readonly label: string
  readonly onTap: () => void
  readonly variant?: ButtonVariant
  readonly size?: ButtonSize
  readonly width?: number
  readonly keys?: readonly string[]
  readonly sfx?: SfxId | null
  readonly enabled?: boolean
  /** 呼吸缩放，吸引注意 */
  readonly pulse?: boolean
  /** 出现后这段时间内不响应，防止上一页的连点落到这里 */
  readonly armMs?: number
}

/** 卡通描边按钮；(x, y) 是按钮面的中心 */
export class Button extends Widget {
  private readonly bg: Phaser.GameObjects.Graphics
  private readonly caption: RichLabel
  private readonly dims: (typeof DIMS)[ButtonSize]
  private readonly bw: number
  private variant: ButtonVariant
  private usable: boolean
  private down = false

  constructor(scene: Phaser.Scene, x: number, y: number, opts: ButtonOptions) {
    super(scene, x, y)
    this.dims = DIMS[opts.size ?? 'lg']
    this.bw = opts.width ?? this.dims.w
    this.variant = opts.variant ?? 'primary'
    this.usable = opts.enabled ?? true
    this.bg = scene.add.graphics()
    this.caption = new RichLabel(scene, 0, 0, opts.label, { kind: this.dims.kind, bold: true, originX: 0.5, maxWidth: this.bw - 28 })
    this.add([this.bg, this.caption])
    this.redraw()
    const h = this.dims.h
    const armedAt = scene.time.now + (opts.armMs ?? 0)
    pressable(this, {
      shape: new Phaser.Geom.Rectangle(-this.bw / 2, -h / 2, this.bw, h + SHAPE.drop),
      onTap: opts.onTap,
      onPress: (down) => {
        this.down = down
        this.redraw()
      },
      enabled: () => this.usable && scene.time.now >= armedAt,
      sfx: opts.sfx,
      keys: opts.keys,
    })
    if (opts.pulse) {
      scene.tweens.add({ targets: this, scale: 1.04, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
    }
  }

  get enabled(): boolean {
    return this.usable
  }

  setLabel(label: string): this {
    this.caption.setContent(label)
    this.redraw()
    return this
  }

  setEnabled(on: boolean): this {
    if (on === this.usable) return this
    this.usable = on
    this.down = false
    this.redraw()
    return this
  }

  setVariant(variant: ButtonVariant): this {
    this.variant = variant
    this.redraw()
    return this
  }

  private redraw(): void {
    const { h, radius } = this.dims
    const w = this.bw
    const g = this.bg.clear()
    if (!this.usable) {
      drawBlock(g, -w / 2, -h / 2 + SINK - 2, w, h, { face: SURFACE.raisedHi, radius, drop: 2 })
      this.caption.setY(SINK - 2).setInk('faint')
      return
    }
    const tone = TONE[VARIANT_TONE[this.variant]]
    const sink = this.down ? SINK : 0
    drawBlock(g, -w / 2, -h / 2 + sink, w, h, {
      face: tone.face,
      lip: tone.lip,
      drop: SHAPE.drop - sink,
      radius,
      gloss: this.variant === 'primary' ? 0.4 : 0.22,
    })
    this.caption.setY(sink - SHAPE.lip / 2).setInk(tone.on)
  }
}

export interface IconButtonOptions {
  /** emoji；和 glyph 二选一 */
  readonly icon?: string
  /** 画出来的符号：暂停、展开（朝右）、收起（朝下） */
  readonly glyph?: 'pause' | 'expand' | 'collapse'
  /** 直径 */
  readonly size?: number
  readonly variant?: 'light' | 'dark'
  readonly onTap: () => void
  readonly keys?: readonly string[]
  readonly sfx?: SfxId | null
}

/** 圆形图标按钮；(x, y) 是圆心 */
export class IconButton extends Widget {
  private readonly bg: Phaser.GameObjects.Graphics
  private readonly face: Phaser.GameObjects.Container
  private readonly opts: IconButtonOptions
  private readonly radius: number
  private down = false

  constructor(scene: Phaser.Scene, x: number, y: number, opts: IconButtonOptions) {
    super(scene, x, y)
    this.opts = opts
    const size = opts.size ?? 64
    this.radius = size / 2
    this.bg = scene.add.graphics()
    this.face = scene.add.container(0, 0)
    if (opts.icon) {
      this.face.add(new Icon(scene, 0, 0, opts.icon, Math.round(size * 0.6)))
    } else if (opts.glyph) {
      const g = scene.add.graphics().fillStyle(opts.variant === 'dark' ? INK.ink : INK.dark, 1)
      const u = size * 0.19
      if (opts.glyph === 'pause') {
        const bw = Math.round(size * 0.13)
        const bh = Math.round(size * 0.38)
        g.fillRoundedRect(-bw * 1.4, -bh / 2, bw, bh, bw / 2)
        g.fillRoundedRect(bw * 0.4, -bh / 2, bw, bh, bw / 2)
      } else if (opts.glyph === 'expand') {
        g.fillTriangle(-u * 0.6, -u, -u * 0.6, u, u, 0)
      } else {
        g.fillTriangle(-u, -u * 0.6, u, -u * 0.6, 0, u)
      }
      this.face.add(g)
    }
    this.add([this.bg, this.face])
    this.redraw()
    pressable(this, {
      shape: new Phaser.Geom.Circle(0, SHAPE.drop / 2, this.radius + 4),
      onTap: opts.onTap,
      onPress: (down) => {
        this.down = down
        this.redraw()
      },
      sfx: opts.sfx,
      keys: opts.keys,
    })
  }

  private redraw(): void {
    const sink = this.down ? SHAPE.drop - 1 : 0
    const face = this.opts.variant === 'dark' ? SURFACE.raisedHi : INK.ink
    drawDisc(this.bg.clear(), 0, sink, this.radius, { face, drop: SHAPE.drop - 1 - sink, gloss: 0.18 })
    this.face.setY(sink)
  }
}
