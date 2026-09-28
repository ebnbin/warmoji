import Phaser from 'phaser'
import type { OutlineKind } from '../emoji/svg'
import { drawBlock, drawDisc } from './draw'
import { pressable } from './gesture'
import type { Rect } from './gesture'
import { Icon } from './icon'
import { Label } from './label'
import { SHAPE, SURFACE, TONE } from './theme'
import type { TextColor, TextKind, Tone } from './theme'
import { Widget } from './widget'

export interface ChoiceLine {
  readonly text: string
  readonly color?: TextColor
}

export interface ChoiceCardOptions {
  readonly icon: string
  readonly outline?: OutlineKind
  readonly title: string
  /** 标题右边的小字，例如 Lv 1 → Lv 2 */
  readonly aside?: string
  readonly lines: readonly ChoiceLine[]
  /** 选中时描边与图标光晕的色调 */
  readonly tone: Tone
  /** 按下这些键也算点它 */
  readonly keys?: readonly string[]
  /** 出现后这段时间内不响应，防止上一页的连点落到这里 */
  readonly armMs?: number
  readonly onTap: () => void
}

const RADIUS = SHAPE.radius.md + 2
const PAD = 14
const ICON = 52
const LINE_GAP = 4

/** 一个可选项：图标与标题一行，下面几行说明；点一下选中，选中时描边与图标光晕亮起来。rect 是卡片外沿 */
export class ChoiceCard extends Widget {
  private readonly bg: Phaser.GameObjects.Graphics
  private readonly halo: Phaser.GameObjects.Graphics
  private readonly cardW: number
  private readonly cardH: number
  private readonly tone: Tone
  private selected = false
  private down = false

  constructor(scene: Phaser.Scene, rect: Rect, opts: ChoiceCardOptions) {
    super(scene, rect.x, rect.y)
    this.cardW = rect.w
    this.cardH = rect.h
    this.tone = opts.tone
    this.bg = scene.add.graphics()
    this.halo = scene.add.graphics()
    const iconY = PAD + ICON / 2
    this.add([this.bg, this.halo, new Icon(scene, PAD + ICON / 2, iconY, opts.icon, ICON, opts.outline)])
    const x0 = PAD + ICON + 12
    const right = rect.w - PAD
    const title = new Label(scene, x0, iconY, opts.title, { kind: 'heading' }).setOrigin(0, 0.5)
    this.add(title)
    let room = right - x0
    if (opts.aside) {
      const aside = new Label(scene, right, iconY, opts.aside, { kind: 'label', bold: true, color: 'accent' }).setOrigin(1, 0.5)
      this.add(aside)
      room -= aside.width + 8
    }
    title.fit(room)
    this.layLines(opts.lines, PAD + ICON + 10)
    this.paint()
    const armedAt = scene.time.now + (opts.armMs ?? 0)
    pressable(this, {
      shape: new Phaser.Geom.Rectangle(0, 0, rect.w, rect.h + SHAPE.drop),
      onTap: opts.onTap,
      onPress: (down) => {
        this.down = down
        this.paint()
      },
      enabled: () => scene.time.now >= armedAt,
      keys: opts.keys,
    })
  }

  setSelected(on: boolean): this {
    if (on === this.selected) return this
    this.selected = on
    this.paint()
    return this
  }

  /** 说明逐行排在标题下；正文字号放不下就换小一号 */
  private layLines(lines: readonly ChoiceLine[], top: number): void {
    const make = (kind: TextKind): Label[] => {
      let y = top
      return lines.map((line) => {
        const t = new Label(this.scene, PAD, y, line.text, { kind, color: line.color ?? 'soft', wrap: this.cardW - PAD * 2, spacing: 2 })
        y += t.height + LINE_GAP
        return t
      })
    }
    let labels = make('label')
    const bottom = (ls: readonly Label[]): number => Math.max(top, ...ls.map((t) => t.y + t.height))
    if (bottom(labels) > this.cardH - PAD) {
      for (const t of labels) t.destroy()
      labels = make('caption')
    }
    this.add(labels)
  }

  private paint(): void {
    const { cardW: w, cardH: h } = this
    const on = this.selected
    const face = TONE[this.tone].face
    drawBlock(this.bg.clear(), 0, 0, w, h, {
      face: this.down ? SURFACE.raisedHi : SURFACE.raised,
      radius: RADIUS,
      drop: SHAPE.drop,
      line: on ? face : undefined,
      lineW: on ? 5 : SHAPE.line,
    })
    drawDisc(this.halo.clear(), PAD + ICON / 2, PAD + ICON / 2, ICON * 0.62, { face: on ? face : SURFACE.raisedHi, faceAlpha: on ? 0.3 : 1, line: null })
  }
}
