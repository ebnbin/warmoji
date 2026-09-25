import Phaser from 'phaser'
import { currentLayout, devConfig } from './config'
import { COLOR, textStyle } from './draw'
import { clearDevLog, devLogEntries, infoCaptureOn, LOG_CHANGED, logEvents, markLogRead, setInfoCapture, unreadErrorCount } from './log'
import type { DevLogLevel } from './log'
import { clock, copyText, downloadDataUrl, stamp } from './util'
import { rendererInfo, resetMetrics } from './metrics'
import { mountPerf } from './perf'
import { mountHistory } from './history'
import { refreshDevPanel, registerDevSection } from './registry'
import { resourceItems } from './resources'
import { flagItems } from './flags'
import { inspectItems } from './inspect'
import { inputItems } from './inputWatch'
import { sceneItems, scenesText } from './scenes'
import { pausedSceneCount, setTimeScale, stepOneFrame, TIME_SCALES, timeScale, timeText } from './timeControl'
import { devSettings, updateDevSettings } from './settings'
import type { DevItem, DevWidget, DevWidgetContext } from './types'

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

function overviewItems(game: Phaser.Game): DevItem[] {
  return [
    { kind: 'text', mono: true, read: () => `Phaser ${Phaser.VERSION} · ${rendererInfo(game)}` },
    { kind: 'text', mono: true, read: () => viewportText(game) },
    { kind: 'text', label: '环境', mono: true, read: envText },
    { kind: 'text', label: '场景 · 状态 · GameObject 数', mono: true, read: () => scenesText(game) },
    {
      kind: 'toggle',
      label: '胶囊显示帧率',
      get: () => devSettings().pillFps,
      set: (on) => updateDevSettings({ pillFps: on }),
    },
    { kind: 'toggle', label: '宽面板', desc: '桌面上看长列表更省事', get: () => devSettings().wide, set: (on) => updateDevSettings({ wide: on }) },
    {
      kind: 'toggle',
      label: '显示安全区边界',
      desc: '勾出布局安全边距与逻辑视口边缘',
      get: () => devSettings().safeArea,
      set: (on) => updateDevSettings({ safeArea: on }),
    },
    {
      kind: 'buttons',
      label: '操作',
      buttons: [
        { label: '复制诊断信息', run: () => void copyText(diagnosticsText(game)).then((ok) => note(ok ? '诊断信息已复制' : '复制失败：剪贴板不可用')) },
        { label: '下载截图', run: () => snapshot(game) },
        { label: '刷新页面', run: () => location.reload() },
      ],
    },
    { kind: 'text', read: () => lastNote },
  ]
}

let lastNote = ''

function note(text: string): void {
  lastNote = `${clock(Date.now())} ${text}`
  refreshDevPanel()
}

function envText(): string {
  const nav = navigator as Navigator & { deviceMemory?: number }
  const ua = navigator.userAgent.replace(/^Mozilla\/5\.0 /, '')
  return [
    ua.length > 96 ? `${ua.slice(0, 96)}…` : ua,
    `窗口 ${window.innerWidth}×${window.innerHeight} · ${screen.orientation?.type ?? '方向未知'} · 语言 ${navigator.language} · ${navigator.onLine ? '在线' : '离线'}`,
    `CPU 线程 ${navigator.hardwareConcurrency} · 内存 ${nav.deviceMemory === undefined ? '—' : `${nav.deviceMemory} GB`} · 触摸点 ${navigator.maxTouchPoints}`,
  ].join('\n')
}

function diagnosticsText(game: Phaser.Game): string {
  const logs = devLogEntries().slice(-30)
  return [
    `# 诊断 ${new Date().toISOString()}`,
    `Phaser ${Phaser.VERSION} · ${rendererInfo(game)}`,
    envText(),
    viewportText(game),
    '',
    '## 场景',
    scenesText(game),
    '',
    '## 资源',
    ...resourceItems(game).map((it) => (it.kind === 'text' ? `${it.label ?? ''}\n${it.read()}` : '')),
    '',
    `## 日志（最近 ${logs.length} 条）`,
    ...logs.map((e) => `${clock(e.at)} ${e.level} ${e.text}`),
  ].join('\n')
}

function snapshot(game: Phaser.Game): void {
  game.renderer.snapshot((img) => {
    if (!(img instanceof HTMLImageElement)) {
      note('截图失败')
      return
    }
    downloadDataUrl(img.src, `snapshot-${stamp()}.png`)
    note('截图已下载')
  })
}

const MAX_SHOWN = 80
const LEVEL_COLOR: Readonly<Record<DevLogLevel, string>> = { error: COLOR.error, warn: COLOR.warnText, info: COLOR.text }
let logFilter: DevLogLevel | 'all' = 'all'

function mountLog(ctx: DevWidgetContext): DevWidget {
  markLogRead()
  const { scene, width, theme } = ctx
  const objects: Phaser.GameObjects.GameObject[] = []
  const entries = devLogEntries().filter((e) => logFilter === 'all' || e.level === logFilter)
  const shown = entries.slice(-MAX_SHOWN).reverse()
  let y = 0
  for (const e of shown) {
    const t = scene.add.text(
      0,
      y,
      `${clock(e.at)}  ${e.text}`,
      textStyle(theme, theme.caption, { mono: true, color: LEVEL_COLOR[e.level], wrap: width }),
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

const CAPTURE_DESC = '默认捕获 console.warn / console.error、未捕获异常与未处理的 Promise 拒绝'

function logItems(): DevItem[] {
  const all = devLogEntries()
  const count = (lv: DevLogLevel): number => all.filter((e) => e.level === lv).length
  return [
    {
      kind: 'choice',
      label: `筛选 · 共 ${all.length} 条`,
      options: [
        { id: 'all', label: '全部' },
        { id: 'error', label: `错误 ${count('error')}` },
        { id: 'warn', label: `警告 ${count('warn')}` },
        { id: 'info', label: `信息 ${count('info')}` },
      ],
      get: () => logFilter,
      set: (id) => (logFilter = id === 'error' || id === 'warn' || id === 'info' ? id : 'all'),
    },
    { kind: 'toggle', label: '同时捕获 console.log / info', desc: CAPTURE_DESC, get: infoCaptureOn, set: setInfoCapture },
    {
      kind: 'buttons',
      buttons: [
        { label: '复制全部', run: () => void copyText(all.map((e) => `${clock(e.at)} ${e.level} ${e.text}`).join('\n')).then((ok) => note(ok ? '日志已复制' : '复制失败：剪贴板不可用')) },
        { label: '清空', run: clearDevLog },
        { label: '写一条测试错误', run: () => console.error('devtools 测试错误', { at: Date.now() }) },
      ],
    },
    { kind: 'text', read: () => lastNote },
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

let expandedKey: string | undefined

function fullValue(key: string): string {
  let v = ''
  try {
    v = localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
  try {
    v = JSON.stringify(JSON.parse(v), null, 2)
  } catch {
  }
  return v.length > 4000 ? `${v.slice(0, 4000)}\n… 共 ${v.length} 字符` : v
}

function storageItems(): DevItem[] {
  const keys = storageKeys()
  const items: DevItem[] = []
  for (const k of keys) {
    const expanded = expandedKey === k
    items.push({
      kind: 'buttons',
      label: `${k} · ${preview(k)}`,
      buttons: [
        { label: expanded ? '收起' : '查看', run: () => (expandedKey = expanded ? undefined : k) },
        { label: '复制值', run: () => void copyText(fullValue(k)).then((ok) => note(ok ? `已复制 ${k}` : '复制失败：剪贴板不可用')) },
        {
          label: pendingKey === k ? '再点一次确认删除' : '删除',
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
        },
      ],
    })
    if (expanded) items.push({ kind: 'text', mono: true, read: () => fullValue(k) })
  }
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
  items.push({ kind: 'text', read: () => lastNote })
  return items
}

function timeItems(): DevItem[] {
  return [
    {
      kind: 'choice',
      label: '游戏速度 · 暂停与单步逐 scene 暂停，慢放与快进驱动引擎时钟',
      options: TIME_SCALES.map((s) => ({ id: String(s), label: s === 0 ? '暂停' : `×${s}` })),
      get: () => String(timeScale()),
      set: (id) => setTimeScale(Number(id)),
    },
    { kind: 'action', label: '单步', desc: `暂停时让业务 scene 推进一帧${pausedSceneCount() > 0 ? '' : '（当前未暂停）'}`, run: stepOneFrame },
    { kind: 'text', mono: true, read: timeText },
  ]
}

export function registerBuiltins(game: Phaser.Game): void {
  registerDevSection({ id: 'devtools.overview', title: '概览', order: 1000, items: () => overviewItems(game) })
  registerDevSection({ id: 'devtools.scenes', title: '场景', order: 1002, items: () => sceneItems(game, devConfig().key) })
  registerDevSection({ id: 'devtools.flags', title: '开关', order: 1005, items: flagItems })
  registerDevSection({ id: 'devtools.time', title: '时间', order: 1008, items: timeItems })
  registerDevSection({
    id: 'devtools.perf',
    title: '性能',
    order: 1010,
    items: () => [
      { kind: 'custom', mount: (ctx) => mountPerf(game, ctx) },
      { kind: 'action', label: '重新采样', desc: '清空样本并重新预热', run: resetMetrics },
      { kind: 'text', label: '一分钟走势 · 面板收起时也在采样', read: () => '' },
      { kind: 'custom', mount: mountHistory },
    ],
  })
  registerDevSection({ id: 'devtools.inspect', title: '检视', order: 1012, items: inspectItems })
  registerDevSection({ id: 'devtools.input', title: '输入', order: 1013, items: inputItems })
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
