import Phaser from 'phaser'
import { devConfig } from './config'
import { devSettings, updateDevSettings } from './settings'
import type { DevMode } from './settings'

export interface DevSize {
  readonly w: number
  readonly h: number
}

/** 窗口横着时停在右边，竖着时停在下边 */
export type DockEdge = 'right' | 'bottom'

export interface DockState {
  readonly win: DevSize
  readonly edge: DockEdge
  /** 停靠的面板占掉的宽或高；没停靠时为 0 */
  readonly size: number
}

export const DOCK_CHANGED = 'changed'
export const dockEvents = new Phaser.Events.EventEmitter()

/** 停靠时面板至少这么宽或高，游戏区至少留下窗口的这一成 */
const MIN_PANEL = 200
const MIN_GAME = 0.3
/** 没拖过时：横着取 440 像素与窗口宽的四成中较小的，竖着取窗口高的四成半 */
const AUTO_W = 440
const AUTO_W_FRAC = 0.4
const AUTO_H_FRAC = 0.45

let state: DockState = { win: { w: window.innerWidth, h: window.innerHeight }, edge: 'right', size: 0 }

export function dockState(): DockState {
  return state
}

export function dockEdge(win: DevSize): DockEdge {
  return win.w >= win.h ? 'right' : 'bottom'
}

export function dockRange(win: DevSize, edge: DockEdge): { readonly min: number; readonly max: number } {
  const max = Math.max(0, (edge === 'right' ? win.w : win.h) * (1 - MIN_GAME))
  return { min: Math.min(MIN_PANEL, max), max }
}

/** 拖过就按拖的；没拖过按窗口算，并且不把游戏区挤得横竖翻转 */
function dockSize(win: DevSize, edge: DockEdge): number {
  const s = devSettings()
  const axis = edge === 'right' ? win.w : win.h
  const cross = edge === 'right' ? win.h : win.w
  const chosen = edge === 'right' ? s.dockW : s.dockH
  const auto = Math.min(edge === 'right' ? Math.min(AUTO_W, axis * AUTO_W_FRAC) : axis * AUTO_H_FRAC, Math.max(MIN_PANEL, axis - cross))
  const r = dockRange(win, edge)
  return Math.round(Math.min(r.max, Math.max(r.min, chosen ?? auto)))
}

/** 宿主排版时调用：按面板的状态从窗口里切出游戏区，游戏区贴着左上角 */
export function layoutDock(win: DevSize): DevSize {
  const s = devSettings()
  const edge = dockEdge(win)
  const size = s.open && s.mode === 'dock' ? dockSize(win, edge) : 0
  if (state.win.w !== win.w || state.win.h !== win.h || state.edge !== edge || state.size !== size) {
    state = { win: { w: win.w, h: win.h }, edge, size }
    dockEvents.emit(DOCK_CHANGED)
  }
  return edge === 'right' ? { w: win.w - size, h: win.h } : { w: win.w, h: win.h - size }
}

export function setPanelOpen(open: boolean): void {
  updateDevSettings({ open })
  devConfig().relayout()
}

export function setPanelMode(mode: DevMode): void {
  updateDevSettings({ mode })
  devConfig().relayout()
}

/** null 回到按窗口算 */
export function setDockSize(edge: DockEdge, px: number | null): void {
  updateDevSettings(edge === 'right' ? { dockW: px } : { dockH: px })
  devConfig().relayout()
}
