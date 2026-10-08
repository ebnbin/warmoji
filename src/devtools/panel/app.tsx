import type Phaser from 'phaser'
import { useEffect, useSyncExternalStore } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { devConfig } from '../config'
import { DOCK_CHANGED, dockEvents, dockState, setPanelOpen } from '../dock'
import { devSettings, SETTINGS_CHANGED, settingsEvents } from '../settings'
import { Guard } from './items'
import { useEvent } from './live'
import { Panel } from './panel'
import { Pill } from './pill'

function subscribeDock(fn: () => void): () => void {
  dockEvents.on(DOCK_CHANGED, fn)
  return () => {
    dockEvents.off(DOCK_CHANGED, fn)
  }
}

function typing(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
}

/** 焦点在面板里时，按键不再传给游戏 */
function keepKeys(e: ReactKeyboardEvent): void {
  e.stopPropagation()
}

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`

export function App({ game }: { readonly game: Phaser.Game }): ReactNode {
  const changed = useEvent(settingsEvents, SETTINGS_CHANGED)
  const dock = useSyncExternalStore(subscribeDock, dockState)
  useEffect(() => {
    const code = devConfig().hotkey
    if (code === null) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.code !== code || e.repeat || typing(e.target)) return
      setPanelOpen(!devSettings().open)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
  const cfg = devConfig()
  const style = {
    width: dock.win.w,
    height: dock.win.h,
    '--dt-accent': hex(cfg.accent),
    '--dt-font': cfg.font,
    '--dt-mono': cfg.mono,
    '--dt-size': `${cfg.size}px`,
  } as CSSProperties
  return (
    <div className="dt-root" style={style} onKeyDown={keepKeys} onKeyUp={keepKeys}>
      <Guard reset={changed}>{devSettings().open ? <Panel game={game} dock={dock} /> : <Pill game={game} win={dock.win} />}</Guard>
    </div>
  )
}
