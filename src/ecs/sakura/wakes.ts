import { hasComponent, query } from 'bitecs'
import { UNIT } from '../../util/units'
import { playSfx } from '../../audio/sfx'
import { Alive, Phys, Pickup, Radius, Shard, Span, Transform } from '../components'
import { flowAt } from './water'
import type Phaser from 'phaser'
import type { Flow, Water } from './water'
import type { Wading } from './bodies'
import type { Sim } from '../sim'

/**
 * 水里身体的水纹：站在水里的身体脚下一圈水线，迎水的一面推起浪、背水的一面拖出两道尾迹；随水漂着的身体周围翻着白沫，刚落水的哗啦一声。
 * skip 的身体不画（比如走在桥上的）
 */
export class Wakes {
  /** 上一帧随水漂着的身体：新落水的哗啦一声 */
  private afloat = new Set<number>()
  private readonly flow: Flow = { h: 0, u: 0, v: 0 }

  draw(g: Phaser.GameObjects.Graphics, sim: Sim, water: Water, swimming: ReadonlyMap<number, number>, cfg: Wading, time: number, skip: (eid: number) => boolean = () => false): void {
    const toPx = UNIT / cfg.meterPerU
    const f = this.flow
    g.clear()
    for (const eid of swimming.keys()) if (!this.afloat.has(eid)) playSfx('wash')
    this.afloat = new Set(swimming.keys())
    for (const eid of query(sim.world, [Phys, Transform, Radius])) {
      if (!Alive.v[eid] || Span.lo[eid]! > 0 || hasComponent(sim.world, eid, Pickup) || hasComponent(sim.world, eid, Shard) || skip(eid)) continue
      const x = Transform.x[eid]!
      const y = Transform.y[eid]!
      flowAt(water, x / UNIT, y / UNIT, f)
      if (f.h < cfg.body.wetM) continue
      const r = Radius.v[eid]!
      const deep = Math.min(1, f.h / 0.4)
      const fx = x
      const fy = y + r * 0.45
      const rx = f.u * toPx - Phys.vx[eid]!
      const ry = f.v * toPx - Phys.vy[eid]!
      const rel = Math.hypot(rx, ry)
      const push = Math.min(1, rel / (2.5 * UNIT))
      if (swimming.has(eid)) {
        for (let k = 0; k < 6; k++) {
          const a = k * 1.05 + time * (2 + (eid % 3))
          const d = r * (0.7 + 0.3 * Math.sin(time * 5 + k * 2.1 + eid))
          g.fillStyle(0xf2f8f6, 0.35 + 0.25 * Math.sin(time * 7 + k))
          g.fillCircle(fx + Math.cos(a) * d, fy + Math.sin(a) * d * 0.55, r * (0.18 + 0.08 * Math.sin(k + time * 4)))
        }
        g.lineStyle(0.06 * UNIT, 0xf4fbfa, 0.5)
        g.strokeEllipse(fx, fy, r * 2.4, r * 1.3)
        continue
      }
      const pulse = 1 + 0.06 * Math.sin(time * 3 + eid)
      g.lineStyle(0.045 * UNIT, 0xe8f4f2, 0.22 + 0.25 * deep)
      g.strokeEllipse(fx, fy, r * 2.1 * pulse, r * 1.05 * pulse)
      if (rel < 0.25 * UNIT) continue
      const ux = rx / rel
      const uy = ry / rel
      const a = Math.atan2(-uy, -ux * 0.5)
      g.lineStyle(0.07 * UNIT * (0.6 + push), 0xf6fcfb, 0.3 + 0.5 * push * deep)
      g.beginPath()
      for (let k = 0; k <= 8; k++) {
        const t = a - 1.2 + (2.4 * k) / 8
        const px = fx + Math.cos(t) * r * 1.05
        const py = fy + Math.sin(t) * r * 0.55
        if (k === 0) g.moveTo(px, py)
        else g.lineTo(px, py)
      }
      g.strokePath()
      const len = r * (0.7 + 1.5 * push)
      for (const side of [-1, 1]) {
        let px = fx - uy * side * r * 0.95
        let py = fy + ux * side * r * 0.5
        const dx = ux - uy * side * 0.45
        const dy = (uy + ux * side * 0.45) * 0.6
        for (let k = 0; k < 4; k++) {
          const nx = px + (dx * len) / 4
          const ny = py + (dy * len) / 4
          g.lineStyle(0.05 * UNIT * (1 - k * 0.18), 0xeef8f6, (0.12 + 0.35 * push * deep) * (1 - k / 4))
          g.lineBetween(px, py, nx, ny)
          px = nx
          py = ny
        }
      }
    }
  }
}
