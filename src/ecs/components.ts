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

/** 渲染所需组件集:四者齐备即可被 spriteBatch 画出。**它是这个集合的唯一声明**——
 * 查询侧 spriteBatch 用它，构造侧 entities/drawable.ts 的 attachDrawable 展开它 */
export const RENDERABLE = [Transform, Sprite, Tint, Depth] as const

// ── 角色/移动(P2)──────────────────────────────────────────

/** 角色标记（数据层叫 CHARACTERS，此处同名；旧称「队员」已统一） */
export const Character = {}

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
export const CharPerk = { thorns: f32(), killHeal: f32(), regenPerSec: f32() }

/** 队员攻速惩罚(黏黏怪接触:until 到期时刻 + mul 冷却倍率;期间攻速变慢 + 黏液绿) */
export const CharAtkSlow = { until: f32(), mul: f32() }

/** 队员血量 + 无敌帧 + 复活 + 受击判定半径 + 受击闪光恢复时刻 */
export const CharHp = { hp: f32(), max: f32() }
export const Iframe = { ms: f32(), last: f32() }
export const Revive = { ms: f32(), at: f32() }
export const Hurt = { radius: f32() }
export const CharFlash = { until: f32() }

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

/** 抛射物标记(我方弹与敌弹同为它;打哪一侧由 Faction 决定) */
export const Projectile = {}

/** 速度(世界像素/秒) */
export const Vel = { x: f32(), y: f32() }

/** 抛射物属性:伤害/半径/击退/来源槽位/贯穿余量/自旋(rad/s)/寿命回收时刻(0=不按寿命)。
 * 敌弹与我方弹是**同一种实体**——差别不在阵营,在下面那几个可选组件:
 * 敌弹只是没挂 SweptHit/WallStop/ViewCull,且 kb/pierce/spin 为 0、srcSlot 为 -1 */
export const Proj = {
  damage: f32(),
  radius: f32(),
  kb: f32(),
  srcSlot: i32(),
  pierce: i32(),
  spin: f32(),
  dieAt: f32(),
}

/** 本帧移动前的位置:线段扫掠命中的起点。回绕帧起点即落点(线段退化成一点) */
export const PrevPos = { x: f32(), y: f32() }

/** 线段扫掠命中(高速弹不穿模):按段上距离排序依次施伤,吃贯穿。
 * **不挂 = 圆-圆命中**——慢速弹用不着扫掠 */
export const SweptHit = {}

/** 撞墙即销毁(残垣图):墙比最近命中点更近时本帧命中作废 */
export const WallStop = {}

/** 出视野一段即回收:无界世界没有地图边可依,视野才是通用口径 */
export const ViewCull = {}

/** 世界钩子回收(有界图出地图即灭) */
export const WorldCull = {}

/** 抛射物查询集 */
export const PROJ_SET = [Projectile, Transform, Vel, Proj] as const

// ── 拾取物(pickup)──────────────────────────────────────────
// 地上一件东西、走过去就拿到、到手触发一种效果——金币与战场增/减益是同一个概念的
// 两个实例,故是同一种实体、同一条管线。三者之差只是三个正交旋钮:
// 磁吸半径(金币有/战场拾取 0)、停留时长(金币永久 = 0)、到手干什么(kind 分派)。
// 效果登记表与管线在 pickups.ts,生成在 entities/pickup.ts。

/** 拾取物标记。「到手给什么」不在这里——见下面那组 Grant*，每种给法一个组件 */
export const Pickup = {}

/** 本帧到手（一次性事件组件）：updatePickups 挂上，各 Grant 系统消费，reapCollected 最后回收。
 * 到手效果从前是 PICKUP_KINDS[kind].collect 一个回调，于是「既给钱又给增益」的拾取物
 * 无处安放；拆成组件后就是两个都挂 */
export const Collected = {}

/** 到手加钱 */
export const GrantCoins = { n: f32() }

/** 到手施加一层限时乘区（哪一枚在 store.pickupDef） */
export const GrantMod = {}

/** 到手全队闪一下（极性色） */
export const GrantFlash = { color: u32(), ms: f32() }

/** 到手的爆点粒数（音效在 store.pickupSfx）。它与 Grant* 正交——既给钱又给增益的
 * 拾取物只该爆一次 */
export const PickupFx = { burst: i32() }

/** 磁吸半径(px):进圈即被吸向队伍中心。0 = 不磁吸(得主动走位过去) */
export const Pull = { radius: f32() }

/** 拾取判定半径(px):队伍中心进圈即到手 */
export const Grab = { radius: f32() }

/** 地面停留到期时刻(elapsedMs):到点淡出回收。0 = 永不过期 */
export const Lifetime = { until: f32() }

/** 待拾缓浮(纯视觉):图标绕落点上下缓飘。y0 = 落点(逻辑真相),Transform.y = y0 + 偏移 */
export const Bob = { y0: f32(), amp: f32(), halfMs: f32() }

/** 圆圈:画在实体位置上的填充圆 + 描边(待拾脉冲、携带者光环、地面效果区、寒气光环)。
 * 绘制在 render/rings.ts——全场就这一个画圆的地方。
 * breathe=1 走呼吸(缩放与透明度往返,born 定相位);=0 静止,半径由持有它的系统自己写。
 * dy = 相对 Transform 的纵向偏移——图标缓浮时用它把圈按回地面 */
export const Ring = {
  color: u32(),
  radius: f32(),
  fillAlpha: f32(),
  lineAlpha: f32(),
  lineWidth: f32(),
  born: f32(),
  dy: f32(),
  z: f32(),
  breathe: u8(),
}

/** 拾取物查询集(磁吸/拾取/到期:位姿 + 速度) */
export const PICKUP_SET = [Pickup, Transform, Vel] as const

/** 圆圈查询集 */
export const RING_SET = [Ring, Transform, Tint] as const

// ── 区域(zone)──────────────────────────────────────────────
// 地上一块圆,进去就受影响。地面毒圈/灼烧区与寒气光环是同一个概念的两个实例——
// 差别只在三个正交旋钮:锚在哪(静止 / 跟着施放者)、活多久(有寿命 / 随武器在)、
// 进去了怎么样(掉血 / 减速)。生成在 entities/zone.ts,逐帧推进在 zones.ts。

/** 区域标记:半径(px)、阵营(效果只落在对面)、入场缩放时长、本帧生效与否。
 * on 由 zones.ts 每帧从源头推导(跟随型看那件武器的出手闸门,静止型恒 1),
 * 消费方只读它——不是一份要各处同步的副本 */
export const Zone = { radius: f32(), faction: u8(), enterMs: f32(), on: u8() }

/** 区域的持续伤害:每 tickMs 一跳。srcSlot = 战报归属槽位(敌方区 -1,名字在 store) */
export const ZoneBurn = { damage: f32(), tickMs: f32(), nextAt: f32(), srcSlot: i32() }

/** 区域的减速:区内敌人移速 ×factor */
export const ZoneChill = { factor: f32() }

/** 区域跟着某个实体走(位姿每帧抄它);不挂 = 静止在落点。
 * 跟随型另有 Owner 指向造它的那件武器:开关随武器的出手闸门,武器没了圈也没 */
export const ZoneFollow = { of: i32() }

/** 区域查询集 */
export const ZONE_SET = [Zone, Transform] as const

/** 上次被地面区烧到的时刻:队员无论同时踩几个区,每 tickMs 至多掉一次血。
 * 这是队员自己的属性,不是区的属性,故挂在队员身上 */
export const GroundHit = { last: f32() }

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


/** 反指持有者实体（队员 / 敌人 / 队伍锚点）。子实体（炮塔、召唤物）复用同一组件 */
export const Owner = { eid: i32() }

/** 阵营取值：决定索敌落在哪一侧，与持有者身份无关 */
export const FACTION = { team: 0, enemy: 1 } as const

export const Faction = { v: u8() }

/** 冷却字段工厂。**冷却属于「这一种能力」，不属于「这个实体」**——组件按 eid 只有
 * 一格，军医的战地医疗与飞针挂在同一个宿主上时，共用一份冷却会让其中一条永远打不
 * 出来，且不报错。所以每种能力的参数组件各带一份，见下面「每种能力的参数组件」。 */
const cd = (): CdComp => ({ cdLeft: f32(), cdBase: f32() })

/** 带冷却的能力参数组件的形状：castScan / tickCooldowns 只认这个，不认具体是哪种能力。
 * cdLeft ≤ 0 即就绪；cdBase = 出手后重置到的间隔（0 = 这种能力没有冷却概念，自己安排下一次） */
export interface CdComp {
  readonly cdLeft: Float32Array
  readonly cdBase: Float32Array
}

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

/** 瞄准方向（弧度）：出手瞬间锁定，持有物摆位与命中判定共用同一个角。
 * 只挂给真的会瞄准的 6 种能力（突刺/横扫/激光/弹道/刺杀/回旋镖），治疗与天罚不用。
 * 它按 eid 只有一格，故同一宿主上两条都要瞄准的能力会撞——由 attachAbility 的断言拦下 */
export const Aim = { rad: f32() }

/** 挥击计时：本次动作的起始时刻（视觉钟）与时长。进度怎么映射成姿态由各 kind 自己解释 */
export const Swing = { startMs: f32(), durMs: f32() }

/** 持有物：这条能力的视觉子实体 eid（0 = 无本体持有物，行为主体是角色自己）。
 * 子实体自带 Transform/Sprite/Tint/Depth，随批绘一起画，不是游离的 GameObject */

// ── 每种能力的参数组件 ───────────────────────────────────────────────
// **一种能力 = 一个组件**：它既是「归哪个 system 管」的标记，也装着执行它需要的
// 全部参数。system 只问「这个实体有没有挂我这个组件」，不问它是什么 kind——
// 参数就在组件上，不必再顺着一个下标去翻定义对象。
//
// def 里的**可选子对象一律拆成可选组件**（群体处方 / 电击起搏 / 扫射 / 冻伤 / 凛冬）：
// 于是 `if (def.aoe)` 变成 `hasComponent(HealAoe)`——「有这个组件 = 有这个性质」。
//
// 参数在装备那一刻由 registries/abilityKinds.ts 的 attach 从 def 写进来，此后 def
// 与这条能力再无关系。
//
// **每个都以 `...cd()` 开头**：冷却是每条能力各一份的状态，不是每个实体一份。
// 这样一个宿主才能同时挂多条不同种能力（军医 = 战地医疗 + 飞针）而互不干扰。

/** 贯穿激光：向瞄准方向发射线段胶囊光束，打穿直线上所有敌人 */
export const Laser = {
  ...cd(),
  damage: f32(),
  knockback: f32(),
  range: f32(),
  beamRadius: f32(),
  color: u32(),
}
/** 双联：正后方同步补一道 */
export const LaserBackBeam = {}
/** 全域扫射：出手改为绕一周的多向序列光束（取代常规单束） */
export const LaserRadial = { beams: f32(), ratio: f32(), stepMs: f32() }

/** 周期治疗：范围内血量比例最低的那一个 */
export const Heal = { ...cd(), amount: f32(), range: f32() }
/** 群体处方：改为范围内全体各回 ratio × amount */
export const HealAoe = { ratio: f32() }
/** 电击起搏：范围内有阵亡队友时优先为其减少复活倒计时 */
export const HealDefib = { reviveCutMs: f32() }

/** 寒气光环：以持有者为圆心的持续减速区（区本身是实体，见 entities/zone.ts） */
export const SlowAura = { ...cd(), radius: f32(), slowFactor: f32(), color: u32() }
/** 冻伤：光环内持续掉血（每秒） */
export const AuraDps = { perSec: f32() }
/** 凛冬降临：每 intervalMs 冻结光环内敌人 durationMs */
export const AuraFreeze = { intervalMs: f32(), durationMs: f32() }

/** 突刺：沿瞄准方向的线段判定；无持有物时本体前冲 lungeDist */
export const Thrust = {
  ...cd(),
  damage: f32(),
  knockback: f32(),
  reach: f32(),
  hitRadius: f32(),
  thrustMs: f32(),
  lungeDist: f32(),
}
/** 二连突：出手后隔 delayMs 重新索敌再刺一段 */
export const ThrustCombo = { delayMs: f32() }

/** 横扫：扇形判定 */
export const Sweep = { ...cd(), damage: f32(), knockback: f32(), radius: f32(), arcDeg: f32(), sweepMs: f32() }

/** 轰炸：在侦测范围内选爆心，炸一个圆 */
export const AreaBlast = {
  ...cd(),
  damage: f32(),
  knockback: f32(),
  detectRange: f32(),
  blastRadius: f32(),
  color: u32(),
}
/** 连锁轰炸：延迟 delayMs 后向随机敌人追加一次 ratio × 伤害 */
export const BlastEcho = { delayMs: f32(), ratio: f32() }

/** 连锁闪电：首跳索敌后逐跳传导，每跳衰减 */
export const ChainArc = {
  ...cd(),
  damage: f32(),
  knockback: f32(),
  range: f32(),
  arcRange: f32(),
  bounces: f32(),
  decay: f32(),
  color: u32(),
}

/** 回旋镖：去程锁点、回程追人，全部接住才开始计冷却 */
export const Boomerang = {
  ...cd(),
  damage: f32(),
  knockback: f32(),
  range: f32(),
  outMs: f32(),
  returnSpeed: f32(),
  hitRadius: f32(),
  spinDegPerSec: f32(),
}
/** 双镖：同时向反方向掷出第二枚 */
export const BoomerangTwin = {}
/** 磁力：飞行途中吸取半径内金币 */
export const CoinMagnet = { radius: f32() }

/** 瞬闪突袭：闪到目标背后斩击，停留期间无敌，结束闪回 */
export const Assassinate = {
  ...cd(),
  damage: f32(),
  knockback: f32(),
  range: f32(),
  behindDist: f32(),
  strikeMs: f32(),
}
/** 处决：目标血量低于 hpRatio 时伤害 ×mul */
export const Execute = { hpRatio: f32(), mul: f32() }

/** 天罚：点名最近的 targets 个目标，坠物砸落 */
export const Strike = {
  ...cd(),
  damage: f32(),
  knockback: f32(),
  targets: f32(),
  coinsPerHit: f32(),
  /** 坠物外形（emoji 在 store.abilityArtEmoji）与下落参数 */
  size: f32(),
  fromAbove: f32(),
  dropMs: f32(),
  staggerMs: f32(),
}

/** 集结号：全队回血 + 短暂无敌 + 冲击环 */
export const Rally = { ...cd(), healRatio: f32(), invulnMs: f32(), ringRadius: f32(), color: u32() }

/** 蹦迪：敌对方全体定身摇摆 */
export const Dance = { ...cd(), durationMs: f32() }

/** 弱点讲座：限时全队增伤 */
export const Buff = { ...cd(), damageMul: f32(), durationMs: f32() }

/** 射击：出膛一枚弹丸。range=0 表示用 ACQUIRE 的缺省索敌上限 */
export const Shoot = { ...cd(), damage: f32(), knockback: f32(), range: f32(), lifeMs: f32() }
/** 瞄准移动方向（缺省是瞄最近目标）——「有这个组件 = 不索敌，朝着走的方向打」 */
export const AimMove = {}
/** 弹丸外形与飞行参数（emoji 在装备那一刻已解析成 frame） */
export const Bolt = { frame: i32(), size: f32(), radius: f32(), speed: f32(), rotOffset: f32() }
/** 齐射：每次出手发 count 枚，扇形散开 spreadDeg（≥360 为整圈） */
export const Volley = { count: f32(), spreadDeg: f32(), randomRotate: u8() }
/** 每第 n 次出手改为一轮特殊齐射 */
export const EveryN = { n: f32(), count: f32(), spreadDeg: f32() }
/** 贯穿：命中后还能再打这么多个 */
export const Pierce = { n: f32() }

/** 召唤：每 intervalMs 放一波 count 只，各自寻路撞敌自毁 */
export const Summon = {
  ...cd(),
  count: f32(),
  damage: f32(),
  knockback: f32(),
  intervalMs: f32(),
  lifeMs: f32(),
  /** 小蜂外形（emoji 在 store.abilityArtEmoji） */
  size: f32(),
  speed: f32(),
}

/** 架设弩塔：本体无攻击，周期在脚下架一座；超编拆最旧的 */
export const Turret = {
  ...cd(),
  placeIntervalMs: f32(),
  maxTurrets: f32(),
  fireIntervalMs: f32(),
  damage: f32(),
  knockback: f32(),
  range: f32(),
  /** 塔的外形（emoji 在 store.abilityArtEmoji） */
  size: f32(),
}
/** 三连弩：每次开火改为扇形连发 */
export const Burst = { count: f32(), spreadDeg: f32() }

/** 全域打击：全场活跃敌人各吃一次大额伤害（随波次威胁倍率缩放，Boss 折减） */
export const Nuke = { ...cd(), damage: f32(), bossRatio: f32() }

/** 时停：按下开关，世界时标的放缩由 stepSim 逐帧处理 */
export const TimeStop = { ...cd(), durationMs: f32() }

/** 光环的两个自走节拍：dps 跳伤与冻结脉冲各自倒计时。
 * 光环没有冷却概念（每帧都过一遍施放扫描），故不能借 Cooldown 当计时器 */
export const Pulse = { dps: f32(), freeze: f32() }

/** 光环名下的减速区实体（0 = 还没建；建一次就一直在，随本武器一并回收）。
 * eid 在 [1, MAX_ENTITIES)，故 0 可当「没有」 */
export const Aura = { zone: i32() }

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

/** 这把武器在途几枚（回旋镖）。出手时置 count，每接住一枚减一，归零才计冷却。
 * 从前是每帧遍历全部 Flyer 数 of===e，现在一次读 */
export const Thrown = { n: i32() }

/** 在途回旋镖：phase 0=去程（沿 launch→dest 缓动）1=回程（追持有者实时位置）。
 * of = 掷出它的武器实体。它是一颗独立实体——武器本身始终留在手上（在途期间隐藏），
 * 不再有「主镖就是武器自己」这回事。已命中集在 store 的 flyerHits */
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

/** 偷币鼠：eaten=已吞金库数（死亡时吐回 + 利息）；nextEatAt=下次可吞时刻（逐枚偷） */
export const Thief = { eaten: i32(), nextEatAt: f32() }

// ── 每种走位的参数组件 ─────────────────────────────────────────────────
// **一种走位 = 一个组件**，与能力同理：它既是「归哪个转向系统管」的标记，也装着
// 这种走位需要的全部参数。系统只问「有没有挂我这个组件」，不问 enemyDef.locomotion.kind。
// def 里的**判别联合一律拆成各自的组件**（冲刺的触发方式与长度），于是
// `if (trigger.kind === 'timer')` 变成 `hasComponent(DashTimer)`。
// 翻译只在出生那一刻发生一次，见 entities/enemy.ts 的 LOCOMOTIONS。

/** 直扑最近的活着队员 */
export const Chase = {}

/** 无目标游荡（wander；Wander 那个名字归队员待机游移） */
export const Roam = {}

/** 定身不动（虫巢之类） */
export const Stationary = {}

/** 逃跑：队伍进 range 就背身逃开，否则慢速游荡 */
export const Flee = { range: f32() }

/** 偷币鼠的走位：直奔最近金币（参数全在 Speed/Radius 与 AI 表里） */
export const CoinThief = {}

/** 定距风筝：detectRange 内咬人，贴到 standoffDist 就停手站定 */
export const Standoff = { detectRange: f32(), standoffDist: f32() }

/** 自爆冲锋：进 triggerRange 定身蓄力，蓄力完必炸（def 的 knockback 未被使用，故无字段） */
export const Detonate = { triggerRange: f32(), windupMs: f32(), blastRadius: f32(), blastDamage: f32() }

/** 护巢环绕：绕巢盘旋，队员逼近巢即扑人。暴走倍率在 Orphan 上，出生即挂 */
export const BaseOrbit = { orbitRadius: f32(), aggroRange: f32() }

/** 蓄力冲刺。三个 u8 是 def 里的三个二选一，不是「有没有」，故做字段不做 tag */
export const Dash = {
  windupMs: f32(),
  dashSpeed: f32(),
  /** 非冲刺期：1 追人 / 0 游荡 */
  idleChase: u8(),
  /** 瞄准：1 队伍中心 / 0 最近队员 */
  aimTeamCenter: u8(),
  /** 锁向时机：1 起跑瞬间（追到最后一刻）/ 0 进蓄力即锁（可预判横躲） */
  lockAtLaunch: u8(),
  /** 起跑音效 */
  whoosh: u8(),
}
/** 冲刺触发：定时。出生即预约第一次（Charge.nextDashAt） */
export const DashTimer = { intervalMs: f32() }
/** 冲刺触发：探测到人进圈 */
export const DashDetect = { range: f32(), cooldownMs: f32() }
/** 冲刺长度：时长制 */
export const DashTime = { durationMs: f32() }
/** 冲刺长度：距离制（换算成时长要用 dashSpeed，故留原值） */
export const DashDist = { dist: f32() }

/** 冲撞碾墙：冲刺态沿途碾碎断壁（残垣图拆迁 Boss）。这是敌人的性质、不属于哪种走位 */
export const BreaksWalls = {}

// ── 转向的每帧派生量 ───────────────────────────────────────────────────

/** 本帧的行为速度（px/s）：各走位系统写，applyEnemySteps 读。
 * 击退等冲量不在此，它们直接叠 Step */
export const BVel = { x: f32(), y: f32() }

/** 本帧移速倍率：减速区 × 能力限时减速 × 体质 × 团队卡与战场拾取。
 * 各走位系统共读一份，不各算一遍 */
export const Slowed = { v: f32() }

/** 本帧该不该由本职走位接管：休眠 / 蹦迪定身 / 变形游荡都由 updateEnemyGates 接管，
 * 那时置 0，各走位系统一律跳过——「谁来开车」只在一处决定 */
export const Steering = { v: u8() }
