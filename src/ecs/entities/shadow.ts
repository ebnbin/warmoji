import { addComponents, hasComponent, query, removeEntity } from 'bitecs'
import { newEntity } from './entity'
import { attachDrawable } from './drawable'
import { Alive, Anim, FACTION, Faction, MARK, Radius, Shadow, Slot, Sprite, Transform, Uid } from '../components'
import { addCc } from '../utils/marks'
import { isSameEntity } from '../utils/identity'
import { targetsWithin } from '../utils/targets'
import { armIdle } from '../systems/shared/anim'
import { displace } from '../systems/shared/displace'
import { blinkFlash } from '../systems/shared/fire'
import { bodyLook, enemyDef } from '../store'
import { CHARACTERS } from '../../data/characters'
import type { Source } from '../utils/source'
import type { Sim } from '../sim'

/** 身体的影子，从旧到新 */
export function shadowsOf(sim: Sim, by: number): number[] {
  const out: number[] = []
  for (const s of query(sim.world, [Shadow])) if (Shadow.of[s] === by && Shadow.until[s]! > sim.elapsedMs) out.push(s)
  return out.sort((a, b) => Uid.v[a]! - Uid.v[b]!)
}

function lookOf(sim: Sim, by: number): string {
  if (bodyLook[by]) return bodyLook[by]!
  if (hasComponent(sim.world, by, Slot)) return CHARACTERS[sim.run.roster[Slot.v[by]!]!]!.emoji
  return enemyDef[by]?.emoji ?? '1f47b'
}

/** 留一个影子：沿 angle 冲出 dash 远；超过 max 个顶掉最旧的；带嘲讽的让周围的敌人去追影子 */
export function spawnShadow(sim: Sim, src: Source, by: number, angle: number, lifeMs: number, max: number, dash: number, taunt?: { readonly radius: number; readonly ms: number }): void {
  const old = shadowsOf(sim, by)
  for (let i = 0; i <= old.length - max; i++) removeEntity(sim.world, old[i]!)
  const x0 = Transform.x[by]!
  const y0 = Transform.y[by]!
  const at = sim.hooks.constrainBody(sim, by, { x: x0, y: y0 }, { x: x0 + Math.cos(angle) * dash, y: y0 + Math.sin(angle) * dash })
  const s = newEntity(sim.world)
  const emoji = lookOf(sim, by)
  const outline = Faction.v[by] === FACTION.team ? 'player' : 'enemy'
  attachDrawable(sim.world, s, sim.frames, { id: emoji, outline, x: at.x, y: at.y, size: Transform.w[by]!, z: 4, color: 0x4a148c, effect: 0, alpha: 0.55 })
  addComponents(sim.world, s, Shadow, Alive, Radius, Anim)
  armIdle(s, emoji, outline, Sprite.frame[s]!, 0)
  Shadow.of[s] = by
  Shadow.ofUid[s] = Uid.v[by]!
  Shadow.until[s] = sim.elapsedMs + lifeMs
  Alive.v[s] = 1
  Radius.v[s] = Radius.v[by]!
  blinkFlash(sim, at.x, at.y)
  if (!taunt) return
  const until = sim.elapsedMs + taunt.ms
  for (const t of targetsWithin(sim, src, at.x, at.y, taunt.radius)) addCc(sim, t.eid, MARK.taunt, until, s, 0, 0, Uid.v[s]!)
}

/** 与最新的影子换位 */
export function swapShadow(sim: Sim, by: number): boolean {
  const list = shadowsOf(sim, by)
  const s = list[list.length - 1]
  if (s === undefined) return false
  const bx = Transform.x[by]!
  const bY = Transform.y[by]!
  if (!displace(sim, by, { kind: 'place', x: Transform.x[s]!, y: Transform.y[s]! }, { self: true })) return false
  blinkFlash(sim, bx, bY)
  blinkFlash(sim, Transform.x[by]!, Transform.y[by]!)
  Transform.x[s] = bx
  Transform.y[s] = bY
  return true
}

/** 影子到时或主人没了就散 */
export function tickShadows(sim: Sim): void {
  for (const s of [...query(sim.world, [Shadow])]) {
    const by = Shadow.of[s]!
    if (Shadow.until[s]! > sim.elapsedMs && isSameEntity(sim.world, by, Shadow.ofUid[s]!) && Alive.v[by]) continue
    sim.out.bursts.push({ x: Transform.x[s]!, y: Transform.y[s]!, count: 5, kind: 'puff' })
    removeEntity(sim.world, s)
  }
}
