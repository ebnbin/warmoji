import { INITIAL_CAPACITY } from './world'

// 数组按 eid 索引，扩容时整体替换（见 storage.ts）：不得缓存数组引用，也不得写 `X.f[i] = 会建实体的调用()`。
// spawn 时须写全字段，跨局复用不清理

type Column = Float32Array | Int32Array | Uint32Array | Uint8Array

/** 非 0 初值的列 */
const FILL = new WeakMap<Column, number>()

const f32 = (): Float32Array => new Float32Array(INITIAL_CAPACITY)
const i32 = (): Int32Array => new Int32Array(INITIAL_CAPACITY)
const u32 = (): Uint32Array => new Uint32Array(INITIAL_CAPACITY)
const u8 = (): Uint8Array => new Uint8Array(INITIAL_CAPACITY)
/** 需要非 0 初值的 i32（如 -1 表示「无」） */
const i32Fill = (v: number): Int32Array => {
  const a = new Int32Array(INITIAL_CAPACITY).fill(v)
  FILL.set(a, v)
  return a
}

/** 同类型的新列：前段照抄，新增的槽位填初值 */
export function resizeColumn<T extends Column>(old: T, length: number): T {
  const next = new (old.constructor as new (length: number) => T)(length)
  next.set(length >= old.length ? old : old.subarray(0, length))
  const fill = FILL.get(old)
  if (fill !== undefined) {
    if (length > old.length) next.fill(fill, old.length)
    FILL.set(next, fill)
  }
  return next
}

/** 世界坐标、旋转（弧度）、显示尺寸（世界像素） */
export const Transform = {
  x: f32(),
  y: f32(),
  rot: f32(),
  w: f32(),
  h: f32(),
}

/** frame = atlas.index(id, outline) */
export const Sprite = {
  frame: i32(),
  flipX: u8(),
}

/** color 0xRRGGBB；effect 0 = 相乘，1 = 纯色填充；alpha 0..1 */
export const Tint = {
  color: u32(),
  effect: u8(),
  alpha: f32(),
}

/** z 大者后画 */
export const Depth = {
  z: f32(),
}

/** 可绘制的组件集，唯一声明：查询侧与构造侧都用它 */
export const RENDERABLE = [Transform, Sprite, Tint, Depth] as const

// ── 角色/移动 ──

export const Character = {}

/** slot 招募次序；post 队形岗位 */
export const Slot = { v: i32() }
export const Post = { v: i32() }

/** 环上避敌/迎敌秉性 */
export const OrbitBias = { v: f32() }

export const Follow = { x: f32(), y: f32(), vx: f32(), vy: f32(), k: f32() }

/** 视觉偏移，叠加在跟随点之上 */
export const VisOff = { x: f32(), y: f32() }

/** 相位种子 + 幅度 0..1 */
export const Wander = { seed: f32(), amp: f32() }

export const Breath = { phase: f32() }

/** until 结束时刻（0 = 无）；back 1 = Back.easeOut，0 = 线性 */
export const Pop = { until: f32(), ms: f32(), size: f32(), back: u8(), alpha: f32() }

export const Alive = { v: u8() }
export const Threat = { v: u8() }

export const CharPerk = { thorns: f32(), killHeal: f32(), regenPerSec: f32() }

/** until 到期时刻；mul 冷却倍率 */
export const CharAtkSlow = { until: f32(), mul: f32() }

export const CharHp = { hp: f32(), max: f32() }
export const Iframe = { ms: f32(), last: f32() }
export const Revive = { ms: f32(), at: f32() }
export const Hurt = { radius: f32() }
export const CharFlash = { until: f32() }

// ── 敌人 ──

export const Enemy = {}

export const Hp = { v: f32(), max: f32() }

/** 世界像素/秒 */
export const Speed = { v: f32() }

/** 0 wander / 1 chase / 2 windup / 3 dash / 4 cool */
export const EState = { v: u8() }

/** 精英/Boss 标记 */
export const Elite = { v: u8() }
export const Boss = { v: u8() }

/** 碰撞半径(世界像素) */
export const Radius = { v: f32() }

export const DmgMul = { v: f32() }

export const SpMul = { v: f32() }

/** 击退冲量，指数衰减；0 = 无 */
export const Kv = { x: f32(), y: f32() }

/** 本帧待提交的位移，尚未过世界约束；转向写、击退叠、提交系统落到 Transform */
export const Step = { x: f32(), y: f32() }

/** 本帧减速区移速乘区，1 = 未被减速 */
export const ZoneSlow = { v: f32() }

/** 受击白闪恢复时刻，0 = 无 */
export const Flash = { until: f32() }

export const EDir = { x: f32(), y: f32() }
export const ETurn = { at: f32() }

/** mul 0 = 冻结 */
export const Slow = { until: f32(), mul: f32() }

/** until 0 = 无毒；slot 伤害归属 */
export const Poison = { until: f32(), nextTick: f32(), dmg: f32(), tickMs: f32(), slot: i32() }

export const Charge = { windupUntil: f32(), dashUntil: f32(), coolUntil: f32(), nextDashAt: f32() }

/** 0 = 不移除 */
export const Despawn = { at: f32() }

/** until 0 = 未变形；cdUntil 期间免疫再变 */
export const Morph = { until: f32(), vuln: f32(), cdUntil: f32() }

/** base < 0 = 帧未烘好或无此 clip，保持 still 静态帧 */
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

/** 行为速度的平滑值，击退不入此列 */
export const Slide = { x: f32(), y: f32() }

/** 休眠：冻结 AI、不被索敌、不占刷怪上限；Boss 永不休眠 */
export const Dormant = { v: u8() }

/** 0 = 整张；1..4 = 左上/右上/左下/右下 */
export const Quad = { v: u8() }

// ── 装饰 ──

/** rad/s；走真实帧长，不吃时停 */
export const Spin = { rate: f32() }

/** u 沿流向进度；cross 跨向基线；漂出下游即回上游重进场 */
export const Drift = { u: f32(), cross: f32(), speedMul: f32(), swayPhase: f32(), swayAmp: f32() }

export const Shard = { vx: f32(), vy: f32(), startMs: f32(), until: f32(), rot: f32(), size: f32() }
export const SHARD_SET = [Shard, Transform, Sprite, Tint, Depth] as const

export const ENEMY_SET = [Enemy, Transform, Speed, Hp] as const

// ── 抛射物 ──

/** 敌我同用，阵营由 Faction 决定 */
export const Projectile = {}

/** 世界像素/秒 */
export const Vel = { x: f32(), y: f32() }

/** 自旋 rad/s；寿命回收时刻 0 = 不按寿命；敌弹来源槽位为 -1 */
export const Proj = {
  damage: f32(),
  radius: f32(),
  kb: f32(),
  srcSlot: i32(),
  pierce: i32(),
  spin: f32(),
  dieAt: f32(),
}

/** 本帧移动前的位置，扫掠命中的起点 */
export const PrevPos = { x: f32(), y: f32() }

/** 线段扫掠命中；不挂 = 圆-圆命中 */
export const SweptHit = {}

/** 撞墙即销毁；墙比最近命中点更近时本帧命中作废 */
export const WallStop = {}

/** 出视野一段即回收 */
export const ViewCull = {}

/** 出地图即回收 */
export const WorldCull = {}

export const PROJ_SET = [Projectile, Transform, Vel, Proj] as const

// ── 拾取物 ──

/** 到手效果由 Grant* 组件决定 */
export const Pickup = {}

/** 一次性事件组件：updatePickups 挂上，Grant 系统消费，reapCollected 回收 */
export const Collected = {}

export const GrantCoins = { n: f32() }

/** 哪一枚在 store.pickupDef */
export const GrantMod = {}

export const GrantFlash = { color: u32(), ms: f32() }

/** 爆点粒数；音效在 store.pickupSfx */
export const PickupFx = { burst: i32() }

/** px；0 = 不磁吸 */
export const Pull = { radius: f32() }

/** px；队伍中心进圈即到手 */
export const Grab = { radius: f32() }

/** elapsedMs；0 = 永不过期 */
export const Lifetime = { until: f32() }

// ── 一次性战斗特效 ──
// 时钟取 sim.fxMs（真实帧长），不吃时停

/** 出生时刻（fxMs）+ 时长；到期由 expireFx 回收 */
export const Fx = { bornMs: f32(), durMs: f32() }

/** stroke = -1 表示无描边 */
export const FxCircle = {
  r: f32(), from: f32(), to: f32(),
  fill: u32(), fillAlpha: f32(),
  stroke: i32Fill(-1), lineW: f32(), lineAlpha: f32(),
}

/** 沿 Transform.rot 铺长 len 的带 */
export const FxBeam = { len: f32(), radius: f32(), color: u32() }

/** 折点在投放时算死存进 store.boltPts；n = 折点数 */
export const FxBolt = { n: i32(), color: u32() }

export const FxSlash = { r: f32() }

/** size = 全尺寸（世界像素）；走 spriteBatch */
export const FxBoom = { size: f32() }

/** Due.at = 起划时刻；已砸过的实体在 store.meteorHit，同一实体只砸一次 */
export const Meteor = { sx: f32(), sy: f32(), ex: f32(), ey: f32(), t: f32() }

/** 哪一枚在 store.modDef；到期走 Lifetime；totalMs 供 HUD */
export const Modifier = { totalMs: f32() }

/** 到点开始（elapsedMs，世界时钟）；做什么由同一实体上的载荷组件决定 */
export const Due = { at: f32() }

/** 纯视觉；y0 = 落点，Transform.y = y0 + 偏移 */
export const Bob = { y0: f32(), amp: f32(), halfMs: f32() }

/** breathe 1 = 呼吸（born 定相位），0 = 静止且半径由持有系统写；dy 相对 Transform 的纵向偏移 */
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

export const PICKUP_SET = [Pickup, Transform, Vel] as const

export const RING_SET = [Ring, Transform, Tint] as const

// ── 区域 ──

/** 半径 px；效果只落在对面阵营；on 每帧由 updateZones 推导，消费方只读 */
export const Zone = { radius: f32(), faction: u8(), enterMs: f32(), on: u8() }

/** srcSlot 战报归属，敌方区 -1 */
export const ZoneBurn = { damage: f32(), tickMs: f32(), nextAt: f32(), srcSlot: i32() }

export const ZoneChill = { factor: f32() }

/** 不挂 = 静止在落点；跟随型的 Owner 指向造它的武器 */
export const ZoneFollow = { of: i32() }

export const ZONE_SET = [Zone, Transform] as const

/** 队员同时踩几个区也每 tickMs 至多掉一次血 */
export const GroundHit = { last: f32() }

// ── 能力组件 ──
// 一条能力归哪个施放系统管，只看它有没有对应 kind 的组件，与持有者无关

/** 出手位置来源；Owner 是归属与状态来源，二者可不同（弩塔） */
export const Anchor = { eid: i32() }

/** 视觉钟；castScan 出手成功时写入 */
export const Fired = { at: f32() }

/** 有此组件 = 有手持外形；位姿由各 kind 的摆位系统写 */
export const Held = {
  /** 静止时距施放锚点的距离 */
  restOffset: f32(),
  /** 朝向补偿（弧度） */
  rotOffset: f32(),
  /** 左/右手横向挂载：垂直于瞄准方向偏移 side × gap（0 = 不偏） */
  side: f32(),
  gap: f32(),
  /** 世界像素 */
  size: f32(),
}

export const Ability = {}

/** 一件武器一颗实体；召唤物带 Ability 但不是 Weapon */
export const Weapon = {}


/** 持有者实体（队员 / 敌人 / 队伍锚点） */
export const Owner = { eid: i32() }

/** 决定索敌落在哪一侧 */
export const FACTION = { team: 0, enemy: 1 } as const

export const Faction = { v: u8() }

/** 每种能力的参数组件各带一份冷却，不得共用：同一宿主可挂多条能力 */
const cd = (): CdComp => ({ cdLeft: f32(), cdBase: f32() })

/** cdLeft ≤ 0 即就绪；cdBase 0 = 无冷却概念 */
export interface CdComp {
  readonly cdLeft: Float32Array
  readonly cdBase: Float32Array
}

/** 装备时定死的乘区；battle 1 = 再吃队伍侧动态乘区，队长技能载荷为 0 */
export const Amp = { dmg: f32(), cd: f32(), crit: f32(), kb: f32(), battle: u8() }

/** 冷却也不推进 */
export const Frozen = { v: u8() }

/** 推进冷却但不出手 */
export const Disarmed = { v: u8() }

/** 1 = 索敌须视线可达 */
export const WallBlocked = { v: u8() }

/** 弧度，出手瞬间锁定；按 eid 只有一格，同一宿主两条瞄准能力会撞，attachAbility 断言拦下 */
export const Aim = { rad: f32() }

/** 视觉钟 */
export const Swing = { startMs: f32(), durMs: f32() }

/** 视觉子实体 eid；0 = 无 */

// ── 每种能力的参数组件 ──
// 一种能力 = 一个组件，既是归属标记也装全部参数；def 的可选子对象拆成可选组件；每个都以 cd() 开头

export const Laser = {
  ...cd(),
  damage: f32(),
  knockback: f32(),
  range: f32(),
  beamRadius: f32(),
  color: u32(),
}
export const LaserBackBeam = {}
export const LaserRadial = { beams: f32(), ratio: f32(), stepMs: f32() }

export const Heal = { ...cd(), amount: f32(), range: f32() }
export const HealAoe = { ratio: f32() }
export const HealDefib = { reviveCutMs: f32() }

export const SlowAura = { ...cd(), radius: f32(), slowFactor: f32(), color: u32() }
export const AuraDps = { perSec: f32() }
export const AuraFreeze = { intervalMs: f32(), durationMs: f32() }

export const Thrust = {
  ...cd(),
  damage: f32(),
  knockback: f32(),
  reach: f32(),
  hitRadius: f32(),
  thrustMs: f32(),
  lungeDist: f32(),
}
export const ThrustCombo = { delayMs: f32() }

export const Sweep = { ...cd(), damage: f32(), knockback: f32(), radius: f32(), arcDeg: f32(), sweepMs: f32() }

export const AreaBlast = {
  ...cd(),
  damage: f32(),
  knockback: f32(),
  detectRange: f32(),
  blastRadius: f32(),
  color: u32(),
}
export const BlastEcho = { delayMs: f32(), ratio: f32() }

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
export const BoomerangTwin = {}
export const CoinMagnet = { radius: f32() }

export const Assassinate = {
  ...cd(),
  damage: f32(),
  knockback: f32(),
  range: f32(),
  behindDist: f32(),
  strikeMs: f32(),
}
export const Execute = { hpRatio: f32(), mul: f32() }

export const Strike = {
  ...cd(),
  damage: f32(),
  knockback: f32(),
  targets: f32(),
  coinsPerHit: f32(),
  /** emoji 在 store.abilityArtEmoji */
  size: f32(),
  fromAbove: f32(),
  dropMs: f32(),
  staggerMs: f32(),
}

export const Rally = { ...cd(), healRatio: f32(), invulnMs: f32(), ringRadius: f32(), color: u32() }

export const Dance = { ...cd(), durationMs: f32() }

export const Buff = { ...cd(), damageMul: f32(), durationMs: f32() }

/** range 0 = 用 ACQUIRE 的缺省 */
export const Shoot = { ...cd(), damage: f32(), knockback: f32(), range: f32(), lifeMs: f32() }
/** 有此组件 = 不索敌，朝移动方向打 */
export const AimMove = {}
export const Bolt = { frame: i32(), size: f32(), radius: f32(), speed: f32(), rotOffset: f32() }
/** spreadDeg ≥ 360 为整圈 */
export const Volley = { count: f32(), spreadDeg: f32(), randomRotate: u8() }
export const EveryN = { n: f32(), count: f32(), spreadDeg: f32() }
export const Pierce = { n: f32() }

export const Summon = {
  ...cd(),
  count: f32(),
  damage: f32(),
  knockback: f32(),
  intervalMs: f32(),
  lifeMs: f32(),
  /** emoji 在 store.abilityArtEmoji */
  size: f32(),
  speed: f32(),
}

/** 超编拆最旧 */
export const Turret = {
  ...cd(),
  placeIntervalMs: f32(),
  maxTurrets: f32(),
  fireIntervalMs: f32(),
  damage: f32(),
  knockback: f32(),
  range: f32(),
  /** emoji 在 store.abilityArtEmoji */
  size: f32(),
}
export const Burst = { count: f32(), spreadDeg: f32() }

export const Nuke = { ...cd(), damage: f32(), bossRatio: f32() }

export const TimeStop = { ...cd(), durationMs: f32() }

/** 光环无冷却概念，不能借 Cooldown 当计时器 */
export const Pulse = { dps: f32(), freeze: f32() }

/** 0 = 还没建；随本武器一并回收 */
export const Aura = { zone: i32() }

/** left > 0 即在途，只在未冻结时推进；damage 为伤害快照 */
export const Followup = { left: f32(), damage: f32() }

/** 不参与自动开火扫描 */
export const Manual = {}

/** 一次性：施放系统消费后移除 */
export const CastRequest = {}

/** 队长实体：位置恒为队伍中心，无碰撞、不绘制；无本体能力以它为持有者 */
export const Captain = {}

/** 世界像素/秒，已含道具/卡牌乘区 */
export const MoveSpeed = { v: f32() }

/** px，已含 magnetMul */
export const Magnet = { radius: f32() }

// 限时全队效果一律存到期时刻，读方比较 now < until

/** 相位 + 本帧主力岗位（-1 = 无人主导） */
export const Orbit = { phase: f32(), driver: i32Fill(-1) }

/** 不叠加，直接覆写；until 之外恒 1 */
export const TeamDamage = { mul: f32(), until: f32() }

/** 含窗口内新登场者 */
export const DanceWindow = { until: f32() }

export const Blink = { x: f32(), y: f32() }

/** 落地才结算；Owner 指回能力实体；startMs 可在未来，期间不显形 */
export const Drop = { startMs: f32(), durMs: f32(), fromY: f32(), toY: f32(), target: i32() }

export const Shots = { n: i32() }

export const Radial = { left: i32(), nextAt: f32(), angle: f32() }

/** 出手时置 count，每接住一枚减一，归零才计冷却 */
export const Thrown = { n: i32() }

/** phase 0 = 去程，1 = 回程追持有者；of = 掷出它的武器；已命中集在 store.flyerHits */
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

/** bornMs 视觉钟；dieAt 世界钟，0 = 不按时限 */
export const Minion = { bornMs: f32(), dieAt: f32(), cd: f32(), phase: f32(), size: f32() }

/** 造它的武器；Owner 则是施放者本人 */
export const Built = { by: i32() }

/** until 视觉钟；期间不再行动 */
export const Retiring = { until: f32() }

export const Swarmer = {}

export const Emplacement = {}

// ── 敌人专属数值组件 ──
// 跨局不清理：spawnEnemy 无条件覆写

/** 本帧移动朝向 */
export const EnemyVel = { x: f32(), y: f32() }

/** armed 由 spawnEnemy 清零；fireDelayMs 首发延迟 */
export const EnemyArm = { armed: u8(), fireDelayMs: f32() }

export const EnemyPhase = { v: f32() }

/** of -1 = 无巢；nextSpawnAt 0 = 非 spawner */
export const Nest = { of: i32Fill(-1), nextSpawnAt: f32() }

// ── Due 的载荷 ──

/** def 与携带载荷在 store.telegraphDef / telegraphCarries */
export const Telegraph = { hp: f32(), elite: u8(), boss: u8(), bornMs: f32() }

/** 落点与出怪表到点才求 */
export const Surge = { hpMul: f32(), forceElite: u8() }

/** 载荷在 store.carrierPickup */
export const Carrier = {}

/** 有此组件 = 拆巢时暴走 */
export const Orphan = { speedMul: f32(), damageMul: f32() }

/** eaten 死亡时吐回 + 利息 */
export const Thief = { eaten: i32(), nextEatAt: f32() }

// ── 每种走位的参数组件 ──
// 一种走位 = 一个组件；def 的判别联合拆成各自的组件，翻译只在出生时发生一次

export const Chase = {}

export const Roam = {}

export const Stationary = {}

export const Flee = { range: f32() }

export const CoinThief = {}

export const Standoff = { detectRange: f32(), standoffDist: f32() }

export const Detonate = { triggerRange: f32(), windupMs: f32(), blastRadius: f32(), blastDamage: f32() }

export const BaseOrbit = { orbitRadius: f32(), aggroRange: f32() }

export const Dash = {
  windupMs: f32(),
  dashSpeed: f32(),
  /** 非冲刺期：1 追人 / 0 游荡 */
  idleChase: u8(),
  /** 瞄准：1 队伍中心 / 0 最近队员 */
  aimTeamCenter: u8(),
  /** 1 起跑瞬间锁向 / 0 进蓄力即锁 */
  lockAtLaunch: u8(),
  whoosh: u8(),
}
/** 出生即预约第一次 */
export const DashTimer = { intervalMs: f32() }
export const DashDetect = { range: f32(), cooldownMs: f32() }
export const DashTime = { durationMs: f32() }
/** 距离制，留原值 */
export const DashDist = { dist: f32() }

/** 仅冲刺态破墙 */
export const BreaksWalls = {}

// ── 转向的每帧派生量 ──

/** px/s；各走位系统写，applyEnemySteps 读；不含击退 */
export const BVel = { x: f32(), y: f32() }

/** 减速区 × 能力减速 × 体质 × 团队乘区 */
export const Slowed = { v: f32() }

/** 0 = 本帧由 updateEnemyGates 接管，各走位系统跳过 */
export const Steering = { v: u8() }
