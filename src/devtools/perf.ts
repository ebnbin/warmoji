import type Phaser from 'phaser'
import { COLOR, roundRect, textStyle } from './draw'
import {
  attachMetrics,
  detachMetrics,
  heapMB,
  metricsMarkSeq,
  metricsReport,
  rafHz,
  recentFrames,
  rendererInfo,
  startRafMeter,
} from './metrics'
import type { DevWidget, DevWidgetContext } from './types'

const CHART_FLOOR = 40

export function mountPerf(game: Phaser.Game, ctx: DevWidgetContext): DevWidget {
  attachMetrics(game)
  startRafMeter()
  const { scene, width: w, theme } = ctx
  const chartH = Math.round(theme.body * 3.4)
  const scaleRow = Math.round(theme.caption * 1.6)
  const chart = scene.add.graphics()
  const scaleText = scene.add
    .text(w, chartH + 6, '', textStyle(theme, theme.caption, { mono: true, color: COLOR.muted }))
    .setOrigin(1, 0)
  const text = scene.add.text(0, chartH + scaleRow, '', textStyle(theme, theme.caption, { mono: true, wrap: w }))
  let refreshedAt = -Infinity

  const row = (label: string, value: string, note = ''): string =>
    `${label.padEnd(9)}${value.padStart(9)}${note ? '  ' + note : ''}`
  const ms = (v: number): string => v.toFixed(1)
  const n = (v: number): string => v.toLocaleString()

  const refresh = (): void => {
    const raf = rafHz()
    const m = metricsReport(raf)
    const heap = heapMB()
    const objects = game.scene.getScenes(true).reduce((sum, s) => sum + s.children.length, 0)
    text.setText([
      m.warming
        ? '预热中：前 800ms 的帧不计入统计'
        : `已采样 ${m.samples} 帧${metricsMarkSeq() > 0 ? '（自标记起）' : ''}`,
      '',
      '── 帧耗时（毫秒 · 越小越好）──',
      row('总计 p50', ms(m.total.p50)),
      row('     p95', ms(m.total.p95)),
      row('     p99', ms(m.total.p99)),
      row('     最大', ms(m.total.max)),
      row('· 更新', ms(m.update.p50), '场景逻辑'),
      row('· 渲染', ms(m.render.p50), '渲染提交'),
      row('· 其余', ms(m.rest.p50), '帧外：vsync 等待/GC/异步任务'),
      row('· 帧间跳变', ms(m.jitter.p50), '节奏抖动'),
      '',
      '── 帧率（fps）──',
      row('平均', m.fps.toFixed(1), '采样窗口内均值'),
      row('1% 低', m.fpsLow1.toFixed(1), '卡顿体感'),
      row('引擎估计', game.loop.actualFps.toFixed(1), 'Phaser 指数平均·抹平尖峰·仅对照'),
      row('中位档', m.fpsMedian.toFixed(1), 'vsync 量化·勿当帧率'),
      row('屏幕上限', raf > 0 ? String(raf) : '—', 'Hz · 实测峰值'),
      `vsync 档  ${m.buckets.map((b, i) => `${i === 3 ? '≥4' : i + 1}×${(b * 100).toFixed(0)}%`).join(' ')}`,
      '',
      '── 引擎结构 ──',
      row('GameObject', n(objects), '活动场景合计'),
      row('纹理', n(game.textures.getTextureKeys().length)),
      ...(m.drawCount === undefined ? [] : [row('渲染对象', n(m.drawCount))]),
      row('JS 堆', heap === undefined ? '—' : n(heap), heap === undefined ? '（非 Chrome）' : 'MB'),
      '',
      '── 渲染后端 ──',
      rendererInfo(game),
    ])
  }

  const drawChart = (): void => {
    const g = chart
    g.clear()
    roundRect(g, 0, 0, w, chartH, 10, { fill: 0x000000, fillAlpha: 0.45 })
    const recent = recentFrames(Math.round(w))
    const frames = recent.map((f) => f.total)
    const sorted = [...frames].sort((a, b) => a - b)
    const p95 = sorted.length > 0 ? sorted[Math.min(sorted.length - 1, Math.round(0.95 * (sorted.length - 1)))]! : 0
    const top = Math.max(CHART_FLOOR, p95 * 1.15)
    const yOf = (v: number): number => chartH - (Math.min(v, top) / top) * chartH
    for (const [v, color] of [[16.7, 0x4caf50], [33.3, 0xffa726]] as const) {
      if (v > top) continue
      g.lineStyle(1, color, 0.5)
      g.lineBetween(0, yOf(v), w, yOf(v))
    }
    if (frames.length >= 2) {
      g.lineStyle(1.5, theme.accent, 0.95)
      g.beginPath()
      for (let px = 0; px < w; px++) {
        const idx = Math.min(frames.length - 1, Math.floor(((w - 1 - px) / (w - 1)) * (frames.length - 1)))
        const py = yOf(frames[idx]!)
        if (px === 0) g.moveTo(px, py)
        else g.lineTo(px, py)
      }
      g.strokePath()
      const mark = metricsMarkSeq()
      const at = mark > 0 ? recent.findIndex((f) => f.seq < mark) : -1
      if (at > 0) {
        const px = ((w - 1) * (frames.length - 1 - (at - 0.5))) / (frames.length - 1)
        g.lineStyle(1, 0xffffff, 0.6)
        g.lineBetween(px, 0, px, chartH)
      }
    }
    scaleText.setText(`0–${top.toFixed(0)}ms · ${frames.length}帧`)
  }

  refresh()
  drawChart()
  return {
    objects: [chart, scaleText, text],
    get height(): number {
      return chartH + scaleRow + text.height
    },
    update(time: number): void {
      drawChart()
      if (time - refreshedAt >= 250) {
        refreshedAt = time
        refresh()
      }
    },
    destroy(): void {
      detachMetrics()
    },
  }
}
