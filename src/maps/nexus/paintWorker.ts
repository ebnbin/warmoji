import { paintGround, pixelBuffer } from './ground'
import type { PaintJob, PaintPiece, PaintScene } from './ground'

let scene: PaintScene | undefined

self.onmessage = (e: MessageEvent<PaintJob>) => {
  const job = e.data
  if (job.kind === 'setup') {
    scene = job.scene
    return
  }
  if (!scene) throw new Error('画天枢的线程还没收到 setup')
  const pixels = pixelBuffer(job.rect)
  paintGround(scene, pixels, job.rect)
  const piece: PaintPiece = { index: job.index, rect: job.rect, pixels }
  self.postMessage(piece, { transfer: [pixels.buffer] })
}
