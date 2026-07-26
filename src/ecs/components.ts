import { MAX_ENTITIES } from './world'

// ECS 组件 = 按 eid 索引的 SoA 类型化数组（bitECS 0.4：组件是任意对象，这里用类型化数组）。
// 渲染相关组件先行（P1）；移动/战斗等组件在后续阶段追加到本文件。
// 所有数组容量 = MAX_ENTITIES；spawn 时写全字段,故跨局复用不残留脏数据。

const f32 = (): Float32Array => new Float32Array(MAX_ENTITIES)
const i32 = (): Int32Array => new Int32Array(MAX_ENTITIES)
const u32 = (): Uint32Array => new Uint32Array(MAX_ENTITIES)
const u8 = (): Uint8Array => new Uint8Array(MAX_ENTITIES)
/** 需要非 0 初值的 i32（如 -1 表示「无」） */
const i32Fill = (v: number): Int32Array => new Int32Array(MAX_ENTITIES).fill(v)

/** 位姿:世界坐标 + 旋转(弧度) + 显示尺寸(世界像素,w×h)。渲染据此算四角。 */
export const Transform = {
  x: f32(),
  y: f32(),
  rot: f32(),
  w: f32(),
  h: f32(),
}

/** 贴图:atlas 变体索引(frame)+ 水平翻转。frame 由 atlas.index(id,outline) 得到。 */
export const Sprite = {
  frame: i32(),
  flipX: u8(),
}

/** 着色:color=0xRRGGBB;effect 0=正常相乘(白=原色) 1=纯色填充(闪白);alpha 0..1。 */
export const Tint = {
  color: u32(),
  effect: u8(),
  alpha: f32(),
}

/** 绘制深度:z 大者后画(压在上层)。同旧 Phaser depth 语义。 */
export const Depth = {
  z: f32(),
}

/** 渲染所需组件集(查询用):四者齐备即可被 spriteBatch 画出 */
export const RENDERABLE = [Transform, Sprite, Tint, Depth] as const

// ── 队员/移动(P2)──────────────────────────────────────────

/** 队员标记 */
export const Member = {}

/** 槽位(招募次序)与队形岗位(座次) */
export const Slot = { v: i32() }
export const Post = { v: i32() }

/** 环上避敌/迎敌秉性(lineup[slot].orbit);null 岗位不参与主力竞争由 Post/formation 决定 */
export const OrbitBias = { v: f32() }

/** 跟随惯性:欠阻尼弹簧位置/速度 + 每人略异刚度 */
export const Follow = { x: f32(), y: f32(), vx: f32(), vy: f32(), k: f32() }

/** 能力驱动的视觉偏移(突刺前冲 / 刺客瞬闪):画在跟随点之上,不动阵型主权 */
export const VisOff = { x: f32(), y: f32() }

/** 待机游移:相位种子 + 幅度(0..1 淡入) */
export const Wander = { seed: f32(), amp: f32() }

/** 呼吸相位(挤压拉伸小动画:移动更快;slot 初相错开) */
export const Breath = { phase: f32() }

/** 弹入动画:until 结束时刻(0=无);ms 总时长;size 目标尺寸;back 是否 Back.easeOut(否则线性)。
 * 队员复活弹入沿用 until(尺寸走呼吸链路);敌人/金币入场由各自系统按 size 插值 */
export const Pop = { until: f32(), ms: f32(), size: f32(), back: u8(), alpha: f32() }

/** 存活 + 本帧探测范围内是否有敌(游移门控/orbit 输入) */
export const Alive = { v: u8() }
export const Threat = { v: u8() }

/** 队员道具属性:荆棘反伤(接触反弹)、击杀回血(吸血獠牙)、再生(每秒回复) */
export const MPerk = { thorns: f32(), killHeal: f32(), regenPerSec: f32() }

/** 队员攻速惩罚(黏黏怪接触:until 到期时刻 + mul 冷却倍率;期间攻速变慢 + 黏液绿) */
export const MAtkSlow = { until: f32(), mul: f32() }

/** 队员血量 + 无敌帧 + 复活 + 受击判定半径 + 受击闪光恢复时刻 */
export const MHp = { hp: f32(), max: f32() }
export const Iframe = { ms: f32(), last: f32() }
export const Revive = { ms: f32(), at: f32() }
export const Hurt = { radius: f32() }
export const MFlash = { until: f32() }

// ── 敌人(P3)──────────────────────────────────────────────

/** 敌人标记 */
export const Enemy = {}

/** 血量 */
export const Hp = { v: f32(), max: f32() }

/** 移速(世界像素/秒,px 化 def.speed) */
export const Speed = { v: f32() }

/** 行为状态机:0 wander / 1 chase / 2 windup / 3 dash / 4 cool(与旧 EnemyState 对应) */
export const EState = { v: u8() }

/** 精英/Boss 标记(渲染描边 elite;体质倍率等后续叠) */
export const Elite = { v: u8() }
export const Boss = { v: u8() }

/** 碰撞半径(世界像素) */
export const Radius = { v: f32() }

/** 敌人伤害倍率(精英体质;护巢子敌暴走再叠) */
export const DmgMul = { v: f32() }

/** 敌人移速倍率(精英加速 ELITE.speedMul;护巢子敌暴走 orphanSpeedMul 再叠) */
export const SpMul = { v: f32() }

/** 击退冲量(指数衰减,0=无) */
export const Kv = { x: f32(), y: f32() }

/** 本帧待提交的位移(行为 + 击退,尚未过世界禁锢/约束):
 * 转向系统写行为分量、击退系统叠冲量分量、提交系统落到 Transform,朝向翻转也读它 */
export const Step = { x: f32(), y: f32() }

/** 本帧减速区叠乘出来的移速乘区(1=未被减速):转向系统与染色系统共读一份,不各算一遍 */
export const ZoneSlow = { v: f32() }

/** 受击白闪恢复时刻(0=无) */
export const Flash = { until: f32() }

/** 游荡方向 + 换向时刻(wander/游荡类 locomotion) */
export const EDir = { x: f32(), y: f32() }
export const ETurn = { at: f32() }

/** 限时减速/冻结(能力施加):present + 未到期时按 mul 缩放移速(mul<1 减速,0 冻结) */
export const Slow = { until: f32(), mul: f32() }

/** 中毒 DoT:until 解毒时刻(0=无毒);nextTick 下次跳伤时刻;dmg 每跳;tickMs 间隔;slot 伤害归属 */
export const Poison = { until: f32(), nextTick: f32(), dmg: f32(), tickMs: f32(), slot: i32() }

/** 冲刺/自爆状态机(dash/detonate locomotion):蓄力/冲刺/冷却结束时刻 + 定时型下轮触发时刻 */
export const Charge = { windupUntil: f32(), dashUntil: f32(), coolUntil: f32(), nextDashAt: f32() }

/** 定时静默移除时刻(0=不移除):亡语诱饵尸壳到时自毁(镜像 despawnAt) */
export const Despawn = { at: f32() }

/** 魔尘变形(仙子 morph):until 变形结束时刻(0=未变形);vuln 变形期受伤倍率;
 * cdUntil 变形+复形冷却结束时刻(期间免疫再变)。变形期无害/缴械/缓速游荡/绵羊形象 */
export const Morph = { until: f32(), vuln: f32(), cdUntil: f32() }

/** 部件动画:常驻 idle 循环(帧基址/帧数/周期/相位偏移)+ 一次性覆盖 clip(播完回落 idle)。
 * base<0 = 帧尚未烘好(或该 emoji 无此 clip),此时保持 still 静态帧——渐进增强,无加载闪烁 */
export const Anim = {
  base: i32(),
  frames: i32(),
  durMs: f32(),
  offset: f32(),
  onceBase: i32(),
  onceFrames: i32(),
  onceDur: f32(),
  onceAt: f32(),
  /** 静态回退帧(atlas 变体索引) */
  still: i32(),
}
export const ANIM_SET = [Anim, Sprite] as const

/** 打滑状态(浮冰世界钩子的低通积分器):行为速度的平滑值,击退不入此列 */
export const Slide = { x: f32(), y: f32() }

/** 休眠(无限世界:出活跃方形即冻结 AI/不被索敌/不占刷怪上限;状态全保留)。Boss 永不休眠 */
export const Dormant = { v: u8() }

/** 贴图取样象限:0=整张 1..4 = 左上/右上/左下/右下(死亡碎片把本体裂成四块)。
 * 渲染层据此把该 frame 的 UV 矩形四等分取其一 */
export const Quad = { v: u8() }

/** 死亡碎片:飞散速度 + 起止时刻 + 终旋转 + 初始尺寸(线性插值:飞散/缩小/旋转/淡出) */
export const Shard = { vx: f32(), vy: f32(), startMs: f32(), until: f32(), rot: f32(), size: f32() }
export const SHARD_SET = [Shard, Transform, Sprite, Tint, Depth] as const

/** 敌人移动查询集(最小:位姿 + 速度 + 血) */
export const ENEMY_SET = [Enemy, Transform, Speed, Hp] as const

// ── 抛射物(P3c)──────────────────────────────────────────

/** 抛射物标记 */
export const Projectile = {}

/** 速度(世界像素/秒) */
export const Vel = { x: f32(), y: f32() }

/** 抛射物属性:伤害/半径/击退/来源槽位/贯穿余量/自旋(rad/s)/寿命回收时刻(0=不按寿命) */
export const Proj = {
  damage: f32(),
  radius: f32(),
  kb: f32(),
  srcSlot: i32(),
  pierce: i32(),
  spin: f32(),
  dieAt: f32(),
}

/** 抛射物查询集 */
export const PROJ_SET = [Projectile, Transform, Vel, Proj] as const

// ── 敌弹(P3e)──────────────────────────────────────────────

/** 敌弹标记(命中队员;不带贯穿/溅射载荷,镜像旧 spawnEnemyProjectile) */
export const EnemyProj = {}

/** 敌弹属性:伤害/半径/寿命回收时刻 */
export const EProj = { damage: f32(), radius: f32(), dieAt: f32() }

/** 敌弹查询集 */
export const EPROJ_SET = [EnemyProj, Transform, Vel, EProj] as const

// ── 拾取物(pickup)──────────────────────────────────────────
// 地上一件东西、走过去就拿到、到手触发一种效果——金币与战场增/减益是同一个概念的
// 两个实例,故是同一种实体、同一条管线。三者之差只是三个正交旋钮:
// 磁吸半径(金币有/战场拾取 0)、停留时长(金币永久 = 0)、到手干什么(kind 分派)。
// 效果登记表与管线在 pickups.ts,生成在 entities/pickup.ts。

/** 拾取物标记。kind = 到手效果的分派键(见 pickups.ts 的 PICKUP_KINDS) */
export const Pickup = { kind: i32() }

/** 磁吸半径(px):进圈即被吸向队伍中心。0 = 不磁吸(得主动走位过去) */
export const Pull = { radius: f32() }

/** 拾取判定半径(px):队伍中心进圈即到手 */
export const Grab = { radius: f32() }

/** 地面停留到期时刻(elapsedMs):到点淡出回收。0 = 永不过期 */
export const Lifetime = { until: f32() }

/** 待拾缓浮(纯视觉):图标绕落点上下缓飘。y0 = 落点(逻辑真相),Transform.y = y0 + 偏移 */
export const Bob = { y0: f32(), amp: f32(), halfMs: f32() }

/** 光圈:跟着实体走的持久呼吸圆(待拾脉冲 / 携带者极性光环)。绘制在 render/rings.ts。
 * dy = 相对 Transform 的纵向偏移——图标缓浮时用它把圈按回地面 */
export const Ring = { color: u32(), radius: f32(), fillAlpha: f32(), born: f32(), dy: f32(), z: f32() }

/** 拾取物查询集(磁吸/拾取/到期:位姿 + 速度) */
export const PICKUP_SET = [Pickup, Transform, Vel] as const

/** 光圈查询集 */
export const RING_SET = [Ring, Transform, Tint] as const

// ── 能力组件 ────────────────────────────────────────────────────────
// 能力 = 实体。一条能力定义在装备时被物化成一个实体，组件描述「它是哪条定义、谁持有、
// 什么阵营、还有多久出手」。各 kind 的施放系统只按自己的 tag 取实体——一条能力归不归
// 某系统管，只看它身上有没有那个 tag，与持有者是队员还是敌人无关。
// tag 本身与 kind 注册表在 ability/tags.ts：那不是纯组件定义，而是「新增一种能力」
// 的唯一登记点，拆散反而难找。

/** 施放锚点：**从哪儿放这一下**。武器指持有者（枪口从人身上算起），
 * 自持能力的召唤物（弩塔）指自己。与 Owner 分开：Owner 是「算谁的账、受谁的状态管」，
 * 弩塔的账算建造者、位置却是它自己 */
export const Anchor = { eid: i32() }

/** 上次出手时刻（视觉钟）：castScan 出手成功时写入。
 * 只有需要在「出手那一下」做事的实体才挂它（弩塔的拉弓动画） */
export const Fired = { at: f32() }

/** 手持外形：这件武器在场上握得出来，位姿由各 kind 的摆位系统写。
 * **有这个组件 = 有手持外形**——摆位系统靠它取自己该摆的那批，不再去 def 里翻 held。
 * 徒手能力（无外形）不挂它，于是根本不会被摆位系统扫到 */
export const Held = {
  /** 静止时距施放锚点的距离 */
  restOffset: f32(),
  /** emoji 素材的原始朝向补偿（弧度，装配时已由度换算） */
  rotOffset: f32(),
  /** 左/右手横向挂载：垂直于瞄准方向偏移 side × gap（0 = 不偏） */
  side: f32(),
  gap: f32(),
  /** 本体显示尺寸（世界像素）——双子镖等分身照它建 */
  size: f32(),
}

/** 能力实体标记 */
export const Ability = {}

/** 武器实体标记：**一件武器就是一颗实体**，能力是它身上的组件。
 * 有外形的自带 Held + Transform/Sprite，就是握在手里的那个 emoji；
 * 徒手能力是同一种实体，只是没有身体。牛仔的左右枪 = 两颗，各自独立冷却。
 * 生成在 entities/weapon.ts。Ability 与 Weapon 分开是因为召唤物（炮台）
 * 也带 Ability 但不是武器 */
export const Weapon = {}

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
/** 队长实体：本局的行为主体与队伍锚点。无碰撞箱、无受击箱、不绘制——
 * 但移速、拾取半径这些属性属于它，队员绕着它编队。理论上一局一个，但不是硬约束。
 * 无本体的能力（队长技能载荷）以它为持有者，于是「持有者位置」对所有能力同构 */
export const Captain = {}

/** 队长移速(世界像素/秒:队长基础 × 道具/卡牌乘区)。队伍整体按它走位 */
export const MoveSpeed = { v: f32() }

/** 金币磁吸半径(px:队长 coinMagnet × 道具 magnetMul) */
export const Magnet = { radius: f32() }

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
 * of = 掷出它的武器实体——主镖就是武器自己（of 指向自身），双子镖是临时副本。
 * 已命中集在 store 的 flyerHits */
export const Flyer = {
  of: i32(),
  phase: u8(),
  launchX: f32(),
  launchY: f32(),
  destX: f32(),
  destY: f32(),
  t: f32(),
  damage: f32(),
}

/** 召唤物（见 entities/minion.ts）：Owner.eid 指回造它的武器实体。
 * bornMs 出生时刻（视觉钟：入场弹入 + 拆最旧时比岁数）、dieAt 寿命到期时刻
 *（世界钟，0=不按时限）、cd 自身行为冷却、phase 候敌打转的相位、
 * size 本体尺寸（弹入插值的终值） */
export const Minion = { bornMs: f32(), dieAt: f32(), cd: f32(), phase: f32(), size: f32() }

/** 召唤物是哪件武器造的：查 def、限座数、都顺着它。
 * 与 Owner 分开：Owner 是施放者本人（伤害归属/乘区/闸门都按他算） */
export const Built = { by: i32() }

/** 退场中：超编被拆的装置，缩小淡出到 until（视觉钟）后离场，期间不再行动。
 * 与 Minion.dieAt 分开：那个是寿命、走世界钟，这个是退场动画、走视觉钟 */
export const Retiring = { until: f32() }

/** 小蜂：寻路扑敌、撞上即自毁的召唤物 */
export const Swarmer = {}

/** 弩塔：架在地上自主索敌开火的装置 */
export const Emplacement = {}

// ── 敌人专属数值组件 ──────────────────────────────────────────────
// 这些原先住在 store.ts（按 eid 索引的旁路数组）。它们全是类型化数组，形式上与本文件
// 其余组件毫无二致，只是没挂进世界——于是既查不到也不随实体注册。搬回来之后
// store.ts 只留真正放不进类型化数组的富数据（对象引用 / Set / 字符串）。
// 跨局无需清理：这些字段一律由 spawnEnemy 无条件覆写（EnemyVel 由 steerEnemies 每帧写）。

/** 本帧移动朝向（steerEnemies 写；敌方 aim:'move' 弹的 ownerHeading 读） */
export const EnemyVel = { x: f32(), y: f32() }

/** 装配状态与出手节奏：armed=是否已装配过能力（eid 复用后 spawnEnemy 清零）；
 * fireDelayMs=首发延迟（spawn 时抽取，lazy-arm 喂入 createAbility） */
export const EnemyArm = { armed: u8(), fireDelayMs: f32() }

/** 行走动画的环境摇摆随机相位（spawn 时抽取，同屏错相） */
export const EnemyPhase = { v: f32() }

/** 虫巢：of = 护巢子敌指回的巢 eid（-1 表示无巢，拆巢时清空触发暴走）；
 * nextSpawnAt = 巢自身的下次生成时刻（0 表示非 spawner） */
export const Nest = { of: i32Fill(-1), nextSpawnAt: f32() }

/** 拆巢暴走倍率：巢没了之后叠到自己的速度/攻击上。
 * **有这个组件 = 这只子敌会因拆巢暴走**——拆巢时不必回头问它是不是 baseOrbit */
export const Orphan = { speedMul: f32(), damageMul: f32() }

/** 偷币鼠：eaten=已吞金币数（死亡时吐回 + 利息）；nextEatAt=下次可吞时刻（逐枚偷） */
export const Thief = { eaten: i32(), nextEatAt: f32() }
