import { bandBuffer, paintBand } from './render'
import type { NebulaSheet, SheetBand, SheetJob, SheetPiece } from './render'

/** 退回主线程画时每画这么久让一次主线程，毫秒 */
const SLICE_MS = 40

const nextTick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

/** 画星云的数据贴图与遗迹图集：几个后台线程分条画，谁画完一条就再给它一条；开不了线程或线程出错，剩下的退回主线程分片画 */
export class NebulaPainter {
  private readonly sheet: NebulaSheet
  private workers: Worker[] = []
  private closed = false
  private settle?: () => void

  constructor(sheet: NebulaSheet, threads: number) {
    this.sheet = sheet
    const setup: SheetJob = { kind: 'setup', sheet }
    try {
      for (let k = 0; k < threads; k++) {
        const w = new Worker(new URL('./paintWorker.ts', import.meta.url), { type: 'module' })
        this.workers.push(w)
        w.postMessage(setup)
      }
    } catch (e) {
      this.fail(e)
    }
  }

  /** 画完这些条或关掉了才 resolve；画好一条交给 onPiece 一条 */
  async paint(bands: readonly SheetBand[], onPiece: (p: SheetPiece) => void): Promise<void> {
    const done = new Uint8Array(bands.length)
    const take = (p: SheetPiece): void => {
      done[p.index] = 1
      onPiece(p)
    }
    if (this.workers.length > 0) {
      try {
        await this.farm(bands, take)
      } catch (e) {
        this.fail(e)
      }
    }
    let t = performance.now()
    for (let index = 0; index < bands.length && !this.closed; index++) {
      if (done[index]) continue
      const band = bands[index]!
      const pixels = bandBuffer(this.sheet, band)
      paintBand(this.sheet, band, pixels)
      take({ index, band, pixels })
      if (performance.now() - t < SLICE_MS) continue
      await nextTick()
      t = performance.now()
    }
    this.stop()
  }

  close(): void {
    this.closed = true
    this.stop()
    this.settle?.()
  }

  private farm(bands: readonly SheetBand[], take: (p: SheetPiece) => void): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let next = 0
      let left = bands.length
      const finish = (): void => {
        this.settle = undefined
        resolve()
      }
      if (left === 0) return finish()
      this.settle = finish
      const feed = (w: Worker): void => {
        if (next >= bands.length) return
        const job: SheetJob = { kind: 'paint', index: next, band: bands[next]! }
        next++
        w.postMessage(job)
      }
      for (const w of this.workers) {
        w.onmessage = (e: MessageEvent<SheetPiece>) => {
          take(e.data)
          if (--left === 0) finish()
          else feed(w)
        }
        w.onerror = (e) => {
          e.preventDefault()
          this.settle = undefined
          reject(new Error(e.message || '画星云的线程出错'))
        }
        w.onmessageerror = () => {
          this.settle = undefined
          reject(new Error('画星云的线程发回的消息解不开'))
        }
        feed(w)
      }
    })
  }

  private fail(e: unknown): void {
    console.error('画星云的线程用不了，改在主线程画', e)
    this.stop()
  }

  private stop(): void {
    for (const w of this.workers.splice(0)) {
      w.onmessage = null
      w.onerror = null
      w.onmessageerror = null
      w.terminate()
    }
  }
}
