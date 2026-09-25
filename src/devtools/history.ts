import type Phaser from 'phaser'
import { COLOR, roundRect, textStyle } from './draw'
import { heapMB } from './metrics'
import type { DevWidget, DevWidgetContext } from './types'

const CAP = 120
const INTERVAL_MS = 500

let game: Phaser.Game | undefined
let lastAt = 0
const fps: number[] = []
const heap: number[] = []
const objects: number[] = []

export function installHistory(g: Phaser.Game): void {
  game = g
}

/** 每 500ms 采一次，面板收起时也在采，展开即有最近一分钟的走势 */
export function sampleHistory(now: number): void {
  if (!game || now - lastAt < INTERVAL_MS) return
  lastAt = now
  const push = (arr: number[], v: number): void => {
    arr.push(v)
    if (arr.length > CAP) arr.shift()
  }
  push(fps, game.loop.actualFps)
  push(heap, heapMB() ?? 0)
  push(objects, game.scene.getScenes(true).reduce((s, sc) => s + sc.children.length, 0))
}

const SERIES: readonly { readonly name: string; readonly data: number[]; readonly color: number; readonly unit: string }[] = [
  { name: 'fps', data: fps, color: 0x4caf50, unit: '' },
  { name: 'JS 堆', data: heap, color: 0x64b5f6, unit: ' MB' },
  { name: '对象', data: objects, color: 0xffa726, unit: '' },
]

export function mountHistory(ctx: DevWidgetContext): DevWidget {
  const { scene, width: w, theme } = ctx
  const chartH = Math.round(theme.body * 3.4)
  const chart = scene.add.graphics()
  const text = scene.add.text(0, chartH + 6, '', textStyle(theme, theme.caption, { mono: true, color: COLOR.muted, wrap: w }))
  let drawnAt = -Infinity

  const draw = (): void => {
    chart.clear()
    roundRect(chart, 0, 0, w, chartH, 10, { fill: 0x000000, fillAlpha: 0.45 })
    const lines: string[] = []
    for (const s of SERIES) {
      const d = s.data
      const max = Math.max(1, ...d)
      if (d.length >= 2) {
        chart.lineStyle(1.5, s.color, 0.9)
        chart.beginPath()
        d.forEach((v, i) => {
          const px = ((CAP - d.length + i) / (CAP - 1)) * (w - 1)
          const py = chartH - 2 - (v / max) * (chartH - 4)
          if (i === 0) chart.moveTo(px, py)
          else chart.lineTo(px, py)
        })
        chart.strokePath()
      }
      const last = d[d.length - 1]
      const min = d.length > 0 ? Math.min(...d) : 0
      lines.push(`${s.name.padEnd(5)} 当前 ${last === undefined ? '—' : Math.round(last)}${s.unit} · 最低 ${Math.round(min)}${s.unit} · 峰值 ${Math.round(max)}${s.unit}`)
    }
    text.setText([`最近 ${Math.round((Math.min(CAP, fps.length) * INTERVAL_MS) / 1000)} s · 各曲线按自身峰值归一`, ...lines])
  }

  draw()
  return {
    objects: [chart, text],
    get height(): number {
      return chartH + 6 + text.height
    },
    update(time: number): void {
      if (time - drawnAt < INTERVAL_MS) return
      drawnAt = time
      draw()
    },
  }
}
