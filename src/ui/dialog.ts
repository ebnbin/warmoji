import Phaser from 'phaser'
import { viewport } from '../util/apply'
import { Button } from './button'
import { hasModal, popModal, pressable, pushModal } from './gesture'
import { Label } from './label'
import { Panel, Scrim } from './panel'
import { LAYER, MOTION } from './theme'
import type { TextColor } from './theme'
import { Widget } from './widget'

export interface DialogOptions {
  readonly width: number
  readonly height: number
  readonly title?: string
  readonly titleColor?: TextColor
  /** 点遮罩或按 ESC 关闭，默认可以 */
  readonly dismissible?: boolean
  readonly autoCloseMs?: number
  readonly onClose?: () => void
  readonly depth?: number
}

/** 模态对话框：居中弹出，压暗并拦住下层；子对象用以中心为原点的局部坐标 */
export class Dialog extends Widget {
  /** 标题下方内容区的起点 y */
  readonly bodyTop: number
  readonly boxW: number
  readonly boxH: number
  private readonly scrim: Scrim
  private readonly onClose?: () => void
  private closed = false

  constructor(scene: Phaser.Scene, opts: DialogOptions) {
    super(scene, viewport.logicalWidth / 2, viewport.logicalHeight / 2)
    const { width: w, height: h } = opts
    this.boxW = w
    this.boxH = h
    this.onClose = opts.onClose
    const depth = opts.depth ?? LAYER.dialog
    const dismissible = opts.dismissible ?? true
    this.scrim = new Scrim(scene, { depth: depth - 1, onTap: dismissible ? () => this.close() : undefined })
    this.setDepth(depth)
    this.add(new Panel(scene, -w / 2, -h / 2, w, h, { variant: 'dialog' }))
    // 面板本身吃掉点按，免得穿到遮罩上把对话框关掉
    pressable(this, { shape: new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h + 8), onTap: () => undefined, sfx: null })
    this.input!.cursor = 'default'
    if (opts.title) {
      this.add(new Label(scene, 0, -h / 2 + 44, opts.title, { kind: 'title', color: opts.titleColor, shadow: true }).setOrigin(0.5))
      this.bodyTop = -h / 2 + 90
    } else {
      this.bodyTop = -h / 2 + 28
    }
    pushModal(this)
    const keyboard = scene.input.keyboard
    if (dismissible && keyboard) {
      const onEsc = (): void => {
        if (!this.closed) this.close()
      }
      keyboard.on('keydown-ESC', onEsc)
      this.once(Phaser.GameObjects.Events.DESTROY, () => keyboard.off('keydown-ESC', onEsc))
    }
    this.setScale(0.86)
    scene.tweens.add({ targets: this, scale: 1, duration: MOTION.pop, ease: 'Back.easeOut' })
    this.scrim.setAlpha(0)
    scene.tweens.add({ targets: this.scrim, alpha: 1, duration: MOTION.pop })
    if (opts.autoCloseMs !== undefined) scene.time.delayedCall(opts.autoCloseMs, () => this.close())
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    popModal(this)
    this.scrim.destroy()
    this.destroy()
    this.onClose?.()
  }
}

export interface ConfirmOptions {
  readonly title: string
  readonly message?: string
  readonly confirmLabel: string
  readonly cancelLabel?: string
  readonly danger?: boolean
  readonly onConfirm: () => void
}

/** 二次确认；已有模态层打开时不再叠一层 */
export function confirmDialog(scene: Phaser.Scene, opts: ConfirmOptions): Dialog | undefined {
  if (hasModal(scene)) return undefined
  const w = 560
  const h = opts.message ? 290 : 230
  const d = new Dialog(scene, { width: w, height: h, title: opts.title })
  if (opts.message) {
    d.add(new Label(scene, 0, d.bodyTop, opts.message, { kind: 'body', color: 'soft', align: 'center', wrap: w - 80 }).setOrigin(0.5, 0))
  }
  const y = h / 2 - 56
  d.add([
    new Button(scene, -128, y, { label: opts.cancelLabel ?? '取消', variant: 'secondary', size: 'md', width: 216, onTap: () => d.close() }),
    new Button(scene, 128, y, {
      label: opts.confirmLabel,
      variant: opts.danger ? 'danger' : 'primary',
      size: 'md',
      width: 216,
      onTap: () => {
        d.close()
        opts.onConfirm()
      },
    }),
  ])
  return d
}
