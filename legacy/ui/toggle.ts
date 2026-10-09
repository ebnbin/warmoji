import Phaser from 'phaser'
import type { SfxId } from '../types/sfx'
import { drawBlock, drawDisc } from './draw'
import { pressable } from './gesture'
import { INK, MOTION, SHAPE, SURFACE, TONE } from './theme'
import { Widget } from './widget'

export interface ToggleOptions {
  readonly value: boolean
  readonly onChange: (value: boolean) => void
  readonly sfx?: SfxId | null
}

const TRACK = { w: 84, h: 46 } as const
const KNOB = TRACK.h / 2 - 7

/** 开关；(x, y) 是中心 */
export class Switch extends Widget {
  private readonly track: Phaser.GameObjects.Graphics
  private readonly knob: Phaser.GameObjects.Graphics
  private readonly onChange: (value: boolean) => void
  private checked: boolean

  constructor(scene: Phaser.Scene, x: number, y: number, opts: ToggleOptions) {
    super(scene, x, y)
    this.checked = opts.value
    this.onChange = opts.onChange
    this.track = scene.add.graphics()
    this.knob = scene.add.graphics()
    drawDisc(this.knob, 0, 0, KNOB, { face: INK.ink, drop: 2, gloss: 0.2 })
    this.add([this.track, this.knob])
    this.paint(false)
    pressable(this, {
      shape: new Phaser.Geom.Rectangle(-TRACK.w / 2 - 6, -TRACK.h / 2 - 6, TRACK.w + 12, TRACK.h + 12),
      onTap: () => this.toggle(),
      sfx: opts.sfx,
    })
  }

  get value(): boolean {
    return this.checked
  }

  setValue(value: boolean, animate = true): this {
    this.checked = value
    this.paint(animate)
    return this
  }

  toggle(): void {
    this.setValue(!this.checked)
    this.onChange(this.checked)
  }

  private paint(animate: boolean): void {
    drawBlock(this.track.clear(), -TRACK.w / 2, -TRACK.h / 2, TRACK.w, TRACK.h, {
      face: this.checked ? TONE.accent.face : SURFACE.sunken,
      radius: TRACK.h / 2,
    })
    const x = (this.checked ? 1 : -1) * (TRACK.w / 2 - TRACK.h / 2)
    this.scene.tweens.killTweensOf(this.knob)
    if (animate) this.scene.tweens.add({ targets: this.knob, x, duration: MOTION.slide, ease: 'Cubic.easeOut' })
    else this.knob.setX(x)
  }
}

const BOX = 40

/** 复选框；(x, y) 是方框中心 */
export class Checkbox extends Widget {
  private readonly box: Phaser.GameObjects.Graphics
  private readonly onChange: (value: boolean) => void
  private checked: boolean

  constructor(scene: Phaser.Scene, x: number, y: number, opts: ToggleOptions) {
    super(scene, x, y)
    this.checked = opts.value
    this.onChange = opts.onChange
    this.box = scene.add.graphics()
    this.add(this.box)
    this.paint()
    pressable(this, {
      shape: new Phaser.Geom.Rectangle(-BOX / 2 - 8, -BOX / 2 - 8, BOX + 16, BOX + 16),
      onTap: () => this.toggle(),
      sfx: opts.sfx,
    })
  }

  get value(): boolean {
    return this.checked
  }

  setValue(value: boolean): this {
    this.checked = value
    this.paint()
    return this
  }

  toggle(): void {
    this.setValue(!this.checked)
    this.onChange(this.checked)
  }

  private paint(): void {
    const g = this.box.clear()
    const half = BOX / 2
    if (!this.checked) {
      drawBlock(g, -half, -half, BOX, BOX, { face: SURFACE.sunken, radius: SHAPE.radius.sm })
      return
    }
    drawBlock(g, -half, -half, BOX, BOX, { face: TONE.accent.face, radius: SHAPE.radius.sm, drop: 3, gloss: 0.35 })
    g.lineStyle(5, INK.dark, 1)
    g.beginPath()
    g.moveTo(-10, 0)
    g.lineTo(-3, 8)
    g.lineTo(11, -8)
    g.strokePath()
  }
}
