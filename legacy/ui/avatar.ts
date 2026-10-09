import Phaser from 'phaser'
import type { OutlineKind } from '../emoji/outline'
import { pressable } from './gesture'
import { Icon } from './icon'
import { INK, SURFACE, TONE } from './theme'
import { Widget } from './widget'

/** member 已在队，picked 本次选中，empty 待补的空位 */
export type SlotMode = 'member' | 'picked' | 'empty'

export interface AvatarSlotOptions {
  readonly emoji?: string
  readonly outline?: OutlineKind
  readonly mode: SlotMode
  readonly onTap?: () => void
}

/** 队伍预览里的一个位置；(x, y) 是中心 */
export class AvatarSlot extends Widget {
  constructor(scene: Phaser.Scene, x: number, y: number, size: number, opts: AvatarSlotOptions) {
    super(scene, x, y)
    const g = scene.add.graphics()
    this.add(g)
    const r = size / 2 + 5
    if (opts.mode === 'empty') {
      const dashes = 12
      g.lineStyle(3, INK.muted, 0.6)
      for (let i = 0; i < dashes; i++) {
        const a0 = (i / dashes) * Math.PI * 2
        g.beginPath()
        g.arc(0, 0, r, a0, a0 + ((Math.PI * 2) / dashes) * 0.55)
        g.strokePath()
      }
      const arm = Math.max(6, size * 0.16)
      g.lineStyle(4, INK.muted, 0.6)
      g.lineBetween(-arm, 0, arm, 0)
      g.lineBetween(0, -arm, 0, arm)
    } else {
      if (opts.mode === 'picked') {
        g.lineStyle(8, SURFACE.outline, 1)
        g.strokeCircle(0, 0, r)
        g.lineStyle(4, TONE.accent.face, 1)
        g.strokeCircle(0, 0, r)
      }
      if (opts.emoji) this.add(new Icon(scene, 0, 0, opts.emoji, size, opts.outline))
    }
    if (opts.onTap) pressable(this, { shape: new Phaser.Geom.Circle(0, 0, r + 4), onTap: opts.onTap })
  }
}
