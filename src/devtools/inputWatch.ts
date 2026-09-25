import type Phaser from 'phaser'
import { COLOR } from './draw'
import { addOverlayPainter } from './overlay'
import type { OverlayCtx } from './overlay'
import type { DevItem } from './types'

let game: Phaser.Game | undefined
const keysDown = new Set<string>()
let lastKey = ''
let showPointers = false

export function installInputWatch(g: Phaser.Game): void {
  game = g
  window.addEventListener('keydown', (e) => {
    keysDown.add(e.code)
    lastKey = e.code
  })
  window.addEventListener('keyup', (e) => keysDown.delete(e.code))
  window.addEventListener('blur', () => keysDown.clear())
  addOverlayPainter(paint)
}

function pointerText(): string {
  if (!game) return ''
  const r = Math.round
  return game.input.pointers
    .map(
      (p) =>
        `#${p.id} ${p.active ? '活动' : '闲置'} ${p.isDown ? '按下' : '抬起'}  画布 ${r(p.x)},${r(p.y)}  ${p.wasTouch ? '触摸' : '鼠标'} 键位 ${p.buttons}`,
    )
    .join('\n')
}

function keyText(): string {
  const down = keysDown.size > 0 ? [...keysDown].join(' ') : '无'
  return `按下中：${down}${lastKey ? `\n最近：${lastKey}` : ''}`
}

function gamepadText(): string {
  try {
    const pads = navigator.getGamepads().filter((p): p is Gamepad => p !== null)
    if (pads.length === 0) return '未连接手柄'
    return pads
      .map((p) => {
        const pressed = p.buttons.map((b, i) => (b.pressed ? String(i) : '')).filter((s) => s !== '')
        return `${p.id.slice(0, 28)} · 按钮 ${pressed.length > 0 ? pressed.join(',') : '-'} · 轴 ${p.axes.map((a) => a.toFixed(2)).join(' ')}`
      })
      .join('\n')
  } catch {
    return '手柄 API 不可用'
  }
}

function paint(g: Phaser.GameObjects.Graphics, ctx: OverlayCtx): void {
  if (!showPointers || !game) return
  for (const p of game.input.pointers) {
    if (!p.active) continue
    const l = ctx.canvasToLocal(p.x, p.y)
    const color = p.isDown ? COLOR.warn : 0x80cbc4
    g.lineStyle(2, color, 0.9)
    g.strokeCircle(l.x, l.y, 24)
    g.lineBetween(l.x - 34, l.y, l.x + 34, l.y)
    g.lineBetween(l.x, l.y - 34, l.x, l.y + 34)
  }
}

export function inputItems(): DevItem[] {
  return [
    { kind: 'toggle', label: '显示触点', desc: '在画面上标出每个活动指针的位置', get: () => showPointers, set: (on) => (showPointers = on) },
    { kind: 'text', label: '指针', mono: true, read: pointerText },
    { kind: 'text', label: '键盘 · KeyboardEvent.code', mono: true, read: keyText },
    { kind: 'text', label: '手柄', mono: true, read: gamepadText },
  ]
}
