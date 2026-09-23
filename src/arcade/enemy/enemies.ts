import type Phaser from 'phaser'
import type { EnemyDef } from '../../types/enemies'
import type { AbilityOwner, AbilityRuntime } from '../abilities/types'
import type { Animator } from '../anim/animator'
import type { ImageObj } from '../ArcadeBattleScene'
import type { FieldPickupDef } from '../../types/battlefield'

// 时间戳字段一律 0 哨兵 = 未生效。

/** wander 游荡 / chase 追击 / windup 蓄力 / dash 冲刺 / cool 冷却 */
export type EnemyState = 'wander' | 'chase' | 'windup' | 'dash' | 'cool'

/** 仅 dash/detonate locomotion 挂 */
export interface ChargeState {
  windupUntil: number
  dashUntil: number
  coolUntil: number
  nextDashAt: number
}

/** 仅偷币鼠 locomotion 挂；死亡时吐回 eaten */
export interface ThiefState {
  eaten: number
  nextEatAt: number
}

/** 未到期时移速 × mul */
export interface SlowState {
  until: number
  /** 0 = 冻结 */
  mul: number
}

/** 非空即变形中；恢复原形 = 置空 */
export interface MorphState {
  until: number
  /** 易伤倍率，1 = 无 */
  vuln: number
}

/** 非空即中毒；解毒 = 置空 */
export interface PoisonState {
  until: number
  nextTick: number
  dmg: number
  tickMs: number
  /** 伤害归属槽位 */
  slot: number
}

export interface Enemy {
  readonly image: ImageObj
  /** 已 px 化 */
  def: EnemyDef
  hp: number
  maxHp: number
  elite: boolean
  boss: boolean
  dormant: boolean
  /** 本次入眠的世界时刻；醒来后下次入眠重新计 */
  dormantSince: number
  kbImmune: boolean
  state: EnemyState
  /** 为真时主循环跳过环境摇摆，旋转由移动策略自管 */
  posed: boolean
  dirX: number
  dirY: number
  turnAt: number
  charge?: ChargeState
  /** 0 = 非巢穴 */
  nextSpawnAt: number
  danceUntil: number
  flashUntil: number
  morph?: MorphState
  /** 变形结束后仍须持续，故不放进 morph */
  morphCdUntil: number
  slowed: boolean
  abilitySlow?: SlowState
  poison?: PoisonState
  /** 移速倍率 */
  spMul: number
  dmgMul: number
  /** 击退冲量，0 = 无 */
  kvx: number
  kvy: number
  thief?: ThiefState
  /** 诱饵：接触不伤人，不触发亡语 */
  decoy: boolean
  /** 生成自己的巢；计入本巢在场上限；巢被拆时由 orphanBrood 清空 */
  owner?: Enemy
  /** 0 = 不消失；到时静默移除，不走死亡结算 */
  despawnAt: number
  /** 非空即死亡时原地掉此拾取 */
  carries?: FieldPickupDef
  /** 离场须经 detachCarrierAura 销毁 */
  aura?: Phaser.GameObjects.Arc
  /** 摇摆/动画随机相位 */
  ph: number
  anim?: Animator
  /** 死亡时随体销毁 */
  abilities?: AbilityRuntime[]
  abilityOwner?: AbilityOwner
}

/** 唯一写入点 */
export function attachEnemy(image: ImageObj, def: EnemyDef, hp: number, init?: Partial<Enemy>): Enemy {
  const a: Enemy = {
    image,
    def,
    hp,
    maxHp: hp,
    elite: false,
    boss: false,
    dormant: false,
    dormantSince: 0,
    kbImmune: false,
    state: 'wander',
    posed: false,
    dirX: 0,
    dirY: 0,
    turnAt: 0,
    nextSpawnAt: 0,
    danceUntil: 0,
    flashUntil: 0,
    morphCdUntil: 0,
    slowed: false,
    spMul: 1,
    dmgMul: 1,
    kvx: 0,
    kvy: 0,
    decoy: false,
    despawnAt: 0,
    ph: 0,
    anim: undefined,
    ...init,
  }
  image.setData('enemy', a)
  return a
}

/** 唯一的强转收口 */
export function enemyOf(image: ImageObj): Enemy {
  return image.getData('enemy') as Enemy
}
