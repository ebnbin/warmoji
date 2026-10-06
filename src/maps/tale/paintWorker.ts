import { buffersOf, paint, prepare } from './ground'
import type { PaintJob, PaintScene, Prepared } from './ground'

let scene: PaintScene | undefined
let prep: Prepared | undefined

self.onmessage = (e: MessageEvent<PaintJob>) => {
  const job = e.data
  if (job.kind === 'setup') {
    scene = job.scene
    prep = prepare(scene)
    return
  }
  if (!scene || !prep) throw new Error('画童话书的线程还没收到 setup')
  const piece = paint(scene, prep, job.index, job.layer, job.rect)
  self.postMessage(piece, { transfer: buffersOf(piece) })
}
