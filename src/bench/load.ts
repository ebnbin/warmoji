import { ABILITIES } from '../data/abilities'
import { ENEMY_DEFS } from '../data/enemies'
import type { ProjectileDef } from '../types/abilityDefs'
import type { EnemyDef } from '../types/enemies'

// 基准负载的固定素材：两侧必须投放**同一份**定义，否则比的是素材差异不是框架差异。
// 都从真实内容表里取现成的行，不另造假数据——假数据会绕开真实的字段分支
//（如 onHit 效果链、描边纹理变体），测出来的开销不作数。

/** 基准弹体：番茄（最常见的直伤弹道，无 onHit 效果链） */
export function benchProjectileDef(): ProjectileDef {
  return ABILITIES.tomatoThrow as ProjectileDef
}

/** 基准敌人：表中第一行（僵尸档，最朴素的追击型，无特殊 locomotion） */
export function benchEnemyDef(): EnemyDef {
  return ENEMY_DEFS[0]!
}

/** 均匀铺开的落点：黄金角螺线，序号 → 相对中心的偏移（单位：格）。
 * 用固定序列而非随机——两次运行、两个框架的空间分布必须一致 */
export function benchOffset(i: number): { dx: number; dy: number } {
  const a = i * 2.399963 // 黄金角 ≈ 137.5°
  const r = 1 + Math.sqrt(i) * 0.55
  return { dx: Math.cos(a) * r, dy: Math.sin(a) * r }
}

/** 弹体的初始朝向（与落点同角，向外辐射） */
export function benchAngle(i: number): number {
  return i * 2.399963
}
