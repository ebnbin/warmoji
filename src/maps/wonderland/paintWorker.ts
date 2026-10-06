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
  if (!scene || !prep) throw new Error('画奇境的线程还没收到 setup')
  const ground = pixelBuffer(job.rect)
  const occ = pixelBuffer(job.rect)
  paintGround(scene, prep, job.rect, ground, occ)
  const piece: PaintPiece = { index: job.index, rect: job.rect, ground, occ }
  self.postMessage(piece, { transfer: [ground.buffer, occ.buffer] })
}
