import { paintAlbedo, paintRelief, paintScene } from './ground'
import type { PaintScene } from './ground'
import type { DeepJob, DeepPiece } from './painter'

let setup: { scene: PaintScene; ppu: number; width: number } | undefined

self.onmessage = (e: MessageEvent<DeepJob>) => {
  const job = e.data
  if (job.kind === 'setup') {
    setup = { scene: paintScene(job.plan, job.meterPerU), ppu: job.ppu, width: job.width }
    return
  }
  if (!setup) throw new Error('画暖海礁湖的线程还没收到 setup')
  if (job.kind === 'relief') {
    const geo = new Uint8ClampedArray(job.size * 4)
    const norm = new Uint8ClampedArray(job.size * 4)
    paintRelief(setup.scene, geo, norm)
    const piece: DeepPiece = { kind: 'relief', geo, norm }
    self.postMessage(piece, { transfer: [geo.buffer, norm.buffer] })
    return
  }
  const pixels = new Uint8ClampedArray((job.r1 - job.r0) * setup.width * 4)
  paintAlbedo(setup.scene, setup.ppu, pixels, job.r0, job.r1)
  const piece: DeepPiece = { kind: 'rows', index: job.index, r0: job.r0, r1: job.r1, pixels }
  self.postMessage(piece, { transfer: [pixels.buffer] })
}
