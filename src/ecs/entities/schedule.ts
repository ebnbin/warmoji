import { addComponents, addEntity } from 'bitecs'
import { Carrier, Due, Surge } from '../components'
import { carrierPickup } from '../store'
import type { FieldPickupDef } from '../../types/battlefield'
import type { Sim } from '../sim'

// 排期实体：Due 说「什么时候」，载荷组件说「做什么」，各自一个系统（systems/fireSurges、
// systems/fireCarriers）在到点那一帧执行并让实体离场。
//
// 从前「稍后做一件事」在这个项目里有三套机制、两种时钟：
//   · sim.pendingSpawns  数组，按 elapsedMs（世界钟）—— 已变成 Telegraph 实体
//   · sim.pendingSurges  数组，按 elapsedMs（世界钟），每帧 filter 重建
//   · this.time.delayedCall  场景侧 Phaser 定时器，**墙钟**
// 第三套跟前两套不是一个时钟：携带者整波的排期走 delayedCall，于是时停期间它照常到点，
// 而同一波的普通刷怪跟着 wdtMs 走。现在它们同源同钟。
//
// 只排「何时」、不预先求落点，是照抄旧实现把整个 spawnOne 塞进 delayedCall 的语义：
// 敌潮会追着移动中的队伍铺开，而不是开场一次性算死十几个落点。

/** 排一次敌潮出怪（到点才求落点与出怪表） */
export function scheduleSurge(sim: Sim, atMs: number, hpMul: number, forceElite: boolean): number {
  const eid = addEntity(sim.world)
  addComponents(sim.world, eid, Due, Surge)
  Due.at[eid] = atMs
  Surge.hpMul[eid] = hpMul
  Surge.forceElite[eid] = forceElite ? 1 : 0
  return eid
}

/** 排一名携带者上场（到点才挑怪求落点） */
export function scheduleCarrier(sim: Sim, atMs: number, pickup: FieldPickupDef): number {
  const eid = addEntity(sim.world)
  addComponents(sim.world, eid, Due, Carrier)
  Due.at[eid] = atMs
  carrierPickup[eid] = pickup
  return eid
}
