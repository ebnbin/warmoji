import { UNIT } from '../../util/units'
import { playSfx } from '../../audio/sfx'
import { charSize } from './shared/scale'
import { endMotion } from './shared/displace'
import { REJOIN, SQUAD } from '../../data/feel'
import { Alive, Breath, Depth, Facing, Motion, MOTION, Phys, Pop, Revive, Sprite, Transform } from '../components'
import { spawnFxCircle } from '../entities/fx'
import { startPop } from '../utils/pop'
import { leaderX, leaderY } from '../utils/team'
import type { Sim } from '../sim'

const STRIDE = 20
const HEADING_MIN = 0.5

/** 落地压扁再回弹，按阻尼振荡收回原样 */
function popping(sim: Sim, eid: number, charSize: number): boolean {
  const left = Pop.until[eid]! - sim.fxMs
  if (left <= 0) return false
  const u = 1 - left / Pop.ms[eid]!
  const s = REJOIN.squash * Math.exp(-4 * u) * Math.cos(3 * Math.PI * u)
  Transform.w[eid] = charSize * (1 + s)
  Transform.h[eid] = charSize * (1 - s)
  return true
}

/** 归队落地：脚下扩开一圈光环、扬起尘土，压扁再弹回 */
function land(sim: Sim, eid: number): void {
  Revive.drop[eid] = 0
  const x = Transform.x[eid]!
  const y = Transform.y[eid]!
  playSfx('revive')
  startPop(sim, eid, REJOIN.bounceMs)
  spawnFxCircle(sim, x, y, REJOIN.ringRadius * UNIT, {
    fill: 0xfff59d,
    fillAlpha: 0.25,
    stroke: 0xffffff,
    lineWidth: 5,
    lineAlpha: 0.95,
    fromScale: 0.2,
    toScale: 1,
    durationMs: 420,
    depth: 7,
  })
  sim.out.bursts.push({ x, y, count: 8, kind: 'puff' })
}

/** 画面停住时把还在进行的归队与回弹直接收尾 */
export function finishCharacterPops(sim: Sim): void {
  for (const eid of sim.characters) {
    if (!Alive.v[eid]) continue
    if (Revive.drop[eid]) {
      endMotion(eid)
      Revive.drop[eid] = 0
    }
    const size = charSize(eid)
    if (Pop.until[eid] === 0 || popping(sim, eid, size)) continue
    Pop.until[eid] = 0
    Transform.w[eid] = size
    Transform.h[eid] = size
  }
}

/** 速度先低通滤波，滤波后快过阈值才更新朝向，静止时保留上一次的方向 */
function face(sim: Sim, eid: number): void {
  const k = Math.min(1, sim.dtMs / SQUAD.facingTauMs)
  const fvx = Facing.vx[eid]! + (Phys.vx[eid]! - Facing.vx[eid]!) * k
  const fvy = Facing.vy[eid]! + (Phys.vy[eid]! - Facing.vy[eid]!) * k
  Facing.vx[eid] = fvx
  Facing.vy[eid] = fvy
  const speed = Math.hypot(fvx, fvy)
  if (speed <= HEADING_MIN * UNIT) return
  Facing.x[eid] = fvx / speed
  Facing.y[eid] = fvy / speed
}

export function animateCharacters(sim: Sim): void {
  const delta = sim.dtMs
  const lx = leaderX(sim)
  const ly = leaderY(sim)
  for (const eid of sim.characters) {
    Depth.z[eid] = 10 + sim.hooks.worldDelta(sim, lx, ly, Transform.x[eid]!, Transform.y[eid]!).y / UNIT
    if (!Alive.v[eid]) continue
    if (Revive.drop[eid] && Motion.kind[eid] !== MOTION.arc) land(sim, eid)
    face(sim, eid)
    const vx = Phys.vx[eid]!
    const moving = Math.hypot(vx, Phys.vy[eid]!) > STRIDE
    const size = charSize(eid)
    if (!popping(sim, eid, size)) {
      const bp = Breath.phase[eid]! + delta / (moving ? 85 : 140)
      Breath.phase[eid] = bp
      const s = Math.sin(bp) * (moving ? 0.13 : 0.09)
      Transform.w[eid] = size * (1 - s * 0.6)
      Transform.h[eid] = size * (1 + s)
    }
    if (Math.abs(vx) > STRIDE) Sprite.flipX[eid] = vx > 0 ? 1 : 0
  }
}
