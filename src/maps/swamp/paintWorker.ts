import { paintCanopy, paintGround, pixelBuffer, prepare } from './ground'
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
  if (!scene || !prep) throw new Error('画泥潭的线程还没收到 setup')
  const pixels = pixelBuffer(job.rect)
  if (job.layer === 'ground') paintGround(scene, prep, pixels, job.rect)
  else paintCanopy(scene, prep, pixels, job.rect, job.layer)
  const piece: PaintPiece = { index: job.index, layer: job.layer, rect: job.rect, pixels }
  self.postMessage(piece, { transfer: [pixels.buffer] })
}
