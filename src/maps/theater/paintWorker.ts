import { paintBackdrop, pixelBuffer, prepare } from './backdrop'
import type { PaintJob, PaintPiece, PaintScene, Prepared } from './backdrop'

let scene: PaintScene | undefined
let prep: Prepared | undefined

self.onmessage = (e: MessageEvent<PaintJob>) => {
  const job = e.data
  if (job.kind === 'setup') {
    scene = job.scene
    prep = prepare()
    return
  }
  if (!scene || prep === undefined) throw new Error('画舞台剧的线程还没收到 setup')
  const pixels = pixelBuffer(job.rect)
  paintBackdrop(scene, prep, pixels, job.rect)
  const piece: PaintPiece = { index: job.index, rect: job.rect, pixels }
  self.postMessage(piece, { transfer: [pixels.buffer] })
}
