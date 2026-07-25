import { MAX_ENTITIES } from './world'

// ECS 组件 = 按 eid 索引的 SoA 类型化数组（bitECS 0.4：组件是任意对象，这里用类型化数组）。
// 渲染相关组件先行（P1）；移动/战斗等组件在后续阶段追加到本文件。
// 所有数组容量 = MAX_ENTITIES；spawn 时写全字段,故跨局复用不残留脏数据。

const f32 = (): Float32Array => new Float32Array(MAX_ENTITIES)
const i32 = (): Int32Array => new Int32Array(MAX_ENTITIES)
const u32 = (): Uint32Array => new Uint32Array(MAX_ENTITIES)
const u8 = (): Uint8Array => new Uint8Array(MAX_ENTITIES)

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

// ── 拾取物·金币(P4)────────────────────────────────────────

/** 金币标记(落地待拾;磁吸向队伍中心,入账半径内 +1 币) */
export const Coin = {}

/** 金币查询集(磁吸/拾取:位姿 + 速度) */
export const COIN_SET = [Coin, Transform, Vel] as const
