import { MAX_ENTITIES } from './world'
import type { EnemyDef } from '../types/enemies'
import type { FieldPickupDef } from '../types/battlefield'
import type { Effect } from '../types/abilityDefs'

// 富数据伴随存储(按 eid 索引):放**不进类型化数组**的东西——对象引用 / Set / 字符串。
// 纯数值一律做成组件（见 components.ts）:那些查得到、随实体注册，这里的查不到。
// **spawn 时必须无条件写**:eid 会复用,漏写就读到上一位住户的残值(见 entities/enemy.ts
// 里那句「携带者由 spawnCarrier 落地后覆写」——它写的就是 undefined)。反过来,
// removeEntity 前不必清;曾经靠「清空 enemyDef」当存活判据,那是巧合不是判据,已改成查组件。
// 跨局(scene.restart)必须整体清空:eid 从头再分配,上一局的引用会挂在新实体身上。
// 一律 new Array(MAX_ENTITIES).fill(undefined) 预分配:按 eid 索引本就要满容量,
// 且 fill 让 V8 保持 packed——空 [] 上直接写 eid=5000 会退化成 holey/字典模式。

/** 敌人的 px 化 def(emoji/尺寸/速度/locomotion/abilities/死亡效果…) */
export const enemyDef: (EnemyDef | undefined)[] = new Array<EnemyDef | undefined>(MAX_ENTITIES).fill(undefined).fill(undefined)

/** 抛射物命中效果链 */
export const projOnHit: (readonly Effect[] | undefined)[] =
  new Array<readonly Effect[] | undefined>(MAX_ENTITIES).fill(undefined).fill(undefined)

/** 抛射物已命中的敌人 eid(贯穿去重) */
export const projHitEids: (Set<number> | undefined)[] = new Array<Set<number> | undefined>(MAX_ENTITIES).fill(undefined).fill(undefined)

/** 在途回旋镖本程已命中的 eid(去程/回程各判一次,同程内每敌最多一次) */
export const flyerHits: (Set<number> | undefined)[] = new Array<Set<number> | undefined>(MAX_ENTITIES).fill(undefined).fill(undefined)

/** 敌人携带的战场拾取(携带者:死亡即在原地掉这枚拾取) */
export const enemyCarries: (FieldPickupDef | undefined)[] =
  new Array<FieldPickupDef | undefined>(MAX_ENTITIES).fill(undefined).fill(undefined)

/** 拾取物携带的载荷(只有需要 def 的那些 kind 用得上:战场增/减益要知道自己是哪一枚;
 * 金币无载荷,kind 本身就是全部信息) */
export const pickupDef: (FieldPickupDef | undefined)[] =
  new Array<FieldPickupDef | undefined>(MAX_ENTITIES).fill(undefined)

/** 能力的命中效果链(Effect[] 是数组,组件装不下;弹丸落地后另抄一份到 projOnHit) */
export const abilityOnHit: (readonly Effect[] | undefined)[] =
  new Array<readonly Effect[] | undefined>(MAX_ENTITIES).fill(undefined)

/** 能力生成物的 emoji(弩塔/小蜂/天罚坠物):字符串装不进组件,而部件动画要靠它惰性解析 clip */
export const abilityArtEmoji: (string | undefined)[] = new Array<string | undefined>(MAX_ENTITIES).fill(undefined)

/** 能力的出手音效(敌械弹幕用;字符串,同上) */
export const abilityFireSfx: (import('../types/sfx').SfxId | undefined)[] =
  new Array<import('../types/sfx').SfxId | undefined>(MAX_ENTITIES).fill(undefined)

/** 抛射物的伤害来源名(敌弹用;结算页敌情明细按敌人名归属。我方弹按 Proj.srcSlot 分账) */
export const projSrcName: (string | undefined)[] = new Array<string | undefined>(MAX_ENTITIES).fill(undefined)

/** 敌方地面区的伤害来源名(同上;队伍侧的区按 ZoneBurn.srcSlot 分账,不用名字) */
export const zoneSrcName: (string | undefined)[] = new Array<string | undefined>(MAX_ENTITIES).fill(undefined)

/** 部件动画的 emoji 与描边(帧惰性解析用;undefined = 该实体不参与动画) */
export const animId: (string | undefined)[] = new Array<string | undefined>(MAX_ENTITIES).fill(undefined)
export const animOutline: (import('../emoji/svg').OutlineKind | undefined)[] =
  new Array<import('../emoji/svg').OutlineKind | undefined>(MAX_ENTITIES).fill(undefined)

/** 跨局清场:模块级伴随存储整体清空(eid 从 0 重新分配,旧局引用不能留给新实体)。
 * 场景 create 时调 */
export function clearEcsStore(): void {
  enemyDef.fill(undefined)
  projOnHit.fill(undefined)
  projHitEids.fill(undefined)
  flyerHits.fill(undefined)
  enemyCarries.fill(undefined)
  pickupDef.fill(undefined)
  animId.fill(undefined)
  animOutline.fill(undefined)
  abilityArtEmoji.fill(undefined)
  abilityOnHit.fill(undefined)
  abilityFireSfx.fill(undefined)
  projSrcName.fill(undefined)
  zoneSrcName.fill(undefined)
}
