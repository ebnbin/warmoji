import { PAINT, pixelBuffer, prepare } from './ground'
import type { PaintJob, PaintPiece, PaintScene, Prepared } from './ground'

let scene: PaintScene | undefined
let prep: Prepared | undefined

self.onmessage = (e: MessageEvent<PaintJob>) => {
  const job = e.data
  if (job.kind === 'setup') {
    scene = job.scene
    prep = prepare(scene)
    return
  }
  if (!scene || !prep) throw new Error('画樱庭的线程还没收到 setup')
  const pixels = pixelBuffer(job.rect)
  PAINT[job.layer](scene, prep, pixels, job.rect)
  const piece: PaintPiece = { index: job.index, layer: job.layer, rect: job.rect, pixels }
  self.postMessage(piece, { transfer: [pixels.buffer] })
}
