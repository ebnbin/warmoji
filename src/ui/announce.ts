import type Phaser from 'phaser'
import { viewport } from '../util/apply'
import { Label, RichLabel } from './label'
import { LAYER, MOTION } from './theme'
import type { TextColor } from './theme'
import { Widget } from './widget'

export interface BannerOptions {
  readonly sub?: string
  readonly color?: TextColor
  readonly holdMs?: number
}

export interface ToastOptions {
  readonly sub?: string
  readonly color?: TextColor
  readonly holdMs?: number
}

interface Toast {
  readonly box: Widget
  readonly height: number
}

const MAX_TOASTS = 3
const TOAST_GAP = 10

/** 压在战场上的播报：大横幅同时只留一条，小提示竖着排队、互不重叠 */
export class Announcer {
  private readonly scene: Phaser.Scene
  private readonly depth: number
  private current?: Widget
  private toasts: Toast[] = []

  constructor(scene: Phaser.Scene, depth: number = LAYER.toast) {
    this.scene = scene
    this.depth = depth
  }

  banner(title: string, opts: BannerOptions = {}): void {
    this.current?.destroy()
    const w = viewport.logicalWidth
    const box = new Widget(this.scene, w / 2, viewport.logicalHeight * 0.24).setDepth(this.depth + 1)
    const head = new Label(this.scene, 0, 0, title, { kind: 'banner', color: opts.color ?? 'bad', outline: true, align: 'center', wrap: w - 80 }).setOrigin(0.5)
    box.add(head)
    if (opts.sub) {
      box.add(new Label(this.scene, 0, head.height / 2 + 8, opts.sub, { kind: 'heading', color: 'accent', outline: true, align: 'center', wrap: w - 80 }).setOrigin(0.5, 0))
    }
    this.current = box
    head.setScale(0.5)
    this.scene.tweens.add({ targets: head, scale: 1, duration: 300, ease: 'Back.easeOut' })
    this.scene.tweens.add({
      targets: box,
      alpha: 0,
      delay: opts.holdMs ?? 2300,
      duration: MOTION.fade,
      onComplete: () => {
        if (this.current === box) this.current = undefined
        box.destroy()
      },
    })
  }

  toast(text: string, opts: ToastOptions = {}): void {
    const w = viewport.logicalWidth
    const box = new Widget(this.scene, w / 2, this.anchorY()).setDepth(this.depth)
    const head = new RichLabel(this.scene, 0, 0, text, { kind: 'heading', color: opts.color ?? 'ink', outline: true, originX: 0.5, maxWidth: w - 80 })
    box.add(head)
    let height = 44
    if (opts.sub) {
      const sub = new Label(this.scene, 0, 26, opts.sub, { kind: 'body', outline: true, align: 'center', wrap: w - 80 }).setOrigin(0.5, 0)
      box.add(sub)
      height = 26 + sub.height + 6
    }
    const toast: Toast = { box, height }
    this.toasts.unshift(toast)
    while (this.toasts.length > MAX_TOASTS) this.toasts.pop()?.box.destroy()
    this.relayout()
    head.setScale(0.6)
    this.scene.tweens.add({ targets: head, scale: 1, duration: MOTION.pop - 20, ease: 'Back.easeOut' })
    this.scene.tweens.add({
      targets: box,
      alpha: 0,
      delay: opts.holdMs ?? 1000,
      duration: MOTION.fade,
      onComplete: () => {
        this.toasts = this.toasts.filter((t) => t !== toast)
        box.destroy()
        this.relayout()
      },
    })
  }

  private anchorY(): number {
    return viewport.logicalHeight * 0.4
  }

  private relayout(): void {
    let y = this.anchorY()
    for (const t of this.toasts) {
      if (!t.box.active) continue
      this.scene.tweens.add({ targets: t.box, y, duration: MOTION.slide, ease: 'Cubic.easeOut' })
      y += t.height + TOAST_GAP
    }
  }
}
