import { INITIAL_CAPACITY } from './world'
import type { BodyRules, EnemyDef, NpcDef, ResourceDef } from '../types/enemies'
import type { FieldPickupDef } from '../types/battlefield'
import type { AbilityDef, Cond, Effect } from '../types/abilityDefs'
import type { Source } from './utils/source'

const slots = <T>(): (T | undefined)[] => new Array<T | undefined>(INITIAL_CAPACITY).fill(undefined)

/** 非玩家身体的定义：敌人、分身、亡仆 */
export const enemyDef = slots<NpcDef>()

/** 敌人的身份（种类、经验、金币、Boss）：只有刷出来的敌人有，召唤出的身体没有 */
export const enemyOf = slots<EnemyDef>()

/** 身体当前的外观（形态切换后），没有就用定义里的；角色与非玩家身体同一个 */
export const bodyLook = slots<string>()

export const projOnHit = slots<readonly Effect[]>()

export const projHitUids = slots<Set<number>>()

export const flyerHits = slots<Set<number>>()

export const boltPts = slots<Float32Array>()

export const meteorHit = slots<Set<number>>()

export const modDef = slots<FieldPickupDef>()

export const telegraphDef = slots<EnemyDef>()

export const telegraphCarries = slots<FieldPickupDef>()

export const carrierPickup = slots<FieldPickupDef>()

export const enemyCarries = slots<FieldPickupDef>()

export const pickupDef = slots<FieldPickupDef>()

export const pickupSfx = slots<import('../types/sfx').SfxId>()

export const abilityOnHit = slots<readonly Effect[]>()

export const abilityOnSelf = slots<readonly Effect[]>()

export const abilityPulse = slots<readonly Effect[]>()

export const abilityArtEmoji = slots<string>()

export const abilityFireSfx = slots<import('../types/sfx').SfxId>()

/** 装置自己的那条能力 */
export const emplaceAbility = slots<AbilityDef>()

/** 弹体出膛时记下的来源：归因与倍率跟着弹体走 */
export const projSrc = slots<Source>()

export const poisonSrc = slots<Source>()

/** 每个身体每个标记槽位的来源：引信、存伤、叠层、死亡印记结算时用 */
export const markSrcs = slots<(Source | undefined)[]>()

/** 能力的附加定义：打死人时施于出手者、出手条件、资源强化、弹匣最后一发 */
export const abilityOnKill = slots<readonly Effect[]>()
export const abilityRequires = slots<Cond>()
export const abilityBoost = slots<{ readonly at: number; readonly spend: number; readonly damageMul?: number; readonly onHit?: readonly Effect[] }>()
export const ammoLast = slots<readonly Effect[]>()

/** 身体的资源定义 */
export const resDef = slots<ResourceDef>()

/** 能力实体装上时的定义：夺取、分身都照它复制 */
export const abilityDef = slots<AbilityDef>()

/** 形态到时切回本体时施加的效果 */
export const formEnd = slots<readonly Effect[]>()

/** 场的对象与判定：场实体上是它自己的，能力实体上是它造出的场的 */
export const zoneRules = slots<import('../types/groundEffects').ZoneRules>()

/** 场内每个身体（按 Uid）连续待着的起始时刻，已触发过的记 -1 */
export const zoneDwellIn = slots<Map<number, number>>()

/** 墙的来源与越过时的效果、每个身体上次在哪一边 */
export const barrierSrc = slots<Source>()
export const barrierCross = slots<readonly Effect[]>()
export const barrierSide = slots<Map<number, number>>()

/** 牵绳的来源与撑满、断开时的效果 */
export const tetherSrc = slots<Source>()
export const tetherHold = slots<readonly Effect[]>()
export const tetherBreak = slots<readonly Effect[]>()

/** 身体自己的规则：敌人是它的定义，角色是出生时按道具拼出来的包，造物只有接触效果 */
export const bodyRules = slots<BodyRules>()

export const zoneEffects = slots<readonly Effect[]>()

/** 被摆布的身体落地、撞墙时的后续与来源 */
export const motionFx = slots<{ readonly src: Source; readonly onLand?: readonly Effect[]; readonly onWall?: readonly Effect[]; readonly base: number }>()

export const zoneSrc = slots<Source>()

export const animId = slots<string>()
export const animOutline = slots<import('../emoji/svg').OutlineKind>()
