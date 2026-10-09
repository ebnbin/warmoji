import { bandBuffer, paintBand } from './render'
import type { NebulaSheet, SheetJob, SheetPiece } from './render'

let sheet: NebulaSheet | undefined

self.onmessage = (e: MessageEvent<SheetJob>) => {
  const job = e.data
  if (job.kind === 'setup') {
    sheet = job.sheet
    return
  }
  if (!sheet) throw new Error('画星云的线程还没收到 setup')
  const pixels = bandBuffer(sheet, job.band)
  paintBand(sheet, job.band, pixels)
  const piece: SheetPiece = { index: job.index, band: job.band, pixels }
  self.postMessage(piece, { transfer: [pixels.buffer] })
}
