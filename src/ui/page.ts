import type Phaser from 'phaser'
import { applyCamera, safeInsets, viewport } from '../util/apply'
import { Button, IconButton } from './button'
import { hasModal } from './gesture'
import type { Rect } from './gesture'
import { RichLabel } from './label'
import { css, SURFACE } from './theme'
import type { TextColor } from './theme'

/** 进入一个界面页：相机对准逻辑坐标，页面底色 */
export function beginPage(scene: Phaser.Scene): void {
  applyCamera(scene)
  const bg = css(SURFACE.bg)
  document.body.style.background = bg
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg)
}

export interface FrameOptions {
  /** 标题下还有一行副标题或页签 */
  readonly sub?: boolean
  /** 底部有主按钮 */
  readonly footer?: boolean
  /** 竖屏时详情区加高 */
  readonly tallDetail?: boolean
}

/** 所有界面页共用的版式：标题、副标题、主体、底部主按钮的位置在各页一致 */
export interface PageFrame {
  readonly portrait: boolean
  /** 1280×720 或 720×1280 的版心，居中 */
  readonly content: Rect
  readonly centerX: number
  readonly headerY: number
  readonly subY: number
  readonly bodyTop: number
  readonly bodyBottom: number
  /** 左详情右列表（竖屏上下排） */
  readonly detail: Rect
  readonly list: Rect
  /** 居中的单栏 */
  readonly column: Rect
  readonly footerY: number
  /** 头部左右按钮可用的最外侧 x，已避开安全区 */
  readonly left: number
  readonly right: number
}

export function pageFrame(opts: FrameOptions = {}): PageFrame {
  const W = viewport.logicalWidth
  const H = viewport.logicalHeight
  const portrait = H > W
  const cw = portrait ? 720 : 1280
  const ch = portrait ? 1280 : 720
  const cx = (W - cw) / 2
  const cy = (H - ch) / 2
  const margin = portrait ? 24 : 40
  const footerY = cy + (portrait ? 1196 : 662)
  const bodyTop = cy + (opts.sub ? (portrait ? 168 : 140) : portrait ? 108 : 96)
  const bodyBottom = opts.footer ? footerY - (portrait ? 60 : 58) : cy + ch - (portrait ? 30 : 32)
  let detail: Rect
  let list: Rect
  if (portrait) {
    const dh = opts.tallDetail ? 640 : 460
    detail = { x: cx + margin, y: bodyTop, w: cw - margin * 2, h: dh }
    const ly = bodyTop + dh + 28
    list = { x: cx + margin, y: ly, w: cw - margin * 2, h: bodyBottom - ly }
  } else {
    detail = { x: cx + margin, y: bodyTop, w: 730, h: bodyBottom - bodyTop }
    list = { x: cx + margin + 770, y: bodyTop, w: cw - margin * 2 - 770, h: bodyBottom - bodyTop }
  }
  const colW = portrait ? cw - margin * 2 : 680
  return {
    portrait,
    content: { x: cx, y: cy, w: cw, h: ch },
    centerX: W / 2,
    headerY: cy + (portrait ? 56 : 44),
    subY: cy + (portrait ? 122 : 96),
    bodyTop,
    bodyBottom,
    detail,
    list,
    column: { x: (W - colW) / 2, y: bodyTop, w: colW, h: bodyBottom - bodyTop },
    footerY,
    left: Math.max(cx + margin, safeInsets.left + 24),
    right: Math.min(cx + cw - margin, W - safeInsets.right - 24),
  }
}

export interface PageHeaderOptions {
  /** 可含 {emoji} 占位 */
  readonly title: string
  /** 左上角“返回”，ESC 同效 */
  readonly back?: () => void
  /** 右上角的暂停键，ESC 同效 */
  readonly pause?: () => void
  /** 标题下一行，可含 {emoji} 占位 */
  readonly sub?: string
  readonly subColor?: TextColor
}

const HEAD_BTN_W = 132
/** 暂停键与战斗 HUD 上的一样大 */
const PAUSE_SIZE = 56

/** 页头：左侧返回或右侧暂停，居中标题，可选副标题 */
export class PageHeader {
  readonly title: RichLabel
  readonly sub?: RichLabel

  constructor(scene: Phaser.Scene, frame: PageFrame, opts: PageHeaderOptions) {
    const { back, pause } = opts
    if (back) {
      new Button(scene, frame.left + HEAD_BTN_W / 2, frame.headerY, { label: '‹ 返回', size: 'sm', variant: 'secondary', width: HEAD_BTN_W, onTap: back })
    }
    if (pause) new IconButton(scene, frame.right - PAUSE_SIZE / 2, frame.headerY, { glyph: 'pause', size: PAUSE_SIZE, onTap: pause })
    const leave = back ?? pause
    if (leave) {
      scene.input.keyboard?.on('keydown-ESC', () => {
        if (!hasModal(scene)) leave()
      })
    }
    const room = (frame.right - frame.left) / 2 - HEAD_BTN_W - 24
    this.title = new RichLabel(scene, frame.centerX, frame.headerY, opts.title, { kind: 'title', shadow: true, originX: 0.5, maxWidth: room * 2 })
    if (opts.sub !== undefined) {
      this.sub = new RichLabel(scene, frame.centerX, frame.subY, opts.sub, { kind: 'body', bold: true, color: opts.subColor ?? 'info', originX: 0.5, maxWidth: frame.right - frame.left })
    }
  }

  setSub(text: string): void {
    this.sub?.setContent(text)
  }
}
