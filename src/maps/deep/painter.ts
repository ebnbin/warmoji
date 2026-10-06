import { paintAlbedo, paintRelief, paintScene } from './ground'
import type { PaintScene } from './ground'
import type { DeepPlan } from './layout'

/** 发给画礁湖的线程：先 setup 一次，再要高度图（relief）或一段段的地面（rows） */
export type DeepJob =
  | { readonly kind: 'setup'; readonly plan: DeepPlan; readonly meterPerU: number; readonly ppu: number; readonly width: number }
  | { readonly kind: 'relief'; readonly size: number }
  | { readonly kind: 'rows'; readonly index: number; readonly r0: number; readonly r1: number }

/** 线程交回来的：一段地面的像素（按行排），或高度图与法线图 */
export type DeepPiece =
  | { readonly kind: 'rows'; readonly index: number; readonly r0: number; readonly r1: number; readonly pixels: Uint8ClampedArray<ArrayBuffer> }
  | { readonly kind: 'relief'; readonly geo: Uint8ClampedArray<ArrayBuffer>; readonly norm: Uint8ClampedArray<ArrayBuffer> }

/** 每段地面多少行 */
const ROWS = 32
/** 退回主线程画时每画这么久让一次主线程，毫秒 */
const SLICE_MS = 40

const nextTick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

/**
 * 画礁湖：交给几个后台线程，一个线程先画高度图，其余一段段地画地面，画好一段交回一段；
 * 开不了线程或线程出了错，剩下的活退回主线程画
 */
export class DeepPainter {
  private readonly scene: PaintScene
  private readonly ppu: number
  private readonly width: number
  private workers: Worker[] = []
  private closed = false
  private settle?: () => void

  constructor(plan: DeepPlan, meterPerU: number, ppu: number, width: number, threads: number) {
    this.scene = paintScene(plan, meterPerU)
    this.ppu = ppu
    this.width = width
    const setup: DeepJob = { kind: 'setup', plan, meterPerU, ppu, width }
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

  /** 画高度图（reliefSize 个像素）与整张地面：画好一段地面交给 onRows，高度图交给 onRelief；全画完或关掉了才 resolve */
  async paint(reliefSize: number, onRows: (r0: number, r1: number, pixels: Uint8ClampedArray<ArrayBuffer>) => void, onRelief: (geo: Uint8ClampedArray<ArrayBuffer>, norm: Uint8ClampedArray<ArrayBuffer>) => void): Promise<void> {
    const chunks: { r0: number; r1: number }[] = []
    for (let r = 0; r < this.width; r += ROWS) chunks.push({ r0: r, r1: Math.min(this.width, r + ROWS) })
    const done = new Uint8Array(chunks.length)
    let relief = false
    if (this.workers.length > 0) {
      try {
        await this.farm(reliefSize, chunks, (p) => {
          if (p.kind === 'relief') {
            relief = true
            onRelief(p.geo, p.norm)
            return
          }
          done[p.index] = 1
          onRows(p.r0, p.r1, p.pixels)
        })
      } catch (e) {
        this.fail(e)
      }
    }
    if (this.closed) return
    if (!relief) {
      const geo = new Uint8ClampedArray(reliefSize * 4)
      const norm = new Uint8ClampedArray(reliefSize * 4)
      paintRelief(this.scene, geo, norm)
      onRelief(geo, norm)
      await nextTick()
    }
    let t = performance.now()
    for (let i = 0; i < chunks.length && !this.closed; i++) {
      if (done[i]) continue
      const c = chunks[i]!
      const pixels = new Uint8ClampedArray((c.r1 - c.r0) * this.width * 4)
      paintAlbedo(this.scene, this.ppu, pixels, c.r0, c.r1)
      onRows(c.r0, c.r1, pixels)
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

  /** 第一个线程先画高度图，之后和其余线程一起一段段地要地面的活：谁交回一段就再给它一段 */
  private farm(reliefSize: number, chunks: readonly { r0: number; r1: number }[], take: (p: DeepPiece) => void): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let next = 0
      let left = chunks.length + 1
      const finish = (): void => {
        this.settle = undefined
        resolve()
      }
      this.settle = finish
      const feed = (w: Worker): void => {
        if (next >= chunks.length) return
        const c = chunks[next]!
        const job: DeepJob = { kind: 'rows', index: next, r0: c.r0, r1: c.r1 }
        next++
        w.postMessage(job)
      }
      this.workers.forEach((w, k) => {
        w.onmessage = (e: MessageEvent<DeepPiece>) => {
          take(e.data)
          if (--left === 0) finish()
          else feed(w)
        }
        w.onerror = (e) => {
          e.preventDefault()
          this.settle = undefined
          reject(new Error(e.message || '画暖海礁湖的线程出错'))
        }
        w.onmessageerror = () => {
          this.settle = undefined
          reject(new Error('画暖海礁湖的线程发回的消息解不开'))
        }
        if (k === 0) {
          const job: DeepJob = { kind: 'relief', size: reliefSize }
          w.postMessage(job)
        } else feed(w)
      })
    })
  }

  private fail(e: unknown): void {
    console.error('画暖海礁湖的线程用不了，改在主线程画', e)
    this.stop()
  }

  private stop(): void {
    for (const w of this.workers) {
      w.onmessage = null
      w.onerror = null
      w.onmessageerror = null
      w.terminate()
    }
    this.workers = []
  }
}
