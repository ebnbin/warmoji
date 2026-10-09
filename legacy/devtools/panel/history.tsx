import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { HISTORY, HISTORY_CAP, HISTORY_INTERVAL_MS, historySamples } from '../history'
import { fitCanvas } from './chart'
import { useLive } from './live'

function historyText(): string {
  const lines = HISTORY.map((s) => {
    const d = s.data
    const last = d[d.length - 1]
    const min = d.length > 0 ? Math.min(...d) : 0
    const max = Math.max(1, ...d)
    return `${s.name.padEnd(5)} 当前 ${last === undefined ? '—' : Math.round(last)}${s.unit} · 最低 ${Math.round(min)}${s.unit} · 峰值 ${Math.round(max)}${s.unit}`
  })
  const n = Math.min(HISTORY_CAP, HISTORY[0]?.data.length ?? 0)
  return [`最近 ${Math.round((n * HISTORY_INTERVAL_MS) / 1000)} s · 各曲线按自身峰值归一`, ...lines].join('\n')
}

function draw(c: HTMLCanvasElement): void {
  const fit = fitCanvas(c)
  if (!fit) return
  const { ctx, w, h } = fit
  ctx.lineWidth = 1.5
  ctx.globalAlpha = 0.9
  for (const s of HISTORY) {
    const d = s.data
    if (d.length < 2) continue
    const max = Math.max(1, ...d)
    ctx.strokeStyle = s.color
    ctx.beginPath()
    d.forEach((v, i) => {
      const px = ((HISTORY_CAP - d.length + i) / (HISTORY_CAP - 1)) * (w - 1)
      const py = h - 2 - (v / max) * (h - 4)
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    })
    ctx.stroke()
  }
}

export function HistoryView(): ReactNode {
  const canvas = useRef<HTMLCanvasElement>(null)
  const samples = useLive(historySamples)
  useEffect(() => {
    if (canvas.current) draw(canvas.current)
  }, [samples])
  return (
    <div>
      <canvas ref={canvas} className="dt-chart" />
      <div className="dt-text dt-mono dt-muted">{historyText()}</div>
    </div>
  )
}
