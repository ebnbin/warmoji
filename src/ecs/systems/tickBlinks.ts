import { query } from 'bitecs'
import { BLINK_IFRAME_PAD_MS, TRANSIT_MS } from '../../data/abilities'
import { Ability, Aim, Alive, BLINK, BlinkShape, BlinkState, Frozen, Hp, Owner, Transform } from '../components'
import { blinkStrike } from '../store'
import { inTransit } from '../utils/marks'
import { isSameEntity } from '../utils/identity'
import { BLINK_COLOR } from './shared/fire'
import { hit } from './shared/damage'
import { applyOnHit, struckOf } from './shared/effects'
import { grantIframe } from './shared/combat'
import { displace } from './shared/displace'
import { spawnFxSlash } from '../entities/fx'
import type { Sim } from '../sim'

/** 穿行到了目标背后：朝它斩下去，斩的这阵子无敌；目标已经没了就空斩 */
function strike(sim: Sim, e: number, m: number): void {
  const s = blinkStrike[e]
  blinkStrike[e] = undefined
  grantIframe(sim, m, BlinkShape.strikeMs[e]! + BLINK_IFRAME_PAD_MS)
  if (!s || !isSameEntity(sim.world, s.target, s.uid) || !Alive.v[s.target]) return
  const t = s.target
  const x = Transform.x[m]!
  const y = Transform.y[m]!
  const d = sim.hooks.worldDelta(sim, x, y, Transform.x[t]!, Transform.y[t]!)
  const tx = x + d.x
  const ty = y + d.y
  Aim.rad[e] = Math.atan2(d.y, d.x)
  let dmg = s.damage
  const execHp = BlinkShape.execHp[e]!
  if (execHp > 0 && Hp.max[t]! > 0 && Hp.v[t]! / Hp.max[t]! <= execHp) dmg *= BlinkShape.execMul[e]!
  const struck = struckOf(t)
  if (hit(sim, s.src, t, dmg, { knockback: s.knockback, from: { x, y } })) applyOnHit(sim, s.src, s.onHit, tx, ty, dmg, [struck], Aim.rad[e])
  spawnFxSlash(sim, tx, ty, Aim.rad[e]!, 34)
}

/** 瞬袭：穿行到了就斩，斩完到点再穿行回原位；宿主倒下就作罢 */
export function tickBlinks(sim: Sim): void {
  for (const e of query(sim.world, [Ability, BlinkShape, BlinkState])) {
    const phase = BlinkState.phase[e]!
    if (phase === BLINK.none) continue
    const m = Owner.eid[e]!
    if (Frozen.v[e]) {
      BlinkState.phase[e] = BLINK.none
      blinkStrike[e] = undefined
      continue
    }
    if (phase === BLINK.going) {
      if (inTransit(m)) continue
      strike(sim, e, m)
      BlinkState.phase[e] = BLINK.striking
      BlinkState.until[e] = sim.elapsedMs + BlinkShape.strikeMs[e]!
      continue
    }
    if (sim.elapsedMs < BlinkState.until[e]!) continue
    BlinkState.phase[e] = BLINK.none
    displace(sim, m, { kind: 'transit', x: BlinkState.x[e]!, y: BlinkState.y[e]!, ms: TRANSIT_MS.blink, look: 'streak', color: BLINK_COLOR }, { self: true, free: true })
  }
}
