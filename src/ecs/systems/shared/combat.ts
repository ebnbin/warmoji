import { hasComponent, query, removeEntity } from 'bitecs'
import { REJOIN } from '../../../data/feel'
import { UNIT } from '../../../util/units'
import { playSfx } from '../../../audio/sfx'
import { gainXp } from '../../../run/xp'
import { teamLeveled } from '../../../run/members'
import { coinDropChance } from '../../../data/waves'
import { ELITE } from '../../../data/enemies'
import type { EnemyDef } from '../../../types/enemies'
import { spawnShards } from '../../entities/shard'
import { Alive, Anchored, Anim, Boss, Elite, ENEMY_SET, FACTION, Faction, Gear, Hp, Lethal, MARK, MARK_SLOTS, Mark, Nest, Revive, Seat, Slot, Sprite, Stamina, Stats, TAG, Thief, Tint, Transform } from '../../components'
import { isSameEntity } from '../../utils/identity'
import { addMark, hasMark } from '../../utils/marks'
import { offenseOf } from '../../utils/stats'
import { abilityOnKill, bodyRules, enemyCarries, enemyDef, enemyLoot, enemyOf, resDef } from '../../store'
import { flying, selfSource } from '../../utils/source'
import { nearestTarget } from '../../utils/targets'
import { gainRes } from './resource'
import { applyAbilityEffects, casterOf, DEATH_DEF, FUSE_DEF, markFrom, markSource } from './effects'
import { mend } from './heal'
import { dropCoins, dropFieldPickup, dropLevelUp } from '../../entities/pickup'
import { unequipAbilities } from '../../entities/ability'
import { displace, endMotion } from './displace'
import type { Mover } from './displace'
import { followersOf, seatPoints } from '../layoutTeam'
import { charSize } from './scale'
import { release } from './gut'
import { returnBorrowed } from './steal'
import { gearKill } from './gear'
import type { Source } from '../../utils/source'
import type { Sim } from '../../sim'
import { clockSec } from '../../fight/clock'

/** 生命归零：击杀者先反应，带复活计时的身体倒地等待，其余身体死亡移除，敌人移除后再触发击杀者道具的击杀规则 */
export function die(sim: Sim, eid: number, src: Source, flingVx: number, flingVy: number): void {
  killerReacts(sim, src)
  settleDeathMarks(sim, eid)
  release(sim, eid)
  returnBorrowed(sim, eid)
  if (hasComponent(sim.world, eid, Revive)) {
    down(sim, eid)
    return
  }
  const anchored = hasComponent(sim.world, eid, Anchored)
  const at = { x: Transform.x[eid]!, y: Transform.y[eid]! }
  const hostile = Faction.v[eid] === FACTION.enemy
  killBody(sim, eid, src.slot, anchored ? 0 : flingVx, anchored ? 0 : flingVy)
  if (hostile) gearKill(sim, src, at)
}

/** 击杀反应施于出手的身体，敌我同一条：属性表的击杀回复、身体的击杀规则、出手那条能力的击杀效果、资源的击杀增长 */
function killerReacts(sim: Sim, src: Source): void {
  const k = src.body
  if (k === undefined || !isSameEntity(sim.world, k, src.bodyUid ?? 0) || !Alive.v[k]) return
  const at = { x: Transform.x[k]!, y: Transform.y[k]!, baseDamage: 0, targets: [k] }
  if (hasComponent(sim.world, k, Stats)) mend(k, Stats.killHeal[k]!)
  const onKill = bodyRules[k]?.onKill
  if (onKill) applyAbilityEffects(sim, selfSource(sim, k), onKill, at)
  const byAbility = src.ability === undefined ? undefined : abilityOnKill[src.ability]
  if (byAbility) applyAbilityEffects(sim, src, byAbility, at)
  const grow = resDef[k]?.onKill
  if (grow) gainRes(sim, k, grow)
}

/** 身上带着的死亡印记在死时结算：施于施加者；会跳的引信跳到最近的另一个敌人，不跳的就地引爆 */
function settleDeathMarks(sim: Sim, eid: number): void {
  const base = eid * MARK_SLOTS
  const now = sim.elapsedMs
  const x = Transform.x[eid]!
  const y = Transform.y[eid]!
  for (let i = 0; i < MARK_SLOTS; i++) {
    const s = base + i
    const kind = Mark.kind[s]!
    if ((kind !== MARK.deathMark && kind !== MARK.fuse) || Mark.until[s]! <= now) continue
    const src = markSource(eid, s)
    Mark.kind[s] = MARK.none
    if (!src) continue
    if (kind === MARK.deathMark) {
      const def = DEATH_DEF.get(Mark.b[s]!)
      const by = casterOf(sim, src)
      if (def) applyAbilityEffects(sim, src, def.then, { x, y, baseDamage: 0, targets: by >= 0 ? [by] : [], victim: eid })
      continue
    }
    const def = FUSE_DEF.get(Mark.b[s]!)
    if (!def) continue
    const next = def.jump ? nearestTarget(sim, flying(src), x, y, Infinity, new Set([eid])) : null
    if (next) markFrom(next.eid, MARK.fuse, Mark.until[s]!, Mark.a[s]!, Mark.b[s]!, src)
    else applyAbilityEffects(sim, src, def.then, { x, y, baseDamage: Mark.a[s]!, targets: [], exclude: new Set([eid]) })
  }
}

/** 倒下的队员还能不能起来：这一局没回不来、全队还有命 */
export function revivable(sim: Sim, eid: number): boolean {
  return !sim.run.fallen[Slot.v[eid]!] && sim.run.lives > 0
}

/** 倒地：留在原地歪倒、淡出，不再跟队，扇形也不再给他留坑；这一场许自己起来又还能起来的开始复活计时，否则一直倒着 */
export function layDown(sim: Sim, eid: number): void {
  endMotion(eid)
  Hp.v[eid] = 0
  Alive.v[eid] = 0
  Revive.at[eid] = sim.fight.rules.revive && revivable(sim, eid) ? sim.elapsedMs + Stats.revive[eid]! : Infinity
  Revive.fell[eid] = sim.fxMs
  Revive.drop[eid] = 0
  Seat.v[eid] = -1
  Tint.color[eid] = 0x888888
  Anim.frames[eid] = -1
  Anim.onceFrames[eid] = 0
  Transform.w[eid] = charSize(eid)
  Transform.h[eid] = charSize(eid)
}

function down(sim: Sim, eid: number): void {
  layDown(sim, eid)
  const st = sim.run.stats
  const slot = Slot.v[eid]!
  if (slot >= 0 && slot < st.deaths.length) st.deaths[slot] = (st.deaths[slot] ?? 0) + 1
  if (eid === sim.leader) sim.fight.leaderFell = true
  sim.out.bursts.push({ x: Transform.x[eid]!, y: Transform.y[eid]!, count: 10, kind: 'puff' })
  if (sim.characters.every((x) => !Alive.v[x])) sim.over = true
}

/** 死亡移除：战利品、击杀计数与 Boss 倒下只算敌方阵营的身体；亡语、巢穴、携带物、碎片敌我同一条 */
function killBody(sim: Sim, eid: number, srcSlot: number, flingVx: number, flingVy: number): void {
  const hostile = Faction.v[eid] === FACTION.enemy
  const st = sim.run.stats
  if (hostile) {
    sim.run.kills++
    if (srcSlot >= 0 && srcSlot < st.kills.length) st.kills[srcSlot] = (st.kills[srcSlot] ?? 0) + 1
  }
  playSfx('kill')
  const def = enemyDef[eid]
  const who = hostile ? enemyOf[eid] : undefined
  const elite = Elite.v[eid] === 1
  const boss = Boss.v[eid] === 1
  if (who) st.enemyKills[who.kind] = (st.enemyKills[who.kind] ?? 0) + 1
  if (hostile && elite) st.eliteKills += 1
  sim.out.bursts.push({ x: Transform.x[eid]!, y: Transform.y[eid]!, count: 6, kind: 'death' })
  if (boss) sim.out.bursts.push({ x: Transform.x[eid]!, y: Transform.y[eid]!, count: 24, kind: 'death' })
  if (hostile && boss) sim.bossDown = true
  if (who) grantKillRewards(sim, eid, who, elite)
  const hexed = hasMark(sim, eid, MARK.morph)
  if (!hexed && def?.onDeath) {
    const snap = { eid: -1, def, x: Transform.x[eid]!, y: Transform.y[eid]!, elite, boss, atk: offenseOf(sim.world, eid), faction: Faction.v[eid]! }
    if (sim.onDeathFx) sim.onDeathFx({ ...snap, eid })
    else sim.pendingDeaths.push(snap)
  }
  orphanBrood(sim, eid, !hexed)
  const carries = enemyCarries[eid]
  if (carries) {
    dropFieldPickup(sim, Transform.x[eid]!, Transform.y[eid]!, carries)
    enemyCarries[eid] = undefined
  }
  spawnShards(
    sim,
    Transform.x[eid]!,
    Transform.y[eid]!,
    Transform.w[eid]!,
    Transform.h[eid]!,
    Sprite.frame[eid]!,
    Sprite.flipX[eid]!,
    flingVx,
    flingVy,
  )
  unequipAbilities(sim, eid)
  enemyDef[eid] = undefined
  enemyOf[eid] = undefined
  enemyLoot[eid] = undefined
  removeEntity(sim.world, eid)
}

/** 全队攒经验；靠全队升级的一局每升一级在 (x, y) 掉一个升级道具，不给位置就掉在队长身边，否则只响一声 */
export function gainTeamXp(sim: Sim, amount: number, x?: number, y?: number): void {
  const gained = gainXp(sim.run, amount)
  if (gained === 0) return
  if (!teamLeveled(sim.run)) {
    playSfx('levelup')
    return
  }
  const cx = x ?? Transform.x[sim.leader]! + UNIT
  const cy = y ?? Transform.y[sim.leader]!
  for (let i = 0; i < gained; i++) {
    const a = (i / gained) * Math.PI * 2
    const r = gained > 1 ? 0.6 * UNIT : 0
    dropLevelUp(sim, cx + Math.cos(a) * r, cy + Math.sin(a) * r)
  }
}

/** 击杀的经验与金币：精英与关卡给这一批的倍率都乘上 */
function grantKillRewards(sim: Sim, eid: number, def: EnemyDef, elite: boolean): void {
  const loot = enemyLoot[eid]
  const xpMul = (elite ? ELITE.xpMul : 1) * (loot?.xp ?? 1)
  gainTeamXp(sim, Math.round(def.xp * xpMul), Transform.x[eid]!, Transform.y[eid]!)
  const dropRoll = sim.rng.next()
  const dropped = dropRoll < coinDropChance(clockSec(sim))
  const baseCoins = dropped ? Math.round(def.coins * (elite ? ELITE.coinsMul : 1) * (loot?.coins ?? 1)) : 0
  const eaten = Thief.eaten[eid]!
  const total = baseCoins + eaten + (eaten > 0 ? 1 : 0)
  if (total > 0) dropCoins(sim, Transform.x[eid]!, Transform.y[eid]!, total)
}

function orphanBrood(sim: Sim, nestEid: number, rage = true): void {
  for (const eid of query(sim.world, ENEMY_SET)) {
    if (Nest.of[eid] !== nestEid) continue
    Nest.of[eid] = -1
    const lost = rage ? bodyRules[eid]?.onAnchorLost : undefined
    if (lost) applyAbilityEffects(sim, selfSource(sim, eid), lost, { x: Transform.x[eid]!, y: Transform.y[eid]!, baseDamage: 0, targets: [eid] })
  }
}

export function despawnEnemy(sim: Sim, eid: number, puff = true): void {
  if (puff) sim.out.bursts.push({ x: Transform.x[eid]!, y: Transform.y[eid]!, count: 8, kind: 'puff' })
  orphanBrood(sim, eid)
  enemyCarries[eid] = undefined
  enemyLoot[eid] = undefined
  unequipAbilities(sim, eid)
  enemyDef[eid] = undefined
  removeEntity(sim.world, eid)
}

/** 无敌窗口只能延长，不能缩短 */
export function grantIframe(sim: Sim, eid: number, ms: number): void {
  addMark(eid, MARK.invuln, TAG.effect, sim.elapsedMs + ms)
}

/** 归队的落下不看能不能动；算被摆布，落地前出不了手 */
const REJOINING: Mover = { self: false, free: true }

/** 归队：扇形多出一个坑位，随机分给他，他从空中落进去；队长原地落下。倒下的人早已淡出、不在场上，在坑位重新登场不算位移 */
function rejoin(sim: Sim, eid: number): void {
  if (eid !== sim.leader) {
    const n = followersOf(sim).length
    const seat = Math.floor(sim.rng.next() * n)
    Seat.v[eid] = seat
    const at = sim.hooks.constrainBody(sim, eid, { x: Transform.x[eid]!, y: Transform.y[eid]! }, seatPoints(sim, n)[seat]!)
    Transform.x[eid] = at.x
    Transform.y[eid] = at.y
  }
  Revive.rose[eid] = sim.fxMs
  Revive.drop[eid] = 1
  displace(sim, eid, { kind: 'drop', ms: REJOIN.dropMs, height: REJOIN.height * UNIT }, REJOINING)
}

/** 复活：回不来的不行；用掉全队一条命，命用完了其余倒着的也不会再自己起来；生命与体力回满，回到队伍里 */
export function reviveCharacter(sim: Sim, eid: number): void {
  if (!revivable(sim, eid)) return
  const run = sim.run
  run.lives -= 1
  if (run.lives <= 0) for (const m of sim.characters) if (!Alive.v[m]) Revive.at[m] = Infinity
  Alive.v[eid] = 1
  Lethal.used[eid] = 0
  Lethal.low[eid] = 0
  Gear.low[eid] = 0
  Gear.lethal[eid] = 0
  Anim.frames[eid] = 0
  Hp.v[eid] = Hp.max[eid]!
  Stamina.used[eid] = 0
  Stamina.restMs[eid] = 0
  Tint.color[eid] = 0xffffff
  Tint.alpha[eid] = 0
  Tint.effect[eid] = 0
  Transform.rot[eid] = 0
  Transform.w[eid] = charSize(eid)
  Transform.h[eid] = charSize(eid)
  rejoin(sim, eid)
  // 复活视同被命中一次的保护
  grantIframe(sim, eid, Stats.iframes[eid]!)
  const back = bodyRules[eid]?.onHurt
  if (back) applyAbilityEffects(sim, selfSource(sim, eid), back, { x: Transform.x[eid]!, y: Transform.y[eid]!, baseDamage: 0, targets: [eid] })
}
