import { addComponent, hasComponent, query } from 'bitecs'
import { Alive, Gut, MARK, TAG, Transform, Uid } from '../../components'
import { addMark, clearMarks, hasMark } from '../../utils/marks'
import { isSameEntity } from '../../utils/identity'
import { selfSource } from '../../utils/source'
import { displace, endMotion } from './displace'
import { interrupt } from './ability'
import { hit } from './damage'
import type { Sim } from '../../sim'

const DEVOURED = [MARK.devoured]

/** 肚子里装着的身体（倒地的也算），没有则 -1 */
function victimOf(sim: Sim, by: number): number {
  if (!hasComponent(sim.world, by, Gut) || Gut.uid[by] === 0) return -1
  const v = Gut.victim[by]!
  return isSameEntity(sim.world, v, Gut.uid[by]!) ? v : -1
}

/** 吞下：目标进肚子，贴着吞噬者走，碰不到也做不了事；肚子满了吞不下 */
export function devour(sim: Sim, by: number, t: number, ms: number, dps: number, escape: number, spit: number): void {
  if (t === by || victimOf(sim, by) >= 0 || hasMark(sim, t, MARK.devoured) || !Alive.v[t]) return
  if (!hasComponent(sim.world, by, Gut)) addComponent(sim.world, by, Gut)
  const now = sim.elapsedMs
  Gut.victim[by] = t
  Gut.uid[by] = Uid.v[t]!
  Gut.hurt[by] = 0
  Gut.limit[by] = escape
  Gut.until[by] = now + ms
  Gut.dps[by] = dps
  Gut.spit[by] = spit
  Gut.nextAt[by] = now + 1000
  addMark(t, MARK.devoured, TAG.effect, now + ms)
  interrupt(sim, t)
  displace(sim, t, { kind: 'follow', host: by, ox: 0, oy: 0, ms: 0 }, { self: false, free: true })
  sim.out.bursts.push({ x: Transform.x[by]!, y: Transform.y[by]!, count: 8, kind: 'puff' })
}

/** 吐出来：抛到 spit 远处，倒地的原地放下 */
export function release(sim: Sim, by: number): void {
  const v = victimOf(sim, by)
  Gut.uid[by] = 0
  if (v < 0) return
  clearMarks(v, DEVOURED)
  endMotion(v)
  if (!Alive.v[v]) return
  const a = sim.rng.next() * Math.PI * 2
  const d = Gut.spit[by]!
  displace(sim, v, { kind: 'arc', x: Transform.x[by]! + Math.cos(a) * d, y: Transform.y[by]! + Math.sin(a) * d, ms: 420, height: d * 0.4 }, { self: false, free: true })
}

/** 吞噬者挨了打：挨够了就吐 */
export function feedGut(sim: Sim, by: number, dmg: number): void {
  if (Gut.uid[by] === 0 || victimOf(sim, by) < 0) return
  Gut.hurt[by] = Gut.hurt[by]! + dmg
  if (Gut.hurt[by]! >= Gut.limit[by]!) release(sim, by)
}

/** 消化：每秒一跳；到时、吞噬者倒下或被吞的没了就吐 */
export function tickGuts(sim: Sim): void {
  const now = sim.elapsedMs
  for (const by of query(sim.world, [Gut])) {
    if (Gut.uid[by] === 0) continue
    const v = victimOf(sim, by)
    if (v < 0 || !Alive.v[v] || !Alive.v[by] || now >= Gut.until[by]!) {
      release(sim, by)
      continue
    }
    if (now < Gut.nextAt[by]!) continue
    Gut.nextAt[by] = Gut.nextAt[by]! + 1000
    hit(sim, selfSource(sim, by), v, Gut.dps[by]!, { tick: true })
  }
}
