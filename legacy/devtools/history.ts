import type Phaser from 'phaser'
import { heapMB } from './metrics'

export const HISTORY_CAP = 120
export const HISTORY_INTERVAL_MS = 500

let game: Phaser.Game | undefined
let lastAt = 0
let samples = 0
const fps: number[] = []
const heap: number[] = []
const objects: number[] = []

export function installHistory(g: Phaser.Game): void {
  game = g
}

/** 每 500ms 采一次，面板收起时也在采，展开即有最近一分钟的走势 */
export function sampleHistory(now: number): void {
  if (!game || now - lastAt < HISTORY_INTERVAL_MS) return
  lastAt = now
  const push = (arr: number[], v: number): void => {
    arr.push(v)
    if (arr.length > HISTORY_CAP) arr.shift()
  }
  push(fps, game.loop.actualFps)
  push(heap, heapMB() ?? 0)
  push(objects, game.scene.getScenes(true).reduce((s, sc) => s + sc.children.length, 0))
  samples++
}

/** 采过多少次：变了就该重画 */
export function historySamples(): number {
  return samples
}

export interface HistorySeries {
  readonly name: string
  readonly data: readonly number[]
  readonly color: string
  readonly unit: string
}

export const HISTORY: readonly HistorySeries[] = [
  { name: 'fps', data: fps, color: '#4caf50', unit: '' },
  { name: 'JS 堆', data: heap, color: '#64b5f6', unit: ' MB' },
  { name: '对象', data: objects, color: '#ffa726', unit: '' },
]
