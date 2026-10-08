import Phaser from 'phaser'
import { devConfig } from './config'
import { inputItems } from './inputWatch'
import { objectItems } from './inspect'
import { clearDevLog, devLogEntries, infoCaptureOn, setInfoCapture, unreadErrorCount } from './log'
import type { DevLogLevel } from './log'
import { rendererInfo, resetMetrics } from './metrics'
import { HistoryView } from './panel/history'
import { LogView } from './panel/log'
import { PerfView } from './panel/perf'
import { refreshDevPanel, registerTabs } from './registry'
import { resourceItems } from './resources'
import { sceneItems, scenesText } from './scenes'
import { pausedSceneCount, setTimeScale, stepOneFrame, TIME_SCALES, timeScale, timeText } from './timeControl'
import type { DevItem } from './types'
import { clock, copyText, downloadDataUrl, stamp } from './util'

const r = (v: number): string => String(Math.round(v))

function canvasText(game: Phaser.Game): string {
  const s = game.scale
  return `画布 ${s.width}×${s.height} px · 显示 ${r(s.displaySize.width)}×${r(s.displaySize.height)} · dpr ${window.devicePixelRatio}`
}

function overviewItems(game: Phaser.Game): DevItem[] {
  const build = devConfig().build
  return [
    { kind: 'text', mono: true, read: () => `Phaser ${Phaser.VERSION} · ${rendererInfo(game)}${build ? `\n构建 ${build.hash} · ${build.time}` : ''}` },
    { kind: 'text', mono: true, read: () => canvasText(game) },
    { kind: 'text', label: '环境', mono: true, read: envText },
    {
      kind: 'buttons',
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
  const build = devConfig().build
  return [
    `# 诊断 ${new Date().toISOString()}`,
    `Phaser ${Phaser.VERSION} · ${rendererInfo(game)}`,
    ...(build ? [`构建 ${build.hash} · ${build.time}`] : []),
    envText(),
    canvasText(game),
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

let logFilter: DevLogLevel | 'all' = 'all'

const CAPTURE_DESC = '默认捕获 console.warn / console.error、未捕获异常与未处理的 Promise 拒绝'

function logItems(): DevItem[] {
  const all = devLogEntries()
  const count = (lv: DevLogLevel): number => all.filter((e) => e.level === lv).length
  return [
    {
      kind: 'choice',
      label: '筛选',
      desc: `共 ${all.length} 条`,
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
      ],
    },
    { kind: 'text', read: () => lastNote },
    { kind: 'custom', render: () => <LogView filter={logFilter} /> },
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
      label: k,
      desc: preview(k),
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
      label: '游戏速度',
      desc: '暂停与单步逐 scene 暂停，慢放与快进驱动引擎时钟',
      options: TIME_SCALES.map((s) => ({ id: String(s), label: s === 0 ? '暂停' : `×${s}` })),
      get: () => String(timeScale()),
      set: (id) => setTimeScale(Number(id)),
    },
    { kind: 'action', label: '单步', desc: `暂停时让业务 scene 推进一帧${pausedSceneCount() > 0 ? '' : '（当前未暂停）'}`, run: stepOneFrame },
    { kind: 'text', mono: true, read: timeText },
  ]
}

/** 引擎层：只放任何 Phaser 游戏都用得上的能力 */
export function registerEngineTabs(game: Phaser.Game): void {
  registerTabs('engine', '', '', [
    { id: 'overview', title: '概览', items: () => overviewItems(game) },
    { id: 'scenes', title: '场景', items: () => sceneItems(game, devConfig().key) },
    { id: 'time', title: '时间', items: timeItems },
    {
      id: 'perf',
      title: '性能',
      items: () => [
        { kind: 'custom', render: () => <PerfView game={game} /> },
        { kind: 'action', label: '重新采样', desc: '清空样本并重新预热', run: resetMetrics },
        { kind: 'custom', label: '一分钟走势', desc: '面板收起时也在采样', render: () => <HistoryView /> },
      ],
    },
    { id: 'objects', title: '对象', items: objectItems },
    { id: 'input', title: '输入', items: inputItems },
    { id: 'resources', title: '资源', items: () => resourceItems(game) },
    { id: 'log', title: '日志', badge: () => (unreadErrorCount() > 0 ? String(unreadErrorCount()) : ''), items: logItems },
    { id: 'storage', title: '存储', items: storageItems },
  ])
}
