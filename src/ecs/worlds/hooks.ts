import { UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { TEAM, MEMBER } from '../../data/characters'
import { SPAWN } from '../../data/enemies'
import { randomMapPoint } from '../utils/spawn'
import { MAPS } from '../../data/maps'
import type { IceConfig, InfiniteConfig, MapDef, MapId, RiverConfig, ShrinkRingConfig, SpaceConfig } from '../../types/maps'
import { approach, onFloe } from '../worlds/ice'
import { outsideZone, ringPoint, zoneRadiusAt } from '../worlds/infinite'
import { clampToDisc, confineVelocity, meteorSweep } from '../worlds/space'
import { clampToRiver, flowVector, pastDownstream, riverRect } from '../worlds/river'
import { ghostImages, torusDelta, torusDist2, wrapPoint } from '../worlds/torus'
import type { RiverRect } from '../worlds/river'
import { isHorizontal } from '../utils/remap'
import { PICKUPS } from '../../data/pickups'
import { query, removeEntity } from 'bitecs'
import { Alive, Boss, Dormant, Due, ENEMY_SET, Meteor, Radius, Slide, Tint, Transform, Uid } from '../components'
import { enemyDef, meteorHit } from '../store'
import { spawnMeteor } from '../entities/meteor'
import { FlowField } from '../worlds/ruins'
import type { WallGrid } from '../worlds/ruins'
import { applyDamage, hurtCharacter } from '../systems/shared/combat'
import type { Sim } from '../sim'
import type { Point } from '../../util/vec'
import { fleeSteer } from '../systems/shared/steer'
import { centerX, centerY, teamCenter } from '../utils/team'

// 各图与有界森林不同的行为，按 mapId 取一份；默认实现即森林语义。只收行为钩子，视觉在 views.ts

const ZERO: Point = { x: 0, y: 0 }
const NO_GHOSTS: Point[] = []

// ── 钩子自己的状态 ──

export interface Walls {
  grid: WallGrid
  flow?: FlowField
  /** 上次重算流场时的队伍格与累计时长 */
  flowCellX: number
  flowCellY: number
  reflowAcc: number
  /** 从中心可达的通行格，刷怪只落在这些格 */
  spawnCells: number[]
  /** 场景侧排空 */
  smashed: number[]
}

/** 每张图只用得上其中一两项，其余保持初值 */
export interface WorldState {
  /** 下次周期结算时刻，仅 tick 自管 */
  tickAt: number
  /** 世界像素/秒；非动量世界恒 0 */
  vx: number
  vy: number
  /** 世界像素；未开圈为 null */
  zone: { x: number; y: number; r: number } | null
  /** 非断壁图为 null */
  walls: Walls | null
}

export function newWorldState(): WorldState {
  return { tickAt: 0, vx: 0, vy: 0, zone: null, walls: null }
}

export interface WorldHooks {
  /** 坐标按地图尺寸回绕 */
  readonly torus: boolean
  /** 世界差向量：环面取最短差；默认直减 */
  worldDelta(sim: Sim, fromX: number, fromY: number, toX: number, toY: number): Point
  /** 索敌镜像坐标；默认无 */
  ghosts(sim: Sim, x: number, y: number): Point[]
  /** 坐标回绕；默认原样 */
  wrap(sim: Sim, x: number, y: number): Point
  /** 玩家子弹的地图寿命上限（ms），与子弹自身寿命取小；0 = 不设，另按视野回收 */
  projectileLifeMs(sim: Sim): number
  /** 队伍的世界漂移，加在本帧输入位移之上，再过 constrainTeam；默认无 */
  teamDrift(sim: Sim, delta: number): Point
  /** next = 本帧想走到的位置；返回实际落点 */
  constrainTeam(sim: Sim, next: Point, delta: number): Point
  /** 敌人落点约束；无界世界原样放行 */
  constrainEnemy(sim: Sim, eid: number, x: number, y: number): Point
  /** 出生帧的落点约束，残垣图不做贴墙滑动 */
  constrainSpawn(sim: Sim, x: number, y: number, radius: number): Point
  /** 追击方向；残垣图走流场绕墙 */
  chaseDir(sim: Sim, eid: number, tx: number, ty: number): Point
  /** 线段 a→b 的首个撞墙点；无墙图恒 null */
  wallHit(sim: Sim, ax: number, ay: number, bx: number, by: number): Point | null
  /** 无墙图空转 */
  smashWall(sim: Sim, x: number, y: number): void
  /** 游荡方向修正；无界世界原样放行 */
  wanderDir(sim: Sim, eid: number, dx: number, dy: number): Point
  /** 逃跑方向修正；无界世界原样放行 */
  fleeDir(sim: Sim, eid: number, awayX: number, awayY: number): Point
  /** 敌人行为速度的后处理，不含击退分量；默认原样 */
  postSteerEnemy(sim: Sim, eid: number, vx: number, vy: number, delta: number): { vx: number; vy: number }
  /** 本帧总位移的世界禁锢，含击退；默认原样 */
  confineEnemyStep(sim: Sim, eid: number, dx: number, dy: number): Point
  /** 击退衰减时间常数倍率 */
  knockbackTauMul(sim: Sim): number
  /** 金币落点约束 */
  constrainCoin(sim: Sim, x: number, y: number): Point
  /** 不在磁吸范围时的金币速度；默认静止 */
  coinIdleVelocity(sim: Sim): Point
  /** 金币的额外回收条件；默认不回收 */
  cullCoin(sim: Sim, x: number, y: number): boolean
  /** 死亡碎片飞散落点；默认原样 */
  constrainShard(sim: Sim, x: number, y: number): Point
  /** 敌弹的额外回收条件 */
  cullEnemyProjectile(sim: Sim, x: number, y: number): boolean
  /** 刷怪落点 */
  spawnPoint(sim: Sim, boss: boolean): Point
  /** 休眠活跃方形的半边长（世界像素）；Infinity = 不休眠 */
  activeHalf(sim: Sim): number
  /** 开局，队伍已就位；默认无 */
  onStart(sim: Sim): void
  /** 终波开场；默认无 */
  onFinalWave(sim: Sim): void
  /** 世界逐帧结算；默认无 */
  tick(sim: Sim, delta: number): void
}

/** 有界世界基线 */
const bounded: WorldHooks = {
  torus: false,
  worldDelta(_sim, fromX, fromY, toX, toY) {
    return { x: toX - fromX, y: toY - fromY }
  },
  ghosts() {
    return NO_GHOSTS
  },
  wrap(_sim, x, y) {
    return { x, y }
  },
  projectileLifeMs() {
    return 0
  },
  teamDrift() {
    return ZERO
  },
  constrainTeam(sim, next) {
    // 整环都留在图内
    const clampMin = (TEAM.ringRadius + MEMBER.radius) * UNIT
    return {
      x: Math.min(Math.max(next.x, clampMin), sim.mapW - clampMin),
      y: Math.min(Math.max(next.y, clampMin), sim.mapH - clampMin),
    }
  },
  constrainEnemy(sim, _eid, x, y) {
    return {
      x: x < 0 ? 0 : x > sim.mapW ? sim.mapW : x,
      y: y < 0 ? 0 : y > sim.mapH ? sim.mapH : y,
    }
  },
  constrainSpawn(sim, x, y) {
    return {
      x: x < 0 ? 0 : x > sim.mapW ? sim.mapW : x,
      y: y < 0 ? 0 : y > sim.mapH ? sim.mapH : y,
    }
  },
  chaseDir(_sim, eid, tx, ty) {
    return norm(tx - Transform.x[eid]!, ty - Transform.y[eid]!)
  },
  wallHit() {
    return null
  },
  smashWall() {},
  wanderDir(sim, eid, dx, dy) {
    const margin = 0.6 * UNIT
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    return {
      x: (x < margin && dx < 0) || (x > sim.mapW - margin && dx > 0) ? -dx : dx,
      y: (y < margin && dy < 0) || (y > sim.mapH - margin && dy > 0) ? -dy : dy,
    }
  },
  fleeDir(sim, eid, awayX, awayY) {
    return fleeSteer(Transform.x[eid]!, Transform.y[eid]!, awayX, awayY, sim.mapW, sim.mapH, 1.5 * UNIT)
  },
  postSteerEnemy(_sim, _eid, vx, vy) {
    return { vx, vy }
  },
  confineEnemyStep(_sim, _eid, dx, dy) {
    return { x: dx, y: dy }
  },
  knockbackTauMul() {
    return 1
  },
  constrainCoin(sim, x, y) {
    const r = PICKUPS.coin.radius * UNIT // 整枚币都留在图内
    return {
      x: Math.min(Math.max(x, r), sim.mapW - r),
      y: Math.min(Math.max(y, r), sim.mapH - r),
    }
  },
  coinIdleVelocity() {
    return ZERO
  },
  cullCoin() {
    return false
  },
  constrainShard(sim, x, y) {
    return {
      x: x < 0 ? 0 : x > sim.mapW ? sim.mapW : x,
      y: y < 0 ? 0 : y > sim.mapH ? sim.mapH : y,
    }
  },
  cullEnemyProjectile(sim, x, y) {
    return x < -UNIT || x > sim.mapW + UNIT || y < -UNIT || y > sim.mapH + UNIT
  },
  spawnPoint(sim, boss) {
    return randomMapPoint(
      sim.rng,
      sim.mapW,
      sim.mapH,
      (boss ? 2 : SPAWN.edgeInset) * UNIT,
      teamCenter(sim),
      SPAWN.minPlayerDist * UNIT * (boss ? 1.6 : 1),
    )
  },
  activeHalf() {
    return Infinity
  },
  onStart() {},
  onFinalWave() {},
  tick() {},
}

// ── 浮冰 ──

function iceCfg(sim: Sim): IceConfig {
  return MAPS[sim.mapId].ice!
}

/** 地图即那块浮冰 */
function floePx(sim: Sim): number {
  return iceCfg(sim).floeU * UNIT
}

/** 行为速度走低通；击退不进低通但衰减更慢；不钳制，可滑出浮冰落水 */
const ice: WorldHooks = {
  ...bounded,
  constrainTeam(sim, next, delta) {
    const cfg = iceCfg(sim)
    const dt = delta / 1000
    if (dt <= 0) return { x: centerX(sim), y: centerY(sim) }
    const desVx = (next.x - centerX(sim)) / dt
    const desVy = (next.y - centerY(sim)) / dt
    const on = onFloe(centerX(sim), centerY(sim), floePx(sim))
    const tau = on ? cfg.teamTauIce : cfg.teamTauWater
    const mul = on ? 1 : cfg.waterSpeedMul
    sim.worldState.vx = approach(sim.worldState.vx, desVx * mul, dt, tau)
    sim.worldState.vy = approach(sim.worldState.vy, desVy * mul, dt, tau)
    return { x: centerX(sim) + sim.worldState.vx * dt, y: centerY(sim) + sim.worldState.vy * dt }
  },
  // 不钳制，冰缘不是墙
  constrainEnemy(_sim, _eid, x, y) {
    return { x, y }
  },
  constrainSpawn(_sim, x, y) {
    return { x, y }
  },
  wanderDir(_sim, _eid, dx, dy) {
    return { x: dx, y: dy }
  },
  constrainShard(_sim, x, y) {
    return { x, y }
  },
  fleeDir(_sim, _eid, awayX, awayY) {
    return { x: awayX, y: awayY }
  },
  postSteerEnemy(sim, eid, vx, vy, delta) {
    const cfg = iceCfg(sim)
    const dt = delta / 1000
    if (dt <= 0) return { vx, vy }
    const on = onFloe(Transform.x[eid]!, Transform.y[eid]!, floePx(sim))
    const tau = on ? cfg.enemyTauIce : cfg.teamTauWater
    const mul = on ? 1 : cfg.waterSpeedMul
    const sx = approach(Slide.x[eid]!, vx * mul, dt, tau)
    const sy = approach(Slide.y[eid]!, vy * mul, dt, tau)
    Slide.x[eid] = sx
    Slide.y[eid] = sy
    return { vx: sx, vy: sy }
  },
  knockbackTauMul(sim) {
    return iceCfg(sim).knockbackTauMul
  },
  constrainCoin(sim, x, y) {
    const r = PICKUPS.coin.radius * UNIT
    const max = floePx(sim) - r
    return { x: Math.min(Math.max(x, r), max), y: Math.min(Math.max(y, r), max) }
  },
  cullEnemyProjectile(sim, x, y) {
    const m = 6 * UNIT
    const px = floePx(sim)
    return x < -m || x > px + m || y < -m || y > px + m
  },
  onStart(sim) {
    sim.worldState.tickAt = iceCfg(sim).waterTickMs
  },
  /** 落水掉血，敌我通吃 */
  tick(sim) {
    const cfg = iceCfg(sim)
    if (sim.elapsedMs < sim.worldState.tickAt) return
    sim.worldState.tickAt = sim.elapsedMs + cfg.waterTickMs
    const px = floePx(sim)
    const frac = cfg.waterTickMs / 1000
    if (!onFloe(centerX(sim), centerY(sim), px)) {
      const dmg = Math.round(cfg.waterTeamDps * frac)
      for (const m of sim.characters) if (Alive.v[m]) hurtCharacter(sim, m, dmg, '寒水', 0x4fc3f7)
    }
    const edmg = Math.round(cfg.waterEnemyDps * frac)
    // 跳伤可能击杀，须先快照
    for (const eid of [...query(sim.world, ENEMY_SET as unknown as object[])]) {
      if (!onFloe(Transform.x[eid]!, Transform.y[eid]!, px)) applyDamage(sim, eid, edmg)
    }
  },
}

// ── 残垣 ──

/** 有界 + 断壁：挡移动/子弹/视线；刷怪只落在从中心可达的格 */
const ruins: WorldHooks = {
  ...bounded,
  constrainTeam(sim, next, delta) {
    const box = bounded.constrainTeam(sim, next, delta)
    const w = sim.worldState.walls
    return w ? w.grid.resolveMove(centerX(sim), centerY(sim), box.x, box.y) : box
  },
  constrainEnemy(sim, eid, x, y) {
    const box = bounded.constrainEnemy(sim, eid, x, y)
    const w = sim.worldState.walls
    // 穿墙与破墙的不吃墙碰撞
    const def = enemyDef[eid]
    if (!w || def?.phasesWalls || def?.breaksWalls) return box
    return w.grid.resolveMove(Transform.x[eid]!, Transform.y[eid]!, box.x, box.y)
  },
  /** 不可达时回退直线 */
  chaseDir(sim, eid, tx, ty) {
    const w = sim.worldState.walls
    if (!w || enemyDef[eid]?.phasesWalls) return bounded.chaseDir(sim, eid, tx, ty)
    const dir = w.flow?.sampleDir(Transform.x[eid]!, Transform.y[eid]!)
    if (dir && (dir.x !== 0 || dir.y !== 0)) return dir
    return bounded.chaseDir(sim, eid, tx, ty)
  },
  wanderDir(sim, eid, dx, dy) {
    const d = bounded.wanderDir(sim, eid, dx, dy)
    const w = sim.worldState.walls
    if (!w) return d
    const ahead = 0.8 * UNIT
    if (w.grid.pointBlocked(Transform.x[eid]! + d.x * ahead, Transform.y[eid]! + d.y * ahead)) {
      return { x: -d.x, y: -d.y }
    }
    return d
  },
  wallHit(sim, ax, ay, bx, by) {
    return sim.worldState.walls?.grid.segmentHit(ax, ay, bx, by) ?? null
  },
  smashWall(sim, x, y) {
    const w = sim.worldState.walls
    if (!w) return
    const cx = w.grid.cellX(x)
    const cy = w.grid.cellY(y)
    if (!w.grid.isBlockedCell(cx, cy)) return
    w.grid.setBlocked(cx, cy, false)
    w.smashed.push(cy * w.grid.cols + cx)
    w.flowCellX = -1
  },
  spawnPoint(sim, boss) {
    const w = sim.worldState.walls
    if (!w || w.spawnCells.length === 0) return bounded.spawnPoint(sim, boss)
    const cfg = MAPS[sim.mapId].walls!
    const minCellDist = cfg.spawnMinCellDist + (boss ? 2 : 0)
    const ccx = w.grid.cellX(centerX(sim))
    const ccy = w.grid.cellY(centerY(sim))
    const min2 = minCellDist * minCellDist
    const cellCenter = (idx: number): Point => ({
      x: ((idx % w.grid.cols) + 0.5) * UNIT,
      y: (Math.floor(idx / w.grid.cols) + 0.5) * UNIT,
    })
    let fallback = cellCenter(w.spawnCells[0]!)
    for (let i = 0; i < 24; i++) {
      const idx = w.spawnCells[Math.floor(sim.rng.next() * w.spawnCells.length)]!
      const p = cellCenter(idx)
      fallback = p
      const dx = (idx % w.grid.cols) - ccx
      const dy = Math.floor(idx / w.grid.cols) - ccy
      if (dx * dx + dy * dy >= min2) return p
    }
    return fallback
  },
  /** 进墙也销毁 */
  cullEnemyProjectile(sim, x, y) {
    return bounded.cullEnemyProjectile(sim, x, y) || (sim.worldState.walls?.grid.pointBlocked(x, y) ?? false)
  },
  tick(sim, delta) {
    const w = sim.worldState.walls
    if (!w) return
    w.reflowAcc += delta
    const cx = w.grid.cellX(centerX(sim))
    const cy = w.grid.cellY(centerY(sim))
    if (cx === w.flowCellX && cy === w.flowCellY && w.reflowAcc < MAPS[sim.mapId].walls!.reflowMs) return
    w.flow = new FlowField(w.grid, cx, cy)
    w.flowCellX = cx
    w.flowCellY = cy
    w.reflowAcc = 0
  },
}

// ── 无限世界 ──

function infCfg(sim: Sim): InfiniteConfig {
  return MAPS[sim.mapId].infinite!
}

function ringCfg(sim: Sim): ShrinkRingConfig {
  return MAPS[sim.mapId].shrinkRing!
}

/** 没有边，出生在原点，负坐标合法；远离队伍的敌人休眠 */
const infinite: WorldHooks = {
  ...bounded,
  constrainTeam(_sim, next) {
    return next
  },
  constrainEnemy(_sim, _eid, x, y) {
    return { x, y }
  },
  constrainSpawn(_sim, x, y) {
    return { x, y }
  },
  wanderDir(_sim, _eid, dx, dy) {
    return { x: dx, y: dy }
  },
  fleeDir(_sim, _eid, awayX, awayY) {
    return { x: awayX, y: awayY }
  },
  cullEnemyProjectile() {
    return false
  },
  constrainShard(_sim, x, y) {
    return { x, y }
  },
  constrainCoin(_sim, x, y) {
    return { x, y }
  },
  spawnPoint(sim, boss) {
    const zone = sim.worldState.zone
    if (boss) return ringPoint(sim.rng, zone ?? teamCenter(sim), 6 * UNIT, 8 * UNIT)
    const cfg = infCfg(sim)
    const p = ringPoint(sim.rng, teamCenter(sim), cfg.spawnRingMin * UNIT, cfg.spawnRingMax * UNIT)
    // 终波落点收进圈内
    if (!zone) return p
    const limit = zone.r - UNIT
    if (limit <= 0 || !outsideZone(p, zone, limit)) return p
    const d = Math.hypot(p.x - zone.x, p.y - zone.y) || 1
    return { x: zone.x + ((p.x - zone.x) / d) * limit, y: zone.y + ((p.y - zone.y) / d) * limit }
  },
  activeHalf(sim) {
    return infCfg(sim).activeHalf * UNIT
  },
  onFinalWave(sim) {
    sim.worldState.zone = { x: centerX(sim), y: centerY(sim), r: ringCfg(sim).r0 * UNIT }
    sim.worldState.tickAt = ringCfg(sim).tickMs
  },
  /** 圈外只有队员掉血 */
  tick(sim) {
    const zone = sim.worldState.zone
    if (!zone) return
    const cfg = ringCfg(sim)
    zone.r = zoneRadiusAt(sim.elapsedMs, cfg) * UNIT
    if (sim.elapsedMs < sim.worldState.tickAt) return
    sim.worldState.tickAt = sim.elapsedMs + cfg.tickMs
    for (const m of sim.characters) {
      if (!Alive.v[m]) continue
      if (outsideZone({ x: Transform.x[m]!, y: Transform.y[m]! }, zone, zone.r)) {
        hurtCharacter(sim, m, cfg.tickDamage, '毒雾', 0xef5350)
      }
    }
  },
}

// ── 深空 ──

function spaceCfg(sim: Sim): SpaceConfig {
  return MAPS[sim.mapId].space!
}

/** 圆心在世界原点 */
function fieldR(sim: Sim): number {
  return spaceCfg(sim).blackholeRadiusU * UNIT
}

/** 无限世界 + 圆形禁锢；队伍另有硬钳兜底，敌人只有引力井 */
const space: WorldHooks = {
  ...infinite,
  constrainTeam(sim, next) {
    const r = fieldR(sim)
    const v = confineVelocity(centerX(sim), centerY(sim), 0, 0, next.x - centerX(sim), next.y - centerY(sim), r)
    return clampToDisc(centerX(sim) + v.x, centerY(sim) + v.y, 0, 0, r)
  },
  constrainSpawn(sim, x, y, radius) {
    return clampToDisc(x, y, 0, 0, fieldR(sim) - radius)
  },
  /** 削掉向外的分量；边缘全抵消，不需要墙 */
  confineEnemyStep(sim, eid, dx, dy) {
    return confineVelocity(Transform.x[eid]!, Transform.y[eid]!, 0, 0, dx, dy, fieldR(sim))
  },
  constrainCoin(sim, x, y) {
    return clampToDisc(x, y, 0, 0, fieldR(sim) - UNIT * 0.5)
  },
  spawnPoint(sim, boss) {
    const cfg = infCfg(sim)
    const p = boss
      ? ringPoint(sim.rng, { x: 0, y: 0 }, 6 * UNIT, 8 * UNIT)
      : ringPoint(sim.rng, teamCenter(sim), cfg.spawnRingMin * UNIT, cfg.spawnRingMax * UNIT)
    return clampToDisc(p.x, p.y, 0, 0, fieldR(sim) - UNIT)
  },
  // 终波不叠缩圈
  onFinalWave() {},
  onStart(sim) {
    sim.worldState.tickAt = 7000
  },
  /** 天体横扫：预警 → 起划 → 匀速推进；同一实体只砸一次 */
  tick(sim, delta) {
    const cfg = spaceCfg(sim).meteor
    const now = sim.elapsedMs
    const rr = cfg.radiusU * UNIT
    const m = query(sim.world, [Meteor])[0]
    if (m === undefined) {
      if (now < sim.worldState.tickAt) return
      const angle = sim.rng.next() * Math.PI * 2
      const offset = (sim.rng.next() * 2 - 1) * cfg.offsetU * UNIT
      const s = meteorSweep(centerX(sim), centerY(sim), angle, offset, (cfg.travelU * UNIT) / 2)
      spawnMeteor(sim, s, cfg.warnMs, rr * 2)
      return
    }
    if (now < Due.at[m]!) return // 预警中
    const sx = Meteor.sx[m]!
    const sy = Meteor.sy[m]!
    const len = Math.hypot(Meteor.ex[m]! - sx, Meteor.ey[m]! - sy) || 1
    const t = Meteor.t[m]! + (cfg.speedU * UNIT * (delta / 1000)) / len
    Meteor.t[m] = t
    const x = sx + (Meteor.ex[m]! - sx) * t
    const y = sy + (Meteor.ey[m]! - sy) * t
    // 自旋走真实帧长
    Transform.x[m] = x
    Transform.y[m] = y
    Transform.rot[m] = Transform.rot[m]! + (sim.dtMs / 1000) * 1.4
    Tint.alpha[m] = 1
    const hit = meteorHit[m]!
    for (const mem of sim.characters) {
      if (!Alive.v[mem] || hit.has(Uid.v[mem]!)) continue
      if (Math.hypot(Transform.x[mem]! - x, Transform.y[mem]! - y) < rr) {
        hit.add(Uid.v[mem]!)
        hurtCharacter(sim, mem, cfg.damage, '天体', 0xffaa33)
      }
    }
    for (const eid of [...query(sim.world, ENEMY_SET as unknown as object[])]) {
      if (Dormant.v[eid] || hit.has(Uid.v[eid]!)) continue
      if (Math.hypot(Transform.x[eid]! - x, Transform.y[eid]! - y) < rr) {
        hit.add(Uid.v[eid]!)
        applyDamage(sim, eid, cfg.damage)
      }
    }
    if (t < 1) return
    removeEntity(sim.world, m)
    sim.worldState.tickAt = now + cfg.intervalMs + (sim.rng.next() * 2 - 1) * cfg.intervalJitterMs
  },
}

// ── 奔流 ──

function riverCfg(sim: Sim): RiverConfig {
  return MAPS[sim.mapId].river!
}

/** 河道沿长轴贯穿、跨轴居中 */
function riverOf(sim: Sim): RiverRect {
  return riverRect(sim.mapW, sim.mapH, riverCfg(sim).width * UNIT)
}

function flowOf(sim: Sim): Point {
  return flowVector(isHorizontal(sim.mapW, sim.mapH), riverCfg(sim).flow * UNIT)
}

/** 只有队伍与 Boss 钳在河道内；普通敌人跨向不能上岸、沿流向可漂出屏外；金币随波逐流 */
const river: WorldHooks = {
  ...bounded,
  teamDrift(sim, delta) {
    const f = flowOf(sim)
    const dt = delta / 1000
    return { x: f.x * dt, y: f.y * dt }
  },
  constrainTeam(sim, next) {
    return clampToRiver(next, riverOf(sim), (TEAM.ringRadius + MEMBER.radius) * UNIT)
  },
  /** 只钳跨向 */
  constrainEnemy(sim, eid, x, y) {
    const r = riverOf(sim)
    const rad = Radius.v[eid]!
    if (r.horizontal) return { x, y: Math.min(Math.max(y, r.y + rad), r.y + r.h - rad) }
    return { x: Math.min(Math.max(x, r.x + rad), r.x + r.w - rad), y }
  },
  constrainSpawn(sim, x, y, radius) {
    const r = riverOf(sim)
    if (r.horizontal) return { x, y: Math.min(Math.max(y, r.y + radius), r.y + r.h - radius) }
    return { x: Math.min(Math.max(x, r.x + radius), r.x + r.w - radius), y }
  },
  /** Boss 两轴都钳 */
  postSteerEnemy(sim, eid, vx, vy) {
    const f = flowOf(sim)
    const r = riverOf(sim)
    let ox = vx + f.x
    let oy = vy + f.y
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const rad = Radius.v[eid]!
    const boss = Boss.v[eid] === 1
    if (boss || !r.horizontal) {
      if (x <= r.x + rad && ox < 0) ox = 0
      if (x >= r.x + r.w - rad && ox > 0) ox = 0
    }
    if (boss || r.horizontal) {
      if (y <= r.y + rad && oy < 0) oy = 0
      if (y >= r.y + r.h - rad && oy > 0) oy = 0
    }
    return { vx: ox, vy: oy }
  },
  wanderDir(_sim, _eid, dx, dy) {
    return { x: dx, y: dy }
  },
  fleeDir(_sim, _eid, awayX, awayY) {
    return { x: awayX, y: awayY }
  },
  cullEnemyProjectile() {
    return false
  },
  constrainShard(_sim, x, y) {
    return { x, y }
  },
  /** Boss 另取距队伍 ≥ 5 格的点 */
  spawnPoint(sim, boss) {
    const r = riverOf(sim)
    const pad = 0.5 * UNIT
    const pick = (): Point => ({
      x: r.x + pad + sim.rng.next() * (r.w - pad * 2),
      y: r.y + pad + sim.rng.next() * (r.h - pad * 2),
    })
    let pos = pick()
    if (!boss) return pos
    for (let i = 0; i < 24; i++) {
      pos = pick()
      const dx = pos.x - centerX(sim)
      const dy = pos.y - centerY(sim)
      if (dx * dx + dy * dy >= 5 * UNIT * (5 * UNIT)) break
    }
    return pos
  },
  constrainCoin(_sim, x, y) {
    return { x, y }
  },
  activeHalf(sim) {
    return MAPS[sim.mapId].infinite!.activeHalf * UNIT
  },
  coinIdleVelocity(sim) {
    return flowOf(sim)
  },
  cullCoin(sim, x, y) {
    return pastDownstream({ x, y }, sim.mapW, sim.mapH, riverCfg(sim).coinCullPad * UNIT)
  },
}

// ── 环面 ──

/** 坐标按模回绕，没有墙；距离/方向用环面最短差；子弹按寿命回收 */
const torus: WorldHooks = {
  ...bounded,
  torus: true,
  worldDelta(sim, fromX, fromY, toX, toY) {
    return torusDelta({ x: fromX, y: fromY }, { x: toX, y: toY }, sim.mapW, sim.mapH)
  },
  ghosts(sim, x, y) {
    return ghostImages({ x, y }, sim.mapW, sim.mapH)
  },
  wrap(sim, x, y) {
    return wrapPoint({ x, y }, sim.mapW, sim.mapH)
  },
  constrainShard(sim, x, y) {
    return wrapPoint({ x, y }, sim.mapW, sim.mapH)
  },
  projectileLifeMs(sim) {
    return MAPS[sim.mapId].torus!.projectileLifeMs
  },
  // 不钳制,穿缝回绕
  constrainTeam(sim, next) {
    return wrapPoint(next, sim.mapW, sim.mapH)
  },
  constrainEnemy(sim, _eid, x, y) {
    return wrapPoint({ x, y }, sim.mapW, sim.mapH)
  },
  constrainSpawn(sim, x, y) {
    return wrapPoint({ x, y }, sim.mapW, sim.mapH)
  },
  constrainCoin(sim, x, y) {
    return wrapPoint({ x, y }, sim.mapW, sim.mapH)
  },
  wanderDir(_sim, _eid, dx, dy) {
    return { x: dx, y: dy }
  },
  fleeDir(_sim, _eid, awayX, awayY) {
    return { x: awayX, y: awayY }
  },
  cullEnemyProjectile() {
    return false
  },
  /** Boss 另取环面距队伍 ≥ 5 格的点 */
  spawnPoint(sim, boss) {
    const pick = (): Point => ({ x: sim.rng.next() * sim.mapW, y: sim.rng.next() * sim.mapH })
    let pos = pick()
    if (!boss) return pos
    for (let i = 0; i < 24; i++) {
      pos = pick()
      if (torusDist2(pos, teamCenter(sim), sim.mapW, sim.mapH) >= 5 * UNIT * (5 * UNIT)) break
    }
    return pos
  },
}

const BY_KIND: Record<MapDef['kind'], WorldHooks> = {
  bounded,
  daynight: bounded, // 世界几何同有界基线
  ruins: ruins,
  ice,
  river,
  void: torus,
  space,
  infinite,
}

/** ice / walls 先判：它们是配置，与世界形态正交 */
export function worldFor(mapId: MapId): WorldHooks {
  const def = MAPS[mapId]
  if (def.ice) return ice
  if (def.walls) return ruins
  return BY_KIND[def.kind]!
}

