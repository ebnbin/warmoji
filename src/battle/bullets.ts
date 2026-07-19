import type { ImageObj } from './BaseArenaScene'

// 弹药的类型化状态（敌我同构，faction 区分）：原精灵数据袋收拢为结构体，
// 经 image.getData('bullet') 单键反查（与敌人的 'enemy' 同一模式）。
// 玩家弹走线段扫掠命中（pierce/splash/hex 能力字段随弹携带）；
// 敌弹走物理 overlap + 寿命回收。

export interface Bullet {
  readonly image: ImageObj
  readonly faction: 'team' | 'enemy'
  damage: number
  radius: number
  /** 上一帧位置（玩家弹扫掠起点；视口重映射时同步改写） */
  prevX: number
  prevY: number
  /** 寿命回收时刻（0 = 不按寿命回收） */
  dieAt: number
  /** 玩家弹：伤害归属槽位 / 击退 / 自旋 / 能力字段 */
  srcSlot: number
  kb: number
  spin: number
  pierce: number
  splash?: { radius: number; ratio: number }
  hex?: { durationMs: number; morphEmoji: string; vulnMul?: number }
  hitRefs?: Set<ImageObj>
  /** 敌弹：伤害来源名（战报归属） */
  srcName?: string
}

export function attachBullet(image: ImageObj, faction: Bullet['faction'], init: Partial<Bullet>): Bullet {
  const b: Bullet = {
    image,
    faction,
    damage: 0,
    radius: 0,
    prevX: image.x,
    prevY: image.y,
    dieAt: 0,
    srcSlot: -1,
    kb: 0,
    spin: 0,
    pierce: 0,
    ...init,
  }
  image.setData('bullet', b)
  return b
}

export function bulletOf(image: ImageObj): Bullet {
  return image.getData('bullet') as Bullet
}
