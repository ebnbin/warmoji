import type Phaser from 'phaser'
import { useEffect, useState, useSyncExternalStore } from 'react'

/** 面板读实时值的节奏：比逐帧省，看着也够快 */
const POLL_MS = 250

const ticks = new Set<() => void>()
let timer = 0

function onTick(fn: () => void): () => void {
  ticks.add(fn)
  if (timer === 0) timer = window.setInterval(() => ticks.forEach((f) => f()), POLL_MS)
  return () => {
    ticks.delete(fn)
    if (ticks.size > 0) return
    window.clearInterval(timer)
    timer = 0
  }
}

/** 按节拍读一个值，变了才重画 */
export function useLive<T extends string | number | boolean>(read: () => T): T {
  return useSyncExternalStore(onTick, read)
}

/** 事件触发后重画；throttleMs 之内的多次触发只重画一次 */
export function useEvent(emitter: Phaser.Events.EventEmitter, event: string, throttleMs = 0): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    let queued = 0
    const bump = (): void => {
      if (throttleMs <= 0) {
        setN((v) => v + 1)
        return
      }
      if (queued !== 0) return
      queued = window.setTimeout(() => {
        queued = 0
        setN((v) => v + 1)
      }, throttleMs)
    }
    emitter.on(event, bump)
    return () => {
      emitter.off(event, bump)
      window.clearTimeout(queued)
    }
  }, [emitter, event, throttleMs])
  return n
}
