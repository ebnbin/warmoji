import { hasComponent, query } from 'bitecs'
import { CHARACTERS } from '../../data/characters'
import { waveAt } from '../../data/waves'
import { Ability, Alive, Amp, Borrowed, Boss, Despawn, ENEMY_SET, EnemyArm, FACTION, Faction, Hp, Manual, Nest, Owner, Phys, Radius, Slot, Transform } from '../components'
import { abilityDef, bodyLook, enemyDef, enemyOf } from '../store'
import { charSize } from '../systems/shared/scale'
import { equipAbility } from './ability'
import { spawnEnemy, spawnNpc } from './enemy'
import type { Effect } from '../../types/abilityDefs'
import type { EnemyDef, NpcDef } from '../../types/enemies'
import type { Sim } from '../sim'

/** 召出的身体同一条出生路径：敌方的算敌人（有战利品），己方的只是身体；都记在召唤者名下 */
export function summonBody(sim: Sim, def: NpcDef, x: number, y: number, hp: number, faction: number, by: number): number {
  const who = faction === FACTION.enemy && def.kind !== undefined ? (def as EnemyDef) : undefined
  const eid = who ? spawnEnemy(sim, sim.frames, who, x, y, hp, false, false) : spawnNpc(sim, sim.frames, def, x, y, hp, { faction })
  Nest.of[eid] = by
  return eid
}

function waveHp(sim: Sim): number {
  return sim.sandbox ? 1 : waveAt((sim.run.combatMs + sim.elapsedMs) / 1000).hpMultiplier
}

/** 召出 count 个 def：敌方的按波次放大生命 */
export function spawnAround(sim: Sim, by: number, faction: number, def: EnemyDef, count: number, spread: number, x: number, y: number): void {
  const hp = Math.round(def.hp * (faction === FACTION.enemy ? waveHp(sim) : 1))
  for (let i = 0; i < count; i++) {
    const a = sim.rng.next() * Math.PI * 2
    const r = count > 1 || spread > 0 ? spread * (0.5 + sim.rng.next() * 0.5) : 0
    const at = sim.hooks.constrainBody(sim, by, { x, y }, { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r })
    summonBody(sim, def, at.x, at.y, hp, faction, by)
  }
}

/** 施法者的普通出手：自动的、不是借来的 */
function ownAttacks(sim: Sim, by: number): number[] {
  const out: number[] = []
  for (const e of query(sim.world, [Ability, Owner])) {
    if (Owner.eid[e] !== by || hasComponent(sim.world, e, Manual) || hasComponent(sim.world, e, Borrowed) || !abilityDef[e]) continue
    out.push(e)
  }
  return out
}

/** 施法者自己的样子，当成一个非玩家身体的定义 */
function lookAlike(sim: Sim, by: number): NpcDef {
  const npc = enemyDef[by]
  const drive = { kind: 'chase' } as const
  if (npc) return { ...npc, drive, spawner: undefined, grow: undefined, mount: undefined, onLethal: undefined, onLowHp: undefined, onDeath: undefined, forms: undefined }
  const c = hasComponent(sim.world, by, Slot) ? CHARACTERS[sim.run.roster[Slot.v[by]!]!] : undefined
  return {
    emoji: bodyLook[by] ?? c?.emoji ?? '1f47b',
    name: c?.name ?? '',
    size: charSize(by),
    radius: Radius.v[by]!,
    hp: Hp.max[by]!,
    speed: Phys.thrust[by]! / Phys.drag[by]!,
    damage: 0,
    drive,
  }
}

/** 分身：长得和施法者一样，带着它的普通出手（伤害打折），到时消失，死时施加 onDeath */
export function spawnClones(sim: Sim, by: number, count: number, lifeMs: number, hpRatio: number, dmgRatio: number, onDeath: readonly Effect[] | undefined): void {
  const def = { ...lookAlike(sim, by), onDeath }
  const attacks = ownAttacks(sim, by)
  const faction = Faction.v[by]!
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + sim.rng.next()
    const r = Radius.v[by]! * 2.5
    const x0 = Transform.x[by]!
    const y0 = Transform.y[by]!
    const at = sim.hooks.constrainBody(sim, by, { x: x0, y: y0 }, { x: x0 + Math.cos(a) * r, y: y0 + Math.sin(a) * r })
    const eid = spawnNpc(sim, sim.frames, def, at.x, at.y, Math.max(1, Math.round(Hp.max[by]! * hpRatio)), { faction })
    Nest.of[eid] = by
    Despawn.at[eid] = sim.elapsedMs + lifeMs
    EnemyArm.armed[eid] = 1
    for (const e of attacks) {
      equipAbility(sim, eid, abilityDef[e]!, faction, 200 + i * 150, { dmg: Amp.dmg[e]! * dmgRatio, cd: Amp.cd[e]!, crit: Amp.crit[e]!, kb: Amp.kb[e]!, battle: Amp.battle[e] === 1 })
    }
  }
}

/** 亡者倒戈：死者以施法者的阵营站起来，到时消失；Boss 不会被拉起来 */
export function raiseDead(sim: Sim, victim: number, faction: number, by: number, lifeMs: number, hpRatio: number): void {
  const def = enemyDef[victim]
  if (!def || Boss.v[victim] || Faction.v[victim] === faction) return
  const raised: NpcDef = { ...def, kind: undefined, spawner: undefined, grow: undefined, mount: undefined, onLethal: undefined, onLowHp: undefined, onDeath: undefined }
  const eid = spawnNpc(sim, sim.frames, raised, Transform.x[victim]!, Transform.y[victim]!, Math.max(1, Math.round(Hp.max[victim]! * hpRatio)), { faction })
  Nest.of[eid] = by
  Despawn.at[eid] = sim.elapsedMs + lifeMs
  sim.out.bursts.push({ x: Transform.x[eid]!, y: Transform.y[eid]!, count: 10, kind: 'puff' })
}

/** 自己召出的某种身体里离 (x, y) 最近的一个，没有则 -1 */
export function nearestSummoned(sim: Sim, by: number, kind: string, x: number, y: number): number {
  let best = -1
  let bestD = Infinity
  for (const e of query(sim.world, ENEMY_SET)) {
    if (Nest.of[e] !== by || !Alive.v[e] || (enemyOf[e]?.kind ?? enemyDef[e]?.kind) !== kind) continue
    const d = sim.hooks.worldDelta(sim, x, y, Transform.x[e]!, Transform.y[e]!)
    const dd = d.x * d.x + d.y * d.y
    if (dd < bestD) {
      bestD = dd
      best = e
    }
  }
  return best
}
