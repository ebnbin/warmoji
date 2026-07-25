import type Phaser from 'phaser'
import type { Animator } from '../war/anim/animator'
import type { CharacterEffects } from '../data/items'
import type { AbilityContext, AbilityOwner, AbilityRuntime } from './abilities/types'
import type { ImageObj } from './ArcadeBattleScene'

export interface Member {
  emoji: string
  slot: number
  image: ImageObj
  abilities: AbilityRuntime[]
  handle: AbilityOwner
  visualOffset: { x: number; y: number }
  /** 道具聚合效果：能力 ctx 闭包实时读它，开箱时原地更新即全线生效 */
  fx: CharacterEffects
  /** 本角色的能力上下文：开箱热重建能力时复用 */
  ctx: AbilityContext
  // 道具修正后的个体生效值
  maxHp: number
  /** 受击判定圆半径（守护中心减半；虚空图手写接触判定复用） */
  hurtRadius: number
  iframesMs: number
  reviveMs: number
  // 稀有道具的触发式属性：每秒回复 / 接触反伤 / 击杀回血
  regenPerSec: number
  thorns: number
  killHeal: number
  hp: number
  alive: boolean
  reviveAt: number
  lastHitMs: number
  /** 地面效果跳伤的按受害者节流时计（独立于接触伤害的无敌帧） */
  lastGroundHitMs: number
  /** 黏滞减速：限时攻速惩罚（能力 cooldownMul 叠乘 >1 = 更慢），到时自动恢复（0 = 无） */
  atkSlowUntil: number
  atkSlowMul: number
  hpBar: Phaser.GameObjects.Graphics
  shownHpRatio: number
  deadText: Phaser.GameObjects.Text
  shownCountdown: number
  /** 呼吸动画的基准缩放（setDisplaySize 得到的比例） */
  baseScale: number
  /** 呼吸相位累积（移动/静止频率不同，用累积保证切换平滑） */
  breathPhase: number
  /** 部件动画播放器：常驻 idle 翻帧，playOwnerClip 播一次性动作 */
  anim: Animator
  /** 复活弹出等 tween 期间暂停程序化动画，避免逐帧写缩放打架 */
  animLockUntil: number
  // 跟随惯性：欠阻尼弹簧位置/速度 + 每人略异的刚度（步调不齐才像一群人）
  followX: number
  followY: number
  followVx: number
  followVy: number
  followK: number
  /** 待机游移：相位种子 + 幅度（静止且探测范围内无敌时淡入） */
  wanderSeed: number
  wanderAmp: number
  /** 本帧探测范围内是否有敌人（orbit 倾向输入 + 游移门控） */
  hasThreat: boolean
}

export function attachMember(image: ImageObj, member: Member): void {
  image.setData('member', member)
}

export function memberOf(image: ImageObj): Member {
  return image.getData('member') as Member
}
