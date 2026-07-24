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

/** 待机游移:相位种子 + 幅度(0..1 淡入) */
export const Wander = { seed: f32(), amp: f32() }

/** 存活 + 本帧探测范围内是否有敌(游移门控/orbit 输入) */
export const Alive = { v: u8() }
export const Threat = { v: u8() }

/** 队员移动/布局查询集 */
export const MEMBER_SET = [Member, Slot, Post, OrbitBias, Follow, Wander, Alive, Threat, Transform] as const

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

/** 敌人伤害倍率(精英体质) */
export const DmgMul = { v: f32() }

/** 击退冲量(指数衰减,0=无) */
export const Kv = { x: f32(), y: f32() }

/** 受击白闪恢复时刻(0=无) */
export const Flash = { until: f32() }

/** 游荡方向 + 换向时刻(wander/游荡类 locomotion) */
export const EDir = { x: f32(), y: f32() }
export const ETurn = { at: f32() }

/** 限时减速/冻结(能力施加):present + 未到期时按 mul 缩放移速(mul<1 减速,0 冻结) */
export const Slow = { until: f32(), mul: f32() }

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
