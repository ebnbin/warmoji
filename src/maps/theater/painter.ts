import { paintBackdrop, pixelBuffer, prepare } from './backdrop'
import type { PaintJob, PaintPiece, PaintScene, PixelRect } from './backdrop'

/** 退回主线程画时每画这么久让一次主线程，毫秒 */
const SLICE_MS = 50

const nextTick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

/**
 * 画舞台剧的地布、台板、台口与大幕：交给几个后台线程一块一块地分着画，画好一块交回一块；
 * 开不了线程或线程出了错，剩下的活退回主线程画
 */
export class TheaterPainter {
  private readonly scene: PaintScene
  private workers: Worker[] = []
  private settle?: () => void
  private closed = false

  constructor(scene: PaintScene, threads: number) {
    this.scene = scene
    const setup: PaintJob = { kind: 'setup', scene }
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

  /** 画这批块，画好一块交给 onPiece 一块；全画完或关掉了才 resolve */
  async paint(rects: readonly PixelRect[], onPiece: (p: PaintPiece) => void): Promise<void> {
    const done = new Uint8Array(rects.length)
    const take = (p: PaintPiece): void => {
      done[p.index] = 1
      onPiece(p)
    }
    if (this.workers.length > 0) {
      try {
        await this.farm(rects, take)
      } catch (e) {
        this.fail(e)
      }
    }
    if (this.closed || done.every((d) => d === 1)) return
    const prep = prepare()
    let t = performance.now()
    for (let index = 0; index < rects.length && !this.closed; index++) {
      if (done[index]) continue
      const rect = rects[index]!
      const pixels = pixelBuffer(rect)
      paintBackdrop(this.scene, prep, pixels, rect)
      take({ index, rect, pixels })
      if (performance.now() - t < SLICE_MS) continue
      await nextTick()
      t = performance.now()
    }
  }

  close(): void {
    this.closed = true
    this.stop()
    this.settle?.()
  }

  /** 谁画完一块就再给它一块 */
  private farm(rects: readonly PixelRect[], take: (p: PaintPiece) => void): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let next = 0
      let left = rects.length
      const finish = (): void => {
        this.settle = undefined
        resolve()
      }
      if (left === 0) return finish()
      this.settle = finish
      const feed = (w: Worker): void => {
        if (next >= rects.length) return
        const job: PaintJob = { kind: 'paint', index: next, rect: rects[next]! }
        next++
        w.postMessage(job)
      }
      for (const w of this.workers) {
        w.onmessage = (e: MessageEvent<PaintPiece>) => {
          take(e.data)
          if (--left === 0) finish()
          else feed(w)
        }
        w.onerror = (e) => {
          e.preventDefault()
          this.settle = undefined
          reject(new Error(e.message || '画舞台剧的线程出错'))
        }
        w.onmessageerror = () => {
          this.settle = undefined
          reject(new Error('画舞台剧的线程发回的消息解不开'))
        }
        feed(w)
      }
    })
  }

  private fail(e: unknown): void {
    console.error('画舞台剧的线程用不了，改在主线程画', e)
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
