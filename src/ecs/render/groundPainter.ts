import { groundBuffer, paintGround, rockMasks } from './volcano'
import type { CellRect, GroundField, GroundJob, GroundMarks, GroundPiece } from './volcano'
import type { VolcanoConfig } from '../../types/maps'

/** 退回主线程画时每画这么久让一次主线程，毫秒 */
const SLICE_MS = 50

const nextTick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

/**
 * 画地面：交给后台线程，几个线程一块一块地分着画，画好一块交回一块；
 * 开不了线程或线程出了错，剩下的活退回主线程画。
 */
export class GroundPainter {
  private readonly field: GroundField
  private readonly cfg: VolcanoConfig
  private readonly marks: GroundMarks
  private readonly ppc: number
  private workers: Worker[] = []
  private busy = false
  /** 正等着线程画完的这批活：关掉时直接了结 */
  private settle?: () => void
  private closed = false

  constructor(field: GroundField, cfg: VolcanoConfig, marks: GroundMarks, ppc: number, threads: number) {
    this.field = field
    this.cfg = cfg
    this.marks = marks
    this.ppc = ppc
    const setup: GroundJob = { kind: 'setup', field, cfg, marks, ppc }
    try {
      for (let k = 0; k < threads; k++) {
        const w = new Worker(new URL('./groundWorker.ts', import.meta.url), { type: 'module' })
        this.workers.push(w)
        w.postMessage(setup)
      }
    } catch (e) {
      this.fail(e)
    }
  }

  /** 按给的地形与岩石画这批块，画好一块交给 onPiece 一块；全画完或关掉了才 resolve */
  async paint(rects: readonly CellRect[], ground: Float32Array, rockAt: Float32Array, onPiece: (p: GroundPiece) => void): Promise<void> {
    if (this.busy) throw new Error('上一批地面还没画完')
    this.busy = true
    try {
      const done = new Uint8Array(rects.length)
      let left = rects.length
      const take = (p: GroundPiece): void => {
        done[p.index] = 1
        left--
        onPiece(p)
      }
      if (this.workers.length > 0) {
        try {
          await this.farm(rects, ground, rockAt, take)
        } catch (e) {
          this.fail(e)
        }
      }
      if (left === 0 || this.closed) return
      const field = { ...this.field, ground, rockAt }
      const masks = rockMasks(field)
      let t = performance.now()
      for (let index = 0; index < rects.length && !this.closed; index++) {
        if (done[index]) continue
        const rect = rects[index]!
        const pixels = groundBuffer(rect, this.ppc)
        paintGround(field, this.cfg, this.ppc, this.marks, masks, pixels, rect.c0, rect.r0, rect.c1, rect.r1)
        take({ index, rect, pixels })
        if (performance.now() - t < SLICE_MS) continue
        await nextTick()
        t = performance.now()
      }
    } finally {
      this.busy = false
    }
  }

  /** 只留 n 个线程：开局分着画完整张以后，补画用不了那么多 */
  trim(n: number): void {
    if (this.busy) throw new Error('地面画到一半不能减线程')
    this.stop(n)
  }

  close(): void {
    this.closed = true
    this.stop(0)
    this.settle?.()
  }

  /** 每个线程先拿到这批的地形与岩石，再一块一块地要活：谁画完一块就再给它一块 */
  private farm(rects: readonly CellRect[], ground: Float32Array, rockAt: Float32Array, take: (p: GroundPiece) => void): Promise<void> {
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
        const job: GroundJob = { kind: 'paint', index: next, rect: rects[next]! }
        next++
        w.postMessage(job)
      }
      const state: GroundJob = { kind: 'state', ground, rockAt }
      for (const w of this.workers) {
        w.onmessage = (e: MessageEvent<GroundPiece>) => {
          take(e.data)
          if (--left === 0) finish()
          else feed(w)
        }
        w.onerror = (e) => {
          e.preventDefault()
          this.settle = undefined
          reject(new Error(e.message || '画地面的线程出错'))
        }
        w.onmessageerror = () => {
          this.settle = undefined
          reject(new Error('画地面的线程发回的消息解不开'))
        }
        w.postMessage(state)
        feed(w)
      }
    })
  }

  private fail(e: unknown): void {
    console.error('画地面的线程用不了，改在主线程画', e)
    this.stop(0)
  }

  private stop(keep: number): void {
    for (const w of this.workers.splice(keep)) {
      w.onmessage = null
      w.onerror = null
      w.onmessageerror = null
      w.terminate()
    }
  }
}
