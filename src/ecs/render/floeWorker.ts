import { paintFloe } from './floe'
import type { FloeCanvas, FloeJob, FloePiece } from './floe'

let canvas: FloeCanvas | undefined

self.onmessage = (e: MessageEvent<FloeJob>) => {
  const job = e.data
  if (job.kind === 'setup') {
    canvas = job.canvas
    return
  }
  if (!canvas) throw new Error('画冰面的线程还没收到 setup')
  const pixels = new Uint8ClampedArray(canvas.w * (job.r1 - job.r0) * 4)
  paintFloe(canvas, pixels, job.r0, job.r1)
  const piece: FloePiece = { index: job.index, r0: job.r0, r1: job.r1, pixels }
  self.postMessage(piece, { transfer: [pixels.buffer] })
}
