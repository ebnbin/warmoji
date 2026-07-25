import { MAX_ENTITIES } from '../world'

// 能力 = 实体。一条能力定义在装备时被物化成一个实体，组件描述「它是哪条定义、谁持有、
// 什么阵营、还有多久出手」。各 kind 的施放系统只按自己的 tag 取实体——一条能力归不归
// 某系统管，只看它身上有没有那个 tag，与持有者是队员还是敌人无关。

const f32 = (): Float32Array => new Float32Array(MAX_ENTITIES)
const i32 = (): Int32Array => new Int32Array(MAX_ENTITIES)
const u8 = (): Uint8Array => new Uint8Array(MAX_ENTITIES)

/** 能力实体标记 */
export const Ability = {}

/** 指回只读定义表的下标（defs.ts）：组件只存数值，嵌套的 def 本体不进组件 */
export const AbilityRef = { def: i32() }

/** 反指持有者实体（队员 / 敌人 / 队伍锚点）。子实体（炮塔、召唤物）复用同一组件 */
export const Owner = { eid: i32() }

/** 阵营取值：决定索敌落在哪一侧，与持有者身份无关 */
export const FACTION = { team: 0, enemy: 1 } as const

export const Faction = { v: u8() }

/** 冷却剩余 ms（≤0 即就绪） */
export const Cooldown = { left: f32() }

/** 出手乘区（装备时定死的那部分）：dmg 伤害 / cd 冷却 / crit 暴击率 / kb 击退倍率。
 * battle=1 表示这是一条常规出手，吃随局面变的队伍侧乘区（战场限时层、暴击加成、
 * 试炼场旋钮）；队长技能载荷是裸乘区，一概不吃 */
export const Amp = { dmg: f32(), cd: f32(), crit: f32(), kb: f32(), battle: u8() }

/** 冻结：持有者阵亡或休眠——连冷却都不推进 */
export const Frozen = { v: u8() }

/** 缴械：持有者被压制（蹦迪 / 变形）——推进冷却但不出手 */
export const Disarmed = { v: u8() }

/** 手动施放：不参与自动开火扫描，只等施放请求（队长技能载荷） */
export const Manual = {}

/** 本帧施放请求：手动通道写入，施放系统消费后即移除 */
export const CastRequest = {}

/** 队伍锚点：位置恒等于队伍中心，供无本体的能力（队长技能载荷）当行为主体 */
export const AnchorCenter = {}

/** 能力实体查询集 */
export const ABILITY_SET = [Ability, AbilityRef, Owner, Faction, Cooldown, Amp, Frozen, Disarmed] as const
