import { addComponent, addComponents, addEntity } from 'bitecs'
import { armIdle } from '../anim'
import { attachDrawable } from '../drawable'
import { Anim, FACTION, Faction, Minion, Owner, Sprite } from '../components'
import type { OutlineKind } from '../../emoji/svg'
import type { Sim } from '../sim'

// 召唤物（minion）：被某件武器造出来、有自己的寿命、在场上**自主行动**的东西。
//
// 为什么它既不是弹丸也不是敌人——两条判据：
// · 弹丸出膛即按初速走完一条线，不重新选目标，也没有「没事干」的状态。
//   召唤物会自主索敌，没目标时还有待机行为（小蜂绕主人打转候敌）。
// · 敌人是战场的一方：有血、会被索敌、会掉落、算进刷怪上限。
//   召唤物没有血、不被索敌、不掉落，到寿命自己消散——它属于召唤它的那一方。
//
// 现有两种（各自的行为在 ability/kinds/ 下，这里只管出生）：
// · Swarmer 小蜂（毒蜂群）——寻路扑敌、撞上即施伤自毁、没撞到则到寿命消散。
//   撞上自毁是它的**死法**不是类别：神风机也是飞机，不是炮弹。
// · Emplacement 弩塔（林木弩塔）——架在地上自主索敌开火，同时在场有上限，
//   超编拆最旧的一座。
//
// Owner.eid 指回造它的武器实体——伤害归属、出手乘区、主人阵亡时停摆，全顺着它走。

export interface MinionSpec {
  /** 该种召唤物的标记组件（Swarmer / Emplacement），各自的行为系统靠它取自己那一批 */
  tag: object
  emoji: string
  /** 本体尺寸（世界像素）——也是入场弹入的终值 */
  size: number
  /** 出生尺寸倍率：<1 即带入场弹入，1 = 直接到位 */
  bornScale: number
  x: number
  y: number
  z: number
  /** 寿命（ms，世界钟）；0 = 不按时限退场（弩塔靠超编被拆） */
  lifeMs: number
  /** 候敌打转的初相（弧度）；不用则给 0 */
  phase: number
  /** 自身行为冷却初值（ms）；不用则给 0 */
  cd: number
  /** 部件动画的相位错峰（ms）；省略即保持静态帧 */
  animOffsetMs?: number
}

/** 造一只召唤物，挂到造它的那件武器名下。阵营与描边随武器走 */
export function spawnMinion(sim: Sim, weaponEid: number, spec: MinionSpec): number {
  const outline: OutlineKind = Faction.v[weaponEid] === FACTION.enemy ? 'enemy' : 'player'
  const m = addEntity(sim.world)
  attachDrawable(sim.world, m, sim.frames, {
    id: spec.emoji,
    outline,
    x: spec.x,
    y: spec.y,
    size: spec.size * spec.bornScale,
    z: spec.z,
  })
  addComponents(sim.world, m, Minion, Owner, spec.tag)
  Owner.eid[m] = weaponEid
  // bornMs 走视觉钟：它只服务入场弹入与「拆最旧」的比岁数，不该被时停拖慢
  Minion.bornMs[m] = sim.fxMs
  Minion.dieAt[m] = spec.lifeMs > 0 ? sim.elapsedMs + spec.lifeMs : 0
  Minion.phase[m] = spec.phase
  Minion.size[m] = spec.size
  Minion.cd[m] = spec.cd
  if (spec.animOffsetMs !== undefined) {
    addComponent(sim.world, m, Anim)
    armIdle(m, spec.emoji, outline, Sprite.frame[m]!, spec.animOffsetMs)
  }
  return m
}
