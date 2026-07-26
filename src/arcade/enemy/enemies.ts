import type Phaser from 'phaser'
import type { EnemyDef } from '../../types/enemies'
import type { AbilityOwner, AbilityRuntime } from '../abilities/types'
import type { Animator } from '../anim/animator'
import type { ImageObj } from '../ArcadeBattleScene'
import type { FieldPickupDef } from '../../types/battlefield'

// 时间戳字段一律 0 哨兵 = 未生效。

/** 行为状态机：wander 游荡 / chase 追击 / windup 蓄力 / dash 冲刺 / cool 冷却 */
export type EnemyState = 'wander' | 'chase' | 'windup' | 'dash' | 'cool'

/** 冲刺/自爆状态机组件（用到才挂）：仅 dash/detonate locomotion 装配——蓄力/冲刺/冷却/下轮计时 */
export interface ChargeState {
  /** 蓄力结束（进入冲刺/自爆）时刻 */
  windupUntil: number
  /** 冲刺结束时刻 */
  dashUntil: number
  /** 冷却结束（恢复游荡）时刻 */
  coolUntil: number
  /** 定时型冲刺的下一轮触发时刻 */
  nextDashAt: number
}

/** 偷币组件（用到才挂）：仅偷币鼠 locomotion 装配——吃下的金币数 + 偷币冷却，死亡时吐回 */
export interface ThiefState {
  /** 已吃下的金币数 */
  eaten: number
  /** 下一次可吃金币的时刻（偷币冷却，防一帧扫光一片） */
  nextEatAt: number
}

/** 能力施加的限时减速/冻结组件（用到才挂）：present + 未到期时按 mul 缩放移速（震慑余波、凛冬降临） */
export interface SlowState {
  /** 减速到期时刻 */
  until: number
  /** 移速缩放（<1 减速；0 冻结） */
  mul: number
}

/** 变羊组件（用到才挂）：present ↔ 变形中；恢复原形 = 置空。防永久变羊的冷却 morphCdUntil
 * 需在变形结束后仍持续，故独立于本组件、留作平铺字段 */
export interface MorphState {
  /** 恢复原形的时刻 */
  until: number
  /** 变形期易伤倍率（1 = 无） */
  vuln: number
}

/** 中毒 DoT 组件（用到才挂）：非空即中毒；到期解毒 = 置空。小蜜蜂毒针等施加 */
export interface PoisonState {
  /** 解毒时刻 */
  until: number
  /** 下一次毒素跳伤的时刻 */
  nextTick: number
  /** 每跳毒伤 */
  dmg: number
  /** 跳间隔（ms） */
  tickMs: number
  /** 伤害归属槽位 */
  slot: number
}

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
  /** 冲刺/自爆状态机（用到才挂）：dash/detonate 敌人的蓄力/冲刺/冷却/下轮计时 */
  charge?: ChargeState
  /** 巢穴的下一轮生成时刻（0 = 非巢穴） */
  nextSpawnAt: number
  danceUntil: number
  flashUntil: number
  /** 变羊（用到才挂）：present ↔ 变形中；到期恢复原形 = 置空 */
  morph?: MorphState
  /** 变羊冷却到期时刻：变羊结束后一段时间内同一敌人不可再被变（防永久变羊；持久，独立于 morph） */
  morphCdUntil: number
  slowed: boolean
  /** 能力施加的限时减速/冻结（用到才挂）：震慑余波/凛冬降临等；到期自动失效 */
  abilitySlow?: SlowState
  /** 中毒 DoT（用到才挂）：非空即中毒，到期解毒 = poison 置空 */
  poison?: PoisonState
  /** 精英体质倍率 */
  spMul: number
  dmgMul: number
  /** 击退冲量（指数衰减，0 = 无） */
  kvx: number
  kvy: number
  /** 偷币（用到才挂）：仅偷币鼠 locomotion 装配，死亡时吐回吃下的金币 */
  thief?: ThiefState
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

/** 精灵 → 结构体反查（全项目唯一的敌人状态强转收口） */
export function enemyOf(image: ImageObj): Enemy {
  return image.getData('enemy') as Enemy
}
