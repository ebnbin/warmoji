import { addOverlayPainter, devFlag } from '../devtools'
import type { DevTab } from '../devtools'
import { TONE } from '../ui/theme'
import { safeInsets, viewport } from '../util/apply'
import { VIEW } from '../util/units'

const showGuides = devFlag({
  id: 'viewport.guides',
  label: '显示视口参考线',
  desc: '灰框是逻辑视口的边，蓝框是保证可用的设计区，黄框是避开刘海与导航条的安全区',
})

const r = (v: number): string => String(Math.round(v))

/** 设计区居中放在逻辑视口里，横屏 1280×720、竖屏 720×1280 */
function designBox(): { readonly x: number; readonly y: number; readonly w: number; readonly h: number } {
  const portrait = viewport.logicalHeight > viewport.logicalWidth
  const w = portrait ? VIEW.minShort : VIEW.minLong
  const h = portrait ? VIEW.minLong : VIEW.minShort
  return { x: (viewport.logicalWidth - w) / 2, y: (viewport.logicalHeight - h) / 2, w, h }
}

function viewportText(): string {
  const v = viewport
  const i = safeInsets
  const d = designBox()
  return [
    `游戏区 ${r(v.cssWidth)}×${r(v.cssHeight)} CSS 像素 · dpr ${v.dpr}`,
    `逻辑视口 ${r(v.logicalWidth)}×${r(v.logicalHeight)} · 一个逻辑像素占 ${v.fitScale.toFixed(3)} CSS 像素`,
    `设计区 ${d.w}×${d.h} · 安全区 上${r(i.top)} 右${r(i.right)} 下${r(i.bottom)} 左${r(i.left)}`,
  ].join('\n')
}

export function viewportTab(): DevTab {
  // 画布与逻辑视口重合：逻辑坐标乘 renderScale 就是画布像素
  addOverlayPainter((g, ctx) => {
    if (!showGuides()) return
    const k = viewport.renderScale
    const rect = (x: number, y: number, w: number, h: number, width: number, color: number, alpha: number): void => {
      const a = ctx.canvasToLocal(x * k, y * k)
      const b = ctx.canvasToLocal((x + w) * k, (y + h) * k)
      g.lineStyle(width, color, alpha)
      g.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y)
    }
    const i = safeInsets
    const d = designBox()
    rect(0, 0, viewport.logicalWidth, viewport.logicalHeight, 2, TONE.steel.face, 0.7)
    rect(d.x, d.y, d.w, d.h, 2, TONE.info.face, 0.8)
    rect(i.left, i.top, viewport.logicalWidth - i.left - i.right, viewport.logicalHeight - i.top - i.bottom, 2, TONE.accent.face, 0.8)
  })
  return {
    id: 'viewport',
    title: '视口',
    items: () => [{ kind: 'text', mono: true, read: viewportText }, showGuides.item],
  }
}
