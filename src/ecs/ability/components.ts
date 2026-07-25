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

/** 受断壁遮挡：1 = 索敌须探得到头（残垣图）。穿墙能力为 0，无墙图整条判定短路 */
export const WallBlocked = { v: u8() }

/** 瞄准方向（弧度）：出手瞬间锁定，持有物摆位与命中判定共用同一个角 */
export const Aim = { rad: f32() }

/** 挥击计时：本次动作的起始时刻（视觉钟）与时长。进度怎么映射成姿态由各 kind 自己解释 */
export const Swing = { startMs: f32(), durMs: f32() }

/** 持有物：这条能力的视觉子实体 eid（0 = 无本体持有物，行为主体是角色自己）。
 * 子实体自带 Transform/Sprite/Tint/Depth，随批绘一起画，不是游离的 GameObject */
export const Gear = { eid: i32() }

/** 光环的两个自走节拍：dps 跳伤与冻结脉冲各自倒计时。
 * 光环没有冷却概念（每帧都要重新登记减速区），故不能借 Cooldown 当计时器 */
export const Pulse = { dps: f32(), freeze: f32() }

/** 后手：这条能力还欠一发（连锁轰炸的追击 / 二连突的第二段）。left>0 即在途，
 * 与冷却一样只在未冻结时推进；damage 是那一发的伤害快照 */
export const Followup = { left: f32(), damage: f32() }

/** 手动施放：不参与自动开火扫描，只等施放请求（队长技能载荷） */
export const Manual = {}

/** 本帧施放请求：手动通道写入，施放系统消费后即移除 */
export const CastRequest = {}

/** 队伍锚点：位置恒等于队伍中心，供无本体的能力（队长技能载荷）当行为主体 */
export const AnchorCenter = {}

/** 瞬闪位移：突袭停留期加在角色跟随点上的视觉偏移（不动阵型主权） */
export const Blink = { x: f32(), y: f32() }

/** 坠物：从目标上方砸落的一次性投送，落地才结算。Owner.eid 指回发出它的能力实体。
 * startMs 含错峰延迟（可在未来），期间停在 fromY 不显形 */
export const Drop = { startMs: f32(), durMs: f32(), fromY: f32(), toY: f32(), target: i32() }

/** 出手计数：everyN「每第 n 次改打一轮特殊齐射」的节拍 */
export const Shots = { n: i32() }

/** 全域扫射的在途序列：left 剩余束数、nextAt 下一束时刻、angle 下一束方向 */
export const Radial = { left: i32(), nextAt: f32(), angle: f32() }

/** 在途回旋镖：phase 0=去程（沿 launch→dest 缓动）1=回程（追持有者实时位置）。
 * Owner.eid 指回发出它的能力实体；已命中集在 store 的 flyerHits */
export const Flyer = {
  phase: u8(),
  launchX: f32(),
  launchY: f32(),
  destX: f32(),
  destY: f32(),
  t: f32(),
  damage: f32(),
}

/** 召唤 / 架设出来的子实体：Owner.eid 指回发出它的能力实体。
 * bornMs 出生时刻（入场弹入 + 拆最旧时比岁数）、dieAt 消散时刻（0=不按时限）、
 * cd 自身行为冷却、phase 候敌打转的相位、size 本体尺寸（弹入插值的终值） */
export const Minion = { bornMs: f32(), dieAt: f32(), cd: f32(), phase: f32(), size: f32() }

/** 退场中：超编被拆的装置，缩小淡出到 Minion.dieAt 后离场，期间不再行动 */
export const Retiring = {}

/** 小蜂：寻路扑敌、撞上即自毁的召唤物 */
export const Swarmer = {}

/** 弩塔：架在地上自主索敌开火的装置 */
export const Emplacement = {}

/** 能力实体查询集 */
export const ABILITY_SET = [Ability, AbilityRef, Owner, Faction, Cooldown, Amp, Frozen, Disarmed] as const
