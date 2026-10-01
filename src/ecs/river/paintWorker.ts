import { indexTrees, paintCanopy, paintGround, pixelBuffer } from './ground'
import type { PaintJob, PaintPiece, PaintScene, TreeIndex } from './ground'

let scene: PaintScene | undefined
let shadows: TreeIndex | undefined
let crowns: TreeIndex | undefined

self.onmessage = (e: MessageEvent<PaintJob>) => {
  const job = e.data
  if (job.kind === 'setup') {
    scene = job.scene
    shadows = indexTrees(scene, true)
    crowns = indexTrees(scene, false)
    return
  }
  if (!scene || !shadows || !crowns) throw new Error('画地面的线程还没收到 setup')
  const pixels = pixelBuffer(job.rect)
  if (job.layer === 'ground') paintGround(scene, shadows, pixels, job.rect)
  else paintCanopy(scene, crowns, pixels, job.rect)
  const piece: PaintPiece = { index: job.index, layer: job.layer, rect: job.rect, pixels }
  self.postMessage(piece, { transfer: [pixels.buffer] })
}
