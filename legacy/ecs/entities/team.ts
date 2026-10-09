import { query, removeEntity } from 'bitecs'
import { UNIT } from '../../util/units'
import { fanSlots } from '../../data/formation'
import { REJOIN, SQUAD } from '../../data/feel'
import { TEAM } from '../../data/characters'
import { leaderSlot, seatLeader } from '../../run/state'
import type { RunState } from '../../run/state'
import type { StatMods } from '../../types/stats'
import type { FrameIndex } from '../frames'
import { Alive, FACTION, Hp, Nest, Transform, Uid } from '../components'
import { fightMods } from '../fight/state'
import { startPop } from '../utils/pop'
import { foldBody, setStatLayer } from '../utils/stats'
import { mend } from '../systems/shared/heal'
import { raise, rejoin } from '../systems/shared/combat'
import { finishHandover, firstUp, switchLeader } from '../systems/shared/leader'
import { unequipAbilities } from './ability'
import { leaderX, leaderY } from '../utils/team'
import { spawnCharacter } from './character'
import { rearmCharacter } from './form'
import { spawnFxCircle } from './fx'
import { armMember, memberGearMods } from './loadout'
import { LEVEL_UP_COLOR } from './pickup'
import type { EcsWorld } from '../world'
import type { Sim } from '../sim'

export interface TeamLayout {
  characters: number[]
  leader: number
}

/** 队长站在出生点，其余按入队顺序排在身后的扇形上；隐藏顺序的队首倒着就交给后面第一个站着的；mods 是这一场给队伍的常驻修正 */
export function formTeam(world: EcsWorld, atlas: FrameIndex, run: RunState, x: number, y: number, mods: readonly StatMods[]): TeamLayout {
  const count = run.roster.length
  seatLeader(run)
  const lead = leaderSlot(run)
  const fan = fanSlots(Math.max(0, count - 1), SQUAD.fanDistance, SQUAD.fanSpreadDeg, 0, -1)
  const characters: number[] = []
  let leader = -1
  let seat = 0
  for (let slot = 0; slot < count; slot++) {
    const isLeader = slot === lead
    const off = (isLeader ? undefined : fan[seat++]) ?? { x: 0, y: 0 }
    const eid = spawnCharacter(world, atlas, run, {
      slot,
      x: x + off.x,
      y: y + off.y,
      depthOffsetY: off.y / UNIT,
      sizeMul: isLeader ? TEAM.leaderSizeMul : TEAM.followerSizeMul,
    }, mods)
    if (isLeader) leader = eid
    characters.push(eid)
  }
  return { characters, leader }
}

/** 脚下扩开一圈光、扬起一阵光点、身上一亮 */
function glow(sim: Sim, eid: number): void {
  const x = Transform.x[eid]!
  const y = Transform.y[eid]!
  spawnFxCircle(sim, x, y, REJOIN.ringRadius * UNIT, {
    fill: LEVEL_UP_COLOR,
    fillAlpha: 0.25,
    stroke: 0xffffff,
    lineWidth: 5,
    lineAlpha: 0.95,
    fromScale: 0.2,
    toScale: 1,
    durationMs: 420,
    depth: 7,
  })
  sim.out.bursts.push({ x, y, count: 12, kind: 'coin' })
  if (Alive.v[eid]) sim.out.events.push({ kind: 'glow', eid, uid: Uid.v[eid]!, color: LEVEL_UP_COLOR, ms: 360, fxAt: sim.fxMs })
}

/** 半路入队：站到队长身后弹出来，带着这一场给队伍的修正，装好能力与主动技能 */
export function joinTeam(sim: Sim, slot: number): void {
  const lx = leaderX(sim)
  const ly = leaderY(sim)
  const back = SQUAD.fanDistance * UNIT
  const p = sim.hooks.constrainBody(sim, sim.leader, { x: lx, y: ly }, { x: lx - sim.heading.x * back, y: ly - sim.heading.y * back })
  const eid = spawnCharacter(sim.world, sim.frames, sim.run, { slot, x: p.x, y: p.y, depthOffsetY: 0, sizeMul: TEAM.followerSizeMul }, fightMods(sim.fight, FACTION.team))
  sim.characters.push(eid)
  sim.fight.rescueMs.push(0)
  armMember(sim, slot)
  startPop(sim, eid, REJOIN.bounceMs)
  glow(sim, eid)
}

/** 队员升了级：等级给的属性换上，多出的生命补进当前生命，自动能力换成新档位 */
export function relevel(sim: Sim, slot: number): void {
  const m = sim.characters[slot]!
  const before = Hp.max[m]!
  setStatLayer(m, 'gear', memberGearMods(sim.run, slot))
  foldBody(sim.world, sim, m)
  if (Alive.v[m]) mend(sim, m, Math.max(0, Hp.max[m]! - before))
  rearmCharacter(sim, m)
  glow(sim, m)
}

/** 换下场：带走他的能力与召唤物，跟着他的不再认他，从世界里拿掉 */
function bench(sim: Sim, eid: number): void {
  sim.out.bursts.push({ x: Transform.x[eid]!, y: Transform.y[eid]!, count: 8, kind: 'puff' })
  unequipAbilities(sim, eid)
  for (const e of query(sim.world, [Transform])) if (Nest.of[e] === eid) Nest.of[e] = -1
  removeEntity(sim.world, eid)
}

/** 半路换人：名单上这一格已经换好；换上来的满生命从空中落进队伍，换下的是队长就先交给隐藏顺序里下一个站着的 */
export function swapTeam(sim: Sim, slot: number): void {
  const old = sim.characters[slot]!
  const eid = spawnCharacter(sim.world, sim.frames, sim.run, { slot, x: Transform.x[old]!, y: Transform.y[old]!, depthOffsetY: 0, sizeMul: TEAM.followerSizeMul }, fightMods(sim.fight, FACTION.team))
  sim.characters[slot] = eid
  if (old === sim.leader) {
    switchLeader(sim, firstUp(sim, old))
    finishHandover(sim)
  }
  bench(sim, old)
  sim.fight.rescueMs[slot] = 0
  armMember(sim, slot)
  rejoin(sim, eid)
  glow(sim, eid)
}

/** 恢复：生命回满，倒下的复活，从空中落回队伍 */
export function restoreMember(sim: Sim, slot: number): void {
  const m = sim.characters[slot]!
  if (Alive.v[m]) mend(sim, m, Hp.max[m]!)
  else raise(sim, m)
  glow(sim, m)
}
