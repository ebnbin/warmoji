import { paintFloe } from './render'
import type { FloeCanvas, FloeJob, FloePiece } from './render'

/** 一次交给一个线程画多少行 */
const BAND = 24
/** 退回主线程画时每画这么久让一次主线程，毫秒 */
const SLICE_MS = 40

const nextTick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

/**
 * 画冰面：几个后台线程一段一段地分着画，谁画完一段就再给谁一段，画好一段交回一段；
 * 开不了线程或线程出了错，没画完的段退回主线程画，画一阵让一下主线程
 */
export class FloePainter {
  private readonly canvas: FloeCanvas
  private workers: Worker[] = []
  private closed = false
  private settle?: () => void

  constructor(canvas: FloeCanvas, threads: number) {
    this.canvas = canvas
    const setup: FloeJob = { kind: 'setup', canvas }
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

  /** 整张画完（或关掉了）才 resolve；画好一段交给 onPiece 一段 */
  async paint(onPiece: (p: FloePiece) => void): Promise<void> {
    const bands: { r0: number; r1: number }[] = []
    for (let r = 0; r < this.canvas.h; r += BAND) bands.push({ r0: r, r1: Math.min(this.canvas.h, r + BAND) })
    const done = new Uint8Array(bands.length)
    const take = (p: FloePiece): void => {
      if (done[p.index]) return
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
      const { r0, r1 } = bands[index]!
      const pixels = new Uint8ClampedArray(this.canvas.w * (r1 - r0) * 4)
      paintFloe(this.canvas, pixels, r0, r1)
      take({ index, r0, r1, pixels })
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

  private farm(bands: readonly { r0: number; r1: number }[], take: (p: FloePiece) => void): Promise<void> {
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
        const job: FloeJob = { kind: 'paint', index: next, ...bands[next]! }
        next++
        w.postMessage(job)
      }
      for (const w of this.workers) {
        w.onmessage = (e: MessageEvent<FloePiece>) => {
          take(e.data)
          if (--left === 0) finish()
          else feed(w)
        }
        w.onerror = (e) => {
          e.preventDefault()
          this.settle = undefined
          reject(new Error(e.message || '画冰面的线程出错'))
        }
        w.onmessageerror = () => {
          this.settle = undefined
          reject(new Error('画冰面的线程发回的消息解不开'))
        }
        feed(w)
      }
    })
  }

  private fail(e: unknown): void {
    console.error('画冰面的线程用不了，改在主线程画', e)
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
