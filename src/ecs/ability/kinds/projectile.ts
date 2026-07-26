import { query } from 'bitecs'
import { DEG2RAD } from '../../../util/units'
import type { ProjectileDef } from '../../../types/abilityDefs'
import { playSfx } from '../../../audio/sfx'
import { Tint, Transform } from '../../components'
import { spawnEnemyProjectileEcs, spawnProjectileEcs } from '../../projectile'
import { enemyDef, enemyVelX, enemyVelY } from '../../store'
import { attributionSlot, damageMul, ownerX, ownerY } from '../amp'
import { Ability, AbilityRef, Aim, FACTION, Faction, Frozen, Gear, Owner, Shots } from '../components'
import { abilityDefAt } from '../defs'
import { sourceOf } from '../source'
import { castScan } from '../systems/cast'
import { KindProjectile } from '../tags'
import { nearestAngle, targetsOf } from '../targets'
import type { Sim } from '../../sim'

/** 敌方能力弹药缺省寿命 */
const BULLET_LIFE_MS = 3000

/** 发射：held 时持有物定身指向目标（可带左右手挂载位），无 held 时角色本体出弹。
 * 瞄准 nearest 最近目标 / move 持有者移动方向（无需目标）；整圈齐射也无需目标。
 * volley 恒定齐射（≥360° 为整圈，可随机整体旋转）；everyN 每第 n 次改打一轮特殊齐射 */
export function castProjectiles(sim: Sim): void {
  placeProjectileGear(sim)
  castScan<ProjectileDef>(sim, KindProjectile, (e, def) => {
    const fullRing = def.volley !== undefined && def.volley.spreadDeg >= 360 - 1e-9
    if (def.aim === 'move') {
      const h = headingOf(sim, e)
      Aim.rad[e] = Math.atan2(h.y, h.x)
    } else if (!fullRing) {
      const aim = nearestAngle(ownerX(e), ownerY(e), targetsOf(sim, sourceOf(sim, e)), def.range)
      if (aim === null) return false
      Aim.rad[e] = aim
    }
    const aim = Aim.rad[e]!
    const damage = Math.round(def.damage * damageMul(sim, e))
    const from = muzzle(e, def)
    Shots.n[e] = Shots.n[e]! + 1
    const special = def.everyN && Shots.n[e]! % def.everyN.n === 0
    const volley: { count: number; spreadDeg: number; randomRotate?: boolean } | undefined = special
      ? { count: def.everyN!.count, spreadDeg: def.everyN!.spreadDeg }
      : def.volley
    if (volley && volley.count > 1) {
      const full = volley.spreadDeg >= 360 - 1e-9
      const base = full && volley.randomRotate ? random(sim, e) * Math.PI * 2 : aim
      for (let i = 0; i < volley.count; i++) {
        // 整圈按 count 均分步进（端点不重叠）；扇形沿瞄准方向对称散开
        const angle = full
          ? base + (i * volley.spreadDeg * DEG2RAD) / volley.count
          : aim + volley.spreadDeg * DEG2RAD * (i / (volley.count - 1) - 0.5)
        shoot(sim, e, def, from.x, from.y, angle, damage)
      }
    } else {
      shoot(sim, e, def, from.x, from.y, aim, damage)
    }
    if (def.fireSfx) playSfx(def.fireSfx)
    return true
  })
}

/** 持有者朝向（aim:'move' 用）：队伍取本帧移动方向，敌人取本帧移动速度方向 */
function headingOf(sim: Sim, e: number): { x: number; y: number } {
  if (Faction.v[e] !== FACTION.enemy) return sim.teamDir
  const o = Owner.eid[e]!
  return { x: enemyVelX[o]!, y: enemyVelY[o]! }
}

/** 出手随机流：队伍侧走非确定性随机，敌方侧走 run 种子（镜像两侧 ctx 的 random） */
function random(sim: Sim, e: number): number {
  return Faction.v[e] === FACTION.enemy ? sim.rng.next() : Math.random()
}

/** 枪口：无持有物即本体位置；有则沿瞄准方向前伸 restOffset，再按左右手横向偏 mountGap */
function muzzle(e: number, def: ProjectileDef): { x: number; y: number } {
  const held = def.held
  if (!held) return { x: ownerX(e), y: ownerY(e) }
  const aim = Aim.rad[e]!
  const side = held.mountSide ?? 0
  const gap = held.mountGap ?? 0
  return {
    x: ownerX(e) + Math.cos(aim) * held.restOffset + Math.cos(aim + Math.PI / 2) * side * gap,
    y: ownerY(e) + Math.sin(aim) * held.restOffset + Math.sin(aim + Math.PI / 2) * side * gap,
  }
}

/** 发一枚：阵营决定进哪条弹道机器（队伍弹带 pierce/onHit，敌弹按寿命回收） */
function shoot(sim: Sim, e: number, def: ProjectileDef, x: number, y: number, angle: number, damage: number): void {
  if (Faction.v[e] !== FACTION.enemy) {
    spawnProjectileEcs(sim, sim.frames, x, y, angle, def, damage, attributionSlot(e))
    return
  }
  const p = def.projectile
  spawnEnemyProjectileEcs(sim, sim.frames, x, y, angle, {
    emoji: p.emoji,
    size: p.size,
    radius: p.radius,
    speed: p.speed,
    damage,
    lifeMs: def.lifeMs ?? BULLET_LIFE_MS,
    srcName: enemyDef[Owner.eid[e]!]?.name,
  })
}

/** 摆位：持有物定身指向瞄准方向（含左右手挂载位） */
function placeProjectileGear(sim: Sim): void {
  for (const e of query(sim.world, [Ability, KindProjectile, Gear, Aim])) {
    const g = Gear.eid[e]!
    if (g === 0) continue
    const def = abilityDefAt(AbilityRef.def[e]!) as ProjectileDef
    const pos = muzzle(e, def)
    Transform.x[g] = pos.x
    Transform.y[g] = pos.y
    Transform.rot[g] = Aim.rad[e]! + def.held!.rotationOffsetDeg * DEG2RAD
    Tint.alpha[g] = Frozen.v[e] ? 0 : 1
  }
}
