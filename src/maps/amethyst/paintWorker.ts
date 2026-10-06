import { paintRelief, paintRows } from './ground'
import type { PaintJob, PaintPiece } from './painter'
import type { AmethystLayout } from './layout'

let setup: { layout: AmethystLayout; ppu: number; width: number } | undefined

self.onmessage = (e: MessageEvent<PaintJob>) => {
  const job = e.data
  if (job.kind === 'setup') {
    setup = { layout: job.layout, ppu: job.ppu, width: job.width }
    return
  }
  if (!setup) throw new Error('画紫水晶洞穴地面的线程还没收到 setup')
  if (job.kind === 'relief') {
    const geo = new Uint8ClampedArray(job.size * 4)
    paintRelief(setup.layout, geo)
    const piece: PaintPiece = { kind: 'relief', geo }
    self.postMessage(piece, { transfer: [geo.buffer] })
    return
  }
  const albedo = new Uint8ClampedArray((job.r1 - job.r0) * setup.width * 4)
  const face = new Uint8ClampedArray((job.r1 - job.r0) * setup.width * 4)
  paintRows(setup.layout, setup.ppu, job.r0, job.r1, albedo, face)
  const piece: PaintPiece = { kind: 'rows', index: job.index, r0: job.r0, r1: job.r1, albedo, face }
  self.postMessage(piece, { transfer: [albedo.buffer, face.buffer] })
}
