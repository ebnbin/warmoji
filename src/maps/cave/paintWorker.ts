import { paintAlbedo, paintRelief } from './render'
import type { CaveJob, CavePiece } from './painter'
import type { CaveLayout } from './model'

let setup: { layout: CaveLayout; ppu: number; width: number } | undefined

self.onmessage = (e: MessageEvent<CaveJob>) => {
  const job = e.data
  if (job.kind === 'setup') {
    setup = { layout: job.layout, ppu: job.ppu, width: job.width }
    return
  }
  if (!setup) throw new Error('画溶洞地面的线程还没收到 setup')
  if (job.kind === 'relief') {
    const geo = new Uint8ClampedArray(job.size * 4)
    const norm = new Uint8ClampedArray(job.size * 4)
    paintRelief(setup.layout, geo, norm)
    const piece: CavePiece = { kind: 'relief', geo, norm }
    self.postMessage(piece, { transfer: [geo.buffer, norm.buffer] })
    return
  }
  const pixels = new Uint8ClampedArray((job.r1 - job.r0) * setup.width * 4)
  paintAlbedo(setup.layout, setup.ppu, pixels, job.r0, job.r1)
  const piece: CavePiece = { kind: 'rows', index: job.index, r0: job.r0, r1: job.r1, pixels }
  self.postMessage(piece, { transfer: [pixels.buffer] })
}
