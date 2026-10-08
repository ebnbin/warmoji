import type Phaser from 'phaser'
import { useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent, ReactNode } from 'react'
import { devConfig } from '../config'
import { dockRange, setDockSize, setPanelMode, setPanelOpen } from '../dock'
import type { DockState } from '../dock'
import { LOG_CHANGED, logEvents } from '../log'
import { listDevProviders, PANEL_REFRESH, REGISTRY_CHANGED, registryEvents } from '../registry'
import type { DevProviderEntry } from '../registry'
import { devSettings, updateDevSettings } from '../settings'
import { timeScale } from '../timeControl'
import type { DevScope, DevSection } from '../types'
import { Item, keepFocus } from './items'
import type { Tap } from './items'
import { useEvent, useLive } from './live'

const GROUPS: readonly { readonly scope: DevScope; readonly label: string }[] = [
  { scope: 'scene', label: '场景' },
  { scope: 'game', label: '游戏' },
  { scope: 'engine', label: '引擎' },
]

interface Tab {
  readonly key: string
  readonly label: string
  readonly section: DevSection
}

function tabsOf(entries: readonly DevProviderEntry[]): Tab[] {
  const multi = entries.length > 1
  return entries.flatMap((e) =>
    e.provider.sections.map((section) => ({
      key: `${e.scope}/${e.provider.id}/${section.id}`,
      label: multi && e.provider.sections.length > 1 ? `${e.provider.title}·${section.title}` : section.title,
      section,
    })),
  )
}

const HINT: Readonly<Record<DevScope, string>> = {
  scene: '当前活动的 scene 都没有注册能力：让 scene 实现 devProvider()',
  game: '游戏还没有注册能力：用 registerGameProvider',
  engine: '没有引擎能力',
}

const scrollByTab = new Map<string, number>()
const tabByGroup = new Map<DevScope, string>()

/** 面板开着时画布变小、填充变少，帧率要对照画布大小看 */
function Meter({ game }: { readonly game: Phaser.Game }): ReactNode {
  const text = useLive(() => {
    const scale = timeScale()
    const tag = scale === 0 ? '暂停 · ' : scale === 1 ? '' : `×${scale} · `
    return `${tag}${Math.round(game.loop.actualFps)} fps · 画布 ${game.scale.width}×${game.scale.height}`
  })
  return <span className="dt-meter">{text}</span>
}

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

export function Panel({ game, dock }: { readonly game: Phaser.Game; readonly dock: DockState }): ReactNode {
  const cfg = devConfig()
  useEvent(registryEvents, REGISTRY_CHANGED)
  useEvent(registryEvents, PANEL_REFRESH)
  useEvent(logEvents, LOG_CHANGED, 300)
  const [, setVersion] = useState(0)
  const body = useRef<HTMLDivElement>(null)
  const s = devSettings()
  const tap: Tap = (fn) => (): void => {
    cfg.onTap()
    fn()
    setVersion((v) => v + 1)
  }
  const tabs = tabsOf(listDevProviders(s.group))
  const current = tabs.find((t) => t.key === s.tab) ?? tabs[0]
  const key = current?.key ?? ''
  useLayoutEffect(() => {
    if (body.current) body.current.scrollTop = scrollByTab.get(key) ?? 0
  }, [key])
  const docked = s.mode === 'dock' && dock.size > 0
  const style = (
    docked ? (dock.edge === 'right' ? { width: dock.size } : { height: dock.size }) : { '--dt-float-w': s.wide ? '560px' : '360px' }
  ) as CSSProperties
  const click = (fn: () => void) => (): void => {
    cfg.onTap()
    fn()
  }
  return (
    <section className={docked ? `dt-panel dock ${dock.edge}` : `dt-panel float ${s.side}`} style={style}>
      {docked && <Divider dock={dock} />}
      <header className="dt-head">
        <span className="dt-title">{cfg.title}</span>
        <Meter game={game} />
        <span className="dt-grow" />
        <span className="dt-seg">
          {(['dock', 'float'] as const).map((m) => (
            <button key={m} className={s.mode === m ? 'on' : ''} onMouseDown={keepFocus} onClick={click(() => setPanelMode(m))}>
              {m === 'dock' ? '停靠' : '悬浮'}
            </button>
          ))}
        </span>
        {!docked && (
          <button className="dt-btn" onMouseDown={keepFocus} onClick={click(() => updateDevSettings({ side: s.side === 'right' ? 'left' : 'right' }))}>
            {s.side === 'right' ? '靠左' : '靠右'}
          </button>
        )}
        <button className="dt-btn" onMouseDown={keepFocus} onClick={click(() => setPanelOpen(false))}>
          收起
        </button>
      </header>
      <nav className="dt-chips dt-bar">
        {GROUPS.map((g) => {
          const entries = listDevProviders(g.scope)
          const n = entries.reduce((sum, e) => sum + e.provider.sections.length, 0)
          const owners = g.scope === 'scene' ? entries.map((e) => e.owner ?? e.provider.title).join('·') : ''
          const on = g.scope === s.group
          return (
            <button
              key={g.scope}
              className={on ? 'dt-chip dt-group on' : 'dt-chip dt-group'}
              onMouseDown={keepFocus}
              onClick={on ? undefined : click(() => updateDevSettings({ group: g.scope, tab: tabByGroup.get(g.scope) ?? null }))}
            >
              {`${g.label} ${n}${owners ? ` · ${owners}` : ''}`}
            </button>
          )
        })}
      </nav>
      {tabs.length > 0 ? (
        <nav className="dt-chips dt-bar">
          {tabs.map((t) => {
            const badge = t.section.badge?.() ?? ''
            const on = t === current
            return (
              <button
                key={t.key}
                className={on ? 'dt-chip on' : 'dt-chip'}
                onMouseDown={keepFocus}
                onClick={
                  on
                    ? undefined
                    : click(() => {
                        tabByGroup.set(s.group, t.key)
                        updateDevSettings({ tab: t.key })
                      })
                }
              >
                {badge === '' ? t.label : `${t.label} ${badge}`}
              </button>
            )
          })}
        </nav>
      ) : (
        <div className="dt-bar dt-muted">{HINT[s.group]}</div>
      )}
      <div className="dt-body" ref={body} onScroll={(e) => scrollByTab.set(key, e.currentTarget.scrollTop)}>
        {current?.section.items().map((item, i) => <Item key={`${key}/${i}`} item={item} tap={tap} />)}
      </div>
    </section>
  )
}
