import { paintCanopy, paintGround, pixelBuffer, prepare, prepareStatic } from './ground'
import type { PaintJob, PaintLayer, PaintPiece, PaintScene, PaintState, PixelRect, Prepared, Static } from './ground'

/** 退回主线程画时每画这么久让一次主线程，毫秒 */
const SLICE_MS = 50

const nextTick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

/** 一块活：画哪一层的哪一块 */
export interface PaintTask {
  readonly layer: PaintLayer
  readonly rect: PixelRect
}

/**
 * 画残垣的地面与树冠：交给几个后台线程一块一块地分着画，画好一块交回一块；墙塌了只把受影响的块按新的砌体补画。
 * 开不了线程或线程出了错，剩下的活退回主线程画
 */
export class RuinsPainter {
  private readonly scene: PaintScene
  private workers: Worker[] = []
  private settle?: () => void
  private closed = false
  private busy = false
  private local?: Static

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

  get idle(): boolean {
    return !this.busy && !this.closed
  }

  /** 按这一版砌体画这批块，画好一块交给 onPiece 一块；全画完或关掉了才 resolve */
  async paint(tasks: readonly PaintTask[], state: PaintState, onPiece: (p: PaintPiece) => void): Promise<void> {
    if (this.busy) throw new Error('上一批地面还没画完')
    this.busy = true
    try {
      const done = new Uint8Array(tasks.length)
      const take = (p: PaintPiece): void => {
        done[p.index] = 1
        onPiece(p)
      }
      if (this.workers.length > 0) {
        try {
          await this.farm(tasks, state, take)
        } catch (e) {
          this.fail(e)
        }
      }
      if (this.closed || done.every((d) => d === 1)) return
      this.local ??= prepareStatic(this.scene)
      let prep: Prepared | undefined
      let t = performance.now()
      for (let index = 0; index < tasks.length && !this.closed; index++) {
        if (done[index]) continue
        const { layer, rect } = tasks[index]!
        const pixels = pixelBuffer(rect)
        if (layer === 'ground') {
          prep ??= prepare(this.scene, state)
          paintGround(this.scene, this.local, prep, state, pixels, rect)
        } else paintCanopy(this.scene, this.local, pixels, rect)
        take({ index, layer, rect, pixels })
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

  /** 每个线程先拿到这一版砌体，再一块一块地要活：谁画完一块就再给它一块 */
  private farm(tasks: readonly PaintTask[], state: PaintState, take: (p: PaintPiece) => void): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let next = 0
      let left = tasks.length
      const finish = (): void => {
        this.settle = undefined
        resolve()
      }
      if (left === 0) return finish()
      this.settle = finish
      const feed = (w: Worker): void => {
        if (next >= tasks.length) return
        const job: PaintJob = { kind: 'paint', index: next, ...tasks[next]! }
        next++
        w.postMessage(job)
      }
      const st: PaintJob = { kind: 'state', state }
      for (const w of this.workers) {
        w.onmessage = (e: MessageEvent<PaintPiece>) => {
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
        w.postMessage(st)
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
