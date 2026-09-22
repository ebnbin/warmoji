import type Phaser from 'phaser'
import type { Animator } from './anim/animator'
import type { CharacterEffects } from '../types/items'
import type { AbilityContext, AbilityOwner, AbilityRuntime } from './abilities/types'
import type { ImageObj } from './ArcadeBattleScene'

export interface Member {
  emoji: string
  slot: number
  image: ImageObj
  abilities: AbilityRuntime[]
  handle: AbilityOwner
  visualOffset: { x: number; y: number }
  /** 能力 ctx 闭包实时读它；开箱时原地更新 */
  fx: CharacterEffects
  ctx: AbilityContext
  // 道具修正后的个体生效值
  maxHp: number
  /** 守护中心减半 */
  hurtRadius: number
  iframesMs: number
  reviveMs: number
  // 稀有道具的触发式属性
  regenPerSec: number
  thorns: number
  killHeal: number
  hp: number
  alive: boolean
  reviveAt: number
  lastHitMs: number
  /** 独立于接触伤害的无敌帧 */
  lastGroundHitMs: number
  /** 0 = 无 */
  atkSlowUntil: number
  atkSlowMul: number
  hpBar: Phaser.GameObjects.Graphics
  shownHpRatio: number
  deadText: Phaser.GameObjects.Text
  shownCountdown: number
  baseScale: number
  /** 累积量：移动/静止频率不同，不能由时间换算 */
  breathPhase: number
  anim: Animator
  /** 到期前程序化动画不写缩放，让位给 tween */
  animLockUntil: number
  // 跟随弹簧
  followX: number
  followY: number
  followVx: number
  followVy: number
  followK: number
  wanderSeed: number
  wanderAmp: number
  hasThreat: boolean
}

export function attachMember(image: ImageObj, member: Member): void {
  image.setData('member', member)
}

export function memberOf(image: ImageObj): Member {
  return image.getData('member') as Member
}
