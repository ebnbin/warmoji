import type { AbilityDef } from '../../data/abilityDefs'

// 每种能力一个 tag 组件：施放系统靠 tag 取自己那一批实体，不在一个循环里 switch kind。
//
// 过渡期：KIND_TAG 里登记过的 kind 走 ECS 系统，没登记的仍由 war/abilities/ 的旧运行时
// 驱动（见 equip.ts 的回落）。随重写推进逐条搬空，全部登记后旧运行时即可整体删除。

export const KindRally = {}
export const KindDance = {}
export const KindBuff = {}
export const KindTimeStop = {}
export const KindNuke = {}
export const KindHeal = {}
export const KindAreaBlast = {}
export const KindChainArc = {}
export const KindThrust = {}
export const KindSweep = {}
export const KindStrike = {}
export const KindAssassinate = {}
export const KindProjectile = {}
export const KindBoomerang = {}
export const KindLaser = {}
export const KindSummon = {}
export const KindTurret = {}
export const KindSlowAura = {}

export const KIND_TAG: Partial<Record<AbilityDef['kind'], object>> = {
  rally: KindRally,
  dance: KindDance,
  buff: KindBuff,
  timeStop: KindTimeStop,
  nuke: KindNuke,
  heal: KindHeal,
  areaBlast: KindAreaBlast,
  chainArc: KindChainArc,
  thrust: KindThrust,
  sweep: KindSweep,
  strike: KindStrike,
  assassinate: KindAssassinate,
  projectile: KindProjectile,
  boomerang: KindBoomerang,
  laser: KindLaser,
  summon: KindSummon,
  turret: KindTurret,
  slowAura: KindSlowAura,
}
