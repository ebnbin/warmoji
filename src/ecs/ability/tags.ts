import type { AbilityDef } from '../../types/abilityDefs'

// 每种能力一个 tag 组件：施放系统靠 tag 取自己那一批实体，不在一个循环里 switch kind。
// 一条能力归不归某系统管，只看它身上有没有那个 tag——与持有者是谁无关。
// 新增 kind：在此加 tag、登记进 KIND_TAG，再写一个 kinds/ 下的施放系统。

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
