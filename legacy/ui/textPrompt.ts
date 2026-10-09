import Phaser from 'phaser'
import { viewport } from '../util/apply'
import { Button } from './button'
import { Dialog } from './dialog'
import { hasModal } from './gesture'
import { Label } from './label'
import { css, FONT_FAMILY, INK, MOTION, SHAPE, SURFACE, TEXT, TONE } from './theme'

export interface TextPromptOptions {
  readonly title: string
  readonly value: string
  /** 输入框下面的淡色说明 */
  readonly hint?: string
  /** 输入框有几行高：长文字给多行，回车照样是交上来 */
  readonly lines?: number
  /** 弹出数字键盘 */
  readonly numeric?: boolean
  /** 写的能不能用：不能用就返回为什么，对话框不关 */
  readonly check?: (text: string) => string | undefined
  /** 交上来的文字，去掉了首尾空白 */
  readonly onDone: (text: string) => void
}

const SIDE = 32
const BOX_PAD = 12
const LINE = TEXT.body.size * 1.45

/** 输入一段文字：对话框里叠一个网页输入框，回车或点确定交上来，ESC 或点取消作罢；已有模态层打开时不再叠一层 */
export function openTextPrompt(scene: Phaser.Scene, opts: TextPromptOptions): Dialog | undefined {
  if (hasModal(scene)) return undefined
  const lines = opts.lines ?? 1
  const w = Math.min(860, viewport.logicalWidth - 40)
  const boxH = Math.round(lines * LINE + BOX_PAD * 2)
  const noteH = 64
  const h = 90 + boxH + noteH + 96
  const d = new Dialog(scene, { width: w, height: h, title: opts.title })
  const boxTop = d.bodyTop
  const note = new Label(scene, -w / 2 + SIDE, boxTop + boxH + 12, opts.hint ?? '', { kind: 'caption', color: 'muted', wrap: w - SIDE * 2 })
  d.add(note)

  const el = document.createElement(lines > 1 ? 'textarea' : 'input')
  el.value = opts.value
  if (el instanceof HTMLInputElement) {
    el.type = 'text'
    if (opts.numeric) el.inputMode = 'decimal'
  }
  el.spellcheck = false
  el.autocomplete = 'off'

  /** 对话框里输入框那一块在网页上的位置：画布按逻辑尺寸等比缩放 */
  const place = (): void => {
    const rect = scene.game.canvas.getBoundingClientRect()
    const k = rect.width / viewport.logicalWidth
    const s = el.style
    s.left = `${rect.left + (viewport.logicalWidth / 2 - w / 2 + SIDE) * k}px`
    s.top = `${rect.top + (viewport.logicalHeight / 2 + boxTop) * k}px`
    s.width = `${(w - SIDE * 2) * k}px`
    s.height = `${boxH * k}px`
    s.fontSize = `${TEXT.body.size * k}px`
    s.lineHeight = `${LINE * k}px`
    s.padding = `${BOX_PAD * k}px`
    s.borderWidth = `${SHAPE.line * k}px`
    s.borderRadius = `${SHAPE.radius.sm * k}px`
  }
  Object.assign(el.style, {
    position: 'fixed',
    zIndex: '10',
    boxSizing: 'border-box',
    margin: '0',
    borderStyle: 'solid',
    borderColor: css(TONE.accent.face),
    background: css(SURFACE.sunken),
    color: css(INK.ink),
    fontFamily: FONT_FAMILY,
    outline: 'none',
    resize: 'none',
    opacity: '0',
    transition: `opacity ${MOTION.pop}ms`,
  })
  place()
  document.body.appendChild(el)
  requestAnimationFrame(() => (el.style.opacity = '1'))

  const done = (): void => {
    const text = el.value.trim()
    const why = opts.check?.(text)
    if (why !== undefined) {
      note.setText(why).setColor(css(TONE.bad.text))
      return
    }
    d.close()
    opts.onDone(text)
  }
  // 输入框里按的键不交给游戏：游戏在窗口上听键盘
  const keys = (e: KeyboardEvent): void => {
    e.stopPropagation()
    if (e.type !== 'keydown') return
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault()
      done()
    } else if (e.key === 'Escape') {
      d.close()
    }
  }
  const box: HTMLElement = el
  box.addEventListener('keydown', keys)
  box.addEventListener('keyup', keys)
  box.addEventListener('keypress', keys)
  window.addEventListener('resize', place)
  d.once(Phaser.GameObjects.Events.DESTROY, () => {
    window.removeEventListener('resize', place)
    el.remove()
  })

  const y = h / 2 - 56
  d.add([
    new Button(scene, -128, y, { label: '取消', variant: 'secondary', size: 'md', width: 216, onTap: () => d.close() }),
    new Button(scene, 128, y, { label: '确定', variant: 'primary', size: 'md', width: 216, onTap: done }),
  ])
  el.focus()
  el.select()
  return d
}
