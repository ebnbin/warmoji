import type Phaser from 'phaser'
import type { EnemyDef } from './registry'
import type { AbilityOwner, AbilityRuntime } from '../abilities/types'
import type { Animator } from '../emoji/animator'
import type { ImageObj } from '../battle/BaseArenaScene'
import type { FieldPickupDef } from '../battlefield/registry'

// 时间戳字段一律 0 哨兵 = 未生效。

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
  /** 脚本化姿态中（蓄力/冲刺）：本体自管旋转朝向，主循环跳过环境摇摆 */
  posed: boolean
  /** 游荡/冲刺方向（锁定时写入） */
  dirX: number
  dirY: number
  turnAt: number
  windupUntil: number
  dashUntil: number
  coolUntil: number
  /** 定时型冲刺的下一轮触发时刻 */
  nextDashAt: number
  /** 巢穴的下一轮生成时刻（0 = 非巢穴） */
  nextSpawnAt: number
  danceUntil: number
  flashUntil: number
  morphUntil: number
  morphVuln: number
  morphed: boolean
  /** 变羊冷却到期时刻：变羊结束后一段时间内同一敌人不可再被变（防永久变羊） */
  morphCdUntil: number
  slowed: boolean
  /** 能力施加的限时减速/冻结（0 = 无） */
  abilitySlowUntil: number
  abilitySlowMul: number
  /** 中毒 DoT（小蜜蜂毒针等）：0 = 未中毒。到期解毒 */
  poisonUntil: number
  /** 下一次毒素跳伤的时刻 */
  poisonNextTick: number
  /** 每跳毒伤 / 跳间隔（ms）/ 伤害归属槽位 */
  poisonDmg: number
  poisonTickMs: number
  poisonSlot: number
  /** 精英体质倍率 */
  spMul: number
  dmgMul: number
  /** 击退冲量（指数衰减，0 = 无） */
  kvx: number
  kvy: number
  /** 偷币鼠吃下的金币数 */
  eaten: number
  /** 偷币鼠下一次可吃金币的时刻（偷币冷却，防一帧扫光一片） */
  nextEatAt: number
  /** 亡语替身：无伤害/无行为的诱饵尸壳（接触不伤人，专供吸引火力） */
  decoy: boolean
  /** 属主（巢）：护巢子敌指向生成自己的巢——绕巢/护巢的锚点 + 计入本巢在场上限。
   * 巢被拆时由 orphanBrood 清空并触发暴走（见 baseOrbit steerer） */
  owner?: Enemy
  /** 定时消失时刻（0 = 不消失）：替身到时静默移除，不走死亡结算 */
  despawnAt: number
  /** 战场拾取携带者：非空即死亡时在原地掉此拾取（带极性光环 aura） */
  carries?: FieldPickupDef
  /** 携带者的极性光环 GameObject（随敌跟位，离场即销毁） */
  aura?: Phaser.GameObjects.Arc
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
    posed: false,
    dirX: 0,
    dirY: 0,
    turnAt: 0,
    windupUntil: 0,
    dashUntil: 0,
    coolUntil: 0,
    nextDashAt: 0,
    nextSpawnAt: 0,
    danceUntil: 0,
    flashUntil: 0,
    morphUntil: 0,
    morphVuln: 1,
    morphed: false,
    morphCdUntil: 0,
    slowed: false,
    abilitySlowUntil: 0,
    abilitySlowMul: 1,
    poisonUntil: 0,
    poisonNextTick: 0,
    poisonDmg: 0,
    poisonTickMs: 1000,
    poisonSlot: -1,
    spMul: 1,
    dmgMul: 1,
    kvx: 0,
    kvy: 0,
    eaten: 0,
    nextEatAt: 0,
    decoy: false,
    despawnAt: 0,
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
