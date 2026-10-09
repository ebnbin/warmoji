import type Phaser from 'phaser'
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { devConfig } from '../config'
import { attachMetrics, detachMetrics, heapMB, metricsMarkSeq, metricsReport, rafHz, recentFrames, rendererInfo, startRafMeter } from '../metrics'
import { fitCanvas, line } from './chart'
import { useLive } from './live'

const CHART_FLOOR = 40
/** 帧耗时曲线每秒重画 20 次就够看，省下的时间留给游戏 */
const CHART_MS = 50

const row = (label: string, value: string, note = ''): string => `${label.padEnd(9)}${value.padStart(9)}${note ? '  ' + note : ''}`
const ms = (v: number): string => v.toFixed(1)
const n = (v: number): string => v.toLocaleString()

function perfText(game: Phaser.Game): string {
  const raf = rafHz()
  const m = metricsReport(raf)
  const heap = heapMB()
  const objects = game.scene.getScenes(true).reduce((sum, s) => sum + s.children.length, 0)
  return [
    m.warming ? '预热中：前 800ms 的帧不计入统计' : `已采样 ${m.samples} 帧${metricsMarkSeq() > 0 ? '（自标记起）' : ''}`,
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
    row('画布', `${game.scale.width}×${game.scale.height}`, '设备像素'),
    row('GameObject', n(objects), '活动场景合计'),
    row('纹理', n(game.textures.getTextureKeys().length)),
    ...(m.drawCount === undefined ? [] : [row('渲染对象', n(m.drawCount))]),
    row('JS 堆', heap === undefined ? '—' : n(heap), heap === undefined ? '（非 Chrome）' : 'MB'),
    '',
    '── 渲染后端 ──',
    rendererInfo(game),
  ].join('\n')
}

function drawFrames(c: HTMLCanvasElement): void {
  const fit = fitCanvas(c)
  if (!fit) return
  const { ctx, w, h } = fit
  const cfg = devConfig()
  const recent = recentFrames(Math.round(w))
  const frames = recent.map((f) => f.total)
  const sorted = [...frames].sort((a, b) => a - b)
  const p95 = sorted.length > 0 ? sorted[Math.min(sorted.length - 1, Math.round(0.95 * (sorted.length - 1)))]! : 0
  const top = Math.max(CHART_FLOOR, p95 * 1.15)
  const yOf = (v: number): number => h - (Math.min(v, top) / top) * h
  ctx.lineWidth = 1
  ctx.globalAlpha = 0.5
  for (const [v, color] of [
    [16.7, '#4caf50'],
    [33.3, '#ffa726'],
  ] as const) {
    if (v > top) continue
    ctx.strokeStyle = color
    line(ctx, 0, yOf(v), w, yOf(v))
  }
  if (frames.length >= 2) {
    ctx.globalAlpha = 0.95
    ctx.lineWidth = 1.5
    ctx.strokeStyle = `#${cfg.accent.toString(16).padStart(6, '0')}`
    ctx.beginPath()
    for (let px = 0; px < w; px++) {
      const idx = Math.min(frames.length - 1, Math.floor(((w - 1 - px) / (w - 1)) * (frames.length - 1)))
      const py = yOf(frames[idx]!)
      if (px === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.stroke()
    const mark = metricsMarkSeq()
    const at = mark > 0 ? recent.findIndex((f) => f.seq < mark) : -1
    if (at > 0) {
      const px = ((w - 1) * (frames.length - 1 - (at - 0.5))) / (frames.length - 1)
      ctx.globalAlpha = 0.6
      ctx.lineWidth = 1
      ctx.strokeStyle = '#ffffff'
      line(ctx, px, 0, px, h)
    }
  }
  ctx.globalAlpha = 1
  ctx.fillStyle = '#9a9aa8'
  ctx.font = `11px ${cfg.mono}`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'top'
  ctx.fillText(`0–${top.toFixed(0)}ms · ${frames.length}帧`, w - 6, 4)
}

export function PerfView({ game }: { readonly game: Phaser.Game }): ReactNode {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    attachMetrics(game)
    startRafMeter()
    let id = 0
    let last = 0
    const loop = (now: number): void => {
      id = requestAnimationFrame(loop)
      if (now - last < CHART_MS || !canvas.current) return
      last = now
      drawFrames(canvas.current)
    }
    id = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(id)
      detachMetrics()
    }
  }, [game])
  const text = useLive(() => perfText(game))
  return (
    <div>
      <canvas ref={canvas} className="dt-chart" />
      <div className="dt-text dt-mono">{text}</div>
    </div>
  )
}
