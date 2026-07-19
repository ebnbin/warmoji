import type { EnemyDef } from './registry'
import type { AbilityOwner, AbilityRuntime } from '../abilities/types'
import type { Animator } from '../emoji/animator'
import type { ImageObj } from '../battle/BaseArenaScene'

// 敌方实体的类型化状态：原先散落在精灵数据袋（getData/setData 字符串键 +
// 逐处强转）的全部战斗状态收拢为一个结构体。精灵仍由 Phaser Group 持有
//（物理/池化不变），结构体经 image.getData('enemy') 单键反查——全项目
// 唯一的一次强转收口在 enemyOf。时间戳字段一律 0 哨兵 = 未生效。

/** 行为状态机：wander 游荡 / chase 追击 / windup 蓄力 / dash 冲刺 / cool 冷却 */
export type EnemyState = 'wander' | 'chase' | 'windup' | 'dash' | 'cool'

export interface Enemy {
  readonly image: ImageObj
  /** px 化规格（Boss 为公共字段合成的规格） */
  def: EnemyDef
  hp: number
  maxHp: number
  elite: boolean
  boss: boolean
  dormant: boolean
  kbImmune: boolean
  state: EnemyState
  /** 游荡/冲刺方向（锁定时写入） */
  dirX: number
  dirY: number
  turnAt: number
  windupUntil: number
  dashUntil: number
  coolUntil: number
  /** 定时型冲刺的下一轮触发时刻 */
  nextDashAt: number
  danceUntil: number
  flashUntil: number
  morphUntil: number
  morphVuln: number
  morphed: boolean
  slowed: boolean
  /** 能力施加的限时减速/冻结（0 = 无） */
  abilitySlowUntil: number
  abilitySlowMul: number
  /** 精英体质倍率 */
  spMul: number
  dmgMul: number
  /** 击退冲量（指数衰减，0 = 无） */
  kvx: number
  kvy: number
  /** 偷币鼠吃下的金币数 */
  eaten: number
  /** 摇摆/动画随机相位 */
  ph: number
  anim?: Animator
  /** 持械（def.abilities 有行时 materialize 装配；死亡随体销毁） */
  abilities?: AbilityRuntime[]
  abilityOwner?: AbilityOwner
}

/** 建结构体并挂到精灵上（唯一写入点） */
export function attachEnemy(image: ImageObj, def: EnemyDef, hp: number, init?: Partial<Enemy>): Enemy {
  const a: Enemy = {
    image,
    def,
    hp,
    maxHp: hp,
    elite: false,
    boss: false,
    dormant: false,
    kbImmune: false,
    state: 'wander',
    dirX: 0,
    dirY: 0,
    turnAt: 0,
    windupUntil: 0,
    dashUntil: 0,
    coolUntil: 0,
    nextDashAt: 0,
    danceUntil: 0,
    flashUntil: 0,
    morphUntil: 0,
    morphVuln: 1,
    morphed: false,
    slowed: false,
    abilitySlowUntil: 0,
    abilitySlowMul: 1,
    spMul: 1,
    dmgMul: 1,
    kvx: 0,
    kvy: 0,
    eaten: 0,
    ph: 0,
    anim: undefined,
    ...init,
  }
  image.setData('enemy', a)
  return a
}

/** 精灵 → 结构体反查（全项目唯一的敌人状态强转收口） */
export function enemyOf(image: ImageObj): Enemy {
  return image.getData('enemy') as Enemy
}
