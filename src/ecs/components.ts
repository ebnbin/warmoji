import type { QueryTerm } from 'bitecs'
import { INITIAL_CAPACITY } from './world'

// 数组按 eid 索引，扩容时整体替换（见 storage.ts）：不得缓存数组引用，也不得写 `X.f[i] = 会建实体的调用()`
export type Column = Float32Array | Int32Array | Uint32Array | Uint8Array

const FILL = new WeakMap<Column, number>()

/** 每个实体占几个连续元素的列，按 eid*stride+i 索引 */
const STRIDE = new WeakMap<Column, number>()

export function columnStride(col: Column): number {
  return STRIDE.get(col) ?? 1
}

export function columnFill(col: Column): number {
  return FILL.get(col) ?? 0
}

const f32 = (): Float32Array => new Float32Array(INITIAL_CAPACITY)
const i32 = (): Int32Array => new Int32Array(INITIAL_CAPACITY)
const u32 = (): Uint32Array => new Uint32Array(INITIAL_CAPACITY)
const u8 = (): Uint8Array => new Uint8Array(INITIAL_CAPACITY)
const i32Fill = (v: number): Int32Array => {
  const a = new Int32Array(INITIAL_CAPACITY).fill(v)
  FILL.set(a, v)
  return a
}

export function resizeColumn<T extends Column>(old: T, length: number): T {
  const stride = columnStride(old)
  const size = length * stride
  const next = new (old.constructor as new (length: number) => T)(size)
  next.set(size >= old.length ? old : old.subarray(0, size))
  const fill = FILL.get(old)
  if (fill !== undefined) {
    if (size > old.length) next.fill(fill, old.length)
    FILL.set(next, fill)
  }
  if (stride !== 1) STRIDE.set(next, stride)
  return next
}

/** 全局唯一、永不复用的实体编号，由 newEntity 写入；0 = 无。eid 会被立即复用，跨时刻认同一实体须比对它 */
export const Uid = {
  v: u32(),
}

export const Transform = {
  x: f32(),
  y: f32(),
  rot: f32(),
  w: f32(),
  h: f32(),
}

export const Sprite = {
  frame: i32(),
  flipX: u8(),
}

export const Tint = {
  color: u32(),
  effect: u8(),
  alpha: f32(),
}

export const Depth = {
  z: f32(),
}

/** 画面位置 = Transform + VisOff；能力从画面位置出手，命中判定只看 Transform */
export const VisOff = { x: f32(), y: f32() }

export const RENDERABLE: QueryTerm[] = [Transform, Sprite, Tint, Depth, VisOff]

export const Slot = { v: i32() }

export const Breath = { phase: f32() }

export const Pop = { until: f32(), ms: f32(), size: f32(), back: u8(), alpha: f32() }

export const Alive = { v: u8() }

export const CharScale = { v: f32() }
export const Revive = { ms: f32(), at: f32() }

export const MARK_SLOTS = 12

const strided = <T extends Column>(ctor: new (length: number) => T): T => {
  const col = new ctor(INITIAL_CAPACITY * MARK_SLOTS)
  STRIDE.set(col, MARK_SLOTS)
  return col
}

/** 标记的种类决定它折叠成哪个有效值：slow 取最小、speed/guard/dmg/cd 相乘、poison 按节拍扣血、regen/undead 按秒增减血、其余是有无；a/b/c/ref 按种类解释，见 utils/marks */
export const MARK = {
  none: 0,
  slow: 1,
  speed: 2,
  guard: 3,
  dmg: 4,
  cd: 5,
  poison: 6,
  stun: 7,
  hide: 8,
  taunt: 9,
  invuln: 10,
  morph: 11,
  morphImmune: 12,
  regen: 13,
  root: 14,
  silence: 15,
  disarm: 16,
  ground: 17,
  sleep: 18,
  fear: 19,
  charm: 20,
  berserk: 21,
  stasis: 22,
  untargetable: 23,
  unstoppable: 24,
  spellShield: 25,
  frontGuard: 26,
  reveal: 27,
  undying: 28,
  realm: 29,
  parry: 30,
  stealth: 31,
  stack: 32,
  fuse: 33,
  store: 34,
  empower: 35,
  deathMark: 36,
  mist: 37,
  devoured: 38,
  undead: 39,
  grow: 40,
} as const

/** 标记的来源：同种同源的标记刷新而不叠加 */
export const TAG = { effect: 0, morph: 1, elite: 2, perk: 3, form: 4 } as const

/** 身体上的标记列表：每个身体 MARK_SLOTS 个槽位；until 为 Infinity 时永久；a/b/c 按种类解释（倍率、跳伤、节拍、下次跳的时刻、嘲讽者、是否曾锚定）；ref 是所引用身体的 Uid */
export const Mark = {
  kind: strided(Uint8Array),
  tag: strided(Uint8Array),
  until: strided(Float32Array),
  a: strided(Float32Array),
  b: strided(Float32Array),
  c: strided(Float32Array),
  ref: strided(Uint32Array),
}
export const CharFlash = { until: f32() }

export const Enemy = {}

export const Hp = { v: f32(), max: f32() }

export const Elite = { v: u8() }
export const Boss = { v: u8() }

export const Radius = { v: f32() }

/** 身体：驱动与阻力同乘抓地（鞋 × 地面），阻力再乘介质黏度、按相对介质的速度算 */
export const Phys = { vx: f32(), vy: f32(), thrust: f32(), drag: f32(), mass: f32(), grip: f32() }

/** 驱动层每帧写入的期望速度，身体按抓地趋近它 */
export const Drive = { x: f32(), y: f32() }

/** 1 = 按真实时间积分（队伍身体），0 = 按世界时间（其余一切） */
export const Clock = { v: u8() }

/** 不吃冲量的身体 */
export const Anchored = {}

/** 无视墙体的身体 */
export const Phasing = {}

export const Flash = { until: f32() }

export const EDir = { x: f32(), y: f32() }
export const ETurn = { at: f32() }

export const Despawn = { at: f32() }

export const Anim = {
  base: i32(),
  frames: i32(),
  durMs: f32(),
  offset: f32(),
  onceBase: i32(),
  onceFrames: i32(),
  onceDur: f32(),
  onceAt: f32(),
  still: i32(),
}
export const ANIM_SET: QueryTerm[] = [Anim, Sprite]

export const Dormant = { v: u8(), since: f32() }

export const Quad = { v: u8() }

export const Spin = { rate: f32() }

export const Drift = { u: f32(), cross: f32(), speedMul: f32(), swayPhase: f32(), swayAmp: f32() }

export const Shard = { startMs: f32(), until: f32(), rot: f32(), size: f32() }
export const SHARD_SET: QueryTerm[] = [Shard, Transform, Sprite, Tint, Depth]

export const ENEMY_SET: QueryTerm[] = [Enemy, Transform, Phys, Hp]

export const Projectile = {}

export const Vel = { x: f32(), y: f32() }

export const Proj = {
  damage: f32(),
  radius: f32(),
  kb: f32(),
  pierce: i32(),
  spin: f32(),
  dieAt: f32(),
  rotOffset: f32(),
}

export const PrevPos = { x: f32(), y: f32() }

export const PROJ_SET: QueryTerm[] = [Projectile, Transform, Vel, Proj]

export const Pickup = { bornMs: f32() }

export const Collected = {}

export const GrantCoins = { n: f32() }

export const GrantMod = {}

export const GrantFlash = { color: u32(), ms: f32() }

export const PickupFx = { burst: i32() }

export const Pull = { on: u8() }

export const Grab = { radius: f32() }

export const Lifetime = { until: f32() }

export const Fx = { bornMs: f32(), durMs: f32() }

export const FxCircle = {
  r: f32(), from: f32(), to: f32(),
  fill: u32(), fillAlpha: f32(),
  stroke: i32Fill(-1), lineW: f32(), lineAlpha: f32(),
}

export const FxBeam = { len: f32(), radius: f32(), color: u32() }

export const FxBolt = { n: i32(), color: u32() }

export const FxSlash = { r: f32() }

export const FxBoom = { size: f32() }

export const Meteor = { sx: f32(), sy: f32(), ex: f32(), ey: f32(), t: f32() }

export const Modifier = { totalMs: f32() }

export const Due = { at: f32() }

export const Bob = { amp: f32(), halfMs: f32(), born: f32() }

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

export const PICKUP_SET: QueryTerm[] = [Pickup, Transform, Phys]

export const RING_SET: QueryTerm[] = [Ring, Transform, Tint]

/** 场：每隔 tickMs 对场内敌方扣 damage 再施加效果，场内己方每秒回复 mend，pulse 非零时每次 tick 闪一圈；who、pull、traction、mist、trap 见 ZoneRules */
export const Zone = { radius: f32(), enterMs: f32(), on: u8(), fadeAt: f32(), tickMs: f32(), nextAt: f32(), damage: f32(), mend: f32(), pulse: u32(), who: u8(), pull: f32(), traction: f32(), mist: u8(), trap: u8() }

export const ZONE_WHO = { foes: 0, allies: 1, all: 2 } as const

/** 传送门：另一扇门与它的编号、同一个身体再传的间隔 */
export const Portal = { other: i32(), otherUid: u32(), cdMs: f32() }

/** 身体下次能被传送门传的时刻 */
export const PortCd = { until: f32() }

/** 墙：shape 0 是一段（a 到 b），1 是一圈（圆心 c、半径 r）；bodies 0 不挡、1 挡敌方、2 都挡；shots 挡敌方弹体；reflect 反弹；跟着 of 走；到 until 消失 */
export const Barrier = {
  shape: u8(),
  ax: f32(),
  ay: f32(),
  bx: f32(),
  by: f32(),
  cx: f32(),
  cy: f32(),
  r: f32(),
  thick: f32(),
  until: f32(),
  bodies: u8(),
  shots: u8(),
  reflect: u8(),
  of: i32(),
  ofUid: u32(),
  color: u32(),
}

/** 牵绳：两端与编号、到期时刻、断开距离、颜色 */
export const Tether = { a: i32(), aUid: u32(), b: i32(), bUid: u32(), until: f32(), range: f32(), color: u32() }

/** 画一条连到另一个身体的线：依存无敌的护卫连着被护的身体 */
export const Link = { to: i32(), toUid: u32(), color: u32() }

/** 追踪弹：每秒最多转多少弧度 */
export const Homing = { turn: f32() }

/** 落地的弹体：躺到 until；召回中 back 为 1，飞向 to */
export const Linger = { ms: f32(), until: f32(), back: u8(), to: i32(), toUid: u32(), speed: f32() }

export const ZoneFollow = { of: i32() }

/** 身体最近一次吃到场的节拍伤的时刻，一个节拍内不重复扣血 */
export const ZoneHit = { last: f32() }

export const ZONE_SET: QueryTerm[] = [Zone, Transform]

export const Anchor = { eid: i32() }

export const Fired = { v: u8() }

export const Held = {
  restOffset: f32(),
  rotOffset: f32(),
  side: f32(),
  gap: f32(),
  size: f32(),
}

export const Ability = {}

export const Owner = { eid: i32() }

export const FACTION = { team: 0, enemy: 1, world: 2 } as const

export const Faction = { v: u8() }

/** 冷却：left 递减到 0 才能出手，base 是每次出手后重置的值 */
export const Cd = { left: f32(), base: f32() }

export const Amp = { dmg: f32(), cd: f32(), crit: f32(), kb: f32(), battle: u8() }

export const Frozen = { v: u8() }

export const Disarmed = { v: u8() }

export const WallBlocked = { v: u8() }

export const AIM = { nearest: 0, strongest: 1, move: 2, leader: 3, self: 4, stick: 5 } as const

/** 瞄准：kind 决定方向从哪来，range 是索敌距离，rad 是最近一次出手的方向 */
export const Aim = { rad: f32(), kind: u8(), range: f32() }

/** 载荷：伤害、击退、Boss 承伤比、是否按波次强度缩放、施法特效的颜色与半径 */
export const Payload = { damage: f32(), knockback: f32(), bossRatio: f32(), waveScale: u8(), color: u32(), fxRadius: f32() }

export const REAIM = { same: 0, nearest: 1, random: 2 } as const

/** 重复出手；delayMs 为 0 时一次出手即打完，否则由 RepeatState 逐发推进 */
export const Repeat = { count: f32(), spreadDeg: f32(), delayMs: f32(), ratio: f32(), everyN: f32(), reaim: u8() }

export const RepeatState = { left: i32(), nextAt: f32(), angle: f32(), damage: f32() }

export const Shots = { n: i32() }

export const Swing = { startMs: f32(), durMs: f32() }

export const Bolt = { frame: i32(), size: f32(), radius: f32(), speed: f32(), rotOffset: f32(), lifeMs: f32(), pierce: i32(), homingDeg: f32(), linger: f32() }

export const Segment = { reach: f32(), radius: f32(), ms: f32(), lunge: f32(), beam: u8() }

export const Sector = { radius: f32(), arcDeg: f32(), ms: f32() }

export const DISC_AT = { self: 0, target: 1 } as const
export const DISC_OF = { foes: 0, hurt: 1 } as const
export const Disc = { radius: f32(), at: u8(), of: u8() }

export const Chain = { hops: f32(), hopRange: f32(), decay: f32() }

export const FlyerShape = { range: f32(), outMs: f32(), returnSpeed: f32(), radius: f32(), spinDegPerSec: f32(), coinMagnet: f32() }

export const DropShape = { targets: f32(), size: f32(), fromAbove: f32(), dropMs: f32(), staggerMs: f32() }

export const BlinkShape = { behindDist: f32(), strikeMs: f32(), execHp: f32(), execMul: f32() }

export const SprintShape = { distance: f32(), ms: f32(), radius: f32(), seek: u8() }

export const LeapShape = { distance: f32(), ms: f32(), height: f32(), radius: f32() }

export const ALL_OF = { foes: 0, allies: 1 } as const
export const AllShape = { of: u8(), downed: u8() }

export const ZoneShape = { radius: f32(), durationMs: f32(), tickMs: f32(), mend: f32(), follow: u8(), pulseMs: f32(), enterMs: f32(), fillAlpha: f32(), lineAlpha: f32(), lineWidth: f32(), color: u32() }

export const SummonShape = { count: f32(), size: f32(), speed: f32(), lifeMs: f32(), orbitRadius: f32(), orbitSpin: f32() }

export const EmplaceShape = { count: f32(), spread: f32(), maxAlive: f32(), lifeMs: f32(), size: f32() }

export const WorldShape = {}

export const Aura = { zone: i32() }

/** 瞬袭：身体已闪到目标背后，until 到点闪回 x/y；back 为 0 则不回 */
export const BlinkState = { until: f32(), x: f32(), y: f32(), back: u8() }

export const Manual = {}

/** 能力的类别：1 是技能（沉默挡它），0 是普通出手（缴械挡它、强化下一击加在它上） */
export const AbilityClass = { skill: u8() }

/** 充能：攒着的次数与上限，冷却按次恢复 */
export const Charges = { n: f32(), max: f32() }

/** 连段：next 是下一段的能力、window 是出手后给下一段留的窗口，open 是这一段可接的截止时刻，root 是第一段；只有第一段的 root 为 0 */
export const Stage = { next: i32(), window: f32(), open: f32(), root: i32() }

/** 弹匣：剩几发、容量、换弹时长、换好的时刻 */
export const Ammo = { n: f32(), max: f32(), reloadMs: f32(), readyAt: f32() }

/** 轮流出手：同组里只有 active 的那一式能出手，打完把出手权交给 next */
export const Turn = { active: u8(), next: i32() }

/** 按住蓄力：按满的时长、满蓄时的距离与伤害倍率，ratio 是这一次蓄了几成 */
export const Hold = { maxMs: f32(), reachMul: f32(), damageMul: f32(), ratio: f32() }

/** 资源的消耗：出手扣 cost、得 gain，以血施法扣 hp */
export const Spend = { cost: f32(), gain: f32(), hp: f32() }

/** 身体的资源：当前值、上限、锁到何时、最近一次增长的时刻 */
export const Res = { v: f32(), max: f32(), lock: f32(), lastGain: f32() }

/** 本条命里用过的一次性规则：致命一击、残血 */
export const Lethal = { used: u8(), low: u8() }

/** 体型：永久倍率、形态倍率与合起来的当前倍率；r0 是本来的判定半径，s0 是本来的画面尺寸 */
export const Grow = { perm: f32(), form: f32(), v: f32(), r0: f32(), s0: f32() }

export const HISTORY = 40
export const HISTORY_MS = 100

const stridedBy = <T extends Column>(ctor: new (length: number) => T, n: number): T => {
  const col = new ctor(INITIAL_CAPACITY * n)
  STRIDE.set(col, n)
  return col
}

/** 位置与生命的历史：每 HISTORY_MS 记一格，环形，i 是下一格，n 是已记的格数，at 是下次记的时刻 */
export const History = { x: stridedBy(Float32Array, HISTORY), y: stridedBy(Float32Array, HISTORY), hp: stridedBy(Float32Array, HISTORY), i: i32(), n: i32(), at: f32() }

/** 借来的能力：到时撤掉；from 是被夺走的那条能力与它的编号，夺取者死了就还回去 */
export const Borrowed = { until: f32(), from: i32(), fromUid: u32() }

/** 肚子里装着的身体：victim 与编号、这期间挨了多少、挨够多少吐出、最多装到何时、每秒消化、吐出距离、下次消化的时刻 */
export const Gut = { victim: i32(), uid: u32(), hurt: f32(), limit: f32(), until: f32(), dps: f32(), spit: f32(), nextAt: f32() }

/** 影子：主人与编号、消失的时刻 */
export const Shadow = { of: i32(), ofUid: u32(), until: f32() }

export const PET = { orbit: 0, trail: 1, ally: 2 } as const

/** 施法锚点物件：所属的能力、宿主、跟随方式、距离与转角 */
export const Pet = { of: i32(), host: i32(), mode: u8(), dist: f32(), phase: f32() }

/** 闲着的计时：最近一次出手或移动的时刻、这一轮是否已触发 */
export const Idle = { since: f32(), done: u8() }

/** 延时成长：到这个时刻长成 */
export const GrowUp = { at: f32() }

/** 形态：当前第几个（-1 是本体）、到何时切回（0 不切回） */
export const Form = { idx: i32Fill(-1), until: f32() }

/** 坐骑：剩余与总生命、扣光后切到的形态 */
export const Mount = { hp: f32(), max: f32(), form: i32() }

/** 能力镜像：影子照着出手 */
export const Mirror = {}

export const CastRequest = {}

/** ghost：0 存活；1 阵亡且已预订目标位、正在归位；2 阵亡且已停靠 */
export const Seat = { v: i32Fill(-1), ghost: u8() }

/** 朝向 x/y 是滤波速度 vx/vy 的方向，跟随时的往复抖动被平均掉；换队长时目标位扇形按它生成 */
export const Facing = { x: f32(), y: f32(), vx: f32(), vy: f32() }

export const Magnet = { radius: f32() }

export const MOTION = { none: 0, dash: 1, arc: 2, follow: 3 } as const

/** 脚本位移：冲刺按速度走（seek 为 1 时追着 ref 转向、碰到就停），弧线沿 f→t 腾空飞，跟随贴着 ref 偏移 t；self 为 1 是自己的动作，skill 是带来这段位移的能力，landed 在落地那帧为 1 */
export const Motion = {
  kind: u8(),
  self: u8(),
  landed: u8(),
  t: f32(),
  ms: f32(),
  fx: f32(),
  fy: f32(),
  tx: f32(),
  ty: f32(),
  vx: f32(),
  vy: f32(),
  h: f32(),
  skill: i32(),
  stamp: f32(),
  ref: i32(),
  refUid: u32(),
  seek: u8(),
}

/** 身体最近一次被哪段冲刺撞过，同一段冲刺不重复吃伤害 */
export const MotionHit = { stamp: f32() }

export const Drop = { startMs: f32(), durMs: f32(), fromY: f32(), toY: f32(), target: i32(), targetUid: u32() }

export const Thrown = { n: i32() }

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

/** ability：装置自己那条能力的实体，0 = 没有 */
export const Minion = { bornMs: f32(), dieAt: f32(), size: f32(), ability: i32() }

export const Built = { by: i32() }

export const Retiring = { until: f32() }

export const Swarmer = {}

export const Emplacement = {}

export const EnemyArm = { armed: u8(), fireDelayMs: f32() }

export const EnemyPhase = { v: f32() }

export const Nest = { of: i32Fill(-1), nextSpawnAt: f32() }

export const Telegraph = { hp: f32(), elite: u8(), boss: u8(), bornMs: f32() }

export const Surge = { hpMul: f32(), forceElite: u8() }

export const Carrier = {}

export const Thief = { eaten: i32(), nextEatAt: f32() }

/** 追击：leader 为 1 时盯着队长而不是最近的敌人 */
export const Chase = { leader: u8() }

export const Wander = {}

export const Flee = { range: f32() }

export const CoinThief = {}

export const Standoff = { detectRange: f32(), standoffDist: f32() }

/** 环绕 Nest 里的身体：spin 为 0 时全速绕行；aggro 为 0 时看见目标就扑，否则目标须在锚点 aggro 内；seek 是自己的索敌距离；fresh 优先扑还没中毒的 */
export const Orbit = { radius: f32(), spin: f32(), aggro: f32(), seek: f32(), fresh: u8() }

/** 接触载荷：碰到敌方身体就打一下；vanish 的身体打中即消散 */
export const Contact = { damage: f32(), knockback: f32(), vanish: u8() }

export const TELEGRAPH = { shake: 0, blink: 1 } as const

/** 蓄力中的身体：until 之前不走，telegraph 是身上的预兆 */
export const Casting = { until: f32(), telegraph: u8() }

export const LOCK_AT = { start: 0, end: 1 } as const

/** 蓄力：出手前停 ms 毫秒，方向在蓄力开始或结束时锁定 */
export const Windup = { ms: f32(), lockAt: u8(), telegraph: u8() }

export const WindupState = { until: f32(), angle: f32() }

/** 飞在空中的身体：不受地面与介质影响 */
export const Airborne = {}

export const BreaksWalls = {}

/** 这一帧的速度倍率：减速状态 × 固有倍率 × 战场效果，每个会走的身体一份 */
export const SpeedMul = { v: f32() }

/** 这一帧身体能做什么：move 自己走、act 普通出手、cast 施放技能、dash 自己位移；forced 非零时被迫朝 f 点走（1 逃离、2 靠近） */
export const Ctl = { move: u8(), act: u8(), cast: u8(), dash: u8(), forced: u8(), fx: f32(), fy: f32() }
