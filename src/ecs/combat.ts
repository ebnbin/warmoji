import { query, removeEntity } from 'bitecs'
import { norm } from '../core/vec'
import { playSfx } from '../audio/sfx'
import { gainXp } from '../run/xp'
import { coinDropChance } from '../run/waves'
import { ELITE } from '../enemies/registry'
import type { EnemyDef } from '../enemies/registry'
import { KNOCKBACK } from '../abilities/registry'
import {
  Alive,
  Boss,
  DmgMul,
  Elite,
  ENEMY_SET,
  Flash,
  Hp,
  Hurt,
  Iframe,
  Kv,
  MFlash,
  MHp,
  Morph,
  Poison,
  Radius,
  Revive,
  SpMul,
  Tint,
  Transform,
} from './components'
import { enemyDef, enemyNest, enemyRef, thiefEaten } from './store'
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
  const morphed = Morph.until[eid] !== 0 && sim.elapsedMs < Morph.until[eid]!
  // 变形期受伤倍率(魔尘诅咒 vulnMul):放大变羊敌人所受伤害
  const dmg = morphed && Morph.vuln[eid] !== 1 ? Math.round(damage * Morph.vuln[eid]!) : damage
  const hp = Hp.v[eid]! - dmg
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
  if (def?.kbImmune && !morphed) kb = 0 // 变形期免疫击退失效(绵羊可被击退)
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

/** 击杀(计数 + 掉落结算 + 亡语入队 + 清体) */
export function killEnemy(sim: Sim, eid: number): void {
  sim.kills++
  playSfx('kill')
  const def = enemyDef[eid]
  const elite = Elite.v[eid] === 1
  if (Boss.v[eid]) sim.bossDown = true // 终波 Boss 被击败 → 场景侧走通关结算
  if (def) grantKillRewards(sim, eid, def, elite) // 经验即得 + 金币落地待拾
  // 亡语快照(实体即将移除:先记死亡点/体质,场景侧 runDeathEffects 重放)
  if (def?.onDeath) {
    sim.pendingDeaths.push({
      def,
      x: Transform.x[eid]!,
      y: Transform.y[eid]!,
      elite,
      boss: Boss.v[eid] === 1,
      dmgMul: DmgMul.v[eid]!,
    })
  }
  if (def?.spawner) orphanBrood(sim, eid) // 拆巢:名下护巢子敌暴走 + 转直扑
  enemyDef[eid] = undefined
  enemyRef[eid] = undefined
  removeEntity(sim.world, eid)
}

/** 经验统一入口(镜像 gainTeamXp):升级累计抽卡,不冻结 */
function gainTeamXp(sim: Sim, amount: number): void {
  const gained = gainXp(sim.run.xp, amount)
  sim.run.xp = gained.state
  if (gained.levelsGained > 0) {
    sim.run.cardDraws += gained.levelsGained
    playSfx('levelup')
  }
}

/** 击杀掉落(镜像 grantKillRewards):经验即得(队长×道具×精英),金币按概率落地待拾。
 * rng 每杀固定取两次(掉落判定 + 双倍判定),勿调整取用次序 */
function grantKillRewards(sim: Sim, eid: number, def: EnemyDef, elite: boolean): void {
  const xpMul = sim.reward.captainXpMul * (elite ? ELITE.xpMul : 1)
  gainTeamXp(sim, Math.round(def.xp * xpMul))
  const dropRoll = sim.rng.next()
  const doubleRoll = sim.rng.next()
  const dropped = dropRoll < coinDropChance((sim.combatMs + sim.elapsedMs) / 1000)
  const baseCoins = dropped ? Math.round(def.coins * (elite ? ELITE.coinsMul : 1)) : 0
  const doubled = baseCoins > 0 && doubleRoll < sim.reward.doubleCoinChance ? baseCoins : 0
  // 偷币鼠吐回吞掉的币 + 1 枚利息(镜像 grantKillRewards 的 eaten 项)
  const eaten = thiefEaten[eid]!
  const total = baseCoins + doubled + eaten + (eaten > 0 ? 1 : 0)
  if (total > 0) sim.pendingCoins.push({ x: Transform.x[eid]!, y: Transform.y[eid]!, count: total })
}

/** 拆巢(镜像 orphanBrood):名下护巢子敌失去锚点——baseOrbit 按各自 orphan 倍率暴走
 * (速度/攻击)并转直扑玩家(enemyNest=-1 即触发 baseOrbit steerer 的暴走分支) */
export function orphanBrood(sim: Sim, nestEid: number): void {
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
    if (enemyNest[eid] !== nestEid) continue
    enemyNest[eid] = -1
    const lm = enemyDef[eid]?.locomotion
    if (lm?.kind === 'baseOrbit') {
      SpMul.v[eid] = SpMul.v[eid]! * lm.orphanSpeedMul
      DmgMul.v[eid] = DmgMul.v[eid]! * lm.orphanDamageMul
    }
  }
}

/** 中毒 DoT:每 tickMs 一跳,到期解毒(镜像 steerEnemies 的毒逻辑核心) */
export function tickPoison(sim: Sim): void {
  const enemies = query(sim.world, ENEMY_SET as unknown as object[])
  const now = sim.elapsedMs
  for (const eid of enemies) {
    if (Poison.until[eid] === 0) continue
    if (now >= Poison.until[eid]!) {
      Poison.until[eid] = 0
      continue
    }
    if (now >= Poison.nextTick[eid]!) {
      Poison.nextTick[eid] = Poison.nextTick[eid]! + Poison.tickMs[eid]!
      applyDamage(sim, eid, Poison.dmg[eid]!)
    }
  }
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
      if (def.damage <= 0) continue // 亡语诱饵尸壳(damage=0)无害:接触不伤(镜像 a.decoy 跳过)
      if (Morph.until[eid] !== 0 && now < Morph.until[eid]!) continue // 变形期无害:接触不伤
      Iframe.last[m] = now
      hurtMember(sim, m, def.damage * DmgMul.v[eid]!)
      break // 一帧一员只吃一次(无敌帧掌管其余)
    }
  }
}

/** 敌人静默移除(自爆/替身到时:不计击杀、不掉落、不放死亡效果) */
export function despawnEnemy(sim: Sim, eid: number): void {
  if (enemyDef[eid]?.spawner) orphanBrood(sim, eid)
  enemyDef[eid] = undefined
  enemyRef[eid] = undefined
  removeEntity(sim.world, eid)
}

/** 队员受伤(镜像 hurtMember + killMember);blast/接触等外部命中点直接调用(无敌帧由调用方掌管) */
export function hurtMember(sim: Sim, eid: number, damage: number): void {
  const hp = Math.max(0, MHp.hp[eid]! - damage)
  MHp.hp[eid] = hp
  playSfx('hurt')
  sim.memberHitCount++ // 场景侧据增量触发受击震屏
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
