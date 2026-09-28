import type Phaser from 'phaser'
import { Button } from './button'
import { Label } from './label'
import { Widget } from './widget'

export interface StepperOptions {
  readonly value: number
  readonly min: number
  readonly max: number
  readonly step?: number
  /** 数值的写法 */
  readonly format?: (value: number) => string
  readonly width?: number
  readonly onChange: (value: number) => void
}

const BTN = 52

/** 加减步进：左减右加，中间是数值，到头的一边按不动；(x, y) 是中心 */
export class Stepper extends Widget {
  private readonly opts: StepperOptions
  private readonly text: Label
  private readonly less: Button
  private readonly more: Button
  private current: number

  constructor(scene: Phaser.Scene, x: number, y: number, opts: StepperOptions) {
    super(scene, x, y)
    this.opts = opts
    this.current = opts.value
    const w = opts.width ?? 220
    const step = opts.step ?? 1
    this.less = new Button(scene, -w / 2 + BTN / 2, 0, { label: '−', size: 'sm', variant: 'secondary', width: BTN, onTap: () => this.nudge(-step) })
    this.more = new Button(scene, w / 2 - BTN / 2, 0, { label: '+', size: 'sm', variant: 'secondary', width: BTN, onTap: () => this.nudge(step) })
    this.text = new Label(scene, 0, -2, '', { kind: 'body', bold: true }).setOrigin(0.5)
    this.add([this.less, this.more, this.text])
    this.refresh()
  }

  get value(): number {
    return this.current
  }

  private nudge(delta: number): void {
    const next = Math.min(this.opts.max, Math.max(this.opts.min, Number((this.current + delta).toFixed(6))))
    if (next === this.current) return
    this.current = next
    this.refresh()
    this.opts.onChange(next)
  }

  private refresh(): void {
    const w = this.opts.width ?? 220
    this.text.setText(this.opts.format?.(this.current) ?? String(this.current)).fit(w - BTN * 2 - 16)
    this.less.setEnabled(this.current > this.opts.min)
    this.more.setEnabled(this.current < this.opts.max)
  }
}
