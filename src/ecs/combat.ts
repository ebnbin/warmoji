import { query, removeEntity } from 'bitecs'
import { norm } from '../core/vec'
import { playSfx } from '../audio/sfx'
import { KNOCKBACK } from '../abilities/registry'
import {
  Alive,
  DmgMul,
  ENEMY_SET,
  Flash,
  Hp,
  Hurt,
  Iframe,
  Kv,
  MFlash,
  MHp,
  Radius,
  Revive,
  Tint,
  Transform,
} from './components'
import { enemyDef } from './store'
import type { Sim } from './sim'

// 战斗(P3b):敌人受伤/致死/击退,队员接触伤害/死亡/复活/受击闪光。
// 镜像 applyDamage / onMemberTouched / hurtMember / killMember / reviveMember 的核心数值;
// 掉落/结算统计/死亡效果/状态效果(毒/减速/变羊)在后续增量追加。

/** 敌人受伤(镜像 applyDamage 核心) */
export function applyDamage(
  sim: Sim,
  eid: number,
  damage: number,
  knockback = 0,
  srcX?: number,
  srcY?: number,
): void {
  const hp = Hp.v[eid]! - damage
  if (hp <= 0) {
    killEnemy(sim, eid)
    return
  }
  Hp.v[eid] = hp
  playSfx('hit')
  Flash.until[eid] = sim.elapsedMs + 70
  Tint.effect[eid] = 1 // 纯白填充
  Tint.color[eid] = 0xffffff
  const def = enemyDef[eid]
  let kb = knockback
  if (def?.kbImmune) kb = 0
  if (kb > 0 && srcX !== undefined && srcY !== undefined) {
    const dir = norm(Transform.x[eid]! - srcX, Transform.y[eid]! - srcY)
    let kvx = Kv.x[eid]! + dir.x * kb
    let kvy = Kv.y[eid]! + dir.y * kb
    const len = Math.hypot(kvx, kvy)
    if (len > KNOCKBACK.maxSpeed) {
      kvx = (kvx / len) * KNOCKBACK.maxSpeed
      kvy = (kvy / len) * KNOCKBACK.maxSpeed
    }
    Kv.x[eid] = kvx
    Kv.y[eid] = kvy
  }
}

/** 击杀(P3b:计数 + 清体;掉落/亡语/死亡效果在后续增量) */
export function killEnemy(sim: Sim, eid: number): void {
  sim.kills++
  playSfx('kill')
  enemyDef[eid] = undefined
  removeEntity(sim.world, eid)
}

/** 队员接触敌人的伤害结算(镜像 onMemberTouched 的无敌帧节流 + 基础伤害) */
export function memberContact(sim: Sim): void {
  const enemies = query(sim.world, ENEMY_SET as unknown as object[])
  if (enemies.length === 0) return
  const now = sim.elapsedMs
  for (const m of sim.members) {
    if (!Alive.v[m]) continue
    if (now - Iframe.last[m]! < Iframe.ms[m]!) continue
    const mx = Transform.x[m]!
    const my = Transform.y[m]!
    const hr = Hurt.radius[m]!
    for (const eid of enemies) {
      const rr = hr + Radius.v[eid]!
      const dx = Transform.x[eid]! - mx
      const dy = Transform.y[eid]! - my
      if (dx * dx + dy * dy > rr * rr) continue
      const def = enemyDef[eid]
      if (!def) continue
      Iframe.last[m] = now
      hurtMember(sim, m, def.damage * DmgMul.v[eid]!)
      break // 一帧一员只吃一次(无敌帧掌管其余)
    }
  }
}

/** 队员受伤(镜像 hurtMember + killMember) */
function hurtMember(sim: Sim, eid: number, damage: number): void {
  const hp = Math.max(0, MHp.hp[eid]! - damage)
  MHp.hp[eid] = hp
  playSfx('hurt')
  MFlash.until[eid] = sim.elapsedMs + 120
  Tint.color[eid] = 0xff7777 // 受击红闪
  Tint.effect[eid] = 0
  if (hp <= 0) {
    Alive.v[eid] = 0
    Revive.at[eid] = sim.elapsedMs + Revive.ms[eid]!
    Tint.color[eid] = 0x888888
    Tint.alpha[eid] = 0.35
    if (sim.members.every((x) => !Alive.v[x])) sim.over = true
  }
}

/** 阵亡复活(镜像 reviveMember;全队阵亡后不复活——待结算) */
export function reviveMembers(sim: Sim): void {
  if (sim.over) return
  const now = sim.elapsedMs
  for (const m of sim.members) {
    if (Alive.v[m]) continue
    if (now < Revive.at[m]!) continue
    playSfx('revive')
    Alive.v[m] = 1
    MHp.hp[m] = MHp.max[m]!
    Iframe.last[m] = now
    Tint.color[m] = 0xffffff
    Tint.alpha[m] = 1
    Tint.effect[m] = 0
  }
}

/** 队员受击红闪到时恢复(仅活着的) */
export function memberVisual(sim: Sim): void {
  const now = sim.elapsedMs
  for (const m of sim.members) {
    if (!Alive.v[m]) continue
    if (MFlash.until[m] !== 0 && now >= MFlash.until[m]!) {
      MFlash.until[m] = 0
      Tint.color[m] = 0xffffff
    }
  }
}
