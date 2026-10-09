import { paintGround, pixelBuffer, prepare } from './ground'
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
  if (!scene || !prep) throw new Error('画培养皿的线程还没收到 setup')
  const pixels = pixelBuffer(job.rect)
  paintGround(scene, prep, pixels, job.rect)
  const piece: PaintPiece = { index: job.index, rect: job.rect, pixels }
  self.postMessage(piece, { transfer: [pixels.buffer] })
}
