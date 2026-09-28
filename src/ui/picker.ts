import Phaser from 'phaser'
import type { OutlineKind } from '../emoji/svg'
import { viewport } from '../util/apply'
import { Dialog, DIALOG_HEAD } from './dialog'
import { drawBlock } from './draw'
import { hasModal, pressable } from './gesture'
import { Icon } from './icon'
import { Label } from './label'
import { SHAPE, SURFACE, TONE } from './theme'
import { Widget } from './widget'

export interface PickItem<K> {
  readonly key: K
  readonly emoji: string
  readonly outline?: OutlineKind
  readonly label: string
}

export interface PickerOptions<K> {
  readonly title: string
  readonly items: readonly PickItem<K>[]
  readonly selected?: K
  readonly onPick: (key: K) => void
}

const TILE = { w: 112, h: 122 } as const
const GAP = 12
/** 放得下标题的最窄宽度 */
const MIN_W = 420

/** 一格：图标在上、名字在下，选中的一格描边高亮 */
class PickTile extends Widget {
  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, item: PickItem<unknown>, chosen: boolean, onTap: () => void) {
    super(scene, x, y)
    const bg = scene.add.graphics()
    drawBlock(bg, -w / 2, -h / 2, w, h, {
      face: chosen ? SURFACE.raisedHi : SURFACE.raised,
      line: chosen ? TONE.accent.face : undefined,
      lineW: chosen ? 4 : SHAPE.line,
      drop: chosen ? SHAPE.drop : 3,
      radius: SHAPE.radius.md,
    })
    const icon = Math.round(Math.min(w, h) * 0.52)
    this.add([
      bg,
      new Icon(scene, 0, -h / 2 + 10 + icon / 2, item.emoji, icon, item.outline),
      new Label(scene, 0, h / 2 - 20, item.label, { kind: 'caption', bold: true, color: chosen ? 'accent' : 'ink' }).setOrigin(0.5).fit(w - 10),
    ])
    pressable(this, { shape: new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h + 3), onTap })
  }
}

/** 弹出选择：对话框里一格一项，放不下就把格子缩小，对话框随格子收拢；点一项就选定并关上。已有模态层打开时不再叠一层 */
export function openPicker<K>(scene: Phaser.Scene, opts: PickerOptions<K>): Dialog | undefined {
  if (hasModal(scene)) return undefined
  const portrait = viewport.logicalHeight > viewport.logicalWidth
  const maxW = Math.min(portrait ? 680 : 1100, viewport.logicalWidth - 40)
  const maxH = Math.min(portrait ? 1120 : 660, viewport.logicalHeight - 40)
  const areaW = maxW - 56
  const areaH = maxH - DIALOG_HEAD - 28
  const n = opts.items.length
  let scale = 1
  let cols = 1
  let rows = n
  for (; scale > 0.5; scale -= 0.05) {
    cols = Math.max(1, Math.floor((areaW + GAP) / (TILE.w * scale + GAP)))
    rows = Math.ceil(n / cols)
    if (rows * (TILE.h * scale + GAP) - GAP <= areaH) break
  }
  const tw = TILE.w * scale
  const th = TILE.h * scale
  const used = Math.min(n, cols) * (tw + GAP) - GAP
  const d = new Dialog(scene, { width: Math.max(MIN_W, used + 56), height: Math.min(maxH, DIALOG_HEAD + rows * (th + GAP) - GAP + 28), title: opts.title })
  opts.items.forEach((item, i) => {
    const x = -used / 2 + (i % cols) * (tw + GAP) + tw / 2
    const y = d.bodyTop + Math.floor(i / cols) * (th + GAP) + th / 2
    d.add(
      new PickTile(scene, x, y, tw, th, item, item.key === opts.selected, () => {
        d.close()
        opts.onPick(item.key)
      }),
    )
  })
  return d
}
