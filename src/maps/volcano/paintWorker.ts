import { groundBuffer, paintGround, rockMasks } from './render'
import type { GroundJob, GroundPiece, RockMasks } from './render'

let setup: Extract<GroundJob, { kind: 'setup' }> | undefined
let state: { ground: Float32Array; rockAt: Float32Array; masks: RockMasks } | undefined

self.onmessage = (e: MessageEvent<GroundJob>) => {
  const job = e.data
  if (job.kind === 'setup') {
    setup = job
    return
  }
  if (!setup) throw new Error('画地面的线程还没收到 setup')
  const { cols, rows } = setup.field
  if (job.kind === 'state') {
    state = { ground: job.ground, rockAt: job.rockAt, masks: rockMasks({ cols, rows, rockAt: job.rockAt }) }
    return
  }
  if (!state) throw new Error('画地面的线程还没收到 state')
  const { c0, r0, c1, r1 } = job.rect
  const pixels = groundBuffer(job.rect, setup.ppc)
  paintGround({ ...setup.field, ground: state.ground, rockAt: state.rockAt }, setup.cfg, setup.ppc, setup.marks, state.masks, pixels, c0, r0, c1, r1)
  const piece: GroundPiece = { index: job.index, rect: job.rect, pixels }
  self.postMessage(piece, { transfer: [pixels.buffer] })
}
