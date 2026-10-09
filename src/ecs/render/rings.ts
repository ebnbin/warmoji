import Phaser from 'phaser'
import { query } from 'bitecs'
import { Ring, RING_SET, Tint, Transform } from '../components'
import { fan, place, ringStrip, segment } from './tri'
import type { Scratch } from './tri'
import type { EcsWorld } from '../world'
import { LayerType, TriBatch } from './layer'
import { SIDE, zoneSide } from './side'
import { packTint } from './tint'

type Matrix = Phaser.GameObjects.Components.TransformMatrix

/** 伤得到队伍的场：边是一圈慢慢转的红色虚线，里面铺红色斜纹；底色仍是能力自己的颜色 */
const HAZARD = { line: 4, lineAlpha: 0.95, dash: 22, dashFill: 0.62, spinPerMs: 0.0006, stripeGap: 16, stripeWidth: 5, stripeAlpha: 0.22 }
/** 队伍自己放的场：底色淡一些，边是一圈细细的淡蓝 */
const OWN = { fillMul: 0.6, line: 2, lineAlpha: 0.5 }

/** 圆里铺一层 45° 的斜纹 */
function stripes(o: Scratch, m: Matrix, x: number, y: number, r: number, color: number): void {
  const k = Math.SQRT1_2
  for (let c = -r + HAZARD.stripeGap / 2; c < r; c += HAZARD.stripeGap) {
    const half = Math.sqrt(r * r - c * c)
    const cx = x + c * k
    const cy = y + c * k
    segment(o, m, cx - half * k, cy + half * k, cx + half * k, cy - half * k, HAZARD.stripeWidth, color)
  }
}

/** 一圈虚线，每段占一格的 dashFill，整圈按 spin 转着 */
function dashes(o: Scratch, m: Matrix, x: number, y: number, r: number, spin: number, color: number): void {
  const n = Math.max(8, Math.round((Math.PI * 2 * r) / HAZARD.dash))
  const step = (Math.PI * 2) / n
  for (let i = 0; i < n; i++) {
    const a = spin + i * step
    ringStrip(o, m, x, y, r, HAZARD.line, color, a, a + step * HAZARD.dashFill)
  }
}

interface Breath {
  ms: number
  scaleLo: number
  scaleHi: number
  alphaLo: number
  alphaHi: number
}

const BREATHS: readonly Breath[] = [
  { ms: 1, scaleLo: 1, scaleHi: 1, alphaLo: 1, alphaHi: 1 },
  { ms: 700, scaleLo: 0.82, scaleHi: 1.12, alphaLo: 0.35, alphaHi: 0.9 },
  { ms: 650, scaleLo: 0.85, scaleHi: 1.12, alphaLo: 0.4, alphaHi: 0.85 },
]

const BANDS: readonly { depth: number; zMin: number; zMax: number }[] = [
  { depth: 2, zMin: -Infinity, zMax: 3 },
  { depth: 2.5, zMin: 3, zMax: 4 },
  { depth: 4, zMin: 4, zMax: Infinity },
]

function breath(age: number, ms: number): number {
  const t = (age % (ms * 2)) / ms
  return t <= 1 ? t : 2 - t
}

/** 地上不属于实体的圈与路，按世界坐标画好：below 压在实体的圈下面，above 盖在上面 */
export interface GroundPaint {
  readonly below: Scratch
  readonly above: Scratch
}

export class RingLayer {
  private readonly batches: TriBatch[] = []
  private now = 0

  constructor(scene: Phaser.Scene, private readonly world: EcsWorld, private readonly ground: GroundPaint) {
    for (let b = 0; b < BANDS.length; b++) this.batches.push(new TriBatch(scene, LayerType.Ring, BANDS[b]!.depth, (o, m) => this.buildBand(b, o, m)))
  }

  destroy(): void {
    for (const b of this.batches) b.destroy()
    this.batches.length = 0
  }

  step(fxMs: number): void {
    this.now = fxMs
  }

  private buildBand(band: number, o: Scratch, m: Phaser.GameObjects.Components.TransformMatrix): void {
    const { zMin, zMax } = BANDS[band]!
    if (zMin === -Infinity) place(o, m, this.ground.below)
    for (const eid of query(this.world, RING_SET)) {
      const z = Ring.z[eid]!
      if (z < zMin || z >= zMax) continue
      const b = BREATHS[Ring.breathe[eid]!]!
      const t = Ring.breathe[eid] ? breath(this.now - Ring.born[eid]!, b.ms) : 0
      const r = Ring.radius[eid]! * (b.scaleLo + (b.scaleHi - b.scaleLo) * t)
      const a = (b.alphaHi + (b.alphaLo - b.alphaHi) * t) * Tint.alpha[eid]!
      const x = Transform.x[eid]!
      const y = Transform.y[eid]! + Ring.dy[eid]!
      const color = Ring.color[eid]!
      const side = zoneSide(this.world, eid)
      if (side === 'foe') {
        fan(o, m, x, y, r, packTint(color, Ring.fillAlpha[eid]! * a))
        stripes(o, m, x, y, r, packTint(SIDE.foe, HAZARD.stripeAlpha * a))
        dashes(o, m, x, y, r, this.now * HAZARD.spinPerMs, packTint(SIDE.foe, HAZARD.lineAlpha * a))
      } else if (side === 'team') {
        fan(o, m, x, y, r, packTint(color, Ring.fillAlpha[eid]! * OWN.fillMul * a))
        ringStrip(o, m, x, y, r, OWN.line, packTint(SIDE.team, OWN.lineAlpha * a))
      } else {
        fan(o, m, x, y, r, packTint(color, Ring.fillAlpha[eid]! * a))
        ringStrip(o, m, x, y, r, Ring.lineWidth[eid]!, packTint(color, Ring.lineAlpha[eid]! * a))
      }
    }
    if (zMin === -Infinity) place(o, m, this.ground.above)
  }
}
