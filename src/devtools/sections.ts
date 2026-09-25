import Phaser from 'phaser'
import { currentLayout } from './config'
import { COLOR, textStyle } from './draw'
import { clearDevLog, devLogEntries, LOG_CHANGED, logEvents, markLogRead, unreadErrorCount } from './log'
import { rendererInfo, resetMetrics } from './metrics'
import { mountPerf } from './perf'
import { refreshDevPanel, registerDevSection } from './registry'
import { resourceItems } from './resources'
import { devSettings, updateDevSettings } from './settings'
import type { DevItem, DevWidget, DevWidgetContext } from './types'

const STATUS: Readonly<Record<number, string>> = {
  [Phaser.Scenes.INIT]: '初始化',
  [Phaser.Scenes.START]: '启动',
  [Phaser.Scenes.LOADING]: '加载',
  [Phaser.Scenes.CREATING]: '创建',
  [Phaser.Scenes.RUNNING]: '运行',
  [Phaser.Scenes.PAUSED]: '暂停',
  [Phaser.Scenes.SLEEPING]: '休眠',
}

const r = (v: number): string => String(Math.round(v))

function viewportText(game: Phaser.Game): string {
  const s = game.scale
  const lines = [
    `画布 ${s.width}×${s.height} px · 显示 ${r(s.displaySize.width)}×${r(s.displaySize.height)} · dpr ${window.devicePixelRatio}`,
  ]
  const L = currentLayout()
  if (L) {
    const i = L.insets
    lines.push(`逻辑 ${r(L.width)}×${r(L.height)} · 安全区 上${r(i.top)} 右${r(i.right)} 下${r(i.bottom)} 左${r(i.left)}`)
  }
  return lines.join('\n')
}

function scenesText(game: Phaser.Game): string {
  return game.scene
    .getScenes(false)
    .map((s) => `${s.scene.key.padEnd(12)} ${(STATUS[s.sys.settings.status] ?? '停止').padEnd(3)} ${s.children.length}`)
    .join('\n')
}

function overviewItems(game: Phaser.Game): DevItem[] {
  return [
    { kind: 'text', mono: true, read: () => `Phaser ${Phaser.VERSION} · ${rendererInfo(game)}` },
    { kind: 'text', mono: true, read: () => viewportText(game) },
    { kind: 'text', label: '场景 · 状态 · GameObject 数', mono: true, read: () => scenesText(game) },
    {
      kind: 'toggle',
      label: '胶囊显示帧率',
      get: () => devSettings().pillFps,
      set: (on) => updateDevSettings({ pillFps: on }),
    },
    {
      kind: 'toggle',
      label: '显示安全区边界',
      desc: '勾出布局安全边距与逻辑视口边缘',
      get: () => devSettings().safeArea,
      set: (on) => updateDevSettings({ safeArea: on }),
    },
    { kind: 'action', label: '刷新页面', run: () => location.reload() },
  ]
}

const MAX_SHOWN = 80
const pad2 = (v: number): string => String(v).padStart(2, '0')

function mountLog(ctx: DevWidgetContext): DevWidget {
  markLogRead()
  const { scene, width, theme } = ctx
  const objects: Phaser.GameObjects.GameObject[] = []
  const entries = devLogEntries()
  const shown = entries.slice(-MAX_SHOWN).reverse()
  let y = 0
  for (const e of shown) {
    const d = new Date(e.at)
    const stamp = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
    const t = scene.add.text(
      0,
      y,
      `${stamp}  ${e.text}`,
      textStyle(theme, theme.caption, { mono: true, color: e.level === 'error' ? COLOR.error : COLOR.warnText, wrap: width }),
    )
    objects.push(t)
    y += t.height + theme.body * 0.35
  }
  if (entries.length > shown.length) {
    const t = scene.add.text(0, y, `还有 ${entries.length - shown.length} 条更早的记录`, textStyle(theme, theme.caption, { color: COLOR.muted }))
    objects.push(t)
    y += t.height
  }
  let alive = true
  let queued = false
  const onChange = (): void => {
    if (!alive || queued) return
    queued = true
    window.setTimeout(() => {
      queued = false
      if (alive) refreshDevPanel()
    }, 300)
  }
  logEvents.on(LOG_CHANGED, onChange)
  return {
    objects,
    height: y,
    destroy(): void {
      alive = false
      logEvents.off(LOG_CHANGED, onChange)
    },
  }
}

const CAPTURE_DESC = '捕获 console.warn / console.error、未捕获异常与未处理的 Promise 拒绝'

function logItems(): DevItem[] {
  const n = devLogEntries().length
  if (n === 0) return [{ kind: 'text', read: () => `暂无记录 · ${CAPTURE_DESC}` }, { kind: 'custom', mount: mountLog }]
  return [
    { kind: 'action', label: `清空 ${n} 条记录`, desc: CAPTURE_DESC, run: clearDevLog },
    { kind: 'custom', mount: mountLog },
  ]
}

const ALL = '\u0000all'
let pendingKey: string | undefined
let pendingTimer: number | undefined

function arm(key: string): void {
  pendingKey = key
  window.clearTimeout(pendingTimer)
  pendingTimer = window.setTimeout(() => {
    pendingKey = undefined
    refreshDevPanel()
  }, 3000)
}

function disarm(): void {
  pendingKey = undefined
  window.clearTimeout(pendingTimer)
}

function storageKeys(): string[] {
  try {
    const out: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k !== null) out.push(k)
    }
    return out.sort()
  } catch {
    return []
  }
}

function preview(key: string): string {
  try {
    const v = localStorage.getItem(key) ?? ''
    const bytes = new TextEncoder().encode(v).length
    return `${bytes} B · ${v.length > 60 ? `${v.slice(0, 60)}…` : v}`
  } catch {
    return ''
  }
}

function storageItems(): DevItem[] {
  const keys = storageKeys()
  const items: DevItem[] = keys.map((k) => ({
    kind: 'action',
    label: pendingKey === k ? '再点一次确认删除' : k,
    desc: preview(k),
    run: (): void => {
      if (pendingKey !== k) {
        arm(k)
        return
      }
      disarm()
      try {
        localStorage.removeItem(k)
      } catch {
      }
    },
  }))
  if (keys.length === 0) items.push({ kind: 'text', read: () => 'localStorage 为空' })
  items.push({
    kind: 'action',
    label: pendingKey === ALL ? '再点一次确认清空并刷新' : '清空全部并刷新页面',
    desc: '删除本站全部 localStorage 后重新加载',
    run: (): void => {
      if (pendingKey !== ALL) {
        arm(ALL)
        return
      }
      disarm()
      try {
        localStorage.clear()
      } catch {
      }
      location.reload()
    },
  })
  return items
}

export function registerBuiltins(game: Phaser.Game): void {
  registerDevSection({ id: 'devtools.overview', title: '概览', order: 1000, items: () => overviewItems(game) })
  registerDevSection({
    id: 'devtools.perf',
    title: '性能',
    order: 1010,
    items: () => [
      { kind: 'custom', mount: (ctx) => mountPerf(game, ctx) },
      { kind: 'action', label: '重新采样', desc: '清空样本并重新预热', run: resetMetrics },
    ],
  })
  registerDevSection({ id: 'devtools.resources', title: '资源', order: 1015, items: () => resourceItems(game) })
  registerDevSection({
    id: 'devtools.log',
    title: '日志',
    order: 1020,
    badge: () => (unreadErrorCount() > 0 ? String(unreadErrorCount()) : ''),
    items: logItems,
  })
  registerDevSection({ id: 'devtools.storage', title: '存储', order: 1030, items: storageItems })
}
