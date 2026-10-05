import { paintCanopy, paintGround, pixelBuffer, prepare, prepareStatic } from './ground'
import type { PaintJob, PaintPiece, PaintScene, PaintState, Prepared, Static } from './ground'

let scene: PaintScene | undefined
let stat: Static | undefined
let state: PaintState | undefined
let prep: Prepared | undefined

self.onmessage = (e: MessageEvent<PaintJob>) => {
  const job = e.data
  if (job.kind === 'setup') {
    scene = job.scene
    stat = prepareStatic(scene)
    return
  }
  if (!scene || !stat) throw new Error('画地面的线程还没收到 setup')
  if (job.kind === 'state') {
    state = job.state
    prep = undefined
    return
  }
  if (!state) throw new Error('画地面的线程还没收到 state')
  const pixels = pixelBuffer(job.rect)
  if (job.layer === 'ground') {
    prep ??= prepare(scene, state)
    paintGround(scene, stat, prep, state, pixels, job.rect)
  } else paintCanopy(stat, pixels, job.rect)
  const piece: PaintPiece = { index: job.index, layer: job.layer, rect: job.rect, pixels }
  self.postMessage(piece, { transfer: [pixels.buffer] })
}
