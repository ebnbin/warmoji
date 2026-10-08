import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent, ReactNode } from 'react'
import { devConfig } from '../config'
import { dockRange, setDockSize, setPanelMode, setPanelOpen } from '../dock'
import type { DockState } from '../dock'
import { LOG_CHANGED, logEvents } from '../log'
import { listTabs, PANEL_REFRESH, REGISTRY_CHANGED, registryEvents } from '../registry'
import { devSettings, updateDevSettings } from '../settings'
import type { DevLayer } from '../types'
import { Item, keepFocus } from './items'
import type { Tap } from './items'
import { useEvent, useLive } from './live'

const LAYERS: readonly { readonly layer: DevLayer; readonly label: string }[] = [
  { layer: 'engine', label: '引擎' },
  { layer: 'game', label: '游戏' },
  { layer: 'scene', label: '场景' },
]

const scrollByTab = new Map<string, number>()
const tabByLayer = new Map<DevLayer, string>()

const ownersOf = (layer: DevLayer): string[] => [...new Set(listTabs(layer).map((e) => e.owner))].filter((o) => o !== '')

/** 页签随 scene 起落、随条件出没：变了就重画 */
const tabsShape = (): string => LAYERS.map((l) => listTabs(l.layer).map((e) => e.key).join(',')).join('|')

/** 拖动时只画一条参考线，松手才改尺寸：每改一次，游戏的界面都要按新尺寸重建 */
function Divider({ dock }: { readonly dock: DockState }): ReactNode {
  const [preview, setPreview] = useState<number | null>(null)
  const range = dockRange(dock.win, dock.edge)
  const sizeAt = (e: PointerEvent): number => {
    const raw = dock.edge === 'right' ? dock.win.w - e.clientX : dock.win.h - e.clientY
    return Math.round(Math.min(range.max, Math.max(range.min, raw)))
  }
  const offset = preview === null ? 0 : dock.size - preview
  return (
    <>
      <div
        className={preview === null ? `dt-divider ${dock.edge}` : `dt-divider ${dock.edge} active`}
        title="拖动调整大小，双击恢复默认"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setPreview(dock.size)
        }}
        onPointerMove={(e) => {
          if (preview !== null) setPreview(sizeAt(e))
        }}
        onPointerUp={(e) => {
          if (preview === null) return
          setPreview(null)
          const px = sizeAt(e)
          if (px !== dock.size) setDockSize(dock.edge, px)
        }}
        onPointerCancel={() => setPreview(null)}
        onDoubleClick={() => setDockSize(dock.edge, null)}
      />
      {preview !== null && <div className={`dt-guide ${dock.edge}`} style={dock.edge === 'right' ? { left: offset } : { top: offset }} />}
    </>
  )
}

export function Panel({ dock }: { readonly dock: DockState }): ReactNode {
  const cfg = devConfig()
  useEvent(registryEvents, REGISTRY_CHANGED)
  useEvent(registryEvents, PANEL_REFRESH)
  useEvent(logEvents, LOG_CHANGED, 300)
  useLive(tabsShape)
  const [, setVersion] = useState(0)
  const body = useRef<HTMLDivElement>(null)
  const s = devSettings()
  const tap: Tap = (fn) => (): void => {
    fn()
    setVersion((v) => v + 1)
  }
  // 选中的层此刻没有页签就不显示，先看排在前面的层
  const layer = listTabs(s.layer).length > 0 ? s.layer : (LAYERS.find((l) => listTabs(l.layer).length > 0)?.layer ?? s.layer)
  const entries = listTabs(layer)
  const current = entries.find((e) => e.key === s.tab) ?? entries.find((e) => e.key === tabByLayer.get(layer)) ?? entries[0]
  const key = current?.key ?? ''
  useLayoutEffect(() => {
    if (body.current) body.current.scrollTop = scrollByTab.get(key) ?? 0
  }, [key])
  const owners = ownersOf(layer)
  const docked = s.mode === 'dock' && dock.size > 0
  const style: CSSProperties | undefined = docked ? (dock.edge === 'right' ? { width: dock.size } : { height: dock.size }) : undefined
  return (
    <section className={docked ? `dt-panel dock ${dock.edge}` : `dt-panel float ${s.side}`} style={style}>
      {docked && <Divider dock={dock} />}
      <header className="dt-head">
        <span className="dt-title">{cfg.title}</span>
        <span className="dt-grow" />
        <span className="dt-seg">
          {(['dock', 'float'] as const).map((m) => (
            <button key={m} className={s.mode === m ? 'on' : ''} onMouseDown={keepFocus} onClick={() => setPanelMode(m)}>
              {m === 'dock' ? '停靠' : '悬浮'}
            </button>
          ))}
        </span>
        {!docked && (
          <button className="dt-btn" onMouseDown={keepFocus} onClick={() => updateDevSettings({ side: s.side === 'right' ? 'left' : 'right' })}>
            {s.side === 'right' ? '靠左' : '靠右'}
          </button>
        )}
        <button className="dt-btn" onMouseDown={keepFocus} onClick={() => setPanelOpen(false)}>
          收起
        </button>
      </header>
      <nav className="dt-chips dt-bar">
        {LAYERS.filter((l) => listTabs(l.layer).length > 0).map((l) => (
          <button
            key={l.layer}
            className={l.layer === layer ? 'dt-chip dt-layer on' : 'dt-chip dt-layer'}
            onMouseDown={keepFocus}
            onClick={l.layer === s.layer ? undefined : () => updateDevSettings({ layer: l.layer, tab: tabByLayer.get(l.layer) ?? null })}
          >
            {l.label}
          </button>
        ))}
      </nav>
      {entries.length > 0 && (
        <nav className="dt-chips dt-bar">
          {entries.map((e, i) => {
            const badge = e.tab.badge?.() ?? ''
            const on = e === current
            // 同时有几个 scene 带页签时，页签不止一个的 scene 先标出名字
            const lead = owners.length > 1 && e.owner !== entries[i - 1]?.owner && entries.filter((x) => x.owner === e.owner).length > 1
            return (
              <Fragment key={e.key}>
                {lead && <span className="dt-owner">{e.owner}</span>}
                <button
                  className={on ? 'dt-chip on' : 'dt-chip'}
                  onMouseDown={keepFocus}
                  onClick={
                    on
                      ? undefined
                      : () => {
                          tabByLayer.set(layer, e.key)
                          updateDevSettings({ tab: e.key })
                        }
                  }
                >
                  {badge === '' ? e.tab.title : `${e.tab.title} ${badge}`}
                </button>
              </Fragment>
            )
          })}
        </nav>
      )}
      <div className="dt-body" ref={body} onScroll={(e) => scrollByTab.set(key, e.currentTarget.scrollTop)}>
        {current?.tab.items().map((item, i) => <Item key={`${key}/${i}`} item={item} tap={tap} />)}
      </div>
    </section>
  )
}
