import type Phaser from 'phaser'
import { useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent, ReactNode } from 'react'
import { devConfig } from '../config'
import { setPanelOpen } from '../dock'
import type { DevSize } from '../dock'
import { unreadErrorCount } from '../log'
import { devSettings, updateDevSettings } from '../settings'
import { timeScale } from '../timeControl'
import { keepFocus } from './items'
import { useLive } from './live'

const HEIGHT = 28
const MARGIN = 12
const DRAG_SLOP = 12

interface Insets {
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
}

/** 刘海与导航条的避让只有 CSS 的 env() 取得到 */
function safeArea(): Insets {
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'
  document.body.appendChild(probe)
  const cs = getComputedStyle(probe)
  const px = (v: string): number => parseFloat(v) || 0
  const out = { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) }
  probe.remove()
  return out
}

interface Drag {
  readonly id: number
  readonly x: number
  readonly y: number
  readonly w: number
  moved: boolean
}

/** 面板收起时悬在游戏上的胶囊：点一下展开，拖到左右两侧停靠 */
export function Pill({ game, win }: { readonly game: Phaser.Game; readonly win: DevSize }): ReactNode {
  const s = devSettings()
  const label = useLive(() => {
    const scale = timeScale()
    const tag = scale === 0 ? '暂停' : scale === 1 ? '' : `×${scale}`
    const body = devSettings().pillFps ? `${Math.round(game.loop.actualFps)} fps` : 'dev'
    return tag ? `${tag} ${body}` : body
  })
  const altered = useLive(() => timeScale() !== 1)
  const unread = useLive(unreadErrorCount)
  const safe = useMemo(() => safeArea(), [win.w, win.h])
  const drag = useRef<Drag | null>(null)
  const [at, setAt] = useState<{ readonly x: number; readonly y: number } | null>(null)
  const usable = Math.max(0, win.h - safe.top - safe.bottom - HEIGHT - MARGIN * 2)
  const place = (e: PointerEvent, d: Drag): { readonly x: number; readonly y: number } => ({
    x: Math.min(win.w - safe.right - MARGIN - d.w, Math.max(safe.left + MARGIN, e.clientX - d.w / 2)),
    y: Math.min(win.h - safe.bottom - MARGIN - HEIGHT, Math.max(safe.top + MARGIN, e.clientY - HEIGHT / 2)),
  })
  const top = safe.top + MARGIN + s.y * usable
  const style: CSSProperties = at
    ? { left: at.x, top: at.y }
    : s.side === 'right'
      ? { right: safe.right + MARGIN, top }
      : { left: safe.left + MARGIN, top }
  return (
    <button
      className={altered ? 'dt-pill altered' : 'dt-pill'}
      style={style}
      onMouseDown={keepFocus}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, w: e.currentTarget.offsetWidth, moved: false }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d || d.id !== e.pointerId) return
        if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) <= DRAG_SLOP) return
        d.moved = true
        setAt(place(e, d))
      }}
      onPointerUp={(e) => {
        const d = drag.current
        drag.current = null
        if (!d || d.id !== e.pointerId) return
        if (!d.moved) {
          devConfig().onTap()
          setPanelOpen(true)
          return
        }
        const p = place(e, d)
        setAt(null)
        updateDevSettings({
          side: p.x + d.w / 2 < win.w / 2 ? 'left' : 'right',
          y: usable > 0 ? Math.min(1, Math.max(0, (p.y - safe.top - MARGIN) / usable)) : 1,
        })
      }}
      onPointerCancel={() => {
        drag.current = null
        setAt(null)
      }}
    >
      {label}
      {unread > 0 && <span className="dt-badge">{unread > 99 ? '99+' : unread}</span>}
    </button>
  )
}
