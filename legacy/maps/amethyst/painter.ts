import { paintRelief, paintRows } from './ground'
import type { Seam } from './ground'
import type { AmethystLayout } from './layout'

/** 发给画地面的线程的活：先 setup 一次，再要高度图（relief）或一段段的地面（rows） */
export type PaintJob =
  | { readonly kind: 'setup'; readonly layout: AmethystLayout; readonly seams: readonly Seam[]; readonly ppu: number; readonly width: number }
  | { readonly kind: 'relief'; readonly size: number }
  | { readonly kind: 'rows'; readonly index: number; readonly r0: number; readonly r1: number }

/** 线程交回来的：一段地面的固有色与表面朝向（按行排），或高度图 */
export type PaintPiece =
  | { readonly kind: 'rows'; readonly index: number; readonly r0: number; readonly r1: number; readonly albedo: Uint8ClampedArray<ArrayBuffer>; readonly face: Uint8ClampedArray<ArrayBuffer> }
  | { readonly kind: 'relief'; readonly geo: Uint8ClampedArray<ArrayBuffer> }

/** 每段地面多少行 */
const BAND = 32
/** 退回主线程画时每画这么久让一次主线程，毫秒 */
const SLICE_MS = 40

const yieldNow = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

/**
 * 画紫晶洞的地面：一个线程先画高度图，其余线程一段段地画地面，谁交回一段就再给它一段；
 * 开不了线程或线程出了错，剩下的活退回主线程画
 */
export class AmethystPainter {
  private workers: Worker[] = []
  private closed = false
  private release?: () => void

  constructor(
    private readonly layout: AmethystLayout,
    private readonly seams: readonly Seam[],
    private readonly ppu: number,
    private readonly width: number,
    private readonly height: number,
    threads: number,
  ) {
    const setup: PaintJob = { kind: 'setup', layout, seams, ppu, width }
    try {
      for (let k = 0; k < threads; k++) {
        const w = new Worker(new URL('./paintWorker.ts', import.meta.url), { type: 'module' })
        this.workers.push(w)
        w.postMessage(setup)
      }
    } catch (e) {
      this.giveUp(e)
    }
  }

  /** 画高度图（reliefSize 个像素）与整张地面：画好一段交给 onRows，高度图交给 onRelief；全画完或关掉了才 resolve */
  async paint(reliefSize: number, onRows: (r0: number, r1: number, albedo: Uint8ClampedArray<ArrayBuffer>, face: Uint8ClampedArray<ArrayBuffer>) => void, onRelief: (geo: Uint8ClampedArray<ArrayBuffer>) => void): Promise<void> {
    const bands: { r0: number; r1: number }[] = []
    for (let r = 0; r < this.height; r += BAND) bands.push({ r0: r, r1: Math.min(this.height, r + BAND) })
    const done = new Uint8Array(bands.length)
    let relief = false
    if (this.workers.length > 0) {
      try {
        await this.farm(reliefSize, bands, (p) => {
          if (p.kind === 'relief') {
            relief = true
            onRelief(p.geo)
            return
          }
          done[p.index] = 1
          onRows(p.r0, p.r1, p.albedo, p.face)
        })
      } catch (e) {
        this.giveUp(e)
      }
    }
    if (this.closed) return
    if (!relief) {
      const geo = new Uint8ClampedArray(reliefSize * 4)
      paintRelief(this.layout, geo)
      onRelief(geo)
      await yieldNow()
    }
    let t = performance.now()
    for (let i = 0; i < bands.length && !this.closed; i++) {
      if (done[i]) continue
      const b = bands[i]!
      const albedo = new Uint8ClampedArray((b.r1 - b.r0) * this.width * 4)
      const face = new Uint8ClampedArray((b.r1 - b.r0) * this.width * 4)
      paintRows(this.layout, this.seams, this.ppu, b.r0, b.r1, albedo, face)
      onRows(b.r0, b.r1, albedo, face)
      if (performance.now() - t < SLICE_MS) continue
      await yieldNow()
      t = performance.now()
    }
  }

  close(): void {
    this.closed = true
    this.stop()
    this.release?.()
  }

  /** 第一个线程先画高度图，之后和其余线程一起一段段地要地面的活 */
  private farm(reliefSize: number, bands: readonly { r0: number; r1: number }[], take: (p: PaintPiece) => void): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let next = 0
      let left = bands.length + 1
      const finish = (): void => {
        this.release = undefined
        resolve()
      }
      this.release = finish
      const feed = (w: Worker): void => {
        if (next >= bands.length) return
        const b = bands[next]!
        const job: PaintJob = { kind: 'rows', index: next, r0: b.r0, r1: b.r1 }
        next++
        w.postMessage(job)
      }
      this.workers.forEach((w, k) => {
        w.onmessage = (e: MessageEvent<PaintPiece>) => {
          take(e.data)
          if (--left === 0) finish()
          else feed(w)
        }
        w.onerror = (e) => {
          e.preventDefault()
          this.release = undefined
          reject(new Error(e.message || '画紫晶洞地面的线程出错'))
        }
        w.onmessageerror = () => {
          this.release = undefined
          reject(new Error('画紫晶洞地面的线程发回的消息解不开'))
        }
        if (k === 0) {
          const job: PaintJob = { kind: 'relief', size: reliefSize }
          w.postMessage(job)
        } else feed(w)
      })
    })
  }

  private giveUp(e: unknown): void {
    console.error('画紫晶洞地面的线程用不了，改在主线程画', e)
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
