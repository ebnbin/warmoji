import type { QueryTerm } from 'bitecs'
import { INITIAL_CAPACITY } from './world'

// 数组按 eid 索引，扩容时整体替换（见 storage.ts）：不得缓存数组引用，也不得写 `X.f[i] = 会建实体的调用()`
export type Column = Float32Array | Int32Array | Uint32Array | Uint8Array

const FILL = new WeakMap<Column, number>()

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
  const next = new (old.constructor as new (length: number) => T)(length)
  next.set(length >= old.length ? old : old.subarray(0, length))
  const fill = FILL.get(old)
  if (fill !== undefined) {
    if (length > old.length) next.fill(fill, old.length)
    FILL.set(next, fill)
  }
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

/** 画面位置 = Transform + VisOff；VisOff 只给渲染层用，任何判定都不看它 */
export const VisOff = { x: f32(), y: f32() }

export const RENDERABLE: QueryTerm[] = [Transform, Sprite, Tint, Depth, VisOff]

export const Character = {}

export const Slot = { v: i32() }

export const Breath = { phase: f32() }

export const Pop = { until: f32(), ms: f32(), size: f32(), back: u8(), alpha: f32() }

export const Alive = { v: u8() }

export const CharPerk = { thorns: f32(), killHeal: f32(), regenPerSec: f32() }

/** 攻击冷却的倍率状态，任何持有能力的身体都可以有 */
export const AtkSlow = { until: f32(), mul: f32() }

export const CharScale = { v: f32() }
export const Iframe = { ms: f32(), last: f32() }
export const Revive = { ms: f32(), at: f32() }
export const CharFlash = { until: f32() }

export const Enemy = {}

export const Hp = { v: f32(), max: f32() }

/** 受到伤害的倍率：嘲讽者的减伤、变形者的脆弱都是它 */
export const Guard = { mul: f32(), until: f32() }

export const Speed = { v: f32() }

export const EState = { v: u8() }

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

export const DmgMul = { v: f32() }

export const SpMul = { v: f32() }

export const Flash = { until: f32() }

export const EDir = { x: f32(), y: f32() }
export const ETurn = { at: f32() }

export const Slow = { until: f32(), mul: f32() }

export const Poison = { until: f32(), nextTick: f32(), dmg: f32(), tickMs: f32() }

export const Charge = { windupUntil: f32(), dashUntil: f32(), coolUntil: f32(), nextDashAt: f32() }

export const Despawn = { at: f32() }

/** anchored：变形前是否锚定，恢复时还回去 */
export const Morph = { until: f32(), cdUntil: f32(), anchored: u8() }

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

export const ENEMY_SET: QueryTerm[] = [Enemy, Transform, Speed, Hp]

export const Projectile = {}

export const Vel = { x: f32(), y: f32() }

export const Proj = {
  damage: f32(),
  radius: f32(),
  kb: f32(),
  srcSlot: i32(),
  pierce: i32(),
  spin: f32(),
  dieAt: f32(),
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

/** 场：每隔 tickMs 对场内敌方扣 damage 再施加效果，场内己方每秒回复 mend，pulse 非零时每次 tick 闪一圈 */
export const Zone = { radius: f32(), faction: u8(), enterMs: f32(), on: u8(), fadeAt: f32(), tickMs: f32(), nextAt: f32(), damage: f32(), mend: f32(), pulse: u32() }

export const ZoneFollow = { of: i32() }

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

export const Weapon = {}


export const Owner = { eid: i32() }

export const FACTION = { team: 0, enemy: 1, world: 2 } as const

export const Faction = { v: u8() }

const cd = (): CdComp => ({ cdLeft: f32(), cdBase: f32() })

export interface CdComp {
  readonly cdLeft: Float32Array
  readonly cdBase: Float32Array
}

export const Amp = { dmg: f32(), cd: f32(), crit: f32(), kb: f32(), battle: u8() }

export const Frozen = { v: u8() }

export const Disarmed = { v: u8() }

export const WallBlocked = { v: u8() }

export const Aim = { rad: f32() }

export const Swing = { startMs: f32(), durMs: f32() }

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
  size: f32(),
  fromAbove: f32(),
  dropMs: f32(),
  staggerMs: f32(),
}

export const Rally = { ...cd(), healRatio: f32(), invulnMs: f32(), ringRadius: f32(), color: u32() }

export const Dance = { ...cd(), durationMs: f32() }

export const Buff = { ...cd(), damageMul: f32(), durationMs: f32() }

export const Shoot = { ...cd(), damage: f32(), knockback: f32(), range: f32(), lifeMs: f32() }
export const AimMove = {}
export const Bolt = { frame: i32(), size: f32(), radius: f32(), speed: f32(), rotOffset: f32() }
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
  size: f32(),
  speed: f32(),
}

export const Turret = {
  ...cd(),
  placeIntervalMs: f32(),
  maxTurrets: f32(),
  fireIntervalMs: f32(),
  damage: f32(),
  knockback: f32(),
  range: f32(),
  lifeMs: f32(),
  size: f32(),
}
export const Burst = { count: f32(), spreadDeg: f32() }

export const Nuke = { ...cd(), damage: f32(), bossRatio: f32() }

export const TimeStop = { ...cd(), durationMs: f32() }

export const Rush = { ...cd(), distance: f32(), ms: f32(), damage: f32(), knockback: f32(), hitRadius: f32(), color: u32() }
export const Leap = { ...cd(), distance: f32(), ms: f32(), height: f32(), damage: f32(), knockback: f32(), radius: f32(), color: u32() }
export const Taunt = { ...cd(), radius: f32(), durationMs: f32(), damageTakenMul: f32(), color: u32() }
export const Stealth = { ...cd(), durationMs: f32() }
export const Field = { ...cd(), radius: f32(), durationMs: f32(), healPerSec: f32(), poisonDamage: f32(), poisonTickMs: f32(), color: u32() }
export const Deploy = { ...cd(), count: f32(), spread: f32(), lifeMs: f32() }
export const Nova = { ...cd(), radius: f32(), damage: f32(), knockback: f32(), color: u32() }

export const Aura = { zone: i32() }

export const Followup = { left: f32(), damage: f32() }

export const Manual = {}

export const CastRequest = {}

/** ghost：0 存活；1 阵亡且已预订目标位、正在归位；2 阵亡且已停靠 */
export const Seat = { v: i32Fill(-1), ghost: u8() }

/** 朝向 x/y 是滤波速度 vx/vy 的方向，跟随时的往复抖动被平均掉；换队长时目标位扇形按它生成 */
export const Facing = { x: f32(), y: f32(), vx: f32(), vy: f32() }

export const Magnet = { radius: f32() }

/** 全队增益不挂在队伍上，而是给每个角色各写一份 */
export const DmgBuff = { mul: f32(), until: f32() }

/** 蹦迪是每个敌人身上的状态，施法之后刷出来的敌人不受影响 */
export const Dancing = { until: f32() }

/** 冲刺中的身体：位移由 moveTeam 推进，撞击按 stamp 去重 */
export const Rushing = { active: u8(), msLeft: f32(), vx: f32(), vy: f32(), skill: i32(), stamp: f32() }

/** 敌人记下最近一次撞到自己的冲刺，同一次冲刺不重复吃伤害 */
export const RushHit = { stamp: f32() }

/** 跳跃中的身体：沿 from→to 的抛物线前进，落地那帧 landed 为 1 */
export const Leaping = { active: u8(), landed: u8(), msLeft: f32(), ms: f32(), fromX: f32(), fromY: f32(), toX: f32(), toY: f32(), skill: i32() }

/** 被嘲讽的敌人只追嘲讽者，直到到期或嘲讽者阵亡 */
export const Taunted = { until: f32(), by: i32() }

/** 隐匿中的角色不被敌人锁定；tinted 记着半透明是否已套上 */
export const Hidden = { until: f32(), tinted: u8() }

export const Blink = { x: f32(), y: f32() }

export const Drop = { startMs: f32(), durMs: f32(), fromY: f32(), toY: f32(), target: i32(), targetUid: u32() }

export const Shots = { n: i32() }

export const Radial = { left: i32(), nextAt: f32(), angle: f32() }

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

export const Minion = { bornMs: f32(), dieAt: f32(), cd: f32(), phase: f32(), size: f32() }

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

export const Orphan = { speedMul: f32(), damageMul: f32() }

export const Thief = { eaten: i32(), nextEatAt: f32() }

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
  idleChase: u8(),
  aimLeader: u8(),
  lockAtLaunch: u8(),
  whoosh: u8(),
}
export const DashTimer = { intervalMs: f32() }
export const DashDetect = { range: f32(), cooldownMs: f32() }
export const DashTime = { durationMs: f32() }
export const DashDist = { dist: f32() }

export const BreaksWalls = {}

export const Slowed = { v: f32() }

export const Steering = { v: u8() }
